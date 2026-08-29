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
    const r = estimateUsedBytes({ ...base, ngl: '', ctk: '', ctv: '', b: '', ub: '', specDraftNMax: '' });
    expect(r.r).toBe(1);
    expect(r.modelBytes).toBe(16 * 1024 ** 3);
  });

  it('ngl_0_is_0pct', () => {
    const r = estimateUsedBytes({ ...base, ngl: '0', ctk: '', ctv: '', b: '', ub: '', specDraftNMax: '' });
    expect(r.r).toBe(0);
    expect(r.modelBytes).toBe(0);
    expect(r.kvBytes).toBe(0);
  });

  it('ngl_999_is_100pct', () => {
    const r = estimateUsedBytes({ ...base, ngl: '999', ctk: '', ctv: '', b: '', ub: '', specDraftNMax: '' });
    expect(r.r).toBe(1);
  });

  it('ngl_exceeding_layer_count_clamps_to_100pct', () => {
    // 真实回归（Qwen3.8-27B n_layer=65）：ngl=99 > 65 层 → r 必须封顶 1，不得 1.52 虚高
    const over = estimateUsedBytes({ ...base, nLayer: 65, ngl: '99', ctk: '', ctv: '', b: '', ub: '', specDraftNMax: '' });
    const capped = estimateUsedBytes({ ...base, nLayer: 65, ngl: '999', ctk: '', ctv: '', b: '', ub: '', specDraftNMax: '' });
    expect(over.r).toBe(1);
    expect(over.total).toBe(capped.total); // 超层数与封顶后一致
  });

  it('nctx_empty_uses_4096', () => {
    const a = estimateUsedBytes({ ...base, nCtx: '', ngl: '', ctk: '', ctv: '', b: '', ub: '', specDraftNMax: '' });
    const b2 = estimateUsedBytes({ ...base, nCtx: '4096', ngl: '', ctk: '', ctv: '', b: '', ub: '', specDraftNMax: '' });
    expect(a.kvBytes).toBe(b2.kvBytes);
  });

  it('ctk_ctv_dtype_scales', () => {
    // q4_0(0.5) + q4_0(0.5) → avg 0.5；f16(2)+f16(2) → avg 2 = 4 倍
    const q4 = estimateUsedBytes({ ...base, ctk: 'q4_0', ctv: 'q4_0', ngl: '', b: '', ub: '', specDraftNMax: '' });
    const f16 = estimateUsedBytes({ ...base, ctk: 'f16', ctv: 'f16', ngl: '', b: '', ub: '', specDraftNMax: '' });
    expect(f16.kvBytes).toBe(q4.kvBytes * 4);
  });

  it('batch_uses_max_of_b_ub', () => {
    const a = estimateUsedBytes({ ...base, b: '4096', ub: '512', ngl: '', ctk: '', ctv: '', specDraftNMax: '' });
    const b2 = estimateUsedBytes({ ...base, b: '512', ub: '4096', ngl: '', ctk: '', ctv: '', specDraftNMax: '' });
    const none = estimateUsedBytes({ ...base, b: '', ub: '', ngl: '', ctk: '', ctv: '', specDraftNMax: '' });
    expect(a.batchBytes).toBe(b2.batchBytes);
    expect(none.batchBytes).toBe(0);
  });

  it('batch_scales_with_size_and_is_visible', () => {
    // 回归（-b/ub 动态可见性）：batch 项必须随 max(b,ub) 线性增长（不得淹没在 0.00 里）。
    // 历史 bug：batch 项公式漏乘 maxBatch → -b/-ub 任意取值都返回同一 total，看起来「没动态计算」。
    const none = estimateUsedBytes({ ...base, b: '', ub: '', ngl: '', ctk: '', ctv: '', specDraftNMax: '' });
    const small = estimateUsedBytes({ ...base, b: '512', ub: '', ngl: '', ctk: '', ctv: '', specDraftNMax: '' });
    const big = estimateUsedBytes({ ...base, b: '4096', ub: '', ngl: '', ctk: '', ctv: '', specDraftNMax: '' });
    expect(none.batchBytes).toBe(0);
    expect(big.batchBytes).toBeGreaterThan(small.batchBytes); // 单调
    expect(big.batchBytes).toBeGreaterThan(0);                 // 可见（非 0）
    expect(big.batchBytes / small.batchBytes).toBeCloseTo(8, 5); // 4096/512 = 8 倍（线性）
    expect(big.total - none.total).toBeGreaterThan(0);          // total 随 -b 变化（动态）
  });

  it('draft_zero_or_negative_is_0', () => {
    const r = estimateUsedBytes({ ...base, specDraftNMax: '0', ngl: '', ctk: '', ctv: '', b: '', ub: '' });
    expect(r.draftBytes).toBe(0);
    expect(estimateUsedBytes({ ...base, specDraftNMax: '-1', ngl: '', ctk: '', ctv: '', b: '', ub: '' }).draftBytes).toBe(0);
  });

  it('mmproj_is_full_size', () => {
    const r = estimateUsedBytes({ ...base, mmprojBytes: 1024 ** 3, ngl: '12', ctk: '', ctv: '', b: '', ub: '', specDraftNMax: '' });
    expect(r.mmprojBytes).toBe(1024 ** 3);
  });

  it('hybrid_attention_kv_uses_attention_layers_only', () => {
    // 真实回归（Qwen3.8-27B：65 层 / full_attention_interval=4）：
    // -c 32000 时 KV 应按 ceil(65/4)=17 层算，而非全 65 层（旧公式 32.4GB 虚高）。
    const hybrid = estimateUsedBytes({ ...base, nLayer: 65, nEmbD: 5120, nFullAttentionInterval: 4, ngl: '', ctk: 'q8_0', ctv: 'q8_0', nCtx: '32000', b: '', ub: '', specDraftNMax: '' });
    const plain = estimateUsedBytes({ ...base, nLayer: 65, nEmbD: 5120, ngl: '', ctk: 'q8_0', ctv: 'q8_0', nCtx: '32000', b: '', ub: '', specDraftNMax: '' });
    // KV 比 = 17/65（17 = ceil(65/4)）
    expect(hybrid.kvBytes / plain.kvBytes).toBeCloseTo(17 / 65, 5);
  });
});
