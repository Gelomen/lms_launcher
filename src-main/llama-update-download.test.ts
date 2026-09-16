import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to create mocks that are available before module loads
const { mockAdmZip, mockExistsSync, mockRmSync, mockSpawnSync, mockOpenSync, mockCloseSync } = vi.hoisted(() => ({
  mockAdmZip: vi.fn(),
  mockExistsSync: vi.fn(),
  mockRmSync: vi.fn(),
  mockSpawnSync: vi.fn(),
  mockOpenSync: vi.fn(),
  mockCloseSync: vi.fn(),
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

  it('should return error when download fails', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      body: null,
    });

    const result = await downloadAndInstallLlama({
      downloadUrl: 'https://example.com/missing.zip',
      targetDir: '/path/to/llama',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Download failed: HTTP 404');
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
import { downloadLlamaZip, extractLlamaZips, findLockedFiles } from './llama-update-download';

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
