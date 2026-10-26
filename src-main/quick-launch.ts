// src-main/quick-launch.ts
// 任务 5：ConPTY 终端进程管理 —— PtyProcess / spawnShell / shellExe / QuickLaunchManager
// 规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §7.1 / §7.3 / §7.5 / §12.4
// 计划：docs/superpowers/plans/2026-10-10-quick-launch-card.md §任务 5（C1–C5 接口逐字，任务 6/7/13 据此调用）
// 边界：不 import src-main/process.ts，也不改它（check B4 / G4）。exe 类型走 deps.spawnExe 接缝，
//       生产侧接 shell-execute（ShellExecuteEx，2026-10-13-quick-launch-elevated-exe §6.6）。
import { execFileSync } from 'node:child_process';
import * as pty from '@lydell/node-pty';
import { t } from './i18n';
import type { QuickLaunchEntry, TerminalId } from './quick-launch-config';

// 错误前缀只有 VALIDATION: / STATE: / PROC:（索引 G7）。
// err.ql.* 已由任务 8 写进词典（src-main/i18n/dict.ts），所以这里一律改回「字面量 key 的 t() 调用」：
// 索引 K8 的收尾（K20(2)）——key-coverage.test.ts:39-41 的 KEY_CALL 只认字面量，:44 还会把调用点传的
// 参数名与词典取值里的 {占位符} 双向比对。key 名与任务 8 表 D8/D9/D10/D6/D3 逐字一致；
// 占位符与 dict.ts 逐字一致：terminalGone→{terminal}、ptySpawn→{exe}{err}、typeInvalid→{type}，
// alreadyRunning / exeRequired 无占位符。
// 复用词典既有键（索引 K9）：err.proc.noChild / log.launcher.start.cmd / log.app.exit，不建同义键。

// 规格 §7.3：TERM 名固定 xterm-256color；start() 不带尺寸（任务 6 的 ql_resize 会立刻校正），
// 故用 80x24 兜底，保证首帧之前 PTY 尺寸不会是 0。
const PTY_NAME = 'xterm-256color';
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
// 规格 §7.3 的原口径：等第一批输出（当成 shell 已就绪）再写自动命令；5s 无输出则兜底写入。审查重点 R1。
// #36 改口径：**首批输出 ≠ 提示符画出来了**。真 wsl.exe 实测（取证台 .temp/wsl-autocmd/，与 spawnShell 同参）：
//   首块都在 t=40~52ms、16B「ESC[?9001h ESC[?1004h」= **一个可见字节都没有**；提示符在其后 3.4s / 3.4s / 4.9s / 6.0s
//   才画出来（WSL 虚拟机冷/热差一个量级）。按原口径，自动命令就在这 16B 之后写进去：那一刻 bash 还没开始读行、
//   tty 还在规范模式且 echo 打开 ⇒ **内核**先把命令回显一遍（画布上那条光秃秃的 ll），
//   bash 画完提示符再由 readline 回显第二遍 = 用户看到的两遍。pwsh / cmd 的提示符就在第一批可见输出里，踩不到。
// 新的写入门 = 两条同时成立才写一次：
//   门① 到目前为止画过**可见文本**（剥掉转义序列后含非空白字符）—— 纯转义序列那一段在这里被挡住；
//   门② 输出已**静默** AUTO_CMD_IDLE_MS（每来一块重排一次）—— 提示符是一段输出的最后一段，
//       实测它内部各块之间最多隔 18ms，200ms 是 10 倍以上的余量。
// 兜底只兜「这 5s 里**一个字节输出都没有**」那一种（E5 的口径逐字保留）：一旦有输出，写不写就全看两条门。
// 这条改动不是装饰：实测有一趟提示符到 5969ms 才画出来，无条件的 5s 兜底会当场抢跑、两遍回显原样复发。
const AUTO_CMD_TIMEOUT_MS = 5000;
// 门② 的静默窗口（读数见上面 #36）
const AUTO_CMD_IDLE_MS = 200;
// 规格 §7.5：[停止] 沿用 llama-server 口径 —— 终止 → 3s → taskkill /T /F（杀进程树）
const STOP_TIMEOUT_SECS = 3;
const POLL_MS = 100; // 与 src-main/process.ts:82 同口径
// 强杀之后再等一小段时间让 exit 事件落地：否则 stop() 返回时 states() 里还留着 stopping:true，
// 渲染端按钮不回落（规格 §7.5「行按钮回落 [启动]」）。
const FORCE_EXIT_WAIT_MS = 1000;
// A2·I-3：stopAll 的轮次上限。正常路径每轮都在摘除实例，这个上限只防「每轮都有新实例进表」的病态情况，
// 与停止语义无关（不改 3s / taskkill 的任何时序）。
const STOP_ALL_MAX_ROUNDS = 64;
// 规格 §7.5：终端页签 id = 'ql:<configId>'。渲染端同名常量在 src/modules/log-tabs.ts（任务 10 C1）。
const QL_TAB_PREFIX = 'ql:';

/** 终端本体与参数（规格 §7.3：没有 v1 的 -Command 包装） */
const SHELL_EXE: Record<TerminalId, { exe: string; args: string[] }> = {
  pwsh: { exe: 'pwsh.exe', args: ['-NoLogo'] },
  powershell: { exe: 'powershell.exe', args: ['-NoLogo'] },
  cmd: { exe: 'cmd.exe', args: [] },
  wsl: { exe: 'wsl.exe', args: [] },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 行分隔规整（2026-10-17 用户改口径：弹窗里 [+] 可以追加多条命令行，落盘是一条以 \n 连接的 cmd 字符串）。
 * 送进 PTY 前必须换成 \r：ConPTY 把裸 \n 吞掉 —— 真机实测（.temp/ql-cmd-rows-newline/probe.md，
 * 真 @lydell/node-pty + cmd.exe，写入与 :411 逐字同构）：
 *   写 "ver\necho SECOND-RAN\r" → 输入回显成 "verecho SECOND-RAN"，执行的是 verecho → 命令不存在；
 *   写 "echo A\recho B\r"      → 先 A 后 B，两条依次执行。
 * 所以「多行命令」的语义 = 依次执行多条命令，靠 \r 逐行提交实现，不依赖 cmd 的 ^ 续行
 * （^ 实测会把两行拼成一条且不补空格：echo A^ + echo B → 输出 Aecho B）。
 * 边界：PowerShell / WSL 本机取不到证（powershell.exe 起不来 8009001d；pwsh / wsl 未安装），
 * 只有 cmd.exe 的实测证据 —— 已登记。
 */
function toPtyInput(cmd: string): string {
  return cmd.replace(/\r\n|\r|\n/g, '\r');
}

// 一条转义序列：CSI（ESC [ … 最终字节 @-~）、OSC（ESC ] … BEL 或 ST）、DCS/SOS/PM/APC（ESC P/X/^_ … ST），
// 以及 ESC + 单字节（xterm 的 Fe 口径：ESC 后跟 0x20-0x7E 任意一个字节）。两支各挡一头：
//   少了「ESC + 单字节」：DECSC（ESC 7）这类不被剥掉，未闭合判定就把它后面的真提示符一路吞进 carry = 门① 永远不过、
//     自动命令根本不写（#36 的门里有一条夹具专钉这一支）；
//   少了引导字段的排除（[ ] P X ^ _ 让给上面各自的分支）：未闭合的 OSC 会被这一支从「ESC]」处咬掉，
//     中段露出来 = 假可见文本，写入门退回 #36 之前。
// 未闭合的序列一律不匹配 = 留给 splitVisibleText 的 carry，与下一块拼回去再判。
const ANSI_SEQ = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[PX^_][^\u001b]*\u001b\\|\u001b(?![\]\[PX^_])[\x20-\x7e]/g;

/**
 * 剥掉转义序列，返回**可见文本**与「没闭合的尾巴」，跨块连续（#36 门① 用它）。
 * 为什么要 carry：ConPTY 把一段输出拆成多条 DATA（实测 wsl.exe 提示符那一段 = 同一毫秒的 232B + 62B 两条），
 * 拆点可能落在一条转义序列中间。不拼回去就会把序列的中段（"3008;start=<guid>" 那一截）当成可见文本，
 * 门① 当场假绿 = 写入门退回原口径。所以未闭合的那一截不算可见，留着与下一块拼。
 */
function splitVisibleText(raw: string): { visible: string; carry: string } {
  const stripped = raw.replace(ANSI_SEQ, '');
  const open = stripped.lastIndexOf('\u001b');
  if (open < 0) return { visible: stripped, carry: '' };
  return { visible: stripped.slice(0, open), carry: stripped.slice(open) };
}

/**
 * node-pty 句柄在本文件里用到的最小一面（PtyProcess 的构造参数）。
 * 之所以自定义而不是直接用 pty.IPty：测试可注入假句柄验证 stopGraceful 的时序（check E11）。
 * 注意 kill() 无参——Windows 下传 signal 会抛（node-pty.d.ts:184-188）。
 */
interface PtyHandle {
  readonly pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(cb: (d: string) => void): void;
  onExit(cb: (e: { exitCode: number }) => void): void;
}

/**
 * PTY 进程包装（C1）。onData/onExit 直接转发给底层句柄，支持多个订阅者。
 * pid 用 getter 而不是构造时快照：ConPTY 的 innerPid 要等 agent 连上才有值
 * （node-pty windowsTerminal.js:62/:69 是异步赋值的），实测 spawn() 返回瞬间读到 0、1s 后才是真 pid。
 */
export class PtyProcess {
  private readonly handle: PtyHandle;
  private running = true;
  private stopping = false;
  private exitCode: number | null = null;
  private exitCbs: Array<(code: number) => void> = [];

  constructor(handle: PtyHandle) {
    this.handle = handle;
    handle.onExit((e) => {
      this.running = false;
      this.exitCode = e.exitCode;
      const cbs = this.exitCbs.slice();
      this.exitCbs = [];
      for (const cb of cbs) cb(e.exitCode);
    });
  }

  get pid(): number {
    return this.handle.pid;
  }

  write(data: string): void {
    this.handle.write(data);
  }

  resize(cols: number, rows: number): void {
    this.handle.resize(cols, rows);
  }

  onData(cb: (d: string) => void): void {
    this.handle.onData(cb);
  }

  onExit(cb: (code: number) => void): void {
    // 已退出则立即补发：注册晚于退出时不补发就会永远等不到（页签按钮卡在 [停止]）
    if (!this.running) {
      cb(this.exitCode ?? -1);
      return;
    }
    this.exitCbs.push(cb);
  }

  isRunning(): boolean {
    return this.running;
  }

  /** 终止 → 等 timeoutSecs → taskkill /T /F 杀进程树（规格 §7.5，与 process.ts:71-92 同口径） */
  async stopGraceful(timeoutSecs: number): Promise<void> {
    if (!this.running || this.stopping) return; // 已退出 / 已在停止流程中：幂等
    this.stopping = true;
    try {
      this.handle.kill();
    } catch {
      // 进程已不在：等 exit 事件落地即可
    }
    const deadline = Date.now() + Math.max(0, timeoutSecs) * 1000;
    while (this.running && Date.now() < deadline) await sleep(POLL_MS);
    if (this.running && process.platform === 'win32' && this.pid) {
      try {
        execFileSync('taskkill', ['/T', '/F', '-PID', String(this.pid)]);
      } catch {
        // 已退出
      }
      const grace = Date.now() + FORCE_EXIT_WAIT_MS;
      while (this.running && Date.now() < grace) await sleep(POLL_MS);
    }
    this.stopping = false;
  }
}

/** 终端 id → 可执行文件与参数（C3）。返回副本，调用方改数组不会污染映射表。 */
export function shellExe(shell: TerminalId): { exe: string; args: string[] } {
  const found = SHELL_EXE[shell];
  if (!found) throw new Error('VALIDATION: ' + t('err.ql.terminalGone', { terminal: String(shell ?? '') }));
  return { exe: found.exe, args: [...found.args] };
}

/** 起一个终端 PTY（C2）。规格 §7.3：选项只有 name/cols/rows/cwd/env，不传 encoding。 */
export function spawnShell(shell: TerminalId, cols: number, rows: number, cwd: string): PtyProcess {
  const { exe, args } = shellExe(shell);
  const handle = pty.spawn(exe, args, {
    name: PTY_NAME,
    cols,
    rows,
    cwd,
    env: process.env,
  });
  return new PtyProcess(handle);
}

/** 主进程 → 渲染端的回调（C4）。onSysLine 是 exe 类型「无页签」时的日志反馈（任务 6 接 emitLog）。 */
export interface QlDeps {
  onData(tabId: string, data: string): void;
  onExit(configId: string, code: number): void;
  onSysLine(configId: string, line: string): void;
  homedir(): string;
  spawnExe(exe: string): { onExit(cb: (code: number) => void): void; stopGraceful(s: number): Promise<void>; isRunning(): boolean };
  /**
   * 启动前全量预检的接缝（2026-10-17-quick-launch-exe-rows §6.4 / 任务 2）：这条路径能不能启动。
   * 生产侧 = isLaunchableExe（shell-execute.ts:242，已导出、一字不改）。
   * 为什么走接缝而不是直接 import：exe 单测用的是本机不存在的假路径（notepad.exe / a.exe），
   * 直接调用会让它们全部预检失败——本文件的既有边界就是「可测性靠 deps 注入假实现」（§6.4）。
   * 必填而非可选：可选会让「忘了接线」退化成静默降级（spawnElevatedShell 同一口径）。
   */
  checkExe(exe: string): boolean;
  /**
   * 起一个**提权**终端（2026-10-14-quick-launch-admin §6.8，接线在 main.ts）：返回 ShellProcess 形状，
   * 所以 write / resize / stop / stopAll / states 一字不改。可 await 的工厂（索引 K45 / 裁决 R-12）：
   * 「等 READY」与「失败按 §6.10 抛出且抛出前关掉两个句柄」都在工厂里（ql-elevated.ts 的 startElevatedHost）。
   * 必填而非可选：可选会让「忘了接线」退化成静默降级（main.ts:1009-1011 的既有批评口径）。
   */
  spawnElevatedShell(shell: TerminalId, cols: number, rows: number, cwd: string): Promise<ShellProcess>;
}

/** QuickLaunchManager 内部用到的 shell 进程面：PtyProcess 与测试里的假实现都满足 */
interface ShellProcess {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData(cb: (d: string) => void): void;
  onExit(cb: (code: number) => void): void;
  isRunning(): boolean;
  stopGraceful(timeoutSecs: number): Promise<void>;
}

interface ExeProcess {
  onExit(cb: (code: number) => void): void;
  stopGraceful(s: number): Promise<void>;
  isRunning(): boolean;
}

interface AutoCommand {
  cmd: string;
  /** 5s 兜底：只兜「到现在一个字节输出都没有」那一种（#36） */
  timer: ReturnType<typeof setTimeout> | null;
  /** 门②：输出静默 AUTO_CMD_IDLE_MS 的计时器，每来一块重排一次 */
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** 门①：到现在为止画过可见文本（剥掉转义序列后含非空白字符） */
  sawVisible: boolean;
  /** 兜底计时器的闸：到现在为止有没有过任何输出 */
  sawOutput: boolean;
  /** 未闭合转义序列的尾巴，与下一块拼回去再判（splitVisibleText） */
  carry: string;
  released: boolean;
}

/**
 * 一配置一实例（F4）：运行中/停止中的配置再点启动 → STATE:。
 * 2026-10-17-quick-launch-exe-rows §6.5：exe 一条配置 = N 个进程（按启动顺序）；shell 仍是「一个」，
 * 用同一个数组装（procs.length === 1，G3：shell 分支时序一字不动）。
 * exited 是**聚合**语义 = 「全部进程都已退出」；逐进程状态放在与 procs 同序的 procExited 上，
 * exitCode = 最后退出者的 code（R-PF5：上报只发生一次，取最后退出的退出码）。
 */
interface Instance {
  kind: 'shell' | 'exe';
  procs: Array<ShellProcess | ExeProcess>;
  procExited: boolean[];
  tabId: string | null;
  stopping: boolean;
  exited: boolean;
  exitCode: number | null;
  auto: AutoCommand | null;
}

/**
 * 快捷启动的进程管理（C5）：状态机 + PTY 生命周期。
 * 启动前校验（§7.5）→ 起进程 → 订阅输出/退出 → 自动命令等首批输出（§7.3）。
 */
export class QuickLaunchManager {
  private readonly instances = new Map<string, Instance>();
  private readonly isTerminalAvailable: (id: TerminalId) => boolean;

  constructor(private readonly deps: QlDeps, terminalAvailable: (id: TerminalId) => boolean) {
    this.isTerminalAvailable = terminalAvailable;
  }

  /**
   * 测试接缝（check E4/E5 要「假 PtyProcess 断言写入顺序」）：C5 的构造签名逐字不动，
   * 测试子类覆写本方法注入假进程。生产路径就是 spawnShell。
   */
  protected createShellProcess(shell: TerminalId, cols: number, rows: number, cwd: string): ShellProcess {
    return spawnShell(shell, cols, rows, cwd);
  }

  /**
   * 提权路径的测试接缝（规格 §6.8）：与上面 createShellProcess 同一手法（C5 的构造签名逐字不动）。
   * 与它的唯一区别是 **async** —— 提权宿主是可 await 的工厂（索引 K45 / 裁决 R-12），
   * 所以 start() 的提权分支必须 await 本方法；生产路径就是 deps.spawnElevatedShell → startElevatedHost。
   */
  protected async createElevatedShellProcess(shell: TerminalId, cols: number, rows: number, cwd: string): Promise<ShellProcess> {
    return this.deps.spawnElevatedShell(shell, cols, rows, cwd);
  }

  /** 启动（规格 §7.5）：shell → { tabId: 'ql:<configId>' }；exe → { tabId: null }。失败不残留状态。 */
  async start(configId: string, entry: QuickLaunchEntry): Promise<{ tabId: string | null }> {
    if (this.instances.has(configId)) throw new Error('STATE: ' + t('err.ql.alreadyRunning'));
    const e = (entry ?? {}) as Partial<QuickLaunchEntry>;

    if (e.type === 'shell') {
      const shell = e.shell;
      if (!shell || !this.isTerminalAvailable(shell)) {
        throw new Error('VALIDATION: ' + t('err.ql.terminalGone', { terminal: String(shell ?? '') }));
      }
      const tabId = QL_TAB_PREFIX + configId;
      let proc: ShellProcess;
      try {
        // 规格 §7.3：cwd 一律用户主目录（deps.homedir，测试可注入）
        // 规格 §6.8：只有 e.admin === true（不是 truthy）走提权宿主；其余全部不变 ——
        // tabId、onData 先转渲染端再放自动命令、onExit → finalize、scheduleAutoCommand、失败不残留，逐条沿用。
        proc = e.admin === true
          ? await this.createElevatedShellProcess(shell, DEFAULT_COLS, DEFAULT_ROWS, this.deps.homedir())
          : this.createShellProcess(shell, DEFAULT_COLS, DEFAULT_ROWS, this.deps.homedir());
      } catch (err) {
        // §12.4：spawn 失败不残留状态——还没进 Map，直接上抛
        const msg = messageOf(err);
        // 索引 K52 / 裁决 R-14（表 C5）：提权路径交出的 Error.message 已是最终文案（PROC: + 词典渲染，
        // 见 ql-elevated.ts 的 hostStartError / handshakeError）。再包一层就是「终端启动失败: PROC: 终端启动失败: …」。
        // 非提权路径的文案逐字不变（表 C4）：node-pty 的失败不带 PROC: 前缀，仍走下面那条包装。
        if (msg.startsWith('PROC: ')) throw err;
        throw new Error('PROC: ' + t('err.ql.ptySpawn', { exe: shellExe(shell).exe, err: msg }));
      }
      const inst: Instance = {
        kind: 'shell', procs: [proc], procExited: [false], tabId, stopping: false, exited: false, exitCode: null, auto: null,
      };
      proc.onData((data) => {
        // 顺序要紧：先把输出转给渲染端，再记自动命令的写入门（审查重点 R1 / check E4）
        this.deps.onData(tabId, data);
        this.noteShellOutput(inst, data);
      });
      this.trackProcessExit(configId, inst, 0, proc);
      this.instances.set(configId, inst);
      if (inst.exited) {
        this.finalize(configId, inst); // 极端竞态：spawn 后同步就退出
        return { tabId };
      }
      this.scheduleAutoCommand(inst, typeof e.cmd === 'string' ? e.cmd : '');
      return { tabId };
    }

    if (e.type === 'exe') {
      // 规格 §6.3：exe 是「有序数组」（配置层已归一为非空数组，§6.1）。这里仍对未知载荷做运行时守卫：
      // 非数组 / 空数组 / 全空串一律 VALIDATION:（与配置层同一判据，start() 的直接调用方不得绕过它）。
      const rawExe = Array.isArray(e.exe) ? e.exe : null;
      const paths = rawExe === null ? [] : rawExe.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter((x) => x.length > 0);
      if (paths.length === 0) throw new Error('VALIDATION: ' + t('err.ql.exeRequired'));
      // §6.3-2 预检循环（任务 2 / 审查重点 RF3 / 票 #2）：按数组顺序对**全部**路径调 deps.checkExe——
      // 不短路（审查轮 1 · Spec 轴：「全量预检」按字面执行；E10 钉住第一条 false 之后其余路径仍被检查）。
      // 任一条 false → 抛既有 PROC: err.proc.exeNotFound（{exe} = 数组序里第一条不可用的——错误形状由规范
      // 钉死为单条，只点名一条），且此前一次 spawnExe 都没调（要么全起，要么都不起；用户故事 11/12）。
      // 在实例入表之前：预检失败不留任何实例痕迹——不会造出「运行中但一个进程都没有」的幽灵实例（R-PF7）。
      // 原因行经 deps.onSysLine 自己写：多条时失败发生在到达 main.ts 的 spawnExeProcess 适配器**之前**，
      // 那里的日志分工触不到这条；而用户故事 12 / 真机 R6 / 既有「路径不存在 → 不调 Shell」端到端门都要求
      // 日志有一行点名失败的那条路径。文案与 launchShellExe :273 逐字同形——同一个键，同一个 {exe}。
      let firstUnavailable: string | null = null;
      for (const path of paths) {
        if (!this.deps.checkExe(path) && firstUnavailable === null) firstUnavailable = path;
      }
      if (firstUnavailable !== null) {
        const line = 'PROC: ' + t('err.proc.exeNotFound', { exe: firstUnavailable });
        this.deps.onSysLine(configId, line);
        throw new Error(line);
      }
      const inst: Instance = {
        kind: 'exe', procs: [], procExited: [], tabId: null, stopping: false, exited: false, exitCode: null, auto: null,
      };
      // R-PF6：先入表再逐条起 —— 任何退出事件都发生在实例已入表之后，聚合 finalize 的身份守卫才成立
      // （exe 分支没有 shell 分支那种 set 后补「已全退」守卫的机会：起第二条之前的退出必须看得见）。
      this.instances.set(configId, inst);
      try {
        // §6.3-3 启动循环：按数组顺序逐条发起，**不 await、不观察退出**（RF4）。
        // 能走到这里说明 §6.3-2 的全量预检已经过了（任务 2 已落地：接缝与调用同批，R-PF2 随之解除）。
        for (const path of paths) {
          const proc = this.deps.spawnExe(path); // 失败（UAC 点「否」/ Shell 失败）原样上抛，§6.3-4 见 catch
          const index = inst.procs.length;
          inst.procs.push(proc);
          inst.procExited.push(false);
          // 每个进程只注册**一次** onExit（修复轮 1 / 审查关键 1）：真 exe 接缝是单槽的 —— shell-execute.ts:138 是
          // private onExitCb 字段、:168-172 做的是 this.onExitCb = cb（赋值，不是 push），main.ts:1094 的适配器只把
          // 每次注册转交给这个槽。这里再挂第二条 proc.onExit 就会把上面那条聚合处理器永久覆盖掉：procExited 永不置位
          // → 永不 finalize → 实例永留表内、ql-exit 永不发出、卡片卡在 [停止]（今天的单路径老配置 N=1 同样中招）。
          // 逐退出副作用因此从这里作为参数进去，并在聚合记账之后执行 —— 与改动前单条时「先 finalize、后写退出日志」逐字同序。
          this.trackProcessExit(configId, inst, index, proc, (code) => {
            // 每条进程退出各写一行 log.app.exit（写法与今天单条时逐字相同，R-08）：
            // 无页签 → 反馈走日志（任务 6 把 onSysLine 接到既有 emitLog(line,'sys')）。
            // 复用词典既有键，不新建 err.ql.* / log.ql.*（索引 K9 的「复用既有键」口径）。
            this.deps.onSysLine(configId, t('log.app.exit', { code }));
          });
          // §6.3-5：每条成功启动各写一行 log.launcher.start.cmd（{cmd} = 该条路径），与今天单条时的写法逐字相同。
          // 顺序要紧：先登记退出回调再写启动行 —— 若退出同步送达，log.app.exit 不得排到 start.cmd 之前。
          this.deps.onSysLine(configId, t('log.launcher.start.cmd', { cmd: path }));
        }
      } catch (err) {
        // §6.3-4 / R-PF3 / R-PF7：第 k 条抛错 → 后续不再发起，错误原样上抛（PROC: 前缀不变，
        // main.ts:1085-1091 的日志分工不变）。k>1：已起的 k-1 条留在实例里（实例保持运行，不回滚杀掉，§7-4）。
        // k=1（零进程）：不得留一个 running:false 的幽灵实例 —— 摘掉实例（含清 auto 计时器）再原样抛出。
        if (inst.procs.length === 0 && this.instances.get(configId) === inst) {
          this.instances.delete(configId);
          this.clearAutoTimers(inst);
        }
        throw err;
      }
      return { tabId: null };
    }

    throw new Error('VALIDATION: ' + t('err.ql.typeInvalid', { type: String(e.type ?? '') }));
  }

  /** 键盘输入（§8 ql_write） */
  write(configId: string, data: string): void {
    const inst = this.instances.get(configId);
    if (!inst || inst.kind !== 'shell') throw new Error('STATE: ' + t('err.proc.noChild'));
    // shell 实例恒为 procs.length === 1（§6.5），write/resize 取那唯一一个
    (inst.procs[0] as ShellProcess).write(data);
  }

  /** 尺寸（§8 ql_resize） */
  resize(configId: string, cols: number, rows: number): void {
    const inst = this.instances.get(configId);
    if (!inst || inst.kind !== 'shell') throw new Error('STATE: ' + t('err.proc.noChild'));
    (inst.procs[0] as ShellProcess).resize(cols, rows);
  }

  /** [停止]（§7.5）：直接杀终端进程树，不关页签；幂等。超时走 §7.5 的 3s 口径（STOP_TIMEOUT_SECS） */
  async stop(configId: string): Promise<void> {
    await this.stopInternal(configId);
  }

  /**
   * 应用退出（§7.5，接线在任务 7）：逐个停，单个失败不影响其余。
   * 口径 C5(a) / 索引 K11(1)（任务 5 审查 Important #1）：timeoutSecs 必须**透传**给每个停止动作，
   * 不得被 stop() 里的 STOP_TIMEOUT_SECS 覆盖 —— 任务 7 按 exit_app 的超时调用 stopAll(n)。
   *
   * A2·I-3：不能「取一次快照逐个停」后无条件 instances.clear()。await 期间窗口还活着、[启动] 仍可点，
   * 新实例会进表而不在那次快照里 → 被 clear() 抹掉却**没被停** → app.exit(0) 之后就是孤儿 ConPTY。
   * finalize 已逐个摘除实例，clear() 唯一能清掉的恰是「没被停的实例」，所以删掉它、改成循环到表空；
   * 上限 STOP_ALL_MAX_ROUNDS 只是防御性护栏（到上限就停手，宁可留实例也不静默丢弃）。
   * 停止语义一字未改：仍是逐个 await、终止 → 3s → taskkill /T /F，超时按调用方透传。
   */
  async stopAll(timeoutSecs: number): Promise<void> {
    let guard = 0;
    while (this.instances.size && ++guard <= STOP_ALL_MAX_ROUNDS) {
      for (const configId of Array.from(this.instances.keys())) {
        try {
          await this.stopInternal(configId, timeoutSecs);
        } catch {
          // 继续停下一个
        }
      }
    }
  }

  /** 停止的公共实现：stop() 用默认超时（3s），stopAll() 透传调用方给的秒数 */
  private async stopInternal(configId: string, timeoutSecs: number = STOP_TIMEOUT_SECS): Promise<void> {
    const inst = this.instances.get(configId);
    if (!inst) return;
    inst.stopping = true;
    // §6.5 / R-09：按启动顺序逐个 stopGraceful（与 instances 插入序一致；已退出的进程 stopGraceful
    // 自己会直接 return，P5）。逐个 await，全部返回后才走下面的收尾 —— 对 shell（N=1）语义逐字不变。
    for (const proc of inst.procs) {
      try {
        await proc.stopGraceful(timeoutSecs);
      } catch {
        // 停止失败也要继续停下一个并收尾，否则状态卡在 stopping
      }
    }
    // 强杀路径下 exit 事件可能还没落地：按未知退出码收尾，保证 states() 清空、按钮回落
    if (this.instances.get(configId) === inst && !inst.exited) {
      inst.exitCode = -1;
      this.finalize(configId, inst);
    }
  }

  /** 状态快照（§8 ql_states，任务 13 的复原依据） */
  states(): Record<string, { running: boolean; stopping: boolean }> {
    const out: Record<string, { running: boolean; stopping: boolean }> = {};
    for (const [configId, inst] of this.instances) {
      // A2·M7：running 不能只由 !inst.stopping 推出 —— 真机上 exit 事件是异步的，
      // 进程已退出而 onExit 尚未到达时那是假状态。isRunning() 是 ShellProcess / ExeProcess 共有的最小面。
      // §6.5（R-PF5）：聚合实例的 running = **任一进程存活**；全部退出前按钮不回落（§7-5，用户选定）。
      out[configId] = { running: !inst.stopping && inst.procs.some((p) => p.isRunning()), stopping: inst.stopping };
    }
    return out;
  }

  /** 退出收尾：从 Map 摘掉并上报 ql-exit（§7.5「页签保留、按钮回落」） */
  private finalize(configId: string, inst: Instance): void {
    if (this.instances.get(configId) !== inst) return; // 已被替换或已摘除
    this.instances.delete(configId);
    this.clearAutoTimers(inst);
    this.deps.onExit(configId, inst.exitCode ?? -1);
  }

  /**
   * 登记某个进程的退出回调（§6.5 聚合口径）：逐进程只记录退出码；当且仅当全部进程都已退出，
   * 才置聚合 exited 并走 finalize（removeInstance + deps.onExit 只发生一次 → 按钮只回落一次，R-08）。
   * shell 分支 procs.length === 1，语义与改动前逐字等价。
   *
   * onExitRecorded 是**逐退出**的副作用（exe 的 log.app.exit，R-08），在上面的聚合记账之后执行：
   * 每个进程只准注册一次 onExit —— 真 exe 接缝是单槽的（shell-execute.ts:138 private onExitCb、:168-172 赋值而不是
   * push，main.ts:1094 只是转交），第二次注册会永久覆盖第一次，聚合记账就整个丢掉（审查关键 1）。
   * 副作用在 finalize 之后调用，与改动前单条（含今天的旧配置）的顺序逐字相同。
   */
  private trackProcessExit(
    configId: string, inst: Instance, index: number, proc: ShellProcess | ExeProcess,
    onExitRecorded?: (code: number) => void,
  ): void {
    proc.onExit((code) => {
      inst.procExited[index] = true;
      inst.exitCode = code; // R-PF5：exitCode = 最后退出者的 code
      // procs 与 procExited 始终同长：启动循环中途抛错时循环立即中止，不会留下「已入表但未登记退出」的进程
      if (inst.procExited.every(Boolean)) {
        inst.exited = true;
        this.finalize(configId, inst); // 全部退出 → 摘实例 + 只上报一次
      } // 还有进程活着 → 不摘实例、不上报
      onExitRecorded?.(code); // 逐退出副作用不论聚合是否完成都要执行，且必须在聚合记账之后
    });
  }

  /** 登记自动命令与 5s 兜底计时器（§7.3；兜底现在只兜「一个字节都没有」，见 AUTO_CMD_TIMEOUT_MS 的注释） */
  private scheduleAutoCommand(inst: Instance, cmd: string): void {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    inst.auto = {
      cmd: trimmed,
      timer: setTimeout(() => this.releaseAutoCommand(inst, true), AUTO_CMD_TIMEOUT_MS),
      idleTimer: null, sawVisible: false, sawOutput: false, carry: '', released: false,
    };
  }

  /** 两条计时器一律走这里清：漏一条 = 摘掉实例之后仍然会写一次（getTimerCount 的门也钉在这） */
  private clearAutoTimers(inst: Instance): void {
    const auto = inst.auto;
    if (!auto) return;
    if (auto.timer) clearTimeout(auto.timer);
    auto.timer = null;
    if (auto.idleTimer) clearTimeout(auto.idleTimer);
    auto.idleTimer = null;
  }

  /**
   * 输出记账（#36 的两条门）：门① 用 splitVisibleText 跨块判「画过可见文本」，
   * 门② 每来一块就把静默计时器重排一次 —— 于是「输出还在往下走」的整段时间里一个字都不写。
   * 两条门没同时成立 = 不写（实测 wsl.exe 启动先吐 16B 纯转义序列，其后几秒才画提示符）。
   */
  private noteShellOutput(inst: Instance, data: string): void {
    const auto = inst.auto;
    if (!auto || auto.released) return;
    auto.sawOutput = true;
    if (!auto.sawVisible) {
      const { visible, carry } = splitVisibleText(auto.carry + data);
      auto.carry = carry;
      if (!/\S/.test(visible)) return; // 这一段只有转义序列 = 提示符还没画出来：门② 也不排，继续等
      auto.sawVisible = true;
      auto.carry = ''; // 过了门就不必再扫转义序列，尾巴一并丢掉
    }
    if (auto.idleTimer) clearTimeout(auto.idleTimer);
    auto.idleTimer = setTimeout(() => this.releaseAutoCommand(inst), AUTO_CMD_IDLE_MS);
  }

  /**
   * 只写一次。两条入口：
   * ① 门① + 门② 同时成立（noteShellOutput 排的静默计时器到点）；
   * ② 5s 兜底，且这 5s 内**一个字节输出都没有**（E5 口径逐字保留）—— 有输出就不让兜底插手（#36）。
   */
  private releaseAutoCommand(inst: Instance, fromFallbackTimer = false): void {
    const auto = inst.auto;
    if (!auto || auto.released) return;
    if (fromFallbackTimer && auto.sawOutput) return; // 有输出 = 写不写由两条门决定，兜底不插手
    auto.released = true;
    this.clearAutoTimers(inst);
    if (inst.exited || inst.kind !== 'shell') return;
    // 多行命令按行提交：行分隔先规整成 \r（见 toPtyInput 的实测注释），末尾再补一个 \r 提交最后一行。
    (inst.procs[0] as ShellProcess).write(toPtyInput(auto.cmd) + '\r');
  }
}
