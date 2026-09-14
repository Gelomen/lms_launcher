import { describe, it, expect } from 'vitest';
import { parseLlamaVersion } from './llama-update-version';

describe('llama-update-version.ts', () => {
  it('parses release version with build number', () => {
    const result = parseLlamaVersion('llama-server v0.4.0 (build b10852)');
    expect(result).toEqual({ type: 'release', version: '0.4.0', build: 10852 });
  });

  it('parses pre-release build number', () => {
    const result = parseLlamaVersion('llama-server b10952');
    expect(result).toEqual({ type: 'prerelease', build: 10952 });
  });

  it('returns null for unknown format', () => {
    expect(parseLlamaVersion('unknown format')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseLlamaVersion('')).toBeNull();
  });

  it('parses release version without build number', () => {
    const result = parseLlamaVersion('llama-server v0.5.0');
    expect(result).toEqual({ type: 'release', version: '0.5.0' });
  });

  it('handles whitespace around input', () => {
    const result = parseLlamaVersion('  llama-server b11000  ');
    expect(result).toEqual({ type: 'prerelease', build: 11000 });
  });

  it('rejects invalid release format with missing version', () => {
    expect(parseLlamaVersion('llama-server v (build b100)')).toBeNull();
  });

  it('rejects invalid pre-release format with non-numeric build', () => {
    expect(parseLlamaVersion('llama-server babc')).toBeNull();
  });

  it('rejects release with invalid version format', () => {
    expect(parseLlamaVersion('llama-server v1.0 (build b100)')).toBeNull();
  });

  // 真实 --version 输出（2026-09-14 bug）：两行，第一行 `version: X.Y.Z[-dev] (build N, commit ...)`,
  // 第二行 `built with ...`。旧实现只认假想的 `llama-server v...` 前缀 → 恒 null → 版本比较恒 unknown。
  describe('真实 llama-server --version 输出（多行）', () => {
    it('解析 dev 构建（0.3.0-dev, build 10679）', () => {
      const out = 'version: 0.3.0-dev (build 10679, commit 50f068fff)\nbuilt with Clang 20.1.8 for Windows x86_64';
      const result = parseLlamaVersion(out);
      expect(result).toEqual({ type: 'prerelease', version: '0.3.0', build: 10679 });
    });

    it('解析正式构建（0.4.0, build 10852）', () => {
      const out = 'version: 0.4.0 (build 10852, commit abc1234)\nbuilt with MSVC 19.40 for Windows x86_64';
      const result = parseLlamaVersion(out);
      expect(result).toEqual({ type: 'release', version: '0.4.0', build: 10852 });
    });

    it('单行输出（无 built with 行）也能解析', () => {
      const result = parseLlamaVersion('version: 0.5.0-dev (build 11000)');
      expect(result).toEqual({ type: 'prerelease', version: '0.5.0', build: 11000 });
    });

    it('commit 缺失/多余字段不影响解析', () => {
      const result = parseLlamaVersion('version: 0.3.0-dev (build 10679)\nbuilt with GCC 14 for Linux x86_64');
      expect(result).toEqual({ type: 'prerelease', version: '0.3.0', build: 10679 });
    });
  });
});
