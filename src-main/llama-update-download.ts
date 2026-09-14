// llama.cpp 下载、解压、验证模块。
// 下载 Windows zip 包（支持代理与进度回调），解压到目标目录，
// 可选下载 CUDA DLLs，并运行 llama-server --version 验证安装。

import AdmZip from 'adm-zip';
import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, rmSync } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { parseLlamaVersion } from './llama-update-version';

/**
 * 流式下载 zip 文件到磁盘，带进度回调。
 */
async function downloadZip(
  url: string,
  dest: string,
  proxy?: string,
  onProgress?: (pct: number, stage: 'download' | 'extract' | 'dlls') => void
): Promise<void> {
  let fetchFn: typeof fetch = fetch;
  let dispatcher: unknown = undefined;

  if (proxy) {
    const agent = new ProxyAgent({ uri: proxy });
    dispatcher = agent;
    fetchFn = undiciFetch as unknown as typeof fetch;
  }

  try {
    const res = await (fetchFn as any)(url, {
      headers: { 'User-Agent': 'lms-launcher' },
      dispatcher,
    });

    if (!res.ok || !res.body) {
      throw new Error('Download failed: HTTP ' + res.status);
    }

    const total = parseInt(res.headers.get('content-length') ?? '0', 10) || null;
    let received = 0;
    let lastPct = -1;

    const meter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        received += chunk.length;
        const pct = total ? Math.floor((received * 100) / total) : 0;
        if (pct !== lastPct) {
          lastPct = pct;
          onProgress?.(pct, 'download');
        }
        this.push(chunk);
        cb();
      },
    });

    const src = Readable.fromWeb(
      res.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>
    );
    const out = createWriteStream(dest);

    await pipeline(src, meter, out);
  } finally {
    if (proxy) {
      // Close the proxy agent to release connections
      const agent = dispatcher as any;
      if (agent?.close) {
        await agent.close().catch(() => {});
      }
    }
  }
}

/**
 * 解压 zip 到目标目录（覆盖现有文件）。
 */
function extractZip(zipPath: string, targetDir: string): void {
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(targetDir, true);
}

/**
 * 下载、解压并安装 llama.cpp 到目标目录。
 *
 * @param downloadUrl - llama.cpp Windows zip 下载链接
 * @param cudaDllsUrl - CUDA DLLs zip 下载链接（可选）
 * @param targetDir - 目标安装目录
 * @param proxy - 代理 URL（可选）
 * @param onProgress - 进度回调 (percent, stage)
 * @returns 安装结果
 */
export async function downloadAndInstallLlama({
  downloadUrl,
  cudaDllsUrl,
  targetDir,
  proxy,
  onProgress,
}: {
  downloadUrl: string;
  cudaDllsUrl?: string;
  targetDir: string;
  proxy?: string;
  onProgress?: (percent: number, stage: 'download' | 'extract' | 'dlls') => void;
}): Promise<{ success: boolean; error?: string }> {
  const tmpZip = join(tmpdir(), 'llama-cpp-download-' + Date.now() + '.zip');
  const tmpDlZip = join(tmpdir(), 'llama-cpp-dlls-' + Date.now() + '.zip');

  try {
    // 1. 下载主 zip
    await downloadZip(downloadUrl, tmpZip, proxy, onProgress);

    // 2. 解压到目标目录
    onProgress?.(0, 'extract');
    extractZip(tmpZip, targetDir);

    // 3. 下载并解压 CUDA DLLs（如果提供）
    if (cudaDllsUrl) {
      onProgress?.(0, 'dlls');
      await downloadZip(cudaDllsUrl, tmpDlZip, proxy, onProgress);
      extractZip(tmpDlZip, targetDir);
      rmSync(tmpDlZip, { force: true });
    }

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    // 清理临时文件
    rmSync(tmpZip, { force: true });
    rmSync(tmpDlZip, { force: true });
  }
}

/**
 * 从下载 URL 推导 release tag。
 * URL 格式：https://github.com/ggml-org/llama.cpp/releases/download/<tag>/<file>.zip
 *
 * @returns tag（如 "b10955" 或 "v0.4.0"），格式不匹配时返回 null
 */
export function deriveTagFromDownloadUrl(url: string): string | null {
  const m = url.match(/releases\/download\/([^/]+)\/[^/]+$/);
  return m ? m[1] : null;
}

/**
 * 验证 llama.cpp 安装：检查 llama-server.exe 存在并运行 --version。
 *
 * @param targetDir - llama.cpp 安装目录
 * @param expectedTag - 预期的版本 tag（如 "v0.4.0" 或 "b10952"）；缺省时
 *   只验证 exe 存在且版本输出可解析（2026-09-14 修复：旧实现硬编码传 'latest'
 *   导致验证恒失败；现由调用方从下载 URL 推导真实 tag）
 * @returns 验证结果
 */
export async function verifyLlamaInstall(
  targetDir: string,
  expectedTag?: string
): Promise<{ success: boolean; actualVersion?: string; error?: string }> {
  const exePath = join(targetDir, 'llama-server.exe');

  // 检查文件存在
  if (!existsSync(exePath)) {
    return {
      success: false,
      error: 'llama-server.exe not found at ' + exePath,
    };
  }

  // 运行 --version
  try {
    const result = spawnSync(exePath, ['--version'], {
      timeout: 10000,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
      return {
        success: false,
        error: 'llama-server --version exited with code ' + result.status,
      };
    }

    const output = (result.stdout || result.stderr || '').trim();
    const parsed = parseLlamaVersion(output);

    if (!parsed) {
      return {
        success: false,
        error: 'Failed to parse version output: ' + output,
      };
    }

    // 构建实际版本字符串用于比较
    let actualVersionStr: string;
    if (parsed.type === 'release' && parsed.version) {
      actualVersionStr = parsed.version;
    } else if (parsed.build !== undefined) {
      actualVersionStr = 'b' + parsed.build;
    } else {
      actualVersionStr = output;
    }

    // 比较版本 tag（expectedTag 缺省时：版本可解析即通过）
    const expectedClean = expectedTag ? expectedTag.replace(/^v/, '') : null;
    let success = false;

    if (!expectedClean) {
      success = true;
    } else if (expectedClean.startsWith('b')) {
      // Build 号比较
      const expectedBuild = parseInt(expectedClean.slice(1), 10);
      const actualBuild = parsed.build;
      if (actualBuild !== undefined) {
        success = actualBuild >= expectedBuild;
      }
    } else {
      // Release 版本比较
      const localVer = parsed.version;
      if (localVer !== undefined) {
        const localParts = localVer.split('.').map(Number);
        const remoteParts = expectedClean.split('.').map(Number);
        success = true;
        for (let i = 0; i < 3; i++) {
          if (remoteParts[i] > localParts[i]) { success = false; break; }
          if (remoteParts[i] < localParts[i]) { success = true; break; }
        }
      }
    }

    return {
      success,
      actualVersion: actualVersionStr,
      error: success ? undefined : 'Version mismatch: expected ' + expectedTag + ', got ' + actualVersionStr,
    };
  } catch (e) {
    return {
      success: false,
      error: 'Failed to run llama-server: ' + (e instanceof Error ? e.message : String(e)),
    };
  }
}
