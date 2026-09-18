import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to create mocks that are available before module loads
const { mockAdmZip, mockExistsSync, mockRmSync, mockSpawnSync, mockOpenSync, mockCloseSync, mockReaddirSync } = vi.hoisted(() => ({
  mockAdmZip: vi.fn(),
  mockExistsSync: vi.fn(),
  mockRmSync: vi.fn(),
  mockSpawnSync: vi.fn(),
  mockOpenSync: vi.fn(),
  mockCloseSync: vi.fn(),
  mockReaddirSync: vi.fn(),
}));

// CJS interop：实现里 `import AdmZip from 'adm-zip'` 取 default 导出，
// 旧 mock 只给具名 AdmZip 缺 default → 下载必抛 vitest interop 错误（2026-09-14 修复，预存 2 例失败的根因）
vi.mock('adm-zip', () => ({
  default: mockAdmZip,
  AdmZip: mockAdmZip,
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: mockExistsSync,
    rmSync: mockRmSync,
    openSync: mockOpenSync,
    closeSync: mockCloseSync,
    readdirSync: mockReaddirSync,
  };
});

vi.mock('node:child_process', () => ({
  spawnSync: mockSpawnSync,
}));

import { downloadAndInstallLlama, verifyLlamaInstall, deriveTagFromDownloadUrl } from './llama-update-download';

function makeMockResponse() {
  // headers 必须是带 .get 的 Headers 形态（生产代码 res.headers.get('content-length')），
  // 旧 mock 用 Map 缺 .get → 下载必抛 TypeError（2026-09-14 修复，预存 2 例失败的根因）
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    }),
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-length' ? '3' : null),
    },
  };
}

describe('verifyLlamaInstall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should succeed when llama-server.exe exists and version matches', async () => {
    mockExistsSync.mockReturnValue(true);
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'llama-server v0.4.0 (build b10852)',
      stderr: '',
    });

    const result = await verifyLlamaInstall('/path/to/llama', 'v0.4.0');

    expect(result.success).toBe(true);
    expect(result.actualVersion).toBe('0.4.0');
    expect(result.error).toBeUndefined();
  });

  it('should fail when llama-server.exe does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await verifyLlamaInstall('/path/to/llama', 'v0.4.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('should fail when spawnSync returns non-zero exit code', async () => {
    mockExistsSync.mockReturnValue(true);
    mockSpawnSync.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'error',
    });

    const result = await verifyLlamaInstall('/path/to/llama', 'v0.4.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('exited with code 1');
  });

  it('should detect version mismatch', async () => {
    mockExistsSync.mockReturnValue(true);
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'llama-server v0.3.0 (build b10800)',
      stderr: '',
    });

    const result = await verifyLlamaInstall('/path/to/llama', 'v0.4.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Version mismatch');
    expect(result.actualVersion).toBe('0.3.0');
  });

  it('should handle build number tags', async () => {
    mockExistsSync.mockReturnValue(true);
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'llama-server b10952',
      stderr: '',
    });

    const result = await verifyLlamaInstall('/path/to/llama', 'b10952');

    expect(result.success).toBe(true);
    expect(result.actualVersion).toBe('b10952');
  });
});

describe('deriveTagFromDownloadUrl', () => {
  it('从 GitHub 下载 URL 提取 nightly tag', () => {
    expect(deriveTagFromDownloadUrl(
      'https://github.com/ggml-org/llama.cpp/releases/download/b10955/llama-b10955-bin-win-cpu-x64.zip'
    )).toBe('b10955');
  });

  it('从 GitHub 下载 URL 提取 stable tag', () => {
    expect(deriveTagFromDownloadUrl(
      'https://github.com/ggml-org/llama.cpp/releases/download/v0.4.0/llama-bin-win-cpu-x64.zip'
    )).toBe('v0.4.0');
  });

  it('非 GitHub release URL 返回 null', () => {
    expect(deriveTagFromDownloadUrl('https://example.com/llama.zip')).toBeNull();
  });
});

describe('verifyLlamaInstall · 无 expectedTag（2026-09-14 修复）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('无 tag 时版本可解析即通过（替代旧硬编码 \'latest\' 的兜底）', async () => {
    mockExistsSync.mockReturnValue(true);
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'version: 0.3.0-dev (build 10679, commit 50f068fff)\nbuilt with Clang 20.1.8 for Windows x86_64',
      stderr: '',
    });

    const result = await verifyLlamaInstall('/path/to/llama');
    expect(result.success).toBe(true);
    expect(result.actualVersion).toBe('b10679');
  });

  it('无 tag 时版本不可解析仍失败', async () => {
    mockExistsSync.mockReturnValue(true);
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'garbage output',
      stderr: '',
    });

    const result = await verifyLlamaInstall('/path/to/llama');
    expect(result.success).toBe(false);
  });
});

describe('downloadAndInstallLlama', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdmZip.mockImplementation(() => ({
      extractAllTo: vi.fn(),
    }));
    (global.fetch as any) = vi.fn();
  });

  it('should download and extract successfully', async () => {
    (global.fetch as any).mockResolvedValue(makeMockResponse());

    const onProgress = vi.fn();
    const result = await downloadAndInstallLlama({
      downloadUrl: 'https://example.com/llama.zip',
      targetDir: '/path/to/llama',
      onProgress,
    });

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/llama.zip', expect.any(Object));
    expect(mockAdmZip).toHaveBeenCalled();
    expect(mockRmSync).toHaveBeenCalled();
  });

  it('should return error when download fails（404 持续 → 重试耗尽的友好错误）', async () => {
    // 2026-09-17 三轮：404 会触发自动重试（nightly 资产滞后），重试耗尽后报友好错误；
    // 经 downloadLlamaZip 的 retryAfterMs 加速（10ms）避免真实 15s 等待
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      body: null,
    });

    const result = await downloadAndInstallLlama({
      downloadUrl: 'https://example.com/missing.zip',
      targetDir: '/path/to/llama',
      retryAfterMs: 10,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('404');
    expect(result.error).toContain('可能还在上传');
  });

  it('should handle CUDA DLLs download', async () => {
    // Each fetch call must return a fresh response (ReadableStream can only be read once)
    (global.fetch as any).mockImplementation(() => Promise.resolve(makeMockResponse()));

    const onProgress = vi.fn();
    const result = await downloadAndInstallLlama({
      downloadUrl: 'https://example.com/llama.zip',
      cudaDllsUrl: 'https://example.com/dlls.zip',
      targetDir: '/path/to/llama',
      onProgress,
    });

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(1, 'https://example.com/llama.zip', expect.any(Object));
    expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://example.com/dlls.zip', expect.any(Object));
    // Should have called dlls stage
    const dllsCalls = onProgress.mock.calls.filter(c => c[1] === 'dlls');
    expect(dllsCalls.length).toBeGreaterThan(0);
  });

  it('should call extract stage', async () => {
    (global.fetch as any).mockResolvedValue(makeMockResponse());

    const onProgress = vi.fn();
    await downloadAndInstallLlama({
      downloadUrl: 'https://example.com/llama.zip',
      targetDir: '/path/to/llama',
      onProgress,
    });

    const extractCalls = onProgress.mock.calls.filter(c => c[1] === 'extract');
    expect(extractCalls.length).toBeGreaterThan(0);
  });
});

// 2026-09-17 修复 EBUSY：下载/安装拆两阶段 + 文件占用探测
import { downloadLlamaZip, extractLlamaZips, findLockedFiles, llamaLockProbeFiles } from './llama-update-download';

describe('llamaLockProbeFiles（2026-09-17 二轮：动态 ggml-*.dll 清单）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('llama-server.exe + 目录内全部 ggml-*.dll（含 CUDA 变体）', () => {
    mockReaddirSync.mockReturnValue(['llama-server.exe', 'ggml-base.dll', 'ggml-cuda.dll', 'llama-cli.exe', 'README.md', 'ggml-metal.dll']);
    const files = llamaLockProbeFiles('D:/AI/llama-cpp');
    expect(files).toContain('llama-server.exe');
    expect(files).toContain('ggml-cuda.dll'); // 二轮修复点：CUDA 变体必须命中
    expect(files).toContain('ggml-base.dll');
    expect(files).not.toContain('llama-cli.exe'); // 非 llama-server 的 exe 不探测
    expect(files).not.toContain('README.md');
    expect(files).toContain('ggml-metal.dll'); // 全部 ggml-*.dll 均纳入（残留文件被锁也是占用信号）
  });

  it('目录不可读 → 仅 llama-server.exe（不抛）', () => {
    mockReaddirSync.mockImplementation(() => { throw new Error('ENOENT'); });
    expect(llamaLockProbeFiles('D:/gone')).toEqual(['llama-server.exe']);
  });
});

describe('findLockedFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCloseSync.mockReturnValue(undefined);
  });

  it('文件可打开 → 返回空数组（空闲）', () => {
    mockExistsSync.mockReturnValue(true);
    mockOpenSync.mockReturnValue(3); // 返回 fd
    expect(findLockedFiles('/d/llama-cpp', ['llama-server.exe', 'ggml-base.dll'])).toEqual([]);
    expect(mockOpenSync).toHaveBeenCalledTimes(2);
    expect(mockCloseSync).toHaveBeenCalledTimes(2);
  });

  it('openSync 抛 EBUSY → 计入被锁文件', () => {
    mockExistsSync.mockReturnValue(true);
    const busy = new Error("EBUSY: resource busy or locked, open '/d/llama-cpp/ggml-base.dll'");
    busy.code = 'EBUSY';
    mockOpenSync.mockImplementation((p: string) => {
      if (p.endsWith('ggml-base.dll')) throw busy;
      return 4;
    });
    const locked = findLockedFiles('/d/llama-cpp', ['llama-server.exe', 'ggml-base.dll']);
    expect(locked).toHaveLength(1);
    expect(locked[0].endsWith('ggml-base.dll')).toBe(true);
    // llama-server.exe 成功打开 → 关闭句柄；ggml-base.dll 抛错 → 不关闭
    expect(mockCloseSync).toHaveBeenCalledTimes(1);
  });

  it('EPERM 同样视为被锁', () => {
    mockExistsSync.mockReturnValue(true);
    const eperm = new Error('EPERM: operation not permitted');
    eperm.code = 'EPERM';
    mockOpenSync.mockImplementation(() => { throw eperm; });
    expect(findLockedFiles('/d/llama-cpp', ['llama-server.exe'])).toHaveLength(1);
  });

  it('不存在的文件跳过（不打开）', () => {
    mockExistsSync.mockReturnValue(false);
    mockOpenSync.mockReturnValue(5);
    expect(findLockedFiles('/d/llama-cpp', ['llama-server.exe'])).toEqual([]);
    expect(mockOpenSync).not.toHaveBeenCalled();
  });

  it('其他错误码（如 EIO）不视为锁定', () => {
    mockExistsSync.mockReturnValue(true);
    const eio = new Error('EIO: i/o error');
    eio.code = 'EIO';
    mockOpenSync.mockImplementation(() => { throw eio; });
    expect(findLockedFiles('/d/llama-cpp', ['llama-server.exe'])).toEqual([]);
  });
});

describe('downloadLlamaZip（只下载，不触碰目标目录）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any) = vi.fn();
  });

  it('成功 → ok 且返回 zipPath；不实例化 AdmZip（不解压）', async () => {
    (global.fetch as any).mockImplementation(() => Promise.resolve(makeMockResponse()));
    const dl = await downloadLlamaZip({
      downloadUrl: 'https://example.com/llama.zip',
      cudaDllsUrl: 'https://example.com/dlls.zip',
    });
    expect(dl.ok).toBe(true);
    if (dl.ok) {
      expect(dl.zipPath).toMatch(/llama-cpp-download-\d+\.zip$/);
      expect(dl.dlZipPath).toMatch(/llama-cpp-dlls-\d+\.zip$/);
    }
    expect(mockAdmZip).not.toHaveBeenCalled(); // 下载阶段绝不解压
  });

  it('下载失败 → ok:false 携带错误，且清理临时 zip', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 500, body: null });
    const dl = await downloadLlamaZip({ downloadUrl: 'https://example.com/llama.zip' });
    expect(dl.ok).toBe(false);
    if (!dl.ok) expect(dl.error).toContain('HTTP 500');
    expect(mockRmSync).toHaveBeenCalled(); // finally 清理
  });

  it('dlls 下载失败 → 主 zip 与 dlls zip 都清理', async () => {
    (global.fetch as any).mockImplementation((url: string) =>
      url.includes('dlls')
        ? Promise.resolve({ ok: false, status: 502, body: null })
        : Promise.resolve(makeMockResponse())
    );
    const dl = await downloadLlamaZip({
      downloadUrl: 'https://example.com/llama.zip',
      cudaDllsUrl: 'https://example.com/dlls.zip',
    });
    expect(dl.ok).toBe(false);
    expect(mockRmSync).toHaveBeenCalledTimes(2);
  });

  // 2026-09-17 三轮：nightly 资产滞后于 release body（body 先写好全部下载链接，
  // 资产随后逐个上传，win-cuda-13.4 是最后之一，约 3 分钟窗口）→ 窗口内点下载必 404。
  // 修复：主包 404 自动重试等待资产就位；重试期间通过 onRetry 回调透出等待状态。
  it('主包 404（资产还在上传）→ 自动重试，资产就位后成功', async () => {
    // retryAfterMs: 10 —— 真实 10ms 延迟（不用 fake timers：ReadableStream 真实 I/O 与其不兼容）
    (global.fetch as any) = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, body: null })
      .mockResolvedValue(makeMockResponse());
    const onRetry = vi.fn();
    const dl = await downloadLlamaZip({
      downloadUrl: 'https://github.com/ggml-org/llama.cpp/releases/download/b10999/llama-b10999-bin-win-cuda-13.4-x64.zip',
      retryAfterMs: 10,
      onRetry,
    });
    expect(dl.ok).toBe(true);
    expect(onRetry).toHaveBeenCalledTimes(1); // 一次 404 → 一次重试提示
  });

  it('404 持续（重试次数用尽）→ 友好错误（资产可能还在上传/检查代理）', async () => {
    (global.fetch as any) = vi.fn().mockResolvedValue({ ok: false, status: 404, body: null });
    const onRetry = vi.fn();
    const dl = await downloadLlamaZip({
      downloadUrl: 'https://github.com/ggml-org/llama.cpp/releases/download/b10999/llama-b10999-bin-win-cuda-13.4-x64.zip',
      retryAfterMs: 10,
      onRetry,
    });
    expect(dl.ok).toBe(false);
    if (!dl.ok) {
      expect(dl.error).toContain('404'); // 原始状态码仍可见
      expect(dl.error).toContain('可能还在上传'); // 友好根因提示
    }
    expect(onRetry).toHaveBeenCalledTimes(3); // 最多重试 3 次
  });

  it('非 404 错误（500）不重试，立即失败', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 500, body: null });
    const dl = await downloadLlamaZip({
      downloadUrl: 'https://example.com/llama.zip',
      onRetry: vi.fn(),
    });
    expect(dl.ok).toBe(false);
    if (!dl.ok) expect(dl.error).toContain('Download failed: HTTP 500'); // 原错误通道保留
  });

  it('首次即 200 → 无重试', async () => {
    (global.fetch as any).mockImplementation(() => Promise.resolve(makeMockResponse()));
    const onRetry = vi.fn();
    const dl = await downloadLlamaZip({
      downloadUrl: 'https://example.com/llama.zip',
      onRetry,
    });
    expect(dl.ok).toBe(true);
    expect(onRetry).not.toHaveBeenCalled();
  });
});

describe('extractLlamaZips（已下载 zip 解压到目标目录）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdmZip.mockImplementation(() => ({ extractAllTo: vi.fn() }));
  });

  it('解压成功 → success', () => {
    const r = extractLlamaZips({ zipPath: '/tmp/a.zip' }, '/d/llama-cpp');
    expect(r).toEqual({ success: true });
    expect(mockAdmZip).toHaveBeenCalledTimes(1);
  });

  it('带 dlls zip → 解压两次', () => {
    const r = extractLlamaZips({ zipPath: '/tmp/a.zip', dlZipPath: '/tmp/b.zip' }, '/d/llama-cpp');
    expect(r).toEqual({ success: true });
    expect(mockAdmZip).toHaveBeenCalledTimes(2);
  });

  it('解压抛 EBUSY → success:false 携带消息（供上层转为友好提示）', () => {
    mockAdmZip.mockImplementation(() => ({
      extractAllTo: () => {
        const e = new Error("EBUSY: resource busy or locked, open 'D:/AI/llama-cpp/ggml-base.dll'");
        e.code = 'EBUSY';
        throw e;
      },
    }));
    const r = extractLlamaZips({ zipPath: '/tmp/a.zip' }, 'D:/AI/llama-cpp');
    expect(r.success).toBe(false);
    expect(r.error).toContain('EBUSY');
  });
});

// 2026-09-18 更新清理旧 CUDA DLL：跨版本变体更新（CUDA 12 ↔ CUDA 13）或切换非 CUDA
// 变体（CPU）后，目录里旧版 cudart64_XX.dll / cublas64_XX.dll / cublasLt64_XX.dll
// 是死文件（进程按 DLL 文件名精确加载，新构建只认新主版本号），更新完成后自动清理。
import { cudaMajorFromDllsUrl, staleCudaDllFiles, cleanupStaleCudaDlls } from './llama-update-download';

describe('cudaMajorFromDllsUrl（从 CUDA DLLs 下载链接解析保留主版本号）', () => {
  it('cudart-llama-bin-win-cuda-12.4-x64.zip → 12', () => {
    expect(cudaMajorFromDllsUrl('https://github.com/ggml-org/llama.cpp/releases/download/b11035/cudart-llama-bin-win-cuda-12.4-x64.zip')).toBe(12);
  });
  it('cuda-13.4 → 13', () => {
    expect(cudaMajorFromDllsUrl('https://github.com/ggml-org/llama.cpp/releases/download/b11035/cudart-llama-bin-win-cuda-13.4-x64.zip')).toBe(13);
  });
  it('无链接（非 CUDA 变体，如 CPU）→ null', () => {
    expect(cudaMajorFromDllsUrl(undefined)).toBeNull();
  });
  it('链接不含 cuda 版本号 → null（不猜测）', () => {
    expect(cudaMajorFromDllsUrl('https://github.com/ggml-org/llama.cpp/releases/download/b11035/llama-b11035-bin-win-cpu-x64.zip')).toBeNull();
  });
});

describe('staleCudaDllFiles（判定哪些 CUDA runtime DLL 应删除）', () => {
  const both = [
    'llama-server.exe', 'ggml-cuda.dll', 'ggml-base.dll', 'model.gguf',
    'cudart64_12.dll', 'cublas64_12.dll', 'cublasLt64_12.dll',
    'cudart64_13.dll', 'cublas64_13.dll', 'cublasLt64_13.dll',
  ];
  it('保留 13（更新到 CUDA 13）→ 只删三个 _12 文件', () => {
    expect(staleCudaDllFiles(both, 13)).toEqual([
      'cudart64_12.dll', 'cublas64_12.dll', 'cublasLt64_12.dll',
    ]);
  });
  it('保留 12（更新到 CUDA 12）→ 只删三个 _13 文件', () => {
    expect(staleCudaDllFiles(both, 12)).toEqual([
      'cudart64_13.dll', 'cublas64_13.dll', 'cublasLt64_13.dll',
    ]);
  });
  it('保留 null（更新到 CPU 等非 CUDA 变体）→ 三个家族全部删除', () => {
    expect(staleCudaDllFiles(both, null)).toEqual([
      'cudart64_12.dll', 'cublas64_12.dll', 'cublasLt64_12.dll',
      'cudart64_13.dll', 'cublas64_13.dll', 'cublasLt64_13.dll',
    ]);
  });
  it('exe / ggml-*.dll / 模型文件一律不碰', () => {
    const result = staleCudaDllFiles(both, null);
    expect(result).not.toContain('llama-server.exe');
    expect(result).not.toContain('ggml-cuda.dll');
    expect(result).not.toContain('ggml-base.dll');
    expect(result).not.toContain('model.gguf');
  });
  it('目录无 CUDA DLL → 空列表', () => {
    expect(staleCudaDllFiles(['llama-server.exe', 'ggml-cuda.dll'], 13)).toEqual([]);
  });
});

describe('cleanupStaleCudaDlls（删除 + 占用跳过，不阻塞安装）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCloseSync.mockReturnValue(undefined);
  });

  it('删除空闲的旧版本 DLL，被锁的跳过', () => {
    mockReaddirSync.mockImplementation((d: string) => {
      if (String(d) !== '/d/llama-cpp') throw new Error('ENOENT');
      return ['llama-server.exe', 'cudart64_12.dll', 'cublas64_12.dll', 'cudart64_13.dll'];
    });
    mockExistsSync.mockReturnValue(true);
    mockOpenSync.mockImplementation((p: string) => {
      if (String(p).includes('cublas64_12')) {
        const e = new Error('EBUSY');
        e.code = 'EBUSY';
        throw e;
      }
      return 3;
    });
    const r = cleanupStaleCudaDlls('/d/llama-cpp', 13);
    expect(r.deleted.sort()).toEqual(['cudart64_12.dll']);
    expect(r.skipped).toEqual(['cublas64_12.dll']);
    expect(mockRmSync).toHaveBeenCalledTimes(1);
  });

  it('无 stale 文件 → 不调 rmSync', () => {
    mockReaddirSync.mockReturnValue(['llama-server.exe', 'cudart64_13.dll', 'cublas64_13.dll', 'cublasLt64_13.dll']);
    mockExistsSync.mockReturnValue(true);
    mockOpenSync.mockReturnValue(3);
    const r = cleanupStaleCudaDlls('/d/llama-cpp', 13);
    expect(r.deleted).toEqual([]);
    expect(r.skipped).toEqual([]);
    expect(mockRmSync).not.toHaveBeenCalled();
  });

  it('目录不可读 → 空结果不抛', () => {
    mockReaddirSync.mockImplementation(() => { throw new Error('ENOENT'); });
    expect(cleanupStaleCudaDlls('/d/gone', 13)).toEqual({ deleted: [], skipped: [] });
  });
});
