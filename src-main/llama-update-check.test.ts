import { describe, it, expect, vi } from 'vitest';
import { parseReleaseBody, compareLlamaVersions, fetchLlamaReleaseInfo } from './llama-update-check';
import { type LlamaVersion } from './llama-update-version';

describe('parseReleaseBody', () => {
  it('解析包含 Windows 下载链接的 body', () => {
    const body = `# Release Notes

## Download

- Windows x64 (CPU): [download](https://github.com/ggml-org/llama.cpp/releases/download/b10952/llama-b10952-bin-win-cpu-x64.zip)
- Windows x64 (CUDA 12): [download](https://github.com/ggml-org/llama.cpp/releases/download/b10952/llama-b10952-bin-win-cuda-x64.zip)
- CUDA DLLs (12.6): [download](https://github.com/ggml-org/llama.cpp/releases/download/b10952/llama-cuda-dlls-12.6.zip)
`;

    const result = parseReleaseBody(body);
    expect(result).not.toBeNull();
    expect(result!.versionOptions).toHaveLength(2);
    expect(result!.versionOptions[0].label).toBe('Windows x64 (CPU)');
    expect(result!.versionOptions[0].downloadUrl).toBe(
      'https://github.com/ggml-org/llama.cpp/releases/download/b10952/llama-b10952-bin-win-cpu-x64.zip'
    );
    expect(result!.versionOptions[1].label).toBe('Windows x64 (CUDA 12)');
    expect(result!.cudaDlls).toBeDefined();
    expect(result!.cudaDlls).toHaveLength(1);
    expect(result!.cudaDlls![0].version).toBe('12.6');
  });

  it('解析不包含 Windows 链接的 body 返回 null', () => {
    const body = `# Release Notes

## Download

- Linux x64: [download](https://example.com/linux.zip)
- macOS: [download](https://example.com/macos.zip)
`;

    const result = parseReleaseBody(body);
    expect(result).toBeNull();
  });
});

describe('compareLlamaVersions', () => {
  it('本地 b10852 vs 远程 b10952 → update-available', () => {
    const local: LlamaVersion = { type: 'prerelease', build: 10852 };
    expect(compareLlamaVersions(local, 'b10952')).toBe('update-available');
  });

  it('本地 b10952 vs 远程 b10952 → up-to-date', () => {
    const local: LlamaVersion = { type: 'prerelease', build: 10952 };
    expect(compareLlamaVersions(local, 'b10952')).toBe('up-to-date');
  });

  it('本地 v0.4.0 vs 远程 v0.4.0 → up-to-date', () => {
    const local: LlamaVersion = { type: 'release', version: '0.4.0', build: 10852 };
    expect(compareLlamaVersions(local, 'v0.4.0')).toBe('up-to-date');
  });

  it('本地 null → unknown', () => {
    expect(compareLlamaVersions(null, 'b10952')).toBe('unknown');
  });
});

describe('fetchLlamaReleaseInfo', () => {
  it('mock API 响应验证解析结果', async () => {
    const mockRelease = {
      tag_name: 'b10952',
      prerelease: false,
      published_at: '2025-01-01T00:00:00Z',
      body: `# Release b10952

- Windows x64 (CPU): [download](https://github.com/ggml-org/llama.cpp/releases/download/b10952/llama-b10952-bin-win-cpu-x64.zip)
`,
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([mockRelease]),
    }));

    const result = await fetchLlamaReleaseInfo(false);
    expect(result).not.toBeNull();
    expect(result!.tag).toBe('b10952');
    expect(result!.publishedAt).toBe('2025-01-01T00:00:00Z');
    expect(result!.versionOptions).toHaveLength(1);
    expect(result!.versionOptions[0].label).toBe('Windows x64 (CPU)');

    vi.unstubAllGlobals();
  });
});
