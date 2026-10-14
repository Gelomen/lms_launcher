// src-main/ql-pty-host.ts
// 任务 5（2026-10-14-quick-launch-admin §6.6）：提权 PTY 宿主入口 —— 被 §6.4 的硬链接 node.exe 直接执行。
// 边界（本表 B1 / F1-F4）：不 import electron（索引 K12）、不 import main.ts；终端映射只复用 quick-launch.ts:146-150
//   的 shellExe（F3：不复制第二张映射表）；停止语义只复用 quick-launch.ts:122-142 的 PtyProcess.stopGraceful
//   （§6.6-7：在提权进程里 taskkill 打得到整棵提权进程树）；不新增依赖（F4）；不含汉字字面量（G6）。
// 错误只发 ERR{stage,message}，stage 取 token / spawn / pipe 这类机器可读片段（G1 / §6.6-9）：
//   文案在主进程侧按词典生成（§6.10），宿主里不出现任何 t() 调用，也不新增错误前缀。
// 帧的 payload 一律是 string（索引 K32）：node-pty 的 onData 交出的就是 JS 字符串，直接 encodeFrame(DATA, data)；
//   自己拼 Buffer 字节再 toString 反而失真（合法字符串的 UTF-8 往返无损）。
import * as net from 'node:net';
import * as pty from '@lydell/node-pty';
import { PtyProcess, shellExe } from './quick-launch';
import type { TerminalId } from './quick-launch-config';
import { HOST_FRAME, createFrameParser, encodeFrame, type HostFrameType } from './ql-host-protocol';

// §6.6-8：管道断开 = 视同 STOP{timeoutSecs:3}。3 与 quick-launch.ts:28 的 STOP_TIMEOUT_SECS 同值；
// 那个常量未导出，为了它去改 quick-launch.ts 属本任务 B 段之外（G9），所以在这里写死并标出处。
const PIPE_GONE_TIMEOUT_SECS = 3;

/** 宿主用到的最小管道面：真实现是 net.Socket，单测里是 EventEmitter + 收集写出的帧（plan 任务 5 步骤 1）。 */
export interface HostSocket {
  write(chunk: Buffer | string): unknown;
  on(event: 'data', listener: (chunk: Buffer) => void): unknown;
  on(event: 'close', listener: () => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
}

/** ERR 的 message 只放原始错误文本（G1：文案在主进程侧按词典生成，宿主不带文案） */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 帧载荷一律按「对象或空对象」收：坏 JSON 不炸宿主（§6.5 的解析器只保证字节边界，不保证 JSON 合法） */
function parseObject(payload: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(payload);
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** STOP 的 timeoutSecs：帧里没给可用的秒数就是「不给宽限期」，不猜默认值（§6.6-7 只定义「按帧给的超时」） */
function finiteOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 宿主的装配（§6.6 的 1-9 步）。管道与 pty 都来自 deps：单测注入假 socket 与假 pty（plan 任务 5 的签名块逐字）。
 * argv: [node, script, pipeName, token]（§6.4-4 / 本表 C1）—— 终端 id、尺寸、cwd 一律在 HELLO 帧里传（索引 K2）。
 */
export function runHost(deps: { connect(name: unknown): HostSocket; spawn: typeof pty.spawn }): void {
  const argv = process.argv.slice(2);
  const pipeName = argv[0];
  const hostToken = argv[1];

  let proc: PtyProcess | null = null; // §6.6-3 之后才有：真 PtyProcess，停止语义与非提权路径同一份
  let stopping = false;              // 停止路径只走一次：STOP 帧与管道断开是同一条路（§6.6-7/8 的幂等）
  let finished = false;              // 已发 EXIT/ERR：之后的事件不再发第二帧、不再第二次退出

  const socket = deps.connect(pipeName); // §6.6-1

  const send = (type: HostFrameType, payload: string): void => {
    try {
      socket.write(encodeFrame(type, payload));
    } catch {
      // 管道已断：没有可通知的一方。主进程侧按 §6.7 回落 GetExitCodeProcess（取证 P12），不靠这一帧送达
    }
  };
  const fail = (stage: string, message: string, code: number): void => {
    send(HOST_FRAME.ERR, JSON.stringify({ stage, message }));
    finished = true;
    process.exit(code);
  };

  /** §6.6-7 / §6.6-8 的共同停止路径：复用 PtyProcess.stopGraceful（kill → 等 timeoutSecs → taskkill /T /F） */
  const stop = async (timeoutSecs: number): Promise<void> => {
    if (finished || proc === null || stopping) return;
    stopping = true;
    await proc.stopGraceful(timeoutSecs);
  };

  const onHello = (payload: string): void => {
    const hello = parseObject(payload);
    if (hello.token !== hostToken) {
      fail('token', 'HELLO token mismatch', 2); // §6.6-2（退出码 2 是本表 C1/E1 的判据）
      return;
    }
    try {
      // §6.6-3：终端映射只有一份（复用 shellExe）；选项与 quick-launch.ts:155-161 逐字一致，**不传 encoding**
      const { exe, args } = shellExe(hello.shell as TerminalId);
      const handle = deps.spawn(exe, args, {
        name: 'xterm-256color',
        cols: hello.cols as number,
        rows: hello.rows as number,
        cwd: hello.cwd as string,
        env: process.env,
      });
      proc = new PtyProcess(handle);
    } catch (err) {
      // §6.6-4：起终端失败（含 shellExe 认不出的 terminal id）→ 只报 stage + 原始 message，退出码 1
      fail('spawn', messageOf(err), 1);
      return;
    }
    const started = proc;
    send(HOST_FRAME.READY, JSON.stringify({ hostPid: process.pid, shellPid: started.pid })); // §6.6-4
    started.onData((data) => send(HOST_FRAME.DATA, data)); // §6.6-5 / 索引 K32：字符串原样进 payload
    started.onExit((code) => {
      finished = true;
      send(HOST_FRAME.EXIT, JSON.stringify({ code })); // §6.6-5：EXIT 帧的 code 与 process.exit 同源（本表 C4）
      process.exit(code);
    });
  };

  const feed = createFrameParser((type: number, payload: string): void => {
    if (finished) return; // 已经发过 EXIT/ERR：后面的帧不再有意义
    switch (type) {
      case HOST_FRAME.HELLO:
        onHello(payload);
        break;
      case HOST_FRAME.WRITE: // §6.6-6
        if (proc !== null) proc.write(payload);
        break;
      case HOST_FRAME.RESIZE: { // §6.6-6
        const resize = parseObject(payload);
        const cols = Number(resize.cols);
        const rows = Number(resize.rows);
        if (proc !== null && Number.isFinite(cols) && Number.isFinite(rows)) proc.resize(cols, rows);
        break;
      }
      case HOST_FRAME.STOP: // §6.6-7
        void stop(finiteOr(parseObject(payload).timeoutSecs, 0));
        break;
      default:
        break; // 宿主 → 主进程方向的帧不会出现在这条管道上；未知 type 已由任务 2 的解析器丢弃
    }
  });

  socket.on('data', (chunk: Buffer) => feed(chunk));
  // §6.6-8：主进程退出 / 崩溃 → 视同 STOP{timeoutSecs:3}，不留孤儿 ConPTY（审查重点 RF6）
  socket.on('close', () => {
    void stop(PIPE_GONE_TIMEOUT_SECS);
  });
  // 断管后的 EPIPE 也走到这里：那时由 close 走停止路径，这里不得抢先退出（否则留孤儿 ConPTY）。
  // 只有终端还没起来时（连不上管道）才按 §6.6-9 报 ERR{stage:'pipe'}；没有这个监听，未处理的 error 会让宿主直接崩掉。
  socket.on('error', (err: unknown) => {
    if (proc !== null || finished) return;
    fail('pipe', messageOf(err), 1);
  });
}

/** 生产侧的装配：真命名管道（§6.6-1，P10 证明 net.connect 可用）+ 真 node-pty（§6.6-3） */
function main(): void {
  runHost({
    connect: (name: unknown) => net.connect(String(name)),
    spawn: pty.spawn,
  });
}

// plan 任务 5：只有被 node.exe 直接执行时才自动跑（单测注入假 socket 与假 pty）。
// require.main === module 是 CJS 的判据；在没有 require/module 的加载器（测试的 ESM 变换）里短路为 false，不会误跑。
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  main();
}
