// 显存占用预测纯函数（规格 2026-08-29-vram-estimate-design §3）。
// 无 IO：文件字节数由调用方 stat 后传入；GGUF 头解析接受 Buffer。
// 只读 GGUF magic + tensor 计数 + KV 元数据，不读张量数据。

export interface GgufHeader { n_layer: number; n_embd: number; /** 全注意力间隔：每 full_attention_interval 层中仅 1 层存 KV（混合注意力模型如 qwen3.8-27b：interval=4）；undefined = 纯注意力模型 */
  full_attention_interval?: number;
  /** KV 头数（GQA/MQA：KV cache 每层只存 kv_heads 个头的 K/V，而非全部注意力头）；undefined = 每注意力头都存（保守高估） */
  head_count_kv?: number;
  /** 注意力头数（备用：head_dim = n_embd / head_count，当无 key_length 时） */
  head_count?: number;
  /** 注意力头维（GGUF attention.key_length/value_length，如 qwen3.8-27b=256）；KV cache 每头每 token 存 head_dim 元素 */
  head_dim?: number }

// dtype → KV cache 每字节系数（字节/元素近似：q4=0.5, q5=0.625, q8=1.0, f16=2.0）
const DTYPE_BYTES: Record<string, number> = {
  q4_0: 0.5, q5_0: 0.625, q8_0: 1.0, f16: 2.0,
};

// GGUF v3 元数据值类型码（ggml/docs/gguf.md）：
// 0=uint8 1=int8 2=uint16 3=int16 4=uint32 5=int32 6=float32 7=bool 8=string 9=array 10=uint64 11=int64 12=float64
// 定长类型的字节大小（string=8 变长、array=9 变长）
const V3_SIZES: Record<number, number> = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 };
// 层数/维度字段名因架构而异（末段匹配）：
//   llama 系 = n_layer / n_embd；qwen/gemini 系 = block_count / embedding_length；其它常见回退
const LAYER_NAMES = new Set(['n_layer', 'block_count', 'n_layers']);
const EMBD_NAMES = new Set(['n_embd', 'embedding_length', 'd_model']);
// 跳过单个值（不读内容），返回新偏移；越界返回 -1
function skipV3(buf: Buffer, off: number, ty: number): number {
  const sz = V3_SIZES[ty];
  if (sz !== undefined) { if (off + sz > buf.length) return -1; return off + sz; }
  if (ty === 8) { // string：u64 len + bytes
    if (off + 8 > buf.length) return -1;
    const l = Number(buf.readBigUInt64LE(off));
    if (off + 8 + l > buf.length) return -1;
    return off + 8 + l;
  }
  if (ty === 9) { // array：u32 elem_type + u64 len + 逐元素
    if (off + 12 > buf.length) return -1;
    const et = buf.readUInt32LE(off);
    const len = Number(buf.readBigUInt64LE(off + 4));
    let o = off + 12;
    for (let j = 0; j < len; j++) { o = skipV3(buf, o, et); if (o < 0) return -1; }
    return o;
  }
  return -1; // 未知类型
}
// 读取定长整数值（层/维度字段恒为整型）
function readNum(buf: Buffer, off: number, ty: number): number {
  const sz = V3_SIZES[ty];
  if (sz === 1) return buf.readUInt8(off);
  if (sz === 2) return buf.readUInt16LE(off);
  if (sz === 4) return buf.readUInt32LE(off);
  return Number(buf.readBigUInt64LE(off)); // 8B
}
// 解析 GGUF v3 头，返回层数与维度。只扫描元数据 KV，不读张量。
// 架构字段命名不一致 → 按 key 末段（. 之后）匹配 LAYER_NAMES / EMBD_NAMES。
export function parseGgufHeader(buf: Buffer): GgufHeader {
  if (buf.length < 24) throw new Error('GGUF: 文件过小');
  if (buf.readUInt32LE(0) !== 0x46554747) throw new Error('GGUF: 非 GGUF 文件（magic 不符）'); // LE 字节 47 47 55 46 = "GGUF"
  // 头布局：magic(u32)@0 + version(u32)@4 + n_tensors(u64)@8 + n_kv(u64)@16 → KV @24
  const kvCount = Number(buf.readBigUInt64LE(16));
  let off = 24;
  let nLayer = 0; let nEmbD = 0; let faInterval: number | undefined; let kvHeads: number | undefined; let headCount: number | undefined; let headDim: number | undefined;
  let scanned = 0;
  let coreFoundAt = -1; // n_layer + n_embd 首次同时到手的位置
  for (let i = 0; i < kvCount; i++) {
    if (off + 8 > buf.length) break;                 // KV 超出读取窗口
    const keyLen = Number(buf.readBigUInt64LE(off)); off += 8; // key = u64 len + bytes（无 null 终止）
    if (keyLen > 60000) break;                       // 异常长度：布局错位，停止
    if (off + keyLen > buf.length) break;
    const key = buf.toString('utf8', off, off + keyLen); off += keyLen;
    if (off + 4 > buf.length) break;
    const ty = buf.readUInt32LE(off); off += 4;      // value_type(u32)
    const seg = key.includes('.') ? key.slice(key.lastIndexOf('.') + 1) : key;
    const fixed = V3_SIZES[ty] !== undefined;
    if (fixed) {
      const v = readNum(buf, off, ty);
      if (LAYER_NAMES.has(seg)) nLayer = v;
      else if (EMBD_NAMES.has(seg)) nEmbD = v;
      else if (seg === 'full_attention_interval') faInterval = v; // 混合注意力：仅每 interval 层存 KV
      else if (seg === 'head_count_kv') kvHeads = v; // GQA/MQA：KV cache 每层只存 kv_heads 个头
      else if (seg === 'head_count') headCount = v; // 注意力头数：head_dim = n_embd / head_count
      else if (seg === 'key_length' || seg === 'value_length') headDim = v; // 头维：KV cache 每头每 token 的元素数
    }
    const next = skipV3(buf, off, ty);                // 推进到下一 KV
    if (next < 0) break;                             // 变长值越界（如超长 tokens 数组）：停止
    off = next;
    scanned = i + 1;
    if (coreFoundAt < 0 && nLayer > 0 && nEmbD > 0) coreFoundAt = i;
    // 提前停：核心字段(n_layer+n_embd)到手，且可选的 full_attention_interval 也到手；
    // 纯注意力模型没有 interval → 最多再扫 40 个 KV（arch 元数据总在 tokenizer 大数组之前）。
    // （不能「核心字段到手就停」：混合模型的 interval 在 block_count/embedding_length 之后，如 qwen3.8-27b KV #27）
    if (coreFoundAt >= 0 && (faInterval !== undefined || i >= coreFoundAt + 40)) break;
  }
  if (nLayer === 0 || nEmbD === 0) throw new Error('GGUF: 缺少层数/维度元数据（' + scanned + ' 个 KV 内未找到 n_layer/block_count 与 n_embd/embedding_length）');
  return { n_layer: nLayer, n_embd: nEmbD, full_attention_interval: faInterval, head_count_kv: kvHeads, head_count: headCount, head_dim: headDim };
}

export interface EstimateInput {
  nLayer: number;
  nEmbD: number;
  /** GGUF full_attention_interval（混合注意力模型：每 interval 层中 1 层存 KV）；undefined=纯注意力 */
  nFullAttentionInterval?: number;
  /** GGUF attention.head_count_kv（GQA/MQA：KV cache 每层只存这个数目的头）；undefined=每注意力头都存（保守高估） */
  nHeadCountKV?: number;
  /** GGUF attention.head_count（注意力头数）：无 key_length 时 head_dim = n_embd / head_count */
  nHeadCount?: number;
  /** GGUF attention.key_length（头维）：KV cache 每头每 token 的元素数，如 qwen3.8-27b=256 */
  nHeadDim?: number;
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

// 实测锚点（2026-08-29，Qwen3.8-27B-Ridge @ RTX4090，nvidia-smi 采集）：
// llama.cpp 进程上 GPU 后恒定占用 ~1.9GiB——CUDA context + cuBLAS/cuBLASLt workspace +
// 常驻 compute buffer + KV 块 scale/pad，与 -c / -b / -ctk 无关。旧公式只算数据量（五项），
// 漏掉这项底座 → Ridge 预测 18.66GB vs 实测净占 ~20.5GiB。
// 固定取 2 GiB（用户批注 2026-08-30：写死常量，覆盖 ~1.9GiB 实测底座并留余量；
// 不随 dtype/batch/随机变化，估算结果可复现）。
const GPU_FIXED_BYTES = 2 * 1024 ** 3;

export interface EstimateResult {
  r: number;           // GPU 层占比（诊断用，测试断言）
  modelBytes: number;
  mmprojBytes: number;
  kvBytes: number;
  batchBytes: number;
  draftBytes: number;
  fixedBytes: number;  // GPU 固定运行时开销（CUDA context + cuBLAS workspace），固定 2 GiB 计入
  total: number;        // = modelBytes + mmprojBytes + kvBytes + batchBytes + draftBytes + fixedBytes
}

export function estimateUsedBytes(input: EstimateInput): EstimateResult {
  const nLayer = input.nLayer;
  // KV 缓存/单 token 激活只存在于注意力层：混合模型（full_attention_interval=I）
  // 每 I 层中仅 1 层存 KV（qwen3.8-27b: 65 层 / interval 4 ≈ 17 层）；其余层是 SSM/线性层，
  // 固定状态不随 ctx 增长。
  const kvLayers = input.nFullAttentionInterval && input.nFullAttentionInterval > 0
    ? Math.ceil(nLayer / input.nFullAttentionInterval)
    : nLayer;
  // ngl 空 / ≥n_layer（含 ≥999）→ r=1；ngl≤0 → r=0；其余 → min(ngl/nLayer, 1)
  // （ngl 超出实际层数无意义——按 100% 封顶，避免 99/65=1.52 这类虚高）
  const nglNum = input.ngl.trim() === '' ? 999 : Number(input.ngl);
  const r = nglNum <= 0 ? 0 : Math.min(nglNum / nLayer, 1);
  const nCtx = input.nCtx.trim() === '' ? 4096 : Number(input.nCtx) || 4096;
  const kBytes = DTYPE_BYTES[input.ctk] ?? 2.0;
  const vBytes = DTYPE_BYTES[input.ctv] ?? 2.0;
  const modelBytes = input.modelBytes * r;
  const mmprojBytes = input.mmprojBytes; // 视觉投影全量计入（无层占比）
  // KV cache 每层每 token 存 2(K+V) × (KV 头维) × dtype 字节。
  // 头维优先读 GGUF attention.key_length（如 qwen3.8-27b=256，比 n_embd/head_count=213 准确——
  // 该架构 q 投影 24头×256=6144 比 embedding 5120 宽）；否则退回 n_embd/head_count，再退 nEmbD。
  // KV 维度 = head_dim × head_count_kv（GQA/MQA 只存 kv_heads 个头，如 qwen3.8-27b：256×4=1024，非全 24 头 5120）。
  const hd = input.nHeadDim && input.nHeadDim > 0
    ? input.nHeadDim
    : (input.nHeadCount && input.nHeadCount > 0 ? input.nEmbD / input.nHeadCount : input.nEmbD);
  const kvDim = input.nHeadCountKV && input.nHeadCountKV > 0 ? hd * input.nHeadCountKV : input.nEmbD;
  const kvBytes = 2 * nCtx * kvLayers * kvDim * (kBytes + vBytes) / 2 * r;
  const bs = input.b.trim() === '' ? 0 : Number(input.b) || 0;
  const ubS = input.ub.trim() === '' ? 0 : Number(input.ub) || 0;
  const maxBatch = Math.max(bs, ubS);
  // -b batch buffer：prompt processing 时每个待处理 token 需一份 hidden state buffer（n_embd × 16B 中间层激活）；
  // buffer 随 max(b, ub) 线性增长（不乘 kvLayers——那是 KV cache 层的项，batch 是独立激活区）。
  const batchBytes = maxBatch > 0 ? maxBatch * input.nEmbD * 16 * r : 0;
  const nd = input.specDraftNMax.trim() === '' ? 0 : Number(input.specDraftNMax) || 0;
  // draft-mtp：独立 MTP draft context——llama.cpp 按完整 n_ctx 预留 cell × 1 个 MTP 层 × kvDim，K/V 恒 f16
  // （不跟 -ctk/-ctv）；--spec-draft-n-max（nd）只控制每步投机 token 数，不改变分配（nd 仅作启用开关）。
  // 实测锚点（Qwen3.6-27B，llama.cpp PR #25465 日志）：n_ctx 190464 → CUDA0 KV buffer 744 MiB（1 layers, K+V f16）。
  const draftBytes = nd > 0 ? nCtx * kvDim * 4 * r : 0;
  return {
    r,
    modelBytes,
    mmprojBytes,
    kvBytes,
    batchBytes,
    draftBytes,
    fixedBytes: GPU_FIXED_BYTES,
    total: modelBytes + mmprojBytes + kvBytes + batchBytes + draftBytes + GPU_FIXED_BYTES,
  };
}
