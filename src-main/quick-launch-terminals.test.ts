// src-main/quick-launch-terminals.test.ts
// 任务 4：终端探测（pwsh / powershell / cmd / wsl），只返回可用项。
// 规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §6.1 / §6.2 / §6.3 / §12.3
// E1 / E2 / E3 = 计划 §任务 4 步骤 1 的三个用例逐字（真机，未改动）。
// E8 / E9 = 索引 K10 补的注入式回归用例（任务 4 审查 Important #1）：本机永远观察不到「wsl 可用」
//   （规格 §6.3），where.exe 的三态也无法在真机稳定复现 → 不注入就永远验证不到 §6.1 的 wsl / pwsh 两行。
//   注入只替换 node:child_process 的 spawnSync（未装脚本时委托真实实现，故 E3 的行为不变）；
//   C1-C3 的导出签名一字未改；不 mock node:fs——「文件是否存在」走真实 fs：
//   存在的文件取 process.execPath（跑 vitest 的 node 可执行文件，必然存在），不存在的取 MISSING_PATH 常量。
// E4 / E7 的代码结构证据行号见 .superpowers/sdd/2026-10-10-quick-launch-card/task-04-report.md。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { parseWslDistroOutput, detectTerminals } from './quick-launch-terminals';

// ─────────────────────────────────────────────────────────────────────────────
// E8 / E9 的注入通道：必须在被测模块加载前就位，所以用 vi.hoisted + vi.mock
// （仓库既有写法，见 src-main/llama-update-download.test.ts:4-35）。
// ─────────────────────────────────────────────────────────────────────────────
type SpawnOpts = { encoding?: string; windowsHide?: boolean; timeout?: number; [k: string]: unknown };
type FakeResult = { status: number; stdout?: Buffer };
type FakeScript = (cmd: string, args: readonly string[], opts: SpawnOpts) => FakeResult;

const spawnHub = vi.hoisted(() => ({
  impl: null as unknown as FakeScript | null,
  calls: [] as { cmd: string; args: readonly string[]; opts: SpawnOpts }[],
}));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    spawnSync: (cmd: string, args?: readonly string[], opts?: SpawnOpts) => {
      const a = args ?? [];
      const o = opts ?? {};
      spawnHub.calls.push({ cmd, args: a, opts: o });
      if (!spawnHub.impl) {
        return (actual.spawnSync as unknown as (c: string, ar: readonly string[], op: SpawnOpts) => unknown)(cmd, a, o);
      }
      const r = spawnHub.impl(cmd, a, o);
      // 按调用方请求的 encoding 交付：真机 spawnSync 的语义是「原始字节按 encoding 解码」，
      // 所以实现里的 encoding 被改成 'utf-8' 时这里给出按 utf-8 解码的文本，不替实现兜底。
      const raw = r.stdout ?? Buffer.alloc(0);
      const stdout = !o.encoding || o.encoding === 'buffer' ? raw : raw.toString(o.encoding as BufferEncoding);
      return { status: r.status, signal: null, output: [], pid: 0, stdout, stderr: Buffer.alloc(0) };
    },
  };
});

const REAL_PATH = process.execPath; // 必然存在的文件
const MISSING_PATH = 'C:\\ql-t4-inject\\no-such-file.exe'; // 必然不存在的文件

function utf16leBytes(text: string): Buffer { return Buffer.from(text, 'utf16le'); }
function utf8Bytes(text: string): Buffer { return Buffer.from(text, 'utf-8'); }

// 假进程脚本：where.exe 按查询名分派，'<exe> -l -q' 走 wslList；未登记的调用一律「查不到」（退出码 1）
function scriptWith(handlers: {
  wherePwsh?: FakeResult;
  whereWslExe?: FakeResult;
  wslList?: FakeResult;
}): FakeScript {
  const notFound: FakeResult = { status: 1, stdout: Buffer.alloc(0) };
  return (cmd, args) => {
    if (String(cmd).toLowerCase().endsWith('where.exe')) {
      const name = String(args[0] ?? '');
      if (name === 'pwsh') return handlers.wherePwsh ?? notFound;
      if (name === 'wsl.exe') return handlers.whereWslExe ?? notFound;
      return notFound;
    }
    if (args[0] === '-l' && args[1] === '-q') return handlers.wslList ?? notFound;
    return notFound;
  };
}

// 注入 → 重置模块缓存 → 动态 import 被测模块 → 探测
async function detectWithInjectedSpawn(script: FakeScript) {
  if (!existsSync(REAL_PATH) || existsSync(MISSING_PATH)) {
    throw new Error('夹具路径不成立：REAL_PATH=' + existsSync(REAL_PATH) + ' MISSING_PATH=' + existsSync(MISSING_PATH));
  }
  spawnHub.impl = script;
  spawnHub.calls = [];
  vi.resetModules();
  const mod = await import('./quick-launch-terminals');
  return mod.detectTerminals();
}

function whereCalls(name: string) {
  return spawnHub.calls.filter(
    (c) => String(c.cmd).toLowerCase().endsWith('where.exe') && String(c.args[0] ?? '') === name,
  );
}
function wslQueryCalls() {
  return spawnHub.calls.filter((c) => c.args[0] === '-l' && c.args[1] === '-q');
}

afterEach(() => {
  spawnHub.impl = null;
  spawnHub.calls = [];
  vi.resetModules();
});

describe('quick-launch-terminals.ts', () => {

  // E1（规格 §12.3）：wsl -l -q 的 UTF-16LE 输出 → 发行版名数组
  it('解析 wsl -l -q 的 UTF-16LE 输出', () => {
    expect(parseWslDistroOutput(Buffer.from('Ubuntu\nDebian\n', 'utf16le'))).toEqual(['Ubuntu', 'Debian']);
  });

  // E2（规格 §12.3）：空 Buffer / 只有换行 → []
  it('空输出（未安装发行版）解析为空数组', () => {
    expect(parseWslDistroOutput(Buffer.alloc(0))).toEqual([]);
    expect(parseWslDistroOutput(Buffer.from('\r\n\r\n', 'utf16le'))).toEqual([]);
  });

  // E3（计划 步骤 1）：真机探测——本机必有 cmd，且 path 是真实存在的文件
  it('本机探测结果里 cmd 可用且 path 存在', () => {
    const cmd = detectTerminals().find((t) => t.id === 'cmd');
    expect(cmd).toBeDefined();
    expect(existsSync(cmd!.path)).toBe(true);
  });
});

describe('E8 · wsl 三条件链（注入假 spawnSync；check E8 / 索引 K10）', () => {
  // 夹具：where.exe wsl.exe 命中一个真实存在的文件 → 三条件的第一条成立
  const wslExeFound: FakeResult = { status: 0, stdout: utf8Bytes(REAL_PATH + '\r\n') };

  it('① wsl.exe 存在但 wsl -l -q 退出码非 0 → 数组里没有 wsl', async () => {
    // 夹具 = 非 0 退出码 + **非空且合法**的 stdout（一个真发行版名）。本机 `wsl.exe -l -q`
    // 正是「退出码 1 + 一段非空 UTF-16LE 提示」（check A2 / 规格 §6.3）。若 stdout 留空，
    // 删掉实现的退出码判定后下游仍独立得出「不可用」（空 Buffer → [] → null），
    // 三条件里的「退出码 0」这条就没被钉住；只有非空输出下才会出现幽灵 wsl 项。
    const found = await detectWithInjectedSpawn(
      scriptWith({ whereWslExe: wslExeFound, wslList: { status: 1, stdout: utf16leBytes('Ubuntu\r\n') } }),
    );
    expect(wslQueryCalls()).toHaveLength(1); // 前提：确实跑了 wsl -l -q
    // 前提：查询打的是「定位到的那个 wsl.exe」——既表达「无 wsl」不是空断言，
    // 又不钉死定位手段（K10 (1) / F6：where.exe 命中与固定路径回退等价，见 impl:68-73）
    expect(wslQueryCalls()[0].cmd).toBe(REAL_PATH);
    expect(found.map((t) => t.id)).not.toContain('wsl');
  });

  it('② 退出码 0 但解析结果为空 → 数组里没有 wsl', async () => {
    const found = await detectWithInjectedSpawn(
      scriptWith({ whereWslExe: wslExeFound, wslList: { status: 0, stdout: utf16leBytes('\r\n\r\n') } }),
    );
    expect(wslQueryCalls()).toHaveLength(1);
    expect(found.map((t) => t.id)).not.toContain('wsl');
  });

  it('③ 退出码 0 且有发行版 → 有 wsl 且 path = 该 wsl.exe', async () => {
    const found = await detectWithInjectedSpawn(
      scriptWith({ whereWslExe: wslExeFound, wslList: { status: 0, stdout: utf16leBytes('Ubuntu\r\nDebian\r\n') } }),
    );
    const wsl = found.filter((t) => t.id === 'wsl');
    expect(wsl).toHaveLength(1); // 规格 §6.2：只列默认发行版一项，不枚举
    expect(wsl[0].path).toBe(REAL_PATH); // path = 定位到的那个 wsl.exe
    const call = wslQueryCalls()[0];
    expect(call.opts.windowsHide).toBe(true); // check F1
    expect(call.opts.timeout).toBe(3000); // check F1：单项 3s
    expect(call.opts.encoding).toBe('buffer'); // 规格 §6.1：wsl -l -q 输出是 UTF-16LE，必须按 buffer 取原始字节
  });
});

describe('E9 · where.exe 判定（注入假 spawnSync；check E9 / 索引 K10）', () => {
  it('① where.exe 退出码非 0 → pwsh 不可用', async () => {
    // 夹具 = 非 0 退出码 + **非空且合法**的 stdout（首行是真实存在的文件）。
    // 若 stdout 留空，删掉实现的退出码判定后空 stdout 也独立得出「不可用」（impl:53-59 → null），
    // 「退出码 0」这条就没被钉住。
    const found = await detectWithInjectedSpawn(
      scriptWith({ wherePwsh: { status: 1, stdout: utf8Bytes(REAL_PATH + '\r\n') } }),
    );
    expect(whereCalls('pwsh')).toHaveLength(1);
    expect(found.map((t) => t.id)).not.toContain('pwsh');
  });

  it('② 退出码 0 但首行指向不存在的文件 → pwsh 不可用（不回退第二行）', async () => {
    const found = await detectWithInjectedSpawn(
      scriptWith({ wherePwsh: { status: 0, stdout: utf8Bytes(MISSING_PATH + '\r\n' + REAL_PATH + '\r\n') } }),
    );
    expect(whereCalls('pwsh')).toHaveLength(1);
    expect(found.map((t) => t.id)).not.toContain('pwsh'); // 规格 §6.1「首行为存在的文件」：第二行存在也不用
  });

  it('③ 首行存在 → 用该路径', async () => {
    const found = await detectWithInjectedSpawn(
      scriptWith({ wherePwsh: { status: 0, stdout: utf8Bytes(REAL_PATH + '\r\n' + MISSING_PATH + '\r\n') } }),
    );
    const pwsh = found.filter((t) => t.id === 'pwsh');
    expect(pwsh).toHaveLength(1);
    expect(pwsh[0].path).toBe(REAL_PATH);
  });
});
