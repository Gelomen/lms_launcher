import { describe, it, expect, vi } from 'vitest';
import { parseReleaseBody, compareLlamaVersions, fetchLlamaReleaseInfo } from './llama-update-check';
import { type LlamaVersion } from './llama-update-version';

// 真实 GitHub release body 格式（2026-09-14 bug 修复，取自 b10955 实际 body）：
//   - [Windows x64 (CPU)](https://github.com/ggml-org/llama.cpp/releases/download/b10955/llama-b10955-bin-win-cpu-x64.zip)
//   - [Windows x64 (CUDA 12)](<url>) - [CUDA 12.4 DLLs](<url>)   ← DLLs 链接内联在同一行
const REAL_B10955_BODY = `**Website:**
- <https://llama.app>

**Windows:**
- [Windows x64 (CPU)](https://github.com/ggml-org/llama.cpp/releases/download/b10955/llama-b10955-bin-win-cpu-x64.zip)
- [Windows x64 (CUDA 12)](https://github.com/ggml-org/llama.cpp/releases/download/b10955/llama-b10955-bin-win-cuda-12.4-x64.zip) - [CUDA 12.4 DLLs](https://github.com/ggml-org/llama.cpp/releases/download/b10955/cudart-llama-bin-win-cuda-12.4-x64.zip)
- [Windows arm64 (CPU)](https://github.com/ggml-org/llama.cpp/releases/download/b10955/llama-b10955-bin-win-cpu-arm64.zip)
- [Windows x64 (Vulkan)](https://github.com/ggml-org/llama.cpp/releases/download/b10955/llama-b10955-bin-win-vulkan-x64.zip)
`;

describe('parseReleaseBody', () => {
  it('解析真实 nightly body：4 个 Windows 选项 + 行内 CUDA DLLs 关联到 CUDA 选项', () => {
    const result = parseReleaseBody(REAL_B10955_BODY);
    expect(result).not.toBeNull();
    expect(result!.versionOptions).toHaveLength(4);
    expect(result!.versionOptions[0]).toEqual({
      label: 'Windows x64 (CPU)',
      downloadUrl: 'https://github.com/ggml-org/llama.cpp/releases/download/b10955/llama-b10955-bin-win-cpu-x64.zip',
    });
    // CUDA 选项必须携带行内 DLLs 链接
    const cudaOpt = result!.versionOptions.find((o) => o.label === 'Windows x64 (CUDA 12)')!;
    expect(cudaOpt.downloadUrl).toBe(
      'https://github.com/ggml-org/llama.cpp/releases/download/b10955/llama-b10955-bin-win-cuda-12.4-x64.zip'
    );
    expect(cudaOpt.cudaDllsUrl).toBe(
      'https://github.com/ggml-org/llama.cpp/releases/download/b10955/cudart-llama-bin-win-cuda-12.4-x64.zip'
    );
    // CPU 选项无 DLLs
    expect(result!.versionOptions[0].cudaDllsUrl).toBeUndefined();
    // 顶层 cudaDlls 平铺列表保留（IPC 契约兼容）
    expect(result!.cudaDlls).toHaveLength(1);
    expect(result!.cudaDlls![0]).toEqual({
      version: '12.4',
      downloadUrl: 'https://github.com/ggml-org/llama.cpp/releases/download/b10955/cudart-llama-bin-win-cuda-12.4-x64.zip',
    });
  });

  it('解析不包含 Windows 链接的 body 返回 null（stable release 只有 nightly-tag.txt）', () => {
    const body = `This is a tag-only release.\n\nSee nightly releases for binaries.
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

  // 2026-09-14 bug 核心回归：llama.cpp 的 stable release 只有 nightly-tag.txt 资产、
  // 无任何 Windows 下载链接 → 旧实现（includePreRelease=false 只取 stable）必然 null →
  // UI 报「获取远程版本失败」。新行为：选中的 release body 解析不出 Windows 链接时，
  // 兜底取后续可解析的 release（即 nightly b 号），保证用户总能拿到可下载版本。
  it('stable 无 Windows 链接时兜底到 nightly（includePreRelease=false 也能返回结果）', async () => {
    const stableRelease = {
      tag_name: 'v0.4.0',
      prerelease: false,
      published_at: '2026-09-04T00:00:00Z',
      body: 'This is a tag-only release. See nightly releases for binaries.',
    };
    const nightlyRelease = {
      tag_name: 'b10955',
      prerelease: true,
      published_at: '2026-09-10T00:00:00Z',
      body: REAL_B10955_BODY,
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([stableRelease, nightlyRelease]),
    }));

    const result = await fetchLlamaReleaseInfo(false);
    expect(result).not.toBeNull();
    expect(result!.tag).toBe('b10955');
    expect(result!.versionOptions).toHaveLength(4);

    vi.unstubAllGlobals();
  });

  it('includePreRelease=true 时优先取列表首位的 nightly', async () => {
    const stableRelease = {
      tag_name: 'v0.4.0',
      prerelease: false,
      published_at: '2026-09-04T00:00:00Z',
      body: 'tag-only',
    };
    const nightlyRelease = {
      tag_name: 'b10955',
      prerelease: true,
      published_at: '2026-09-10T00:00:00Z',
      body: REAL_B10955_BODY,
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([nightlyRelease, stableRelease]),
    }));

    const result = await fetchLlamaReleaseInfo(true);
    expect(result).not.toBeNull();
    expect(result!.tag).toBe('b10955');

    vi.unstubAllGlobals();
  });
});
