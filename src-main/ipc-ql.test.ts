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
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
import { ProcessState } from './process';

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
/** 模拟渲染端 invoke：ipcMain.handle 的监听器签名是 (event, ...args) */
function invoke(name: string, ...args: unknown[]): unknown {
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
// 本文件里真起过进程的配置 id（cmd.exe / notepad.exe）。afterAll 兜底停一遍：
// 某条用例在 ql_stop 之前抛错时，不让它们活到 worker 退出（修复轮 1 · Minor #8）。
const KNOWN_STARTED_IDS = [
  'qlshape01', 'qlshape02', 'qlshape03', 'qlshape04',
  'qlfixexe01', 'qlfixsh01', 'qlconc01', 'qlconc02',
];

afterAll(async () => {
  // 顺序：先停进程（要 cwd 吗？不要——stopGraceful 只 kill/taskkill），再还原 cwd、删临时目录。
  // 吞异常：兜底清理不是判据；未启动的 id 走 quick-launch.ts:334 的直接 return。
  for (const id of KNOWN_STARTED_IDS) {
    try { await handlerOf('ql_stop')(undefined, id); } catch { /* 已停 / 未启动 */ }
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
    expect(list.items[String(id)]).toEqual({ name: '形状门 cmd', type: 'shell', shell: 'cmd', cmd: 'echo HI' });
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

  it('exe 配置：{ tabId: null }；每配置一个新 ProcessState，且不动 llama-server 的 ps 单例（索引 K13）', async () => {
    await invoke('ql_save', 'qlshape02', { name: '形状门 exe A', type: 'exe', exe: 'notepad.exe' });
    await invoke('ql_save', 'qlshape03', { name: '形状门 exe B', type: 'exe', exe: 'notepad.exe' });

    const a = await invoke('ql_start', 'qlshape02');
    expect(a).toEqual({ tabId: null });
    // 若复用 main.ts:59 的 ps 单例，第二次 launch 会抛 STATE:（process.ts:28）
    const b = await invoke('ql_start', 'qlshape03');
    expect(b).toEqual({ tabId: null });

    expect(invoke('ql_states')).toEqual({
      qlshape02: { running: true, stopping: false },
      qlshape03: { running: true, stopping: false },
    });
    // 既有 get_state 通道读的是 ps 单例：快捷启动的 exe 不得污染它
    expect(invoke('get_state')).toEqual({ running: false, stopping: false, configId: null });

    await invoke('ql_stop', 'qlshape02');
    await invoke('ql_stop', 'qlshape03');
    expect(invoke('ql_states')).toEqual({});
  }, 30000);

  it('exe 启动失败：前缀由 ProcessState 自带（索引 K11(4)），并经既有日志通道反馈（check E4）', async () => {
    await invoke('ql_save', 'qlshape04', { name: '形状门 badexe', type: 'exe', exe: 'no-such-exe-zzz.exe' });
    const res = await invoke('ql_start', 'qlshape04');
    expect(res).toEqual({ tabId: null }); // 启动失败是异步的（child.on('error')），start 本身已返回
    await waitFor(
      () => cap.sends.some((s) => s.channel === 'log-line' && /^PROC:/.test(String((s.payload as { line?: string }).line ?? ''))),
      5000, 'PROC: 日志行',
    );
    const logLines = sendsOf('log-line') as Array<{ line: string; stream: string }>;
    expect(logLines.some((l) => l.stream === 'sys' && /^PROC:/.test(l.line))).toBe(true);
    await invoke('ql_stop', 'qlshape04');
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
      // 词典未落地（K8）→ t() 原样返回 key（dict.ts:577），所以消息里就是 key 名本身
      expect(msg).toContain('err.ql.notFound');
      expect(msg).not.toContain('err.ql.typeInvalid');
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

  it('两个 exe 配置并发 ql_start：launch(exe, [], configId) 各归各，且 spawnExe 处槽必然非空且属于本次', async () => {
    const guard = guardOf();
    const calls: Array<{ args: string[]; configId: string | null; ctxOk: boolean }> = [];
    const original = ProcessState.prototype.launch;
    // 观察点 = K13 要求的那次调用本身：process.ts:27 的第三参数就是 runningConfigId 的来源。
    ProcessState.prototype.launch = function (
      this: ProcessState, exe: string, args: string[], configId: string | null, cwd?: string,
    ): Promise<void> {
      let ctxOk = false;
      try {
        const ctx = guard ? guard('probe') : undefined;
        ctxOk = !!ctx && ctx.configId === configId; // 串到别的请求 / 槽为 null → false
      } catch {
        ctxOk = false;
      }
      calls.push({ args, configId, ctxOk });
      return original.call(this, exe, args, configId, cwd);
    } as typeof ProcessState.prototype.launch;

    try {
      await invoke('ql_save', 'qlconc01', { name: '修复 并发 A', type: 'exe', exe: 'notepad.exe' });
      await invoke('ql_save', 'qlconc02', { name: '修复 并发 B', type: 'exe', exe: 'notepad.exe' });

      const [a, b] = await Promise.all([invoke('ql_start', 'qlconc01'), invoke('ql_start', 'qlconc02')]);
      expect(a).toEqual({ tabId: null });
      expect(b).toEqual({ tabId: null });

      // 各自的 configId 不串（顺序 = 两次 invoke 的顺序：两个 handler 各自同步跑完再让出）
      expect(calls.map((c) => c.configId)).toEqual(['qlconc01', 'qlconc02']);
      // 索引 K13 逐字：launch(exe, [], configId)
      for (const c of calls) expect(c.args).toEqual([]);
      // 每次 spawnExe 读到的槽就是本次启动的（槽为 null 或串到另一条 → false）
      expect(calls.map((c) => c.ctxOk)).toEqual([true, true]);

      expect(invoke('ql_states')).toEqual({
        qlconc01: { running: true, stopping: false },
        qlconc02: { running: true, stopping: false },
      });
      // 既有 get_state 读的是 main.ts:59 的 ps 单例：两条快捷启动 exe 不得污染它
      expect(invoke('get_state')).toEqual({ running: false, stopping: false, configId: null });
    } finally {
      ProcessState.prototype.launch = original;
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
