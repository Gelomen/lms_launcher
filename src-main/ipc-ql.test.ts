// src-main/ipc-ql.test.ts
// 任务 6 的 D6a 自动化形状门（check 表 B5 / 索引 K12(2) 授权本文件）。
// 做法：vi.mock('electron') 捕获 main.ts 在模块作用域注册的 ipcMain.handle 处理器，直接调用，
// 断「通道名 / 参数 / 返回形状」与规格 §8（specs/2026-10-10-quick-launch-card-design.md:199-219）逐字一致。
// 这里只测**接线**：QuickLaunchManager 自身的状态机在 src-main/quick-launch.test.ts（任务 5）已测。
// 附带两件事：
//   • 事件载荷（C12）：真起一个 cmd 配置，断 ql-data / ql-exit 的载荷形状（规格 §8 事件表）；
//   • preload 的两个订阅（check E3）：清理后不再收到 → 重复订阅不叠加。
// 范围：不改 src-main/process.ts（索引 G4），不新增通道（check F4）。
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process'; // M23：tasklist / taskkill，只清测试自己造出来的记事本窗口
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { t } from './i18n'; // 任务 8 E7（索引 K16(2)）：词典已落地，断言必须按译文写

type Handler = (event: unknown, ...args: unknown[]) => unknown;
type Listener = (event: unknown, payload: unknown) => void;

const cap = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  /** 主进程 → 渲染端的 send（webContents.send） */
  sends: [] as Array<{ channel: string; payload: unknown }>,
  /** BrowserWindow.getAllWindows() 的返回值：放一个假窗口才能观察事件载荷 */
  windows: [] as unknown[],
  dialogResult: { canceled: true, filePaths: [] as string[] },
  dialogOptions: null as Record<string, unknown> | null,
  clipboardText: 'seed-from-clipboard',
  clipboardWrites: [] as string[],
  /** preload 侧 ipcRenderer 的订阅表（check E3 的判据） */
  listeners: new Map<string, Listener[]>(),
  /** contextBridge.exposeInMainWorld('lms', api) 捕获的 API */
  exposed: {} as Record<string, unknown>,
  /** detectTerminals 的**真实调用次数**：修复轮 1 · 重要 #1（索引 K15(2)）的证据计数器 */
  termProbes: 0,
}));

vi.mock('electron', () => ({
  app: {
    requestSingleInstanceLock: () => true,
    // whenReady 的回调体不是本文件的判据（建窗口 / 托盘 / GPU 采样 / 读仓库 yaml / 跑 schtasks）：
    // 返回永不 resolve 的 promise，让它整段不执行。通道注册在模块作用域，不受影响。
    whenReady: () => new Promise<void>(() => { /* 永不 resolve */ }),
    on: () => { /* second-instance / will-quit / activate：本文件不触发 */ },
    exit: () => { /* 单实例锁失败路径：本文件走 else 分支 */ },
    getLocale: () => 'zh-CN',
    getVersion: () => '0.0.0-test',
    isPackaged: false,
  },
  BrowserWindow: { getAllWindows: () => cap.windows },
  ipcMain: {
    handle: (name: string, fn: Handler) => { cap.handlers.set(name, fn); },
  },
  Tray: class { setToolTip(): void { /* noop */ } setContextMenu(): void { /* noop */ } on(): void { /* noop */ } },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => { /* whenReady 内，未执行 */ } },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }), createEmpty: () => ({}) },
  shell: { openExternal: async () => { /* 本文件不驱动 open_external */ } },
  clipboard: {
    readText: () => cap.clipboardText,
    writeText: (s: string) => { cap.clipboardText = s; cap.clipboardWrites.push(s); },
  },
  dialog: {
    showOpenDialog: async (_win: unknown, options: Record<string, unknown>) => {
      cap.dialogOptions = options;
      return cap.dialogResult;
    },
  },
  contextBridge: {
    exposeInMainWorld: (_name: string, api: Record<string, unknown>) => { Object.assign(cap.exposed, api); },
  },
  ipcRenderer: {
    invoke: async () => undefined,
    on: (channel: string, fn: Listener) => {
      const arr = cap.listeners.get(channel) ?? [];
      arr.push(fn);
      cap.listeners.set(channel, arr);
    },
    removeListener: (channel: string, fn: Listener) => {
      const arr = cap.listeners.get(channel) ?? [];
      cap.listeners.set(channel, arr.filter((x) => x !== fn));
    },
  },
}));

// 修复轮 1 · 重要 #1（索引 K15(2)）：给 detectTerminals 包一层**只计数**的壳，实现仍走原模块
// （语义不变：每次实测、不跨调用缓存，规格 §6.1）。用它钉「保存/启动 exe 配置不付探测代价」。
vi.mock('./quick-launch-terminals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./quick-launch-terminals')>();
  return {
    ...actual,
    detectTerminals: () => {
      cap.termProbes += 1;
      return actual.detectTerminals();
    },
  };
});

// 两个被测模块：main.ts 注册 12 个通道，preload.ts 注册 2 个事件订阅。
// main 用命名空间导入：修复轮 1 · 重要 #2 的守卫（qlStartContextOrThrow）从模块上取——
// 取不到（= 守卫退回 `?? 默认值` 的静默降级）时相关用例必须红，而不是整文件报错。
import * as mainModule from './main';
import './preload';
// 任务 3（规格 §6.6）：exe 类型的观察点从 ProcessState.prototype.launch 换到 winShell.shellExecute。
// 只替换 shellExecute 一个属性（其余六个方法保持真实现），finally 里还原。
import { winShell } from './shell-execute';
// 任务 7（2026-10-14-quick-launch-admin §6.8）：提权 shell 条目的观察点 = main.ts 接线里的两个接缝对象。
// 同样只替换属性（真工厂 startElevatedHost 与 ElevatedPtyProcess 都跑真实现），finally 里还原。
import { hostLauncher, winPipe } from './ql-elevated';
import { encodeFrame, HOST_FRAME } from './ql-host-protocol';

/** main.ts 里强制 qlStartContext 不变量的守卫（重要 #2）；不存在 → undefined */
const GUARD_EXPORT = 'qlStartContextOrThrow';
function guardOf(): ((seam: string) => { configId: string; available: Set<unknown> }) | undefined {
  return (mainModule as Record<string, unknown>)[GUARD_EXPORT] as
    ((seam: string) => { configId: string; available: Set<unknown> }) | undefined;
}

/** 取某个通道的处理器（未注册即失败，对应 check E2「漏一个 → 渲染端 invoke 报 no handler」） */
function handlerOf(name: string): Handler {
  const fn = cap.handlers.get(name);
  if (!fn) throw new Error('NO_HANDLER_REGISTERED: ' + name);
  return fn;
}
/**
 * 本文件真起过进程的配置 id（cmd.exe / notepad.exe）。
 * M10：自动记录，不再手维护清单——硬编码的 KNOWN_STARTED_IDS 会让新增用例静默不清理。
 * afterAll 逐个兜底 ql_stop：某条用例在自己的 ql_stop 之前抛错时，不让它们活到 worker 退出（修复轮 1 · Minor #8）。
 */
const startedIds = new Set<string>();
/** 模拟渲染端 invoke：ipcMain.handle 的监听器签名是 (event, ...args) */
function invoke(name: string, ...args: unknown[]): unknown {
  if (name === 'ql_start') startedIds.add(String(args[0]));
  return handlerOf(name)(undefined, ...args);
}
/**
 * 同步处理器（ql_delete 等）直接调用会**同步 throw**，而真 IPC 里那是一次 reject。
 * 用它把两种处理器归一成 Promise，错误断言才能统一写 rejects.toThrow。
 */
async function invokeRejects(name: string, ...args: unknown[]): Promise<unknown> {
  return handlerOf(name)(undefined, ...args);
}
/** 模拟主进程 webContents.send → 触发 preload 侧已注册的监听器 */
function fire(channel: string, payload: unknown): void {
  for (const fn of cap.listeners.get(channel) ?? []) fn({}, payload);
}
function listenerCount(channel: string): number {
  return (cap.listeners.get(channel) ?? []).length;
}
function sendsOf(channel: string): unknown[] {
  return cap.sends.filter((s) => s.channel === channel).map((s) => s.payload);
}
async function waitFor(cond: () => boolean, ms: number, what: string): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('TIMEOUT waiting for ' + what);
}

const CHANNELS = [
  'ql_list', 'ql_save', 'ql_delete', 'ql_terminals', 'ql_start', 'ql_stop',
  'ql_write', 'ql_resize', 'ql_states', 'ql_pick_exe', 'clipboard_read', 'clipboard_write',
] as const;

let realCwd = '';
let workDir = '';
beforeAll(() => {
  // main.ts 的 dataDir() 在非打包态取 process.cwd()（main.ts:75-78）→ 换掉它，
  // 免得 ql_save / ql_delete 往仓库的 configs/ 写 quick_launch.yaml（check G3 的范围门）。
  // 不用 process.chdir：vitest 在 worker 线程里跑，那里 chdir 不可用。
  realCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'ipc-ql-'));
  mkdirSync(join(workDir, 'configs'));
  process.cwd = () => workDir;
  cap.windows.push({
    webContents: {
      send: (channel: string, payload: unknown) => { cap.sends.push({ channel, payload }); },
      isLoading: () => false,
    },
  });
});
/**
 * M23（索引）：本文件拿真 notepad.exe 当 exe 样本，而 Windows 11 的打包版记事本
 * （Microsoft.WindowsNotepad）不是「一个进程 = 一个窗口」：`notepad.exe` 的 stub 在启动时就把窗口
 * 交给真正的记事本进程（命令行带 /SESSION:，父 PID 就是那个 stub），而 quick-launch 只跟踪 stub 的 PID。
 * → ql_stop 的 child.kill(SIGTERM) 只杀掉 stub，窗口进程不在实例表里，每跑一次本文件漏一个空白窗口。
 * 本机取证（主代理与实现者各测一次，结论一致）：spawn notepad.exe → 0.5s 内就有两个 notepad PID
 * （stub + 窗口进程）；对 stub 发 SIGTERM 只杀掉 stub，窗口进程留下；taskkill /F 杀掉窗口进程后 12s 内
 * 不再出现新的 notepad（清理是终态的，不会连锁再生）。
 * 做法：文件开头快照一次 notepad 的 PID 集合，afterAll 只清「快照里没有」的 PID——用户自己开着的记事本不动。
 */
function notepadPids(): number[] {
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq notepad.exe', '/NH', '/FO', 'CSV'], { encoding: 'utf8' });
    return out.split(/\r?\n/)
      .filter((line) => /^"notepad\.exe",/i.test(line)) // tasklist 输出的镜像名是 Notepad.exe
      .map((line) => Number(line.split('","')[1]))
      .filter((pid) => Number.isInteger(pid));
  } catch {
    return []; // tasklist 不可用 → 没有可对照的基线，也就不清（清理不是判据）
  }
}
/** 测试开始前就存在的记事本（用户自己开的）：这些 PID 一个都不许清掉 */
const NOTEPAD_BASELINE = new Set<number>(notepadPids());

afterAll(async () => {
  // 顺序：先停进程（要 cwd 吗？不要——stopGraceful 只 kill/taskkill），再清记事本再生窗口，最后还原 cwd、删临时目录。
  // 吞异常：兜底清理不是判据；未启动的 id 走 quick-launch.ts:334 的直接 return。
  for (const id of startedIds) {
    try { await handlerOf('ql_stop')(undefined, id); } catch { /* 已停 / 未启动 */ }
  }
  // M23：上面的 ql_stop 只杀掉被跟踪的 notepad stub，真正的记事本窗口进程（/SESSION: 那个）还留在桌面上。
  // 等 1.5s 让再生进程稳定（实测它在 spawn 时就已出现，1.5s 是余量），再对「不在基线快照里」的 PID 逐个强杀。
  await new Promise((r) => setTimeout(r, 1500));
  for (const pid of notepadPids()) {
    if (NOTEPAD_BASELINE.has(pid)) continue; // 用户自己开着的记事本：不碰
    try { execFileSync('taskkill', ['/F', '/PID', String(pid)]); } catch { /* 已退出 */ }
  }
  // 证据：本文件对 detectTerminals 的真实调用次数（修复轮 1 · 重要 #1 的前后对比靠它）
  console.log('[ipc-ql] detectTerminals 真实调用次数 =', cap.termProbes);
  process.cwd = () => realCwd;
  cap.windows.length = 0;
  rmSync(workDir, { recursive: true, force: true });
});

describe('C 段 · 通道注册（check C1-C11 / E2 / F1 / F4）', () => {
  it('规格 §8 的 12 个通道全部注册', () => {
    for (const name of CHANNELS) expect(cap.handlers.has(name), 'missing channel: ' + name).toBe(true);
  });

  it('没有规格外的 ql_* 通道（F4：不加 ql_restart 之类）', () => {
    const got = [...cap.handlers.keys()].filter((n) => n.startsWith('ql_')).sort();
    expect(got).toEqual([...CHANNELS].filter((n) => n.startsWith('ql_')).sort());
  });
});

describe('C1/C2/C3 · ql_list / ql_save / ql_delete', () => {
  it('ql_list：文件缺失 → { items:{}, invalid:[] }（规格 §5.2，不抛 MISSING）', () => {
    expect(invoke('ql_list')).toEqual({ items: {}, invalid: [] });
  });

  it('ql_save(id=null, entry) → 最终 id（string，前缀 ql）；条目只含该类型字段', async () => {
    const id = await invoke('ql_save', null, { name: '形状门 cmd', type: 'shell', shell: 'cmd', cmd: 'echo HI', exe: 'ignored.exe' });
    expect(typeof id).toBe('string');
    expect(String(id)).toMatch(/^ql[0-9a-z]+$/);
    const list = invoke('ql_list') as { items: Record<string, unknown>; invalid: string[] };
    expect(list.invalid).toEqual([]);
    expect(list.items[String(id)]).toEqual({ name: '形状门 cmd', type: 'shell', shell: 'cmd', cmd: 'echo HI', admin: false });
  });

  it('ql_save 空名 → VALIDATION:（前缀只用索引 G7 的五种）', async () => {
    await expect(invokeRejects('ql_save', null, { name: '  ', type: 'shell', shell: 'cmd', cmd: 'x' })).rejects.toThrow(/^VALIDATION:/);
  });

  it('ql_delete → undefined；再删同 id → VALIDATION:（不存在，不是 MISSING）', async () => {
    const id = String(await invoke('ql_save', 'qlshapedel', { name: '形状门 删除', type: 'exe', exe: 'notepad.exe' }));
    expect(id).toBe('qlshapedel');
    expect(invoke('ql_delete', id)).toBeUndefined();
    expect((invoke('ql_list') as { items: Record<string, unknown> }).items[id]).toBeUndefined();
    await expect(invokeRejects('ql_delete', id)).rejects.toThrow(/^VALIDATION:/);
  });
});

describe('C4 · ql_terminals（索引 K10-3：异步、不缓存）', () => {
  it('handler 是 async 函数，返回 Promise', async () => {
    expect(handlerOf('ql_terminals').constructor.name).toBe('AsyncFunction');
    const p = invoke('ql_terminals');
    expect(typeof (p as Promise<unknown>).then).toBe('function');
    await p;
  });

  it('返回 TerminalInfo[]：只含 {id,path}、id ∈ 四个终端；两次调用不共用数组实例（不缓存）', async () => {
    const a = (await invoke('ql_terminals')) as Array<Record<string, unknown>>;
    const b = (await invoke('ql_terminals')) as Array<Record<string, unknown>>;
    for (const r of [a, b]) {
      expect(Array.isArray(r)).toBe(true);
      for (const info of r) {
        expect(Object.keys(info).sort()).toEqual(['id', 'path']);
        expect(['pwsh', 'powershell', 'cmd', 'wsl']).toContain(info.id);
        expect(typeof info.path).toBe('string');
      }
    }
    expect(a).not.toBe(b);
    // 本机基线（规格 §6.3）：cmd 必然可用
    expect(a.some((t) => t.id === 'cmd')).toBe(true);
  });
});

describe('C5-C9 + C12 · ql_start / ql_write / ql_resize / ql_states / ql_stop + 两个事件', () => {
  const SHELL_ID = 'qlshape01';

  it('ql_start 未知 id → VALIDATION:（「配置存在」这层由接线自己查）', async () => {
    await expect(invokeRejects('ql_start', 'qlnope')).rejects.toThrow(/^VALIDATION:/);
  });

  it('shell 配置：{ tabId: "ql:<id>" }；ql_states 形状；write/resize 返回 undefined；stop 幂等；两个事件载荷逐字', async () => {
    const savedId = await invoke('ql_save', SHELL_ID, { name: '形状门 shell 运行', type: 'shell', shell: 'cmd', cmd: 'echo QLSHAPE' });
    expect(savedId).toBe(SHELL_ID);

    const res = await invoke('ql_start', SHELL_ID);
    expect(res).toEqual({ tabId: 'ql:' + SHELL_ID });
    expect(invoke('ql_states')).toEqual({ [SHELL_ID]: { running: true, stopping: false } });

    // 输出 → ql-data { tabId, data }（规格 §8 事件表）
    await waitFor(() => sendsOf('ql-data').length > 0, 20000, 'cmd.exe 的 ql-data');
    const dataEvents = sendsOf('ql-data') as Array<Record<string, unknown>>;
    for (const e of dataEvents) {
      expect(Object.keys(e).sort()).toEqual(['data', 'tabId']);
      expect(e.tabId).toBe('ql:' + SHELL_ID);
      expect(typeof e.data).toBe('string');
    }

    expect(invoke('ql_write', SHELL_ID, 'echo X\r')).toBeUndefined();
    expect(invoke('ql_resize', SHELL_ID, 100, 30)).toBeUndefined();

    await expect(invoke('ql_stop', SHELL_ID)).resolves.toBeUndefined();
    expect(invoke('ql_states')).toEqual({});
    await expect(invoke('ql_stop', SHELL_ID)).resolves.toBeUndefined(); // 再停一次：幂等，不抛错

    // 退出 → ql-exit { configId, code }
    await waitFor(() => sendsOf('ql-exit').length > 0, 10000, 'ql-exit');
    for (const e of sendsOf('ql-exit') as Array<Record<string, unknown>>) {
      expect(Object.keys(e).sort()).toEqual(['code', 'configId']);
      expect(e.configId).toBe(SHELL_ID);
      expect(typeof e.code).toBe('number');
    }
  }, 60000);

  it('exe 配置：{ tabId: null }；每配置一个新 ShellExecProcess（规格 §6.6），且不动 llama-server 的 ps 单例', async () => {
    await invoke('ql_save', 'qlshape02', { name: '形状门 exe A', type: 'exe', exe: 'notepad.exe' });
    await invoke('ql_save', 'qlshape03', { name: '形状门 exe B', type: 'exe', exe: 'notepad.exe' });

    const a = await invoke('ql_start', 'qlshape02');
    expect(a).toEqual({ tabId: null });
    // 若复用 main.ts:64 的 ps 单例，第二条会与第一条撞车（规格 §6.6 的「每配置一个新实例」不变量）
    const b = await invoke('ql_start', 'qlshape03');
    expect(b).toEqual({ tabId: null });

    expect(invoke('ql_states')).toEqual({
      qlshape02: { running: true, stopping: false },
      qlshape03: { running: true, stopping: false },
    });
    // 既有 get_state 通道读的是 main.ts:64 的 ps 单例：快捷启动的 exe 不得污染它
    expect(invoke('get_state')).toEqual({ running: false, stopping: false, configId: null });

    await invoke('ql_stop', 'qlshape02');
    await invoke('ql_stop', 'qlshape03');
    expect(invoke('ql_states')).toEqual({});
  }, 30000);

  it('exe 启动失败：前缀由 shell-execute 自带（规格 §6.5），经既有日志通道反馈且 `ql_start` 被拒', async () => {
    await invoke('ql_save', 'qlshape04', { name: '形状门 badexe', type: 'exe', exe: 'no-such-exe-zzz.exe' });
    // 观察点 = 真接缝的 shellExecute 属性。这里必须替换它：真 ShellExecuteEx 打一个不存在的 exe
    // 会弹系统错误框并把 vitest worker 卡住（规格 E19 / §9-R8，索引 R8 / K17）；真路径的失败由任务 4
    // 的真机清单守，本用例只钉适配器这一层的分工（同步 reject + 既有日志通道 + 可辨文案）。
    const original = winShell.shellExecute;
    winShell.shellExecute = () => ({ ok: false, handle: null, win32Error: 1223 }); // 用户在 UAC 点了「否」
    try {
      // 新路径：失败在调用栈里同步可见 → ql_start 直接 reject（规格 §6.6，取代旧「先返回、错误异步到」）
      await expect(invoke('ql_start', 'qlshape04')).rejects.toThrow(/^PROC: /);
      // 日志行行首必须是 [lms_launcher]（sys 通道统一口径，索引 K23），PROC: 分类标记紧随其后
      await waitFor(
        () => cap.sends.some((s) => s.channel === 'log-line' && /^\[lms_launcher\] PROC:/.test(String((s.payload as { line?: string }).line ?? ''))),
        5000, '[lms_launcher] PROC: 日志行',
      );
      const logLines = sendsOf('log-line') as Array<{ line: string; stream: string }>;
      const procLine = logLines.find((l) => l.stream === 'sys' && /^\[lms_launcher\] PROC:/.test(l.line));
      expect(procLine, 'sys 通道里必须有 PROC: 行 —— App.vue:477-478 的 catch 只负责回落按钮，原因行只由这条日志负责').toBeTruthy();
      // 索引 R1 / K2：UAC 取消必须给出可辨文案（带 exe），不再是 spawn 时代的 EACCES
      expect(procLine!.line).toContain(t('err.proc.uacCancelled', { exe: 'no-such-exe-zzz.exe' }));
      expect(procLine!.line).not.toContain('EACCES');
      await invoke('ql_stop', 'qlshape04');
    } finally {
      winShell.shellExecute = original;
    }
  }, 30000);

  // 2026-10-14-quick-launch-admin 任务 3（plan 步骤 5 / check B4、E1、E2、E3）：
  // exe 的「管理员」开关 = 到 Shell 接缝的 lpVerb。观察点仍是 winShell.shellExecute（:103-104 的既有做法）。
  it('exe 提权形状门：admin:true → shellExecute 收到 verb=runas；admin 缺省 → null（规格 §6.9 / 索引 G3、K29）', async () => {
    await invoke('ql_save', 'qladmin01', { name: '形状门 提权 on', type: 'exe', exe: 'notepad.exe', admin: true });
    await invoke('ql_save', 'qladmin02', { name: '形状门 提权 off', type: 'exe', exe: 'notepad.exe' });

    const seen: Array<{ file: string; nShow: number; opts: { verb?: string | null; parameters?: string | null } | undefined }> = [];
    const original = winShell.shellExecute;
    // 不真起进程：真 runas 会弹 UAC 并把主进程同步阻塞 5.7s（规格 §3-P11），且弹窗压不住（E19 / 索引 R8、K17）。
    // 返回 1223 = 用户在 UAC 点「否」：ql_start 同步 reject，且 quick-launch.ts:268-287 在 set 之前抛出 → 不残留状态。
    winShell.shellExecute = (file: string, nShow: number, opts?: { verb?: string | null; parameters?: string | null }) => {
      seen.push({ file, nShow, opts });
      return { ok: false, handle: null, win32Error: 1223 };
    };
    try {
      await expect(invoke('ql_start', 'qladmin01')).rejects.toThrow(/^PROC: /);
      await expect(invoke('ql_start', 'qladmin02')).rejects.toThrow(/^PROC: /);

      expect(seen.map((s) => s.file), '两条都是用户那一行的 exe').toEqual(['notepad.exe', 'notepad.exe']);
      // 勾选 → 'runas'；未勾选 → null（索引 G3 / RF2：不勾选的路径不多弹 UAC）
      expect(seen.map((s) => s.opts?.verb ?? null)).toEqual(['runas', null]);
      // 其余取值不随之变（规格 §6.4-3：parameters 本期不传、nShow 仍是 SW_SHOWNORMAL）
      expect(seen.map((s) => s.opts?.parameters ?? null)).toEqual([null, null]);
      expect(seen.map((s) => s.nShow)).toEqual([1, 1]);

      // §6.10：提权路径的 UAC 取消仍映射到 err.proc.uacCancelled，且 {exe} 是用户那一行的目标（不是宿主 exe）
      await waitFor(
        () => sendsOf('log-line').some((p) => String((p as { line?: string }).line ?? '')
          .includes(t('err.proc.uacCancelled', { exe: 'notepad.exe' }))),
        5000, 'uacCancelled(notepad.exe) 的 sys 日志行',
      );
      expect(invoke('ql_states'), '失败不残留状态').toEqual({});
    } finally {
      winShell.shellExecute = original;
      await invoke('ql_stop', 'qladmin01');
      await invoke('ql_stop', 'qladmin02');
    }
  }, 30000);
});

// ---------- 任务 7（2026-10-14-quick-launch-admin §6.8 / §6.10 / §9-R8）：提权 shell 条目的端到端形状门 ----------
// 观察点 = main.ts 的接线：QlDeps.spawnElevatedShell → 真工厂 startElevatedHost(winPipe, hostLauncher, …)。
// 这里只替换**接缝对象**的属性（winPipe 的六个管道方法 / hostLauncher 的三个方法 / winShell 的句柄方法）：
// 工厂本身、ElevatedPtyProcess 本身、QuickLaunchManager 本身都跑真代码 —— 于是「提权与非提权在页签事件 /
// ql_write / ql_resize / [停止] 上同形」这条判据（plan 任务 7 步骤 5）落在 IPC 层。
// 不真起提权进程、不真建管道（那些是规格 §7.2 的打包真机门）。
function fakeHostSeam(opts: { launchWin32Error?: number } = {}) {
  const seen = {
    pipeNames: [] as string[],
    hostArgs: [] as Array<{ exe: string; script: string; pipeName: string; token: string }>,
    hostHandles: [] as unknown[],
    hello: [] as Array<Record<string, unknown>>,
    frames: [] as Array<{ type: number; payload: string }>,
  };
  interface FakeHost { handle: unknown; pipeHandle: unknown; alive: boolean; queued: Buffer[] }
  const hosts: FakeHost[] = [];
  const byPipe = new Map<unknown, FakeHost>();
  const byName = new Map<string, FakeHost>();
  let seq = 0;
  // 一次 sendFrame 就是一个完整帧（ql-elevated.ts 的 sendFrame 不拆帧），所以按帧头解即可
  const decode = (buf: Buffer): { type: number; payload: string } => ({
    type: buf.readUInt8(0),
    payload: buf.subarray(5, 5 + buf.readUInt32LE(1)).toString('utf8'),
  });
  const original = {
    createServer: winPipe.createServer, connect: winPipe.connect, available: winPipe.available,
    read: winPipe.read, write: winPipe.write, close: winPipe.close,
    hostExePath: hostLauncher.hostExePath, hostScriptPath: hostLauncher.hostScriptPath, launch: hostLauncher.launch,
    pidOf: winShell.pidOf, isAlive: winShell.isAlive, exitCodeOf: winShell.exitCodeOf,
    terminate: winShell.terminate, closeHandle: winShell.close, killTree: winShell.killTree,
  };
  winPipe.createServer = (pipeName: string): unknown => {
    seq += 1;
    const host: FakeHost = { handle: { fakeHost: seq }, pipeHandle: { fakePipe: seq }, alive: true, queued: [] };
    hosts.push(host);
    byPipe.set(host.pipeHandle, host);
    byName.set(pipeName, host);
    seen.pipeNames.push(pipeName);
    return host.pipeHandle;
  };
  winPipe.connect = (): boolean => true;
  winPipe.available = (h: unknown): number => (byPipe.get(h)?.queued.reduce((n, b) => n + b.length, 0)) ?? 0;
  winPipe.read = (h: unknown, n: number): Buffer => {
    const host = byPipe.get(h);
    if (!host) return Buffer.alloc(0);
    const out: Buffer[] = [];
    let left = n;
    while (left > 0 && host.queued.length > 0) {
      const chunk = host.queued.shift() as Buffer;
      if (chunk.length <= left) { out.push(chunk); left -= chunk.length; }
      else { out.push(chunk.subarray(0, left)); host.queued.unshift(chunk.subarray(left)); left = 0; }
    }
    return Buffer.concat(out);
  };
  winPipe.write = (h: unknown, buf: Buffer): boolean => {
    const host = byPipe.get(h);
    if (!host) return false;
    const f = decode(buf);
    seen.frames.push(f);
    if (f.type === HOST_FRAME.HELLO) {
      seen.hello.push(JSON.parse(f.payload) as Record<string, unknown>);
      // 索引 K44①：真机上 READY 的 shellPid 是 0，本文件不据它做任何判断
      host.queued.push(encodeFrame(HOST_FRAME.READY, JSON.stringify({ shellPid: 0 })));
    }
    if (f.type === HOST_FRAME.STOP) {
      // 规格 §6.6-7：收到 STOP 的宿主自己杀树并回 EXIT 帧。照做，停止路径就不必等到宽限上限（真机同理）
      host.alive = false;
      host.queued.push(encodeFrame(HOST_FRAME.EXIT, JSON.stringify({ code: 0 })));
    }
    return true;
  };
  winPipe.close = (): void => { /* 假句柄没有要释放的东西 */ };
  hostLauncher.hostExePath = (): string => 'lms_launcher.exe'; // 不真解析宿主路径（真机门 §7.2-1）
  hostLauncher.hostScriptPath = (): string => 'ql-pty-host.js';
  hostLauncher.launch = (exe: string, script: string, pipeName: string, token: string) => {
    seen.hostArgs.push({ exe, script, pipeName, token });
    const host = byName.get(pipeName);
    if (!host) return { ok: false, handle: null, win32Error: 0 };
    if (opts.launchWin32Error !== undefined) {
      return { ok: false, handle: null, win32Error: opts.launchWin32Error }; // §6.10 第一行：1223 = UAC 点「否」
    }
    seen.hostHandles.push(host.handle);
    return { ok: true, handle: host.handle, win32Error: 0 };
  };
  // 宿主进程句柄的方法（ShellExecProcess 的 100ms 轮询要问它们）：假句柄不能交给真 koffi
  winShell.pidOf = (): number => 424242;
  winShell.isAlive = (h: unknown): boolean => hosts.some((x) => x.handle === h && x.alive);
  winShell.exitCodeOf = (): number => 0;
  winShell.terminate = (): boolean => true;
  winShell.close = (): void => { /* 假句柄 */ };
  winShell.killTree = (): boolean => false; // 不真跑 taskkill：假宿主没有进程树
  return {
    seen,
    /** 让「宿主」吐一行输出（真机上由 ConPTY 的 DATA 帧送达；index = 创建顺序） */
    emitData(index: number, text: string): void { hosts[index].queued.push(encodeFrame(HOST_FRAME.DATA, text)); },
    /**
     * 还原九个接缝属性。**先**让每个假宿主「退出」并给 ShellExecProcess 的 100ms 轮询一次机会
     * （shell-execute.ts:143 的定时器）：它没轮询到退出就不会 clearInterval，
     * 还原后就会拿假句柄去问真 koffi（TypeError: Unexpected Object value, expected void *）。
     */
    async restore(): Promise<void> {
      for (const h of hosts) h.alive = false;
      await new Promise((resolve) => setTimeout(resolve, 200)); // 100ms 轮询 + 余量
      Object.assign(winPipe, { createServer: original.createServer, connect: original.connect, available: original.available, read: original.read, write: original.write, close: original.close });
      Object.assign(hostLauncher, { hostExePath: original.hostExePath, hostScriptPath: original.hostScriptPath, launch: original.launch });
      Object.assign(winShell, { pidOf: original.pidOf, isAlive: original.isAlive, exitCodeOf: original.exitCodeOf, terminate: original.terminate, close: original.closeHandle, killTree: original.killTree });
    },
  };
}

/** 某个事件通道已发出的载荷（本文件里跨用例累积，所以断言一律按 tabId / configId 过滤） */
function sentPayloads(channel: string): unknown[] {
  return cap.sends.filter((s) => s.channel === channel).map((s) => s.payload);
}

describe('任务 7 · 提权 shell 条目的端到端形状门（plan 步骤 5 / 规格 §6.8 / 表 E1-E6 / C5）', () => {
  const ADMIN_ID = 'qlelevsh01';

  it('admin:true 的 shell 条目走提权宿主：页签事件 / ql_write / ql_resize / [停止] 与非提权用例同一断言集', async () => {
    const savedId = await invoke('ql_save', ADMIN_ID, { name: '形状门 提权 shell', type: 'shell', shell: 'cmd', cmd: 'echo QLELEV', admin: true });
    expect(savedId, 'admin 字段不影响保存').toBe(ADMIN_ID);
    const seam = fakeHostSeam();
    try {
      const res = await invoke('ql_start', ADMIN_ID);
      expect(res, 'C10：返回形状与非提权逐字一致').toEqual({ tabId: 'ql:' + ADMIN_ID });
      expect(invoke('ql_states'), 'C13：页签状态形状不变').toEqual({ [ADMIN_ID]: { running: true, stopping: false } });
      // 走的是提权接缝：一条私有管道 + 一次起宿主；argv 只带管道名与 token（规格 §6.4-4），其余在 HELLO 里
      expect(seam.seen.pipeNames.length).toBe(1);
      expect(seam.seen.hostArgs.length).toBe(1);
      expect(seam.seen.hello.length).toBe(1);
      expect(seam.seen.hello[0].shell).toBe('cmd');
      expect(seam.seen.hello[0].cols).toBe(80);
      expect(typeof seam.seen.hello[0].token).toBe('string');
      // 本地 pty 一次都没起：页签里出现的每个字符都只能来自宿主
      expect(seam.seen.frames.filter((f) => f.type === HOST_FRAME.WRITE), '首批输出之前不写自动命令（RF1）').toEqual([]);
      seam.emitData(0, 'QLELEV-PROMPT');
      await waitFor(
        () => (sentPayloads('ql-data') as Array<Record<string, unknown>>).some((e) => e.tabId === 'ql:' + ADMIN_ID),
        5000, '宿主 DATA → ql-data',
      );
      const dataEvents = (sentPayloads('ql-data') as Array<Record<string, unknown>>).filter((e) => e.tabId === 'ql:' + ADMIN_ID);
      for (const e of dataEvents) {
        expect(Object.keys(e).sort(), 'C12：ql-data 载荷键名逐字').toEqual(['data', 'tabId']);
        expect(typeof e.data).toBe('string');
      }
      // 自动命令在首批输出之后才写（与非提权路径同一时序判据）
      await waitFor(
        () => seam.seen.frames.some((f) => f.type === HOST_FRAME.WRITE && f.payload === 'echo QLELEV\r'),
        5000, '自动命令的 WRITE 帧',
      );
      // 输入与尺寸：payload 逐字（规格 §6.5 帧表）
      expect(invoke('ql_write', ADMIN_ID, 'echo X\r'), 'C10：无返回值').toBeUndefined();
      expect(invoke('ql_resize', ADMIN_ID, 100, 30), 'C10：无返回值').toBeUndefined();
      expect(seam.seen.frames.some((f) => f.type === HOST_FRAME.WRITE && f.payload === 'echo X\r'), 'WRITE 帧 payload 逐字').toBe(true);
      expect(seam.seen.frames.some((f) => f.type === HOST_FRAME.RESIZE && f.payload === JSON.stringify({ cols: 100, rows: 30 })), 'RESIZE 帧带 cols/rows').toBe(true);
      // [停止]：同一个 ql_stop 通道；STOP 帧带数字 timeoutSecs（索引 K44②）
      await expect(invoke('ql_stop', ADMIN_ID), 'C10：无返回值').resolves.toBeUndefined();
      expect(seam.seen.frames.some((f) => f.type === HOST_FRAME.STOP && (JSON.parse(f.payload) as { timeoutSecs?: unknown }).timeoutSecs === 3), 'STOP 帧带 timeoutSecs').toBe(true);
      expect(invoke('ql_states'), '停止后状态清空（按钮回落）').toEqual({});
      await expect(invoke('ql_stop', ADMIN_ID), 'C10：幂等').resolves.toBeUndefined();
      await waitFor(() => (sentPayloads('ql-exit') as Array<Record<string, unknown>>).some((e) => e.configId === ADMIN_ID), 5000, 'ql-exit');
      for (const e of (sentPayloads('ql-exit') as Array<Record<string, unknown>>).filter((x) => x.configId === ADMIN_ID)) {
        expect(Object.keys(e).sort(), 'C12：ql-exit 载荷键名逐字').toEqual(['code', 'configId']);
        expect(typeof e.code, '退出码优先取 EXIT 帧（规格 §6.7 / RF5）').toBe('number');
      }
    } finally {
      await invoke('ql_stop', ADMIN_ID); // 先停（此时假接缝还在），再还原
      await seam.restore();
    }
  }, 30000);

  // 表 E6 / 规格 §9-R8：并发提权条目各一条私有管道（ql-elevated.ts 的 nMaxInstances=1 + 每次新名字）与各自宿主
  it('two_elevated_entries_run_independently：两条提权条目并发 → 各一条私有管道与各自宿主，停一条不影响另一条', async () => {
    // id 必须是小写字母开头的字母数字串（quick-launch-config.ts:126 的既有校验），所以用 a01 / b01
    await invoke('ql_save', 'qleleva01', { name: '形状门 提权 A', type: 'shell', shell: 'cmd', cmd: 'echo QLELEV-A', admin: true });
    await invoke('ql_save', 'qlelevb01', { name: '形状门 提权 B', type: 'shell', shell: 'cmd', cmd: 'echo QLELEV-B', admin: true });
    const seam = fakeHostSeam();
    try {
      const [a, b] = await Promise.all([invoke('ql_start', 'qleleva01'), invoke('ql_start', 'qlelevb01')]);
      expect(a).toEqual({ tabId: 'ql:qleleva01' });
      expect(b).toEqual({ tabId: 'ql:qlelevb01' });
      expect(seam.seen.pipeNames.length).toBe(2);
      expect(new Set(seam.seen.pipeNames).size, '管道名必须互不相同（否则第二条连不上自己的管道）').toBe(2);
      expect(seam.seen.pipeNames.every((n) => n.includes('lms-ql-')), '管道名前缀不变（规格 §6.5）').toBe(true);
      expect(seam.seen.hostHandles.length).toBe(2);
      expect(seam.seen.hostHandles[0], '各自一个宿主句柄').not.toBe(seam.seen.hostHandles[1]);
      expect(seam.seen.hello[0].token, '一次性 token 也各不相同（§6.4-4）').not.toBe(seam.seen.hello[1].token);
      expect(invoke('ql_states')).toEqual({
        qleleva01: { running: true, stopping: false },
        qlelevb01: { running: true, stopping: false },
      });
      // 停一条不影响另一条
      await invoke('ql_stop', 'qleleva01');
      expect(invoke('ql_states')).toEqual({ qlelevb01: { running: true, stopping: false } });
      expect(invoke('ql_write', 'qlelevb01', 'still-alive'), '另一条的输入仍可用').toBeUndefined();
      await invoke('ql_stop', 'qlelevb01');
      expect(invoke('ql_states')).toEqual({});
    } finally {
      await invoke('ql_stop', 'qleleva01'); // 先停（此时假接缝还在），再还原
      await invoke('ql_stop', 'qlelevb01');
      await seam.restore();
    }
  }, 30000);

  // 表 C5 / 索引 K52 + §6.10 第一行 + §7.2-4 的自动化对应物：文案只包一层，日志一行且带的是终端名
  it('提权启动失败（UAC 点「否」= 1223）：ql_start 只被包一层 PROC:，sys 日志一行且带终端名不是宿主名', async () => {
    await invoke('ql_save', 'qlelevfail', { name: '形状门 提权失败', type: 'shell', shell: 'cmd', cmd: 'echo QLELEV-FAIL', admin: true });
    const seam = fakeHostSeam({ launchWin32Error: 1223 });
    const before = sentPayloads('log-line').length;
    let msg = '';
    try {
      await invokeRejects('ql_start', 'qlelevfail');
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    try {
      expect(msg, '§6.10 第一行：{exe} 是用户那一行的目标（终端 exe），不是宿主').toBe('PROC: ' + t('err.proc.uacCancelled', { exe: 'cmd.exe' }));
      expect((msg.match(/PROC:/g) ?? []).length, '索引 K52：不得二次包装').toBe(1);
      expect(msg).not.toContain('lms_launcher.exe'); // R-21：宿主就是应用自己的 exe，它不得出现在文案里
      const lines = (sentPayloads('log-line') as Array<{ line: string; stream: string }>).slice(before)
        .filter((l) => l.stream === 'sys' && l.line.includes(t('err.proc.uacCancelled', { exe: 'cmd.exe' })));
      expect(lines.length, '一行、且只有一行（索引 K10：除此之外不新增日志行）').toBe(1);
      expect(lines[0].line, '与 main.ts:1069 的 spawnExeProcess 同一分工：先写原因行再抛').toBe('[lms_launcher] ' + msg);
      expect(invoke('ql_states'), '失败不残留状态').toEqual({});
      expect(seam.seen.frames, '起宿主就失败 → 没有管道读循环，一条帧都不该写').toEqual([]);
    } finally {
      await invoke('ql_stop', 'qlelevfail'); // 先停（此时假接缝还在），再还原
      await seam.restore();
    }
  }, 30000);
});

// ---------- 修复轮 1（任务 6 审查：重要 #1 / 重要 #2 / Minor #2）----------

describe('修复轮 1 · 重要 #1（索引 K15(2)）：exe 分支不付终端探测的代价', () => {
  it('ql_save：exe 条目不调 detectTerminals；shell 条目仍实测（对照，规格 §5.3-4）', async () => {
    const beforeExe = cap.termProbes;
    const id = String(await invoke('ql_save', 'qlfixexe01', { name: '修复 exe 不探测', type: 'exe', exe: 'notepad.exe' }));
    expect(id).toBe('qlfixexe01');
    // available 只在 quick-launch-config.ts:104-107 的 shell 分支被读 → exe 保存不得付 3×3s
    expect(cap.termProbes, '保存 exe 配置不得调用 detectTerminals').toBe(beforeExe);

    const beforeShell = cap.termProbes;
    const sid = String(await invoke('ql_save', 'qlfixsh01', { name: '修复 shell 对照', type: 'shell', shell: 'cmd', cmd: 'echo FIX' }));
    expect(sid).toBe('qlfixsh01');
    // 对照组：shell 的「终端可用」校验必须仍然实测（规格 §5.3-4 / 索引 K14(2)）
    expect(cap.termProbes, '保存 shell 配置仍必须实测').toBe(beforeShell + 1);
  });

  it('ql_start：exe 配置不调 detectTerminals；shell 配置仍实测（对照，规格 §7.5）', async () => {
    const beforeExe = cap.termProbes;
    expect(await invoke('ql_start', 'qlfixexe01')).toEqual({ tabId: null });
    // quick-launch.ts:238 的 isTerminalAvailable 只在 shell 分支被调 → exe 启动不付探测代价
    expect(cap.termProbes, '启动 exe 配置不得调用 detectTerminals').toBe(beforeExe);
    await invoke('ql_stop', 'qlfixexe01');

    const beforeShell = cap.termProbes;
    expect(await invoke('ql_start', 'qlfixsh01')).toEqual({ tabId: 'ql:qlfixsh01' });
    // 对照组：shell 启动前的「终端仍可用」（规格 §7.5）仍要实测
    expect(cap.termProbes, '启动 shell 配置仍必须实测').toBe(beforeShell + 1);
    await invoke('ql_stop', 'qlfixsh01');
  }, 30000);
});

describe('修复轮 1 · Minor #2：ql_start 的「配置存在」不走原型链', () => {
  // items 是普通对象（quick-launch-config.ts:122）→ items['constructor'] 取到真值，
  // 会通过「配置存在」这层，然后在 quick-launch.ts:293 抛 typeInvalid：前缀对、消息错。
  // 配置层自己对此是防住的（quick-launch-config.ts:161 用 hasOwnProperty）→ 接线对齐同一口径。
  for (const key of ['constructor', 'toString', '__proto__']) {
    it(`ql_start('${key}') → VALIDATION: 且消息是 notFound，不是 typeInvalid`, async () => {
      let msg = '';
      try {
        await invokeRejects('ql_start', key);
      } catch (e) {
        msg = e instanceof Error ? e.message : String(e);
      }
      expect(msg).toMatch(/^VALIDATION:/);
      // 任务 8 E7（索引 K16(2)）：err.ql.* 已进词典，消息里是译文而不是 key 名。
      // 期望值仍由 t() 现算（本文件默认 zh），所以「notFound 而不是 typeInvalid」这条判据不变；
      // key-coverage.test.ts:24 的 walk() 排除 .test.ts，测试里写字面量 key 不触「调用点 ↔ 词典」门。
      expect(msg).toContain(t('err.ql.notFound', { id: key }));
      expect(msg).not.toContain(t('err.ql.typeInvalid', { type: key }));
    });
  }
});

describe('修复轮 1 · 重要 #2：qlStartContext 槽的不变量由代码强制', () => {
  it('main.ts 导出守卫：不在 ql_start 里（槽为 null）时立刻抛 STATE:，不静默降级', () => {
    const guard = guardOf();
    expect(typeof guard, '重要 #2 的守卫必须存在（改回 ?? 默认值 就退回静默降级）').toBe('function');
    // 此刻没有任何 ql_start 在飞 → 槽必为 null；两个构造期回调若被调用必须炸，
    // 而不是把 configId 变成 null（污染 get_state 的 runningConfigId 语义）或抛误导性的 terminalGone。
    expect(() => (guard as (s: string) => unknown)('probe')).toThrow(/^STATE:/);
  });

  it('两个 exe 配置并发 ql_start：ShellExecuteEx 各归各（规格 §6.6），且 spawnExe 处槽必然非空且属于本次', async () => {
    const guard = guardOf();
    // 两条配置的 exe 必须不同：观察点记的是 lpFile，只有两条不同才抓得出「串到别的请求」（表 E4）
    const EXE_OF: Record<string, string> = { qlconc01: 'notepad.exe', qlconc02: 'mspaint.exe' };
    const calls: Array<{ file: string; ctxOk: boolean }> = [];
    const original = winShell.shellExecute;
    // 观察点 = 新路径的那次调用本身（规格 §6.6）：只记参数，随后原样真启动（两条真进程，表 E8）。
    winShell.shellExecute = (file: string, nShow: number) => {
      let ctxOk = false;
      try {
        const ctx = guard ? guard('probe') : undefined;
        // 槽里的 configId 必须正是这条 lpFile 所属的配置：串到别的请求 / 槽为 null → false
        ctxOk = !!ctx && EXE_OF[ctx.configId] === file;
      } catch {
        ctxOk = false;
      }
      calls.push({ file, ctxOk });
      return original(file, nShow);
    };

    try {
      await invoke('ql_save', 'qlconc01', { name: '修复 并发 A', type: 'exe', exe: EXE_OF.qlconc01 });
      await invoke('ql_save', 'qlconc02', { name: '修复 并发 B', type: 'exe', exe: EXE_OF.qlconc02 });

      const [a, b] = await Promise.all([invoke('ql_start', 'qlconc01'), invoke('ql_start', 'qlconc02')]);
      expect(a).toEqual({ tabId: null });
      expect(b).toEqual({ tabId: null });

      // 各自的 lpFile 不串（顺序 = 两次 invoke 的顺序：两个 handler 各自同步跑完再让出）
      expect(calls.map((c) => c.file)).toEqual([EXE_OF.qlconc01, EXE_OF.qlconc02]);
      // 每次 spawnExe 读到的槽就是本次启动的（槽为 null 或串到另一条 → false）
      expect(calls.map((c) => c.ctxOk)).toEqual([true, true]);

      expect(invoke('ql_states')).toEqual({
        qlconc01: { running: true, stopping: false },
        qlconc02: { running: true, stopping: false },
      });
      // 既有 get_state 读的是 main.ts:64 的 ps 单例：两条快捷启动 exe 不得污染它
      expect(invoke('get_state')).toEqual({ running: false, stopping: false, configId: null });
    } finally {
      winShell.shellExecute = original;
      await invoke('ql_stop', 'qlconc01');
      await invoke('ql_stop', 'qlconc02');
    }
  }, 30000);
});

describe('C10 · ql_pick_exe（.exe 过滤；取消 → null，不抛错）', () => {
  it('取消对话框 → null，且过滤器是 .exe', async () => {
    cap.dialogResult = { canceled: true, filePaths: [] };
    await expect(invoke('ql_pick_exe')).resolves.toBeNull();
    const filters = (cap.dialogOptions as { filters?: Array<{ extensions: string[] }> }).filters;
    expect(filters?.[0].extensions).toEqual(['exe']);
  });

  it('选中 → 返回路径字符串', async () => {
    cap.dialogResult = { canceled: false, filePaths: ['D:\\Tools\\LM Studio.exe'] };
    await expect(invoke('ql_pick_exe')).resolves.toBe('D:\\Tools\\LM Studio.exe');
  });
});

describe('C11 · clipboard_read / clipboard_write', () => {
  it('clipboard_read → string；clipboard_write → undefined 且随后读得到', () => {
    expect(typeof invoke('clipboard_read')).toBe('string');
    expect(invoke('clipboard_write', 'ZHW with ASCII')).toBeUndefined();
    expect(cap.clipboardWrites).toEqual(['ZHW with ASCII']);
    expect(invoke('clipboard_read')).toBe('ZHW with ASCII');
  });
});

describe('E3 · preload 的两个事件订阅（照 onLogLine 的 removeListener 模式）', () => {
  it('onQlData / onQlExit 已暴露；清理后不再收到（重复订阅不叠加）', () => {
    // 先取成带类型的局部变量：`x as T(cb)` 这种写法在 as 后面直接跟调用括号时会被解析成别的东西
    const subData = cap.exposed.onQlData as unknown as (cb: (e: unknown) => void) => () => void;
    const subExit = cap.exposed.onQlExit as unknown as (cb: (e: unknown) => void) => () => void;
    expect(typeof subData).toBe('function');
    expect(typeof subExit).toBe('function');

    const gotData: unknown[] = [];
    const gotExit: unknown[] = [];
    const offData = subData((e) => gotData.push(e));
    const offExit = subExit((e) => gotExit.push(e));
    expect(typeof offData).toBe('function'); // 返回的是清理函数
    expect(listenerCount('ql-data')).toBe(1);
    expect(listenerCount('ql-exit')).toBe(1);

    fire('ql-data', { tabId: 'ql:c1', data: 'hi' });
    fire('ql-exit', { configId: 'c1', code: 0 });
    expect(gotData).toEqual([{ tabId: 'ql:c1', data: 'hi' }]);
    expect(gotExit).toEqual([{ configId: 'c1', code: 0 }]);

    offData();
    offExit();
    expect(listenerCount('ql-data')).toBe(0);
    expect(listenerCount('ql-exit')).toBe(0);
    fire('ql-data', { tabId: 'ql:c1', data: 'again' });
    expect(gotData.length).toBe(1); // 已清理 → 不再收到

    // 再订阅两次并各自清理：计数回到 0，既不叠加也不残留
    const off2 = subData(() => { /* noop */ });
    const off3 = subData(() => { /* noop */ });
    expect(listenerCount('ql-data')).toBe(2);
    off2();
    off3();
    expect(listenerCount('ql-data')).toBe(0);
  });
});
