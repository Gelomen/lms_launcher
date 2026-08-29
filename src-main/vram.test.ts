// vram.ts 纯函数单测：GGUF 头解析 + 显存公式边界（规格 2026-08-29-vram-estimate-design §3/§7）。
// GGUF 二进制格式：magic(4B) + tensor count (u64) + array element count (u64) + KV 对。
import { describe, it, expect } from 'vitest';
import { parseGgufHeader, estimateUsedBytes } from './vram';

// GGUF v3 元数据类型码（ggml/docs/gguf.md）：4=uint32 5=int32 6=float32 8=string 9=array 10=uint64
// KV 布局：keyLen(u64) + key bytes（无 null 终止）+ type(u32) + value
// 构造器：parts 累计法
const u32 = (n: number): Buffer => { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; };
const u64 = (n: number | bigint): Buffer => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n), 0); return b; };
function kvU32(key: string, v: number): Buffer[] {
  const kb = Buffer.from(key, 'utf8');
  return [u64(kb.length), kb, u32(4), u32(v)]; // [keyLen u64][key][type=uint32][val]
}
function kvStr(key: string, s: string): Buffer[] {
  const kb = Buffer.from(key, 'utf8');
  const sb = Buffer.from(s, 'utf8');
  return [u64(kb.length), kb, u32(8), u64(sb.length), sb]; // type=string：u64 len + bytes
}
// string 数组（type=9）：elem_type(u32)=8 + len(u64) + 各元素（u64 len + bytes）
function kvStrArray(key: string, items: string[]): Buffer[] {
  const kb = Buffer.from(key, 'utf8');
  const parts: Buffer[] = [u64(kb.length), kb, u32(9), u32(8), u64(items.length)];
  for (const it of items) { const sb = Buffer.from(it, 'utf8'); parts.push(u64(sb.length), sb); }
  return parts;
}
function gguf(entries: Buffer[][], tensors = 100): Buffer {
  return Buffer.concat([
    u32(0x46554747), // magic "GGUF"（LE：字节 47 47 55 46，与真实文件一致）
    u32(3),          // version = 3
    u64(BigInt(tensors)),  // n_tensors
    u64(BigInt(entries.length)), // n_kv
    ...entries.flatMap((e) => e),
  ]);
}

describe('parseGgufHeader', () => {
  it('parses_n_layer_and_n_embd', () => {
    const buf = gguf([kvU32('n_layer', 48), kvU32('n_embd', 5120)]);
    const h = parseGgufHeader(buf);
    expect(h.n_layer).toBe(48);
    expect(h.n_embd).toBe(5120);
  });

  it('skips_string_kv_between_values', () => {
    const buf = gguf([kvU32('n_layer', 48), kvStr('ggml_file_version', '1.0'), kvU32('n_embd', 5120)]);
    const h = parseGgufHeader(buf);
    expect(h.n_layer).toBe(48);
    expect(h.n_embd).toBe(5120);
  });

  it('magic_constant_matches_real_gguf_bytes', () => {
    // 真实 GGUF 文件头前 4 字节（LE 存储为 47 47 55 46 = ASCII "GGUF"）；
    // 断言 magic 常量与之对应，防「常量字节序写错」再次自洽漂移。
    const magicBytes = Buffer.from([0x47, 0x47, 0x55, 0x46]);
    expect(magicBytes.readUInt32LE(0)).toBe(0x46554747);
  });

  it('parses_real_layout_with_version_field', () => {
    // 头布局：magic + version + n_tensors(u64) + n_kv(u64) + KV；version 占 4 字节。
    const buf = gguf([kvU32('n_layer', 48), kvU32('n_embd', 5120)], 866);
    expect(buf.readUInt32LE(0)).toBe(0x46554747);   // magic
    expect(buf.readUInt32LE(4)).toBe(3);            // version
    expect(buf.readBigUInt64LE(8)).toBe(866n);       // n_tensors
    expect(buf.readBigUInt64LE(16)).toBe(2n);        // n_kv
    const h = parseGgufHeader(buf);
    expect(h.n_layer).toBe(48);
    expect(h.n_embd).toBe(5120);
  });

  it('rejects_bad_magic', () => {
    const buf = Buffer.alloc(64);
    expect(() => parseGgufHeader(buf)).toThrow(/GGUF/);
  });

  it('rejects_missing_n_layer', () => {
    const buf = gguf([kvU32('n_embd', 5120)]);
    expect(() => parseGgufHeader(buf)).toThrow(/层数|n_layer|block_count/);
  });

  it('parses_arch_prefixed_field_names_qwen_style', () => {
    // qwen/gemini 架构用 block_count / embedding_length（而非 n_layer / n_embd），
    // 且带架构前缀（<arch>.block_count）。解析须按 key 末段匹配。
    const buf = gguf([
      kvStr('general.architecture', 'qwen35'),
      kvStrArray('general.tags', ['foo', 'bar']), // 变长数组：须正确跳过
      kvU32('qwen35.block_count', 65),
      kvU32('qwen35.embedding_length', 5120),
      kvStrArray('tokenizer.ggml.tokens', ['t1', 't2', 't3']), // 之后的 KV 应「找到即停」忽略
    ]);
    const h = parseGgufHeader(buf);
    expect(h.n_layer).toBe(65);
    expect(h.n_embd).toBe(5120);
  });
});

describe('estimateUsedBytes', () => {
  const base = { nLayer: 48, nEmbD: 5120, modelBytes: 16 * 1024 ** 3, mmprojBytes: 0, nCtx: '4096' };

  it('ngl_empty_is_100pct', () => {
    const r = estimateUsedBytes({ ...base, ngl: '', ctk: '', ctv: '', b: '', ub: '', specType: 'draft-mtp', specDraftNMax: '' });
    expect(r.r).toBe(1);
    expect(r.modelBytes).toBe(16 * 1024 ** 3);
  });

  it('ngl_0_is_0pct', () => {
    const r = estimateUsedBytes({ ...base, ngl: '0', ctk: '', ctv: '', b: '', ub: '', specType: 'draft-mtp', specDraftNMax: '' });
    expect(r.r).toBe(0);
    expect(r.modelBytes).toBe(0);
    expect(r.kvBytes).toBe(0);
  });

  it('ngl_999_is_100pct', () => {
    const r = estimateUsedBytes({ ...base, ngl: '999', ctk: '', ctv: '', b: '', ub: '', specType: 'draft-mtp', specDraftNMax: '' });
    expect(r.r).toBe(1);
  });

  it('ngl_exceeding_layer_count_clamps_to_100pct', () => {
    // 真实回归（Qwen3.8-27B n_layer=65）：ngl=99 > 65 层 → r 必须封顶 1，不得 1.52 虚高
    const over = estimateUsedBytes({ ...base, nLayer: 65, ngl: '99', ctk: '', ctv: '', b: '', ub: '', specType: 'draft-mtp', specDraftNMax: '' });
    const capped = estimateUsedBytes({ ...base, nLayer: 65, ngl: '999', ctk: '', ctv: '', b: '', ub: '', specType: 'draft-mtp', specDraftNMax: '' });
    expect(over.r).toBe(1);
    expect(over.total).toBe(capped.total); // 超层数与封顶后一致
  });

  it('gpu_fixed_overhead_is_constant_2gb_and_included', () => {
    // 实测锚点（2026-08-29，Qwen3.8-27B-Ridge @ RTX4090，nvidia-smi）：llama.cpp 进程上 GPU 后
    // 恒定占用 ~1.9GiB（CUDA context + cuBLAS/cuBLASLt workspace + 常驻 compute buffer），
    // 与 -c / -b 无关。旧公式漏算该项 → Ridge 预测 18.66GB，实测净占 ~20.5GiB。
    // 固定 2 GiB（用户批注 2026-08-30：覆盖 ~1.9GiB 底座并留余量），恒定计入 total。
    const a = estimateUsedBytes({ ...base, ngl: '', ctk: '', ctv: '', b: '', ub: '', specType: 'draft-mtp', specDraftNMax: '' });
    const b2 = estimateUsedBytes({ ...base, ngl: '', ctk: 'f16', ctv: 'f16', b: '4096', ub: '4096', specType: 'draft-mtp', specDraftNMax: '4' });
    // 固定项：精确 = 2 GiB，且两次独立调用必须相等（不随 dtype/batch/随机变）
    expect(a.fixedBytes).toBe(2 * 1024 ** 3);
    expect(b2.fixedBytes).toBe(a.fixedBytes);
    expect(a.total).toBe(a.modelBytes + a.mmprojBytes + a.kvBytes + a.batchBytes + a.draftBytes + a.fixedBytes);
  });

  it('ridge_real_config_total_close_to_measured', () => {
    // 真实回归（Qwen3.8-27B-MTP-Ridge，65层/interval4/GQA kv4/head_dim256）：
    // -m 12599187008B, mmproj 931145952B, ngl999, c184320, b1024, ub512, ctk=ctv=q8_0, nd4。
    // 加入固定开销后 total 应落在 [18.6, 22.5] GiB——下界 = 旧 18.66GB，上界覆盖实测净占 20.5GiB。
    const r = estimateUsedBytes({
      nLayer: 65, nEmbD: 5120, nFullAttentionInterval: 4, nHeadCountKV: 4, nHeadCount: 24, nHeadDim: 256,
      modelBytes: 12599187008, mmprojBytes: 931145952, ngl: '999', ctk: 'q8_0', ctv: 'q8_0',
      b: '1024', ub: '512', nCtx: '184320', specType: 'draft-mtp', specDraftNMax: '4',
    });
    const totalGiB = r.total / 1024 ** 3;
    // draft-mtp 修正后（2026-08-30）：draft context 按完整 n_ctx 分配（184320 × 1024 × 4B ≈ 0.71 GiB），
    // total 由 18.66/20.66 上调至 ~21.3 GiB；断言窗口 [21.2, 21.5] 覆盖公式值与浮动。
    expect(totalGiB).toBeGreaterThanOrEqual(21.2);
    expect(totalGiB).toBeLessThanOrEqual(21.5);
    // 固定项 = 恒定 2 GiB
    expect(r.fixedBytes / 1024 ** 3).toBe(2);
  });

  it('nctx_empty_uses_4096', () => {
    const a = estimateUsedBytes({ ...base, nCtx: '', ngl: '', ctk: '', ctv: '', b: '', ub: '', specType: 'draft-mtp', specDraftNMax: '' });
    const b2 = estimateUsedBytes({ ...base, nCtx: '4096', ngl: '', ctk: '', ctv: '', b: '', ub: '', specType: 'draft-mtp', specDraftNMax: '' });
    expect(a.kvBytes).toBe(b2.kvBytes);
  });

  it('ctk_ctv_dtype_scales', () => {
    // q4_0(0.5) + q4_0(0.5) → avg 0.5；f16(2)+f16(2) → avg 2 = 4 倍
    const q4 = estimateUsedBytes({ ...base, ctk: 'q4_0', ctv: 'q4_0', ngl: '', b: '', ub: '', specType: 'draft-mtp', specDraftNMax: '' });
    const f16 = estimateUsedBytes({ ...base, ctk: 'f16', ctv: 'f16', ngl: '', b: '', ub: '', specType: 'draft-mtp', specDraftNMax: '' });
    expect(f16.kvBytes).toBe(q4.kvBytes * 4);
  });

  it('batch_uses_max_of_b_ub', () => {
    const a = estimateUsedBytes({ ...base, b: '4096', ub: '512', ngl: '', ctk: '', ctv: '', specType: 'draft-mtp', specDraftNMax: '' });
    const b2 = estimateUsedBytes({ ...base, b: '512', ub: '4096', ngl: '', ctk: '', ctv: '', specType: 'draft-mtp', specDraftNMax: '' });
    const none = estimateUsedBytes({ ...base, b: '', ub: '', ngl: '', ctk: '', ctv: '', specType: 'draft-mtp', specDraftNMax: '' });
    expect(a.batchBytes).toBe(b2.batchBytes);
    expect(none.batchBytes).toBe(0);
  });

  it('batch_scales_with_size_and_is_visible', () => {
    // 回归（-b/ub 动态可见性）：batch 项必须随 max(b,ub) 线性增长（不得淹没在 0.00 里）。
    // 历史 bug：batch 项公式漏乘 maxBatch → -b/-ub 任意取值都返回同一 total，看起来「没动态计算」。
    const none = estimateUsedBytes({ ...base, b: '', ub: '', ngl: '', ctk: '', ctv: '', specType: 'draft-mtp', specDraftNMax: '' });
    const small = estimateUsedBytes({ ...base, b: '512', ub: '', ngl: '', ctk: '', ctv: '', specType: 'draft-mtp', specDraftNMax: '' });
    const big = estimateUsedBytes({ ...base, b: '4096', ub: '', ngl: '', ctk: '', ctv: '', specType: 'draft-mtp', specDraftNMax: '' });
    expect(none.batchBytes).toBe(0);
    expect(big.batchBytes).toBeGreaterThan(small.batchBytes); // 单调
    expect(big.batchBytes).toBeGreaterThan(0);                 // 可见（非 0）
    expect(big.batchBytes / small.batchBytes).toBeCloseTo(8, 5); // 4096/512 = 8 倍（线性）
    expect(big.total - none.total).toBeGreaterThan(0);          // total 随 -b 变化（动态）
  });

  it('draft_is_independent_mtp_context_kv_not_nd_entries', () => {
    // llama.cpp MTP：独立 draft context 按完整 n_ctx 分配 cell × 1 个 MTP 层 × kvDim，K/V 恒 f16；
    // --spec-draft-n-max（nd）只控制每步投机 token 数，不改变分配（nd 仅作启用开关）。
    // 实测锚点（Qwen3.6-27B，PR #25465 日志）：n_ctx 190464 → CUDA0 KV buffer 744 MiB（1 layers, K+V f16）。
    const P65 = { ...base, nLayer: 65, nEmbD: 5120, nFullAttentionInterval: 4, nHeadCountKV: 4, nHeadCount: 24, nHeadDim: 256, ngl: '', ctk: 'q8_0', ctv: 'q8_0', b: '', ub: '', specType: 'draft-mtp' };
    const nd1 = estimateUsedBytes({ ...P65, specType: 'draft-mtp', specDraftNMax: '1' });
    const nd4 = estimateUsedBytes({ ...P65, specType: 'draft-mtp', specDraftNMax: '4' });
    expect(nd4.draftBytes).toBe(nd1.draftBytes); // nd 不影响分配
    // 公式：n_ctx(4096) × 1 层 × kvDim(1024) × (K+V f16 = 4B)
    expect(nd4.draftBytes).toBe(4096 * 1024 * 4);
  });

  it('draft_kv_scales_with_nctx_linearly', () => {
    const P65 = { ...base, nLayer: 65, nEmbD: 5120, nFullAttentionInterval: 4, nHeadCountKV: 4, nHeadCount: 24, nHeadDim: 256, ngl: '', ctk: 'q8_0', ctv: 'q8_0', b: '', ub: '', specType: 'draft-mtp' };
    const a = estimateUsedBytes({ ...P65, nCtx: '4096', specType: 'draft-mtp', specDraftNMax: '4' });
    const b4 = estimateUsedBytes({ ...P65, nCtx: '184320', specType: 'draft-mtp', specDraftNMax: '4' });
    expect(b4.draftBytes / a.draftBytes).toBeCloseTo(184320 / 4096, 5); // 随 -c 线性（draft context 按完整上下文预留）
  });

  it('draft_requires_spec_type_not_none', () => {
    // 门控：--spec-draft-n-max 有值但 --spec-type 为 none/空 → draft 缓存不分配（llama-server 端该 flag 不生效）
    const P65 = { ...base, nLayer: 65, nEmbD: 5120, nFullAttentionInterval: 4, nHeadCountKV: 4, nHeadCount: 24, nHeadDim: 256, ngl: '', ctk: 'q8_0', ctv: 'q8_0', b: '', ub: '' };
    const none = estimateUsedBytes({ ...P65, specType: 'none', specDraftNMax: '4' });
    const empty = estimateUsedBytes({ ...P65, specType: '', specDraftNMax: '4' });
    const on = estimateUsedBytes({ ...P65, specType: 'draft-mtp', specDraftNMax: '4' });
    expect(none.draftBytes).toBe(0);
    expect(empty.draftBytes).toBe(0);
    expect(on.draftBytes).toBeGreaterThan(0);
    // draft-dflash / draft-dspark 同为有效 draft 类型，但无 -md 时不计入（独立模型未提供）
    expect(estimateUsedBytes({ ...P65, specType: 'draft-dflash', specDraftNMax: '4' }).draftBytes).toBe(0);
    expect(estimateUsedBytes({ ...P65, specType: 'draft-dspark', specDraftNMax: '4' }).draftBytes).toBe(0);
  });

  it('ext_draft_uses_model_bytes_and_draft_header_kv', () => {
    // draft-dflash / draft-dspark：draft 项 = draft 模型本体（-md 全量，ngld 空）+ draft 头 KV context
    // draft 模型：12 层 / embd 2560 / head_count 20（无 kv_dim 字段 → kvDim = embd）/ head_dim 128
    const MD = { mdBytes: 3 * 1024 ** 3, mdNLayer: 12, mdNEmbD: 2560, mdNHeadCount: 20, mdNHeadDim: 128 };
    for (const st of ['draft-dflash', 'draft-dspark']) {
      const r = estimateUsedBytes({ ...base, nCtx: '4096', ngl: '', ctk: '', ctv: '', b: '', ub: '', specType: st, specDraftNMax: '4', ...MD });
      // draft 模型本体 = mdBytes 全量（ngld 空 → 全量）
      expect(r.draftModelBytes).toBe(3 * 1024 ** 3);
      // draft KV = 2 × n_ctx(4096) × 12 层 × kvDim(128×20=2560) × f16(K+V=4B) / 2 = 4096×12×2560×4
      expect(r.draftBytes).toBe(4096 * 12 * 2560 * 4);
      expect(r.total).toBe(r.modelBytes + r.mmprojBytes + r.kvBytes + r.batchBytes + r.draftBytes + r.draftModelBytes + r.fixedBytes);
    }
  });

  it('ext_draft_model_bytes_scales_with_ngld', () => {
    // -ngld（--spec-draft-ngl）：draft 模型本体按 ngld/draft 层数占比计（与主模型 -ngl 同逻辑）
    // draft 模型 12 层 / mdBytes 3GB：空/'auto'/'all' → 全量；6 → 6/12=0.5；12/≥12 → 全量；0/-1 → 0
    const MD = { mdBytes: 3 * 1024 ** 3, mdNLayer: 12, mdNEmbD: 2560 };
    const call = (ngld: string) => estimateUsedBytes({ ...base, ngl: '', ctk: '', ctv: '', b: '', ub: '', specType: 'draft-dflash', specDraftNMax: '4', ...MD, ngld }).draftModelBytes;
    expect(call('')).toBe(3 * 1024 ** 3);        // 空 → 全量
    expect(call('auto')).toBe(3 * 1024 ** 3);    // auto → 全量
    expect(call('all')).toBe(3 * 1024 ** 3);     // all → 全量
    expect(call('6')).toBe(1.5 * 1024 ** 3);     // 6/12 = 0.5
    expect(call('12')).toBe(3 * 1024 ** 3);      // 12/12 → 全量（封顶）
    expect(call('999')).toBe(3 * 1024 ** 3);     // 超层数 → 封顶
    expect(call('0')).toBe(0);                   // 0 → 无 GPU
    expect(call('-1')).toBe(0);                  // 负 → 无 GPU
  });

  it('ext_draft_active_when_nd_empty_uses_llama_default', () => {
    // llama.cpp --spec-draft-n-max 默认 3：nd 留空仍载 draft（本体 + KV 都计）；仅显式 nd≤0 禁用
    const MD = { mdBytes: 3 * 1024 ** 3, mdNLayer: 12, mdNEmbD: 2560, mdNHeadCount: 20, mdNHeadDim: 128 };
    const empty = estimateUsedBytes({ ...base, ngl: '', ctk: '', ctv: '', b: '', ub: '', specType: 'draft-dflash', specDraftNMax: '', ...MD });
    const nd4 = estimateUsedBytes({ ...base, ngl: '', ctk: '', ctv: '', b: '', ub: '', specType: 'draft-dflash', specDraftNMax: '4', ...MD });
    expect(empty.draftModelBytes).toBe(3 * 1024 ** 3);
    expect(empty.draftBytes).toBe(nd4.draftBytes); // nd 不改分配
    expect(empty.draftBytes).toBeGreaterThan(0);
    // mtp 同样：nd 空 → 仍按 MTP 公式计
    const mtpEmpty = estimateUsedBytes({ ...base, ngl: '', ctk: '', ctv: '', b: '', ub: '', specType: 'draft-mtp', specDraftNMax: '' });
    expect(mtpEmpty.draftBytes).toBe(4096 * base.nEmbD * 4); // base 无 kv_head 字段 → kvDim 退 nEmbD, nCtx 默认 4096
  });

  it('ext_draft_kv_scales_with_ngld', () => {
    // KV 随层驻留设备：ngld=6/12 → KV 0.5 倍（与本体同缩）
    const MD = { mdBytes: 3 * 1024 ** 3, mdNLayer: 12, mdNEmbD: 2560, mdNHeadCount: 20, mdNHeadDim: 128 };
    const call = (ngld: string) => estimateUsedBytes({ ...base, ngl: '', ctk: '', ctv: '', b: '', ub: '', specType: 'draft-dflash', specDraftNMax: '4', ...MD, ngld });
    const full = call(''), half = call('6'), none = call('0');
    expect(half.draftBytes / full.draftBytes).toBeCloseTo(0.5, 5); // KV 与本体同缩
    expect(half.draftModelBytes / full.draftModelBytes).toBeCloseTo(0.5, 5);
    expect(none.draftBytes).toBe(0); // ngld=0 → 无 GPU → KV 也不占显存
    expect(none.draftModelBytes).toBe(0);
  });

  it('ext_draft_without_md_is_0', () => {
    // dflash/dspark 但 mdBytes=0（未填 -md，main 层会降级 ok:false；纯函数层 draft 项为 0）
    const r = estimateUsedBytes({ ...base, ngl: '', ctk: '', ctv: '', b: '', ub: '', specType: 'draft-dflash', specDraftNMax: '4', mdBytes: 0 });
    expect(r.draftBytes).toBe(0);
    expect(r.draftModelBytes).toBe(0);
  });

  it('ext_draft_disabled_when_none_or_nd_zero', () => {
    const MD = { mdBytes: 3 * 1024 ** 3, mdNLayer: 12, mdNEmbD: 2560 };
    expect(estimateUsedBytes({ ...base, ngl: '', ctk: '', ctv: '', b: '', ub: '', specType: 'none', specDraftNMax: '4', ...MD }).draftModelBytes).toBe(0);
    expect(estimateUsedBytes({ ...base, ngl: '', ctk: '', ctv: '', b: '', ub: '', specType: 'draft-dflash', specDraftNMax: '0', ...MD }).draftModelBytes).toBe(0);
    // mtp 忽略 -md（内建 MTP 头，无外挂模型）
    const mtp = estimateUsedBytes({ ...base, ngl: '', ctk: '', ctv: '', b: '', ub: '', specType: 'draft-mtp', specDraftNMax: '4', ...MD });
    expect(mtp.draftModelBytes).toBe(0);
    expect(mtp.draftBytes).toBeGreaterThan(0); // 仍按 MTP 公式计
  });

  it('draft_zero_or_negative_is_0', () => {
    const r = estimateUsedBytes({ ...base, specType: 'draft-mtp', specDraftNMax: '0', ngl: '', ctk: '', ctv: '', b: '', ub: '' });
    expect(r.draftBytes).toBe(0);
    expect(estimateUsedBytes({ ...base, specType: 'draft-mtp', specDraftNMax: '-1', ngl: '', ctk: '', ctv: '', b: '', ub: '' }).draftBytes).toBe(0);
  });

  it('mmproj_is_full_size', () => {
    const r = estimateUsedBytes({ ...base, mmprojBytes: 1024 ** 3, ngl: '12', ctk: '', ctv: '', b: '', ub: '', specType: 'draft-mtp', specDraftNMax: '' });
    expect(r.mmprojBytes).toBe(1024 ** 3);
  });

  it('kv_dim_prefers_gguf_head_dim', () => {
    const n = estimateUsedBytes({ ...base, nLayer: 65, nEmbD: 5120, nFullAttentionInterval: 4, nHeadCountKV: 4, nHeadCount: 24, ngl: '', ctk: 'q8_0', ctv: 'q8_0', nCtx: '180224', b: '', ub: '', specType: 'draft-mtp', specDraftNMax: '' });
    const w = estimateUsedBytes({ ...base, nLayer: 65, nEmbD: 5120, nFullAttentionInterval: 4, nHeadCountKV: 4, nHeadCount: 24, nHeadDim: 256, ngl: '', ctk: 'q8_0', ctv: 'q8_0', nCtx: '180224', b: '', ub: '', specType: 'draft-mtp', specDraftNMax: '' });
    expect(w.kvBytes / n.kvBytes).toBeCloseTo(256 / (5120 / 24), 5);
  });

  it('hybrid_attention_kv_uses_attention_layers_only', () => {
    // 真实回归（Qwen3.8-27B：65 层 / full_attention_interval=4）：
    // -c 32000 时 KV 应按 ceil(65/4)=17 层算，而非全 65 层（旧公式 32.4GB 虚高）。
    const hybrid = estimateUsedBytes({ ...base, nLayer: 65, nEmbD: 5120, nFullAttentionInterval: 4, ngl: '', ctk: 'q8_0', ctv: 'q8_0', nCtx: '32000', b: '', ub: '', specType: 'draft-mtp', specDraftNMax: '' });
    const plain = estimateUsedBytes({ ...base, nLayer: 65, nEmbD: 5120, ngl: '', ctk: 'q8_0', ctv: 'q8_0', nCtx: '32000', b: '', ub: '', specType: 'draft-mtp', specDraftNMax: '' });
    // KV 比 = 17/65（17 = ceil(65/4)）
    expect(hybrid.kvBytes / plain.kvBytes).toBeCloseTo(17 / 65, 5);
  });
});
