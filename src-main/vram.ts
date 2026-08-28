// 显存占用预测纯函数（规格 2026-08-29-vram-estimate-design §3）。
// 无 IO：文件字节数由调用方 stat 后传入；GGUF 头解析接受 Buffer。
// 只读 GGUF magic + tensor 计数 + KV 元数据，不读张量数据。

export interface GgufHeader { n_layer: number; n_embd: number }

// dtype → KV cache 每字节系数（字节/元素近似：q4=0.5, q5=0.625, q8=1.0, f16=2.0）
const DTYPE_BYTES: Record<string, number> = {
  q4_0: 0.5, q5_0: 0.625, q8_0: 1.0, f16: 2.0,
};

// KV 值类型码（llama.cpp gguf.h）：0=u8(1B) 1=u16(2B) 2=u32(4B) 3=u64(8B) 4=f32(4B) 5=f64(8B) 6=bool(1B)
// 7=string(u32 len + bytes + 0x00) 8=array(u64 count + u32 elem_type + count×elem)。
export function parseGgufHeader(buf: Buffer): GgufHeader {
  if (buf.length < 20) throw new Error('GGUF: 文件过小');
  if (buf.readUInt32LE(0) !== 0x46475547) throw new Error('GGUF: 非 GGUF 文件（magic 不符）');
  const kvCount = Number(buf.readBigUInt64LE(12));
  let off = 20;
  let nLayer = 0; let nEmbD = 0;
  const fixedSizes: Record<number, number> = { 0: 1, 1: 2, 2: 4, 3: 8, 4: 4, 5: 8, 6: 1 };
  for (let i = 0; i < kvCount; i++) {
    if (off + 4 > buf.length) break;
    const keyLen = buf.readUInt32LE(off); off += 4;
    if (off + keyLen + 1 > buf.length) break;
    const key = buf.toString('utf8', off, off + keyLen); off += keyLen;
    off += 1; // 0x00 终止符（C 字符串，单字节）
    if (off + 4 > buf.length) break;
    const type = buf.readUInt32LE(off); off += 4;
    let vSize = 0; let v = 0;
    if (fixedSizes[type] !== undefined) {
      vSize = fixedSizes[type];
      v = type === 3 ? Number(buf.readBigUInt64LE(off)) : (buf.readUInt32LE(off) & 0xffffffff) >>> 0;
      // u8/u16/bool 复用 u32 读法（低位取值足够 n_layer/n_embd）
      off += vSize;
    } else if (type === 7) { // string：u32 len（含 0x00 终止符）+ bytes
      const len = buf.readUInt32LE(off); off += 4;
      off += len;
    } else if (type === 8) { // array：count(u64) + elem_type(u32) + count × elem
      const count = Number(buf.readBigUInt64LE(off)); off += 8;
      const elemType = buf.readUInt32LE(off); off += 4;
      const es = fixedSizes[elemType] ?? 4;
      off += count * es;
    } else {
      break; // 未知类型：不再继续（避免错位）
    }
    if (key === 'n_layer') nLayer = v;
    else if (key === 'n_embd') nEmbD = v;
  }
  if (nLayer === 0 || nEmbD === 0) throw new Error('GGUF: 缺少 n_layer/n_embd 元数据');
  return { n_layer: nLayer, n_embd: nEmbD };
}

export interface EstimateInput {
  nLayer: number;
  nEmbD: number;
  modelBytes: number;
  mmprojBytes: number;
  ngl: string;
  nCtx: string;
  ctk: string;
  ctv: string;
  b: string;
  ub: string;
  specDraftNMax: string;
}

export interface EstimateResult {
  r: number;           // GPU 层占比（诊断用，测试断言）
  modelBytes: number;
  mmprojBytes: number;
  kvBytes: number;
  batchBytes: number;
  draftBytes: number;
  total: number;        // = modelBytes + mmprojBytes + kvBytes + batchBytes + draftBytes
}

export function estimateUsedBytes(input: EstimateInput): EstimateResult {
  const nLayer = input.nLayer;
  // ngl 空 / ≥999 → r=1；ngl=0 → r=0；其余 → ngl / nLayer
  const nglNum = input.ngl.trim() === '' ? 999 : Number(input.ngl);
  const r = nglNum >= 999 ? 1 : nglNum <= 0 ? 0 : nglNum / nLayer;
  const nCtx = input.nCtx.trim() === '' ? 4096 : Number(input.nCtx) || 4096;
  const kBytes = DTYPE_BYTES[input.ctk] ?? 2.0;
  const vBytes = DTYPE_BYTES[input.ctv] ?? 2.0;
  const modelBytes = input.modelBytes * r;
  const mmprojBytes = input.mmprojBytes; // 视觉投影全量计入（无层占比）
  const kvBytes = 2 * nCtx * nLayer * input.nEmbD * (kBytes + vBytes) / 2 * r;
  const bs = input.b.trim() === '' ? 0 : Number(input.b) || 0;
  const ubS = input.ub.trim() === '' ? 0 : Number(input.ub) || 0;
  const maxBatch = Math.max(bs, ubS);
  const batchBytes = maxBatch > 0 ? input.nEmbD * nLayer * r * 16 : 0; // 单 token 激活估算
  const nd = input.specDraftNMax.trim() === '' ? 0 : Number(input.specDraftNMax) || 0;
  const draftBytes = nd > 0 ? 2 * nd * nLayer * input.nEmbD * kBytes * r : 0;
  return {
    r,
    modelBytes,
    mmprojBytes,
    kvBytes,
    batchBytes,
    draftBytes,
    total: modelBytes + mmprojBytes + kvBytes + batchBytes + draftBytes,
  };
}
