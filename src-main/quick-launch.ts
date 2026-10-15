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
// 规格 §7.3：等第一批输出（shell 已就绪）再写自动命令；5s 无输出则兜底写入。审查重点 R1。
const AUTO_CMD_TIMEOUT_MS = 5000;
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
  timer: ReturnType<typeof setTimeout> | null;
  released: boolean;
}

/** 一配置一实例（F4）：运行中/停止中的配置再点启动 → STATE: */
interface Instance {
  kind: 'shell' | 'exe';
  proc: ShellProcess | ExeProcess;
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
        kind: 'shell', proc, tabId, stopping: false, exited: false, exitCode: null, auto: null,
      };
      proc.onData((data) => {
        // 顺序要紧：先把输出转给渲染端，再写自动命令（审查重点 R1 / check E4）
        this.deps.onData(tabId, data);
        this.releaseAutoCommand(inst);
      });
      proc.onExit((code) => {
        inst.exited = true;
        inst.exitCode = code;
        this.finalize(configId, inst);
      });
      this.instances.set(configId, inst);
      if (inst.exited) {
        this.finalize(configId, inst); // 极端竞态：spawn 后同步就退出
        return { tabId };
      }
      this.scheduleAutoCommand(inst, typeof e.cmd === 'string' ? e.cmd : '');
      return { tabId };
    }

    if (e.type === 'exe') {
      const exe = typeof e.exe === 'string' ? e.exe.trim() : '';
      if (!exe) throw new Error('VALIDATION: ' + t('err.ql.exeRequired'));
      // 规格 §7.3：可执行程序不用 PTY。不 catch：ProcessState.launch 的 STATE:/PROC: 原样上抛。
      const proc = this.deps.spawnExe(exe);
      const inst: Instance = {
        kind: 'exe', proc, tabId: null, stopping: false, exited: false, exitCode: null, auto: null,
      };
      proc.onExit((code) => {
        inst.exited = true;
        inst.exitCode = code;
        this.finalize(configId, inst);
        // 无页签 → 反馈走日志（任务 6 把 onSysLine 接到既有 emitLog(line,'sys')）。
        // 复用词典既有键，不新建 err.ql.* / log.ql.*（索引 K9 的「复用既有键」口径）。
        this.deps.onSysLine(configId, t('log.app.exit', { code }));
      });
      this.instances.set(configId, inst);
      this.deps.onSysLine(configId, t('log.launcher.start.cmd', { cmd: exe }));
      return { tabId: null };
    }

    throw new Error('VALIDATION: ' + t('err.ql.typeInvalid', { type: String(e.type ?? '') }));
  }

  /** 键盘输入（§8 ql_write） */
  write(configId: string, data: string): void {
    const inst = this.instances.get(configId);
    if (!inst || inst.kind !== 'shell') throw new Error('STATE: ' + t('err.proc.noChild'));
    (inst.proc as ShellProcess).write(data);
  }

  /** 尺寸（§8 ql_resize） */
  resize(configId: string, cols: number, rows: number): void {
    const inst = this.instances.get(configId);
    if (!inst || inst.kind !== 'shell') throw new Error('STATE: ' + t('err.proc.noChild'));
    (inst.proc as ShellProcess).resize(cols, rows);
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
    try {
      await inst.proc.stopGraceful(timeoutSecs);
    } catch {
      // 停止失败也要收尾，否则状态卡在 stopping
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
      out[configId] = { running: !inst.stopping && inst.proc.isRunning(), stopping: inst.stopping };
    }
    return out;
  }

  /** 退出收尾：从 Map 摘掉并上报 ql-exit（§7.5「页签保留、按钮回落」） */
  private finalize(configId: string, inst: Instance): void {
    if (this.instances.get(configId) !== inst) return; // 已被替换或已摘除
    this.instances.delete(configId);
    if (inst.auto?.timer) clearTimeout(inst.auto.timer);
    this.deps.onExit(configId, inst.exitCode ?? -1);
  }

  /** 登记自动命令与 5s 兜底计时器（§7.3） */
  private scheduleAutoCommand(inst: Instance, cmd: string): void {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    inst.auto = { cmd: trimmed, timer: setTimeout(() => this.releaseAutoCommand(inst), AUTO_CMD_TIMEOUT_MS), released: false };
  }

  /** 只写一次：首批输出到达（shell 就绪）或 5s 超时（兜底） */
  private releaseAutoCommand(inst: Instance): void {
    const auto = inst.auto;
    if (!auto || auto.released) return;
    auto.released = true;
    if (auto.timer) clearTimeout(auto.timer);
    auto.timer = null;
    if (inst.exited || inst.kind !== 'shell') return;
    (inst.proc as ShellProcess).write(auto.cmd + '\r');
  }
}
