// downloadToFile 单元测试（2026-10-12 更新下载 EPERM 崩溃修复）。
// 复现目标：writeStream 出错若无人监听 → 主进程 uncaughtException → Electron 弹
// 「A JavaScript error occurred in the main process」。pipeline 对每个流挂 error 监听，
// 断言所有失败路径都以 reject 返回（携带原 errno），EPERM 按次数重试、其他错误不重试。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { Writable } from 'node:stream';
import { join } from 'node:path';
import { downloadToFile } from './update-download';

const TMP = join(process.cwd(), '.temp', 'update-download-test');

// Buffer 按固定块大小包装成 fetch body 的 ReadableStream（与 undici body 同形）
function bodyStream2(buf: Buffer, chunk = 4): ReadableStream<Uint8Array> {
  const parts: Buffer[] = [];
  for (let i = 0; i < buf.length; i += chunk) parts.push(buf.subarray(i, i + chunk));
  let n = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (n < parts.length) controller.enqueue(parts[n++]);
      else controller.close();
    },
  });
}

function fetchOk(buf: Buffer, chunk = 4): typeof fetch {
  return (async () => new Response(bodyStream2(buf, chunk), {
    status: 200,
    headers: { 'content-length': String(buf.length) },
  })) as unknown as typeof fetch;
}

function errno(code: string): NodeJS.ErrnoException {
  const e = new Error(code + ': operation not permitted, open \'x.zip\'') as NodeJS.ErrnoException;
  e.code = code;
  return e;
}

// 伪造流：第一块写入成功，第二块写入时报错（模拟真实 fs 流：open 成功、写盘时才 EPERM；
// 且错误发生在 write 回调内 → pipeline 的 error 监听必然已挂载）
function failingWritable(code: string, failAfter: number = 1): Writable {
  let n = 0;
  return new Writable({
    write(_c, _e, cb) {
      n++;
      if (n <= failAfter) { cb(); return; }
      setImmediate(() => { this.emit('error', errno(code)); });
      // 不 cb：真实 fs 出错后流已不可用；pipeline 靠 error 监听退出
    },
  });
}

beforeEach(() => { fs.mkdirSync(TMP, { recursive: true }); });
afterEach(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

describe('downloadToFile', () => {
  it('正常路径：完整落盘 + 进度 0→100 + 返回 size/total', async () => {
    const buf = Buffer.from('hello world, this is update package body');
    const dest = join(TMP, 'ok.zip');
    const pcts: number[] = [];
    const r = await downloadToFile({
      fetchFn: fetchOk(buf),
      url: 'https://example.test/x.zip',
      dest,
      signal: new AbortController().signal,
      onProgress: (p) => { pcts.push(p); },
    });
    expect(r.size).toBe(buf.length);
    expect(r.total).toBe(buf.length);
    expect(fs.readFileSync(dest).toString()).toBe(buf.toString());
    // 首个事件是首块后的 floor(4/44*100)=9（不是 0——0 只有无变化时不回调），末个必为 100
    expect(pcts[0]).toBeLessThan(100);
    expect(pcts[pcts.length - 1]).toBe(100);
    for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeGreaterThan(pcts[i - 1]); // 单调递增
  });

  it('EPERM（首次尝试写盘时被锁）：自动重试后成功，onRetry 记录尝试序号 1', async () => {
    const buf = Buffer.from('payload bytes 1234567890'); // 24B → 6 块
    const dest = join(TMP, 'retry.zip');
    let calls = 0;
    const retries: number[] = [];
    const r = await downloadToFile({
      fetchFn: fetchOk(buf),
      url: 'u',
      dest,
      signal: new AbortController().signal,
      retryDelayMs: 5,
      onRetry: (a) => { retries.push(a); },
      createStream: (d) => {
        calls++;
        return calls === 1 ? failingWritable('EPERM', 1) : fs.createWriteStream(d);
      },
    });
    expect(calls).toBe(2);
    expect(retries).toEqual([1]);
    expect(r.size).toBe(buf.length);
    expect(fs.readFileSync(dest).toString()).toBe(buf.toString());
  });

  it('EPERM 持续达到 maxAttempts：以原 EPERM reject，恰好重试 maxAttempts-1 次', async () => {
    const dest = join(TMP, 'always-perm.zip');
    let calls = 0;
    const retries: number[] = [];
    await expect(
      downloadToFile({
        fetchFn: fetchOk(Buffer.from('0123456789')), // 5 块
        url: 'u',
        dest,
        signal: new AbortController().signal,
        maxAttempts: 3,
        retryDelayMs: 5,
        onRetry: (a) => { retries.push(a); },
        createStream: () => { calls++; return failingWritable('EPERM', 1); },
      }),
    ).rejects.toMatchObject({ code: 'EPERM' });
    expect(calls).toBe(3);
    expect(retries).toEqual([1, 2]);
  });

  it('非 EPERM 错误（EACCES）：不重试，原样 reject', async () => {
    const dest = join(TMP, 'eacces.zip');
    let calls = 0;
    const retries: number[] = [];
    await expect(
      downloadToFile({
        fetchFn: fetchOk(Buffer.from('0123456789')),
        url: 'u',
        dest,
        signal: new AbortController().signal,
        retryDelayMs: 5,
        onRetry: (a) => { retries.push(a); },
        createStream: () => { calls++; return failingWritable('EACCES', 1); },
      }),
    ).rejects.toMatchObject({ code: 'EACCES' });
    expect(calls).toBe(1);
    expect(retries).toEqual([]);
  });

  it('写入中途 EPERM（前 2 块成功后被锁）：reject 退出等待，不挂死、不 unhandledRejection', async () => {
    const dest = join(TMP, 'mid-perm.zip');
    const buf = Buffer.from('0123456789abcdefgh'); // 18B → 5 块（4/4/4/4/2）
    let calls = 0;
    const retries: number[] = [];
    await expect(
      downloadToFile({
        fetchFn: fetchOk(buf, 4),
        url: 'u',
        dest,
        signal: new AbortController().signal,
        retryDelayMs: 5,
        onRetry: (a) => { retries.push(a); },
        createStream: () => { calls++; return failingWritable('EPERM', 2); },
      }),
    ).rejects.toMatchObject({ code: 'EPERM' });
    expect(calls).toBe(3);
    expect(retries).toEqual([1, 2]);
  });

  it('无 Content-Length：total=null，pct 恒 0', async () => {
    const buf = Buffer.from('no-cl-body');
    const dest = join(TMP, 'nocl.zip');
    const pcts: number[] = [];
    const fetchNoCl = (async () => new Response(bodyStream2(buf), { status: 200 })) as unknown as typeof fetch;
    const r = await downloadToFile({
      fetchFn: fetchNoCl,
      url: 'u',
      dest,
      signal: new AbortController().signal,
      onProgress: (p) => { pcts.push(p); },
    });
    expect(r.total).toBeNull();
    expect(r.size).toBe(buf.length);
    expect(pcts.every((p) => p === 0)).toBe(true);
  });

  it('HTTP 500：reject（无重试、未触达写流）', async () => {
    const fetch500 = (async () => new Response(bodyStream2(Buffer.from('err')), { status: 500 })) as unknown as typeof fetch;
    let calls = 0;
    const retries: number[] = [];
    await expect(
      downloadToFile({
        fetchFn: fetch500,
        url: 'u',
        dest: join(TMP, '500.zip'),
        signal: new AbortController().signal,
        retryDelayMs: 5,
        onRetry: (a) => { retries.push(a); },
        createStream: () => { calls++; return failingWritable('EPERM', 1); },
      }),
    ).rejects.toThrow('HTTP 500');
    expect(calls).toBe(0);
    expect(retries).toEqual([]);
  });
});
