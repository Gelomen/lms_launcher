import { evaluateDownloadIntegrity } from './update-verify';
import { applyLang } from './i18n';
import { dict, translate } from './i18n/dict';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { evaluateDownloadIntegrity, sha256FileAsync, digestMatches } from './update-verify';

describe('update-verify.ts', () => {
  // ---------- evaluateDownloadIntegrity：纯函数两级校验判定 ----------

  it('complete_size_and_matching_digest_passes', () => {
    const d = 'sha256:' + 'a'.repeat(64);
    const r = evaluateDownloadIntegrity({
      expectedSize: 100, actualSize: 100,
      expectedDigest: d, actualDigest: d,
    });
    expect(r).toEqual({ ok: true, reasonKey: null });
  });

  it('size_mismatch_fails_even_before_digest', () => {
    const r = evaluateDownloadIntegrity({
      expectedSize: 100, actualSize: 50,
      expectedDigest: null,
      actualDigest: 'sha256:0'.repeat(32),
    });
    expect(r.ok).toBe(false);
    expect(r.reasonKey).toBe('err.update.incomplete');
    expect(r.reasonParams).toEqual({ actual: 50, expected: 100 });
  });

  it('digest_mismatch_fails_when_sizes_equal', () => {
    const r = evaluateDownloadIntegrity({
      expectedSize: 100, actualSize: 100,
      expectedDigest: 'sha256:' + 'a'.repeat(64),
      actualDigest: 'sha256:' + 'b'.repeat(64),
    });
    expect(r.ok).toBe(false);
    expect(r.reasonKey).toBe('err.update.digestMismatch');
  });

  it('no_digest_and_size_ok_passes', () => {
    const r = evaluateDownloadIntegrity({
      expectedSize: 100, actualSize: 100,
      expectedDigest: null, actualDigest: null,
    });
    expect(r).toEqual({ ok: true, reasonKey: null });
  });

  it('no_content_length_and_no_digest_passes', () => {
    const r = evaluateDownloadIntegrity({
      expectedSize: null, actualSize: 100,
      expectedDigest: null, actualDigest: null,
    });
    expect(r).toEqual({ ok: true, reasonKey: null });
  });

  // ---------- sha256FileAsync：流式文件哈希 ----------

  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'lms-verify-'));
    writeFileSync(join(dir, 'a.bin'), Buffer.from('hello world'));
    // 已知 SHA-256：b94d27b9934d3e08a52e52d7da7dab9c84e3277be3532860371718a4c2895baa
  });
  afterAll(() => rmSync(dir, { force: true, recursive: true }));

  it('computes_known_sha256', async () => {
    expect(await sha256FileAsync(join(dir, 'a.bin'))).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
  });

  it('rejects_missing_file', async () => {
    await expect(sha256FileAsync(join(dir, 'nope.bin'))).rejects.toThrow();
  });

  // ---------- digestMatches：发布格式 sha256:xxx 与本地 hex 摘要比较 ----------

  it('digest_matches_true_when_equal', () => {
    const h = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';
    expect(digestMatches('sha256:' + h, h)).toBe(true);
  });

  it('digest_matches_false_when_different', () => {
    expect(digestMatches('sha256:' + 'a'.repeat(64), 'b'.repeat(64))).toBe(false);
  });

  it('digest_matches_false_on_shape_violation', () => {
    expect(digestMatches(null, 'x')).toBe(false);
    expect(digestMatches('sha1:abc', 'abc')).toBe(false);
    expect(digestMatches('not-a-digest', 'x')).toBe(false);
  });

  // 2026-10-05 i18n 响应性：主进程不再定死译文，只回 key(+params) → 翻译发生在渲染端（渲染时 t()）。
  // 本用例等价于旧断言：key 在 en 词典下渲染出的仍是那句英文。
  it('en: 完整性失败回 key，en 词典值为英文短句', () => {
    applyLang('en');
    const r = evaluateDownloadIntegrity({ expectedSize: 100, actualSize: 10, expectedDigest: null, actualDigest: null, path: 'x' });
    expect(r.reasonKey).toBe('err.update.incomplete');
    expect(translate(dict.en as Record<string, string>, r.reasonKey!, r.reasonParams))
      .toBe('Incomplete download: received 10 bytes / expected 100 bytes, retry');
    applyLang('zh');
  });

});

describe('en prefix retention', () => {
  it('en: completeness reason in English', () => {
    applyLang('en');
    const r = evaluateDownloadIntegrity({ expectedSize: 100, actualSize: 10, expectedDigest: null, actualDigest: null, path: 'x' });
    expect(r.reasonKey).toBe('err.update.incomplete');
    expect(translate(dict.en as Record<string, string>, r.reasonKey!, r.reasonParams))
      .toBe('Incomplete download: received 10 bytes / expected 100 bytes, retry');
    applyLang('zh');
  });
});