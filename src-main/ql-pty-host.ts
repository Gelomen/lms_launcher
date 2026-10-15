// src-main/ql-pty-host.ts
// 任务 5（2026-10-14-quick-launch-admin §6.6）：提权 PTY 宿主入口 —— 被 §6.4 的硬链接 node.exe 直接执行。
// 边界（本表 B1 / F1-F4）：不 import electron（索引 K12）、不 import main.ts；终端映射只复用 quick-launch.ts:146-150
//   的 shellExe（F3：不复制第二张映射表）；停止语义只复用 quick-launch.ts:122-142 的 PtyProcess.stopGraceful
//   （§6.6-7：在提权进程里 taskkill 打得到整棵提权进程树）；不新增依赖（F4）；不含汉字字面量（G6）。
// 错误只发 ERR{stage,message}，stage 取 token / spawn / pipe 这类机器可读片段（G1 / §6.6-9）：
//   文案在主进程侧按词典生成（§6.10），宿主里不出现任何 t() 调用，也不新增错误前缀。
// 帧的 payload 一律是 string（索引 K32）：node-pty 的 onData 交出的就是 JS 字符串，直接 encodeFrame(DATA, data)；
//   自己拼 Buffer 字节再 toString 反而失真（合法字符串的 UTF-8 往返无损）。
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import * as pty from '@lydell/node-pty';
import { PtyProcess, shellExe } from './quick-launch';
import type { TerminalId } from './quick-launch-config';
import { HOST_FRAME, createFrameParser, encodeFrame, type HostFrameType } from './ql-host-protocol';

// §6.6-8：管道断开 = 视同 STOP{timeoutSecs:3}。3 与 quick-launch.ts:28 的 STOP_TIMEOUT_SECS 同值；
// 那个常量未导出，为了它去改 quick-launch.ts 属本任务 B 段之外（G9），所以在这里写死并标出处。
const PIPE_GONE_TIMEOUT_SECS = 3;

// 任务 10 · C7 / §6.6-12 / 裁决 R-18 / 索引 K57：失败留痕文件与上限。
// 为什么必须有它：ShellExecuteEx 不给子进程 stdio，宿主连不上管道时 ERR 帧也发不出去，
// 主进程只有这个文件能知道宿主侧发生了什么（2026-10-15 的真机故障正是卡在这里）。
const HOST_TRACE_FILE = 'lms-ql-host.log';
const HOST_TRACE_MAX_BYTES = 64 * 1024; // 超过 64KiB 先清空再写（覆盖），避免无限增长

/**
 * 四类失败（token / spawn / pipe / fatal）各追加一行到 %TEMP%\lms-ql-host.log：
 * <ISO 时间> pid=<pid> pipe=<管道名> stage=<stage> err=<原始 message>。
 * message 里的换行压成空格；写之前若文件 > 64KiB 先清空（覆盖写）；纯 ASCII、不含汉字（G6）。
 * 写失败一律吞掉 —— 留痕绝不能把宿主搞崩。只追加，不由本 feature 清理（§6.6-12）。
 */
function writeTrace(pipeName: string, stage: string, message: string): void {
  try {
    const file = path.join(os.tmpdir(), HOST_TRACE_FILE);
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch {
      size = 0;
    }
    const line = new Date().toISOString() + ' pid=' + process.pid + ' pipe=' + pipeName
      + ' stage=' + stage + ' err=' + message.replace(/\r?\n/g, ' ') + '\n';
    if (size > HOST_TRACE_MAX_BYTES) fs.writeFileSync(file, line, 'utf8');
    else fs.appendFileSync(file, line, 'utf8');
  } catch {
    // 留痕写不进去也不能影响宿主的错误路径
  }
}

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
    // 任务 10 · C7 / §6.6-12 / K57：先落留痕再发帧再退出 —— 连不上管道时 ERR 帧发不出去，只有文件能带回现场
    writeTrace(pipeName, stage, message);
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
    // 任务 10 · C6 / R-18 / K57：管道连不上 = 退出码 3（原来与加载期崩溃同为 1，主进程无法判别）
    fail('pipe', messageOf(err), 3);
  });
}

/**
 * 生产侧的装配：真命名管道（§6.6-1，P10 证明 net.connect 可用）+ 真 node-pty（§6.6-3）。
 * 任务 10 · C6 / §6.6-12 / R-18 / K57：外层 try/catch 兜住加载期 / 运行期的未预期异常 ——
 * 记 stage='fatal' 的留痕后 process.exit(4)，不再带未处理的崩溃栈（原来与管道失败同为 1）。
 * 导出只为一个可注入的测试接缝（ql-pty-host.test.ts 把 net.connect 换成会抛的实现）。
 */
export function main(): void {
  try {
    runHost({
      connect: (name: unknown) => net.connect(String(name)),
      spawn: pty.spawn,
    });
  } catch (err) {
    writeTrace(process.argv.slice(2)[0] ?? '', 'fatal', messageOf(err));
    process.exit(4);
  }
}

// plan 任务 5：只有被 node.exe 直接执行时才自动跑（单测注入假 socket 与假 pty）。
// require.main === module 是 CJS 的判据；在没有 require/module 的加载器（测试的 ESM 变换）里短路为 false，不会误跑。
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  main();
}
