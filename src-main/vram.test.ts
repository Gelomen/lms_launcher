// vram.ts 纯函数单测：GGUF 头解析 + 显存公式边界（规格 2026-08-29-vram-estimate-design §3/§7）。
// GGUF 二进制格式：magic(4B) + tensor count (u64) + array element count (u64) + KV 对。
import { describe, it, expect } from 'vitest';
import { parseGgufHeader, estimateUsedBytes } from './vram';

// GGUF KV 类型码（llama.cpp gguf.h）：0=u8 1=u16 2=u32 3=u64 4=f32 5=f64 6=bool 7=string 8=array
// 构造器：parts 累计法（Buffer.alloc(0) 不支持写偏移）
const u32 = (n: number): Buffer => { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; };
const u64 = (n: number | bigint): Buffer => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n), 0); return b; };
// GGUF: keyLen(u32) = strlen(key) 不含终止符；key bytes 后跟一个 0x00。
// string 值：len(u32) 含 0x00 终止符（llama.cpp gguf 字符串 = 定长含终止符）。
// GGUF: key = C 字符串——keyLen(u32) 不含终止符，key bytes 后跟 1 字节 0x00。
// 值 string：len(u32) + bytes（llama.cpp 按 len 读，无额外终止符）。
function kvU32(key: string, v: number): Buffer[] {
  const kb = Buffer.from(key, 'utf8');
  const term = Buffer.from([0]);
  return [u32(kb.length), kb, term, u32(2), u32(v)]; // [keyLen][key][0x00][type=2][val]
}
function kvStr(key: string, s: string): Buffer[] {
  const kb = Buffer.from(key, 'utf8');
  const sb = Buffer.from(s, 'utf8');
  const term = Buffer.from([0]);
  return [u32(kb.length), kb, term, u32(7), u32(sb.length), sb];
}
function gguf(tensors: number, entries: Buffer[][]): Buffer {
  return Buffer.concat([
    u32(0x46475547), // magic "GGUF"
    u64(BigInt(tensors)),
    u64(BigInt(entries.length)),
    ...entries.flatMap((e) => e),
  ]);
}

describe('parseGgufHeader', () => {
  it('parses_n_layer_and_n_embd', () => {
    const buf = gguf(2, [kvU32('n_layer', 48), kvU32('n_embd', 5120)]);
    const h = parseGgufHeader(buf);
    expect(h.n_layer).toBe(48);
    expect(h.n_embd).toBe(5120);
  });

  it('skips_string_kv_between_values', () => {
    const buf = gguf(2, [kvU32('n_layer', 48), kvStr('ggml_file_version', '1.0'), kvU32('n_embd', 5120)]);
    const h = parseGgufHeader(buf);
    expect(h.n_layer).toBe(48);
    expect(h.n_embd).toBe(5120);
  });

  it('rejects_bad_magic', () => {
    const buf = Buffer.alloc(64);
    expect(() => parseGgufHeader(buf)).toThrow(/GGUF/);
  });

  it('rejects_missing_n_layer', () => {
    const buf = gguf(2, [kvU32('n_embd', 5120)]);
    expect(() => parseGgufHeader(buf)).toThrow(/n_layer/);
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

  it('draft_zero_or_negative_is_0', () => {
    const r = estimateUsedBytes({ ...base, specDraftNMax: '0', ngl: '', ctk: '', ctv: '', b: '', ub: '' });
    expect(r.draftBytes).toBe(0);
    expect(estimateUsedBytes({ ...base, specDraftNMax: '-1', ngl: '', ctk: '', ctv: '', b: '', ub: '' }).draftBytes).toBe(0);
  });

  it('mmproj_is_full_size', () => {
    const r = estimateUsedBytes({ ...base, mmprojBytes: 1024 ** 3, ngl: '12', ctk: '', ctv: '', b: '', ub: '', specDraftNMax: '' });
    expect(r.mmprojBytes).toBe(1024 ** 3);
  });
});
