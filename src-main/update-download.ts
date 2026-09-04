// 自动更新：更新包流式下载到文件（可单测，不依赖 Electron）。
// 职责：fetch → 流式落盘（pipeline 统一处理 error/backpressure/清理）→
// EPERM 延迟重试（杀毒实时扫描偶发锁文件）→ 返回落盘大小与 Content-Length 供完整性校验。
// 失败时残留半成品文件由调用方（main.ts download_update）负责删除。
//
// 为什么用 pipeline 而非手写 reader 循环：writeStream 的 error 若无人监听会成为主进程
// uncaughtException → Electron 弹「A JavaScript error occurred in the main process」
//（2026-10 实测：写入时 Defender 实时扫描锁文件 EPERM，旧代码 createWriteStream 后
// 无任何 error 监听，报错弹窗且下载状态卡死）。pipeline 对链上每个流挂 error 监听，
// 任一失败即 reject 并销毁全部流。
import { createWriteStream, statSync } from 'node:fs';
import { Readable, Transform, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface DownloadToFileOptions {
  fetchFn: typeof fetch;
  url: string;
  dest: string;
  signal: AbortSignal;
  /** 每次整数百分比变化时回调（pct 0-100）；无 Content-Length 时恒 0 */
  onProgress?: (pct: number) => void;
  /** EPERM 最大尝试次数，默认 3 */
  maxAttempts?: number;
  /** EPERM 重试间隔毫秒，默认 2000（测试用小值） */
  retryDelayMs?: number;
  /** 第 a 次尝试以 EPERM 失败、即将重试时回调 */
  onRetry?: (attempt: number) => void;
  /** 写流工厂（默认 createWriteStream）；测试注入伪造流 */
  createStream?: (dest: string) => Writable;
}

export interface DownloadToFileResult {
  /** 落盘字节数 */
  size: number;
  /** 服务器 Content-Length；null = 未提供（调用方跳过大小校验） */
  total: number | null;
}

export const sleep = (ms: number): Promise<void> => new Promise<void>((r) => setTimeout(r, ms));

// errno 提取：任何带 code 的错误对象（含 undici/Node 的 ErrnoException）
function errCode(e: unknown): string | null {
  return (e as { code?: string } | null)?.code ?? null;
}

export async function downloadToFile(opts: DownloadToFileOptions): Promise<DownloadToFileResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const retryDelayMs = opts.retryDelayMs ?? 2000;
  const openStream = opts.createStream ?? ((d: string) => createWriteStream(d));

  // 单次下载：fetch + pipeline 落盘。任何一步失败 → 抛错（含 EPERM）给重试循环。
  const once = async (): Promise<DownloadToFileResult> => {
    const res = await opts.fetchFn(opts.url, { signal: opts.signal, redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
    const total = parseInt(res.headers.get('content-length') ?? '0', 10) || null;
    const out = openStream(opts.dest);
    let received = 0;
    let lastPct = -1;
    // 计量 Transform：每块经过时累计字节并推进度（0-100 整数变化才回调）
    const meter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        received += chunk.length;
        const pct = total ? Math.floor((received * 100) / total) : 0;
        if (pct !== lastPct) {
          lastPct = pct;
          opts.onProgress?.(pct);
        }
        this.push(chunk);
        cb();
      },
    });
    // DOM-lib 与 node stream/web 的 ReadableStream 类型不兼容 → 显式桥接为 node 侧类型（运行时同形）
    const src = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>);
    // pipeline：任一流 error → reject 该 error 并销毁 src/meter/out（无挂死、无 unhandled error）
    await pipeline(src, meter, out);
    return { size: statSync(opts.dest).size, total };
  };

  // EPERM 重试：杀毒实时扫描偶发锁文件 → open/写入 EPERM；短延迟后通常解除。
  // 其他错误（网络/HTTP/上游校验）不重试，直接抛给调用方。
  for (let a = 1; ; a++) {
    try {
      return await once();
    } catch (e) {
      if (errCode(e) === 'EPERM' && a < maxAttempts) {
        opts.onRetry?.(a);
        await sleep(retryDelayMs);
        continue;
      }
      throw e;
    }
  }
}
