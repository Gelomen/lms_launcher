import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to create mocks that are available before module loads
const { mockAdmZip, mockExistsSync, mockRmSync, mockSpawnSync } = vi.hoisted(() => ({
  mockAdmZip: vi.fn(),
  mockExistsSync: vi.fn(),
  mockRmSync: vi.fn(),
  mockSpawnSync: vi.fn(),
}));

vi.mock('adm-zip', () => ({
  AdmZip: mockAdmZip,
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: mockExistsSync,
    rmSync: mockRmSync,
  };
});

vi.mock('node:child_process', () => ({
  spawnSync: mockSpawnSync,
}));

import { downloadAndInstallLlama, verifyLlamaInstall } from './llama-update-download';

function makeMockResponse() {
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    }),
    headers: new Map([['content-length', '3']]),
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
