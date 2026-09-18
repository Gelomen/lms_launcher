// llama.cpp 下载、解压、验证模块。
// 下载 Windows zip 包（支持代理与进度回调），解压到目标目录，
// 可选下载 CUDA DLLs，并运行 llama-server --version 验证安装。

import AdmZip from 'adm-zip';
import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, rmSync, openSync, closeSync, readdirSync } from 'node:fs';
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
  retryAfterMs,
}: {
  downloadUrl: string;
  cudaDllsUrl?: string;
  targetDir: string;
  proxy?: string;
  onProgress?: (percent: number, stage: 'download' | 'extract' | 'dlls') => void;
  retryAfterMs?: number;
}): Promise<{ success: boolean; error?: string }> {
  const dl = await downloadLlamaZip({ downloadUrl, cudaDllsUrl, proxy, onProgress, retryAfterMs });
  if (!dl.ok) return { success: false, error: dl.error };
  try {
    onProgress?.(0, 'extract');
    extractZip(dl.zipPath, targetDir);
    if (dl.dlZipPath) {
      onProgress?.(0, 'dlls');
      extractZip(dl.dlZipPath, targetDir);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    cleanupLlamaZips(dl);
  }
}

/**
 * llama_dir 的占用探测文件清单：llama-server.exe + 目录内全部 ggml-*.dll。
 *
 * 2026-09-17 修复（二轮）：旧硬编码清单 ['llama-server.exe', 'ggml-base.dll']
 * 漏掉 ggml-cuda.dll 等 CUDA 变体——CUDA 版 llama-server 运行时锁的是 ggml-cuda.dll，
 * 探测不到 → 安装阶段仍裸露 EBUSY。改动态枚举：任何 ggml-*.dll 被锁都能命中。
 */
export function llamaLockProbeFiles(dir: string): string[] {
  const files: string[] = ['llama-server.exe'];
  try {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('ggml-') && name.endsWith('.dll')) files.push(name);
    }
  } catch { /* 目录不存在时仅探测 exe */ }
  return files;
}

/**
 * 探测目标目录中的文件是否被进程锁定（Windows 上运行中的 exe 锁住其 DLL）。
 *
 * 2026-09-17 修复：更新解压覆盖写 EBUSY 的根因是 llama-server 正在运行。
 * 主进程无法直接枚举文件句柄持有者，故用「以独占写模式打开」探测：
 * 能被打开 = 空闲；EBUSY/EPERM/EACCES = 被锁。逐个文件探测并关闭句柄。
 *
 * @returns 被锁定的文件路径数组（空数组表示全部空闲）
 */
export function findLockedFiles(dir: string, filenames: string[]): string[] {
  const locked: string[] = [];
  for (const name of filenames) {
    const p = join(dir, name);
    if (!existsSync(p)) continue;
    let fd: number | null = null;
    try {
      fd = openSync(p, 'a+'); // 追加写模式：不截断内容，仅验证可打开
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
        locked.push(p);
      }
      // 其他错误（如 ENOENT 竞态）不视为锁定
    } finally {
      if (fd !== null) {
        try { closeSync(fd); } catch { /* 已关闭 */ }
      }
    }
  }
  return locked;
}

/**
 * 仅下载 llama.cpp 更新 zip 到临时目录（不触碰目标目录）。
 *
 * 2026-09-17 修复：原 downloadAndInstallLlama 下载后立即解压到 llama_dir，
 * 若 llama-server 正在运行则 DLL 被锁 → EBUSY。拆分为下载/安装两阶段后，
 * 下载期间不影响运行中的服务；安装前由调用方确认服务已停止。
 *
 * @param retryAfterMs 404 重试间隔（ms），默认 15000（测试可传小值）
 * @param onRetry 404 重试前回调（供上层记日志/提示「等待资产就位」）
 * @returns ok 时携带 zip 路径；失败时携带 error
 */
export async function downloadLlamaZip({
  downloadUrl,
  cudaDllsUrl,
  proxy,
  onProgress,
  retryAfterMs,
  onRetry,
}: {
  downloadUrl: string;
  cudaDllsUrl?: string;
  proxy?: string;
  onProgress?: (percent: number, stage: 'download' | 'extract' | 'dlls') => void;
  retryAfterMs?: number;
  onRetry?: (attempt: number) => void;
}): Promise<
  | { ok: true; zipPath: string; dlZipPath?: string }
  | { ok: false; error: string }
> {
  const zipPath = join(tmpdir(), 'llama-cpp-download-' + Date.now() + '.zip');
  const dlZipPath = join(tmpdir(), 'llama-cpp-dlls-' + Date.now() + '.zip');
  try {
    await downloadZipWith404Retry(downloadUrl, zipPath, proxy, onProgress, retryAfterMs, onRetry);
    if (cudaDllsUrl) {
      onProgress?.(0, 'dlls');
      await downloadZip(cudaDllsUrl, dlZipPath, proxy, onProgress);
    }
    return { ok: true, zipPath, dlZipPath: cudaDllsUrl ? dlZipPath : undefined };
  } catch (e) {
    cleanupLlamaZips({ zipPath, dlZipPath });
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 将已下载的 zip 解压到目标目录（覆盖现有文件）。
 *
 * @param zips  downloadLlamaZip 成功返回的 zip 路径
 * @returns 失败时携带 error（典型：目标 DLL 被锁 → EBUSY）
 */
export function extractLlamaZips(
  zips: { zipPath: string; dlZipPath?: string },
  targetDir: string
): { success: boolean; error?: string } {
  try {
    extractZip(zips.zipPath, targetDir);
    if (zips.dlZipPath) extractZip(zips.dlZipPath, targetDir);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 下载主包，404 自动重试（2026-09-17 三轮：nightly 资产滞后修复）。
 *
 * 根因：llama.cpp nightly 工作流**先创建 release（body 已含全部下载链接），
 * 再逐个上传资产**，全部上传完成约需 3 分钟（b10999 实测：release 12:31:41 发布，
 * win-cuda-13.4 资产 12:34:35 才上传完）。窗口内点击下载 → GitHub 对尚未就位的资产
 * 返回 404（release 存在但资产缺失）。浏览器稍后能打开同一链接即为佐证。
 *
 * 策略：主包 404 → 间隔 retryAfterMs（默认 15s）重试，最多 3 次；仍 404 →
 * 友好错误（提示资产可能还在上传 + 检查代理）。其他状态码（500 等）立即失败，
 * 不走重试（可能是代理/网络问题，重试无意义且掩盖真因）。
 * 仅主包重试：dlls 包上传序靠前，404 罕见，失败走原错误通道。
 */
async function downloadZipWith404Retry(
  url: string,
  dest: string,
  proxy?: string,
  onProgress?: (pct: number, stage: 'download' | 'extract' | 'dlls') => void,
  retryAfterMs?: number,
  onRetry?: (attempt: number) => void
): Promise<void> {
  const waitMs = retryAfterMs ?? 15000;
  const maxAttempts = 4; // 1 次原始请求 + 3 次重试
  for (let attempt = 1; ; attempt++) {
    try {
      await downloadZip(url, dest, proxy, onProgress);
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isTransient404 = msg.includes('Download failed: HTTP 404');
      if (!isTransient404) throw e;
      if (attempt >= maxAttempts) {
        throw new Error(
          '下载失败：HTTP 404——该版本的下载资产可能还在上传（nightly 发布后资产需几分钟陆续就位，稍后重试即可）；若持续 404 请检查代理设置'
        );
      }
      onRetry?.(attempt);
      await new Promise<void>((r) => setTimeout(r, waitMs));
    }
  }
}

function cleanupLlamaZips(zips: { zipPath: string; dlZipPath?: string }): void {
  rmSync(zips.zipPath, { force: true });
  if (zips.dlZipPath) rmSync(zips.dlZipPath, { force: true });
}

/**
 * 从 CUDA DLLs 下载链接解析保留的主版本号（如 cuda-12.4 → 12）。
 *
 * 官方 DLLs 包命名：cudart-llama-bin-win-cuda-<major.minor>-<arch>.zip（2026-09 实测
 * b11035：cuda-12.4 / cuda-13.4）。链接缺失（非 CUDA 变体，如 CPU）或无法解析时
 * 返回 null——调用方将 null 视为「本更新不含 CUDA，三个 DLL 家族全部视为过期」。
 */
export function cudaMajorFromDllsUrl(url?: string): number | null {
  if (!url) return null;
  const m = url.match(/cuda-(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * 判定 llama_dir 中哪些 CUDA runtime DLL 已过期（应删除）。
 *
 * 背景：Windows 上进程按 DLL 文件名精确加载（cudart64_12.dll 与 cudart64_13.dll
 * 互不冲突），跨 CUDA 版本更新（12 ↔ 13）或切换到非 CUDA 变体（CPU）后，
 * 旧版 DLL 是永不加载的死文件，自动清理。
 *
 * 只处理三个精确命名家族：cudart64_*.dll / cublas64_*.dll / cublasLt64_*.dll
 * （官方 CUDA DLLs 包的全部内容）。keepMajor 为 null（非 CUDA 变体）时三个家族
 * 全删（用户 2026-09-18 定稿：CPU 变体安装后 CUDA DLL 一并删除，目录最干净）。
 *
 * @param names 目录内文件名列表
 * @param keepMajor 本更新保留的 CUDA 主版本号；null = 全部删除
 */
export function staleCudaDllFiles(names: string[], keepMajor: number | null): string[] {
  const stale: string[] = [];
  for (const name of names) {
    const m = name.match(/^(?:cudart64|cublas64|cublasLt64)_(\d+)\.dll$/i);
    if (!m) continue;
    if (keepMajor === null || parseInt(m[1], 10) !== keepMajor) stale.push(name);
  }
  return stale;
}

/**
 * 删除目录中过期的 CUDA runtime DLL（更新解压覆盖后调用）。
 *
 * 删除前逐个做占用探测（复用 findLockedFiles 的 openSync 'a+' 机制）：被外部
 * 进程锁住的文件跳过并计入 skipped——本函数绝不抛错、绝不阻塞安装主流程
 * （调用点在解压成功之后，删除失败/跳过只记日志，不算更新失败）。
 *
 * @returns deleted 实际删除的文件名；skipped 因占用跳过的文件名
 */
export function cleanupStaleCudaDlls(
  dir: string,
  keepMajor: number | null
): { deleted: string[]; skipped: string[] } {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return { deleted: [], skipped: [] };
  }
  const stale = staleCudaDllFiles(names, keepMajor);
  const locked = new Set(findLockedFiles(dir, stale).map((p) => p.split(/[\\/]/).pop()));
  const deleted: string[] = [];
  const skipped: string[] = [];
  for (const name of stale) {
    if (locked.has(name)) {
      skipped.push(name);
      continue;
    }
    rmSync(join(dir, name), { force: true });
    deleted.push(name);
  }
  return { deleted, skipped };
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

/**
 * 安装完成日志文案（2026-09-18 用户定稿：解压成功即安装完成，--version 只是
 * 辅助告知当前版本号，其失败一律非致命——跨架构变体（如 arm64 exe 装在 x64 机器）
 * 下 --version 必然不可用，不得否定已完成的文件覆盖）。
 * 成功 →「安装完成：bNNNNN」（无版本号 →「安装完成：版本号未知」）；
 * 失败 →「安装完成（未能确认本地版本号：原因）」（安装仍算成功）。
 */
export function installVerifyMessage(
  result: { success: true; actualVersion?: string } | { success?: false; error?: string }
): string {
  if (result.success && result.actualVersion) return '安装完成：' + result.actualVersion;
  if (result.success) return '安装完成：版本号未知';
  return '安装完成（未能确认本地版本号：' + (result.error || '未知原因') + '）';
}
