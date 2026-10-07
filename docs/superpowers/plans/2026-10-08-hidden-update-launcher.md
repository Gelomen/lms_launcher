# 更新启动器隐藏控制台 · 实现计划

> 面向 AI 代理的工作者：本计划假设你在本仓库中执行，且已读过设计规格。步骤用复选框（`- [ ]`）跟踪。每个任务先写失败测试、确认失败，再实现、确认通过、提交。

**目标**：应用自更新（解压 + 拉起新版）全程不再出现任何 cmd / Windows Terminal 窗口——不是「出现后立刻隐藏」。

**架构**：计划任务仍只引用安装目录里的一个短启动器（`/TR` 261 字符上限不变），但启动器从 `@echo off` 的 `.cmd` 换成 `.vbs`：`wscript.exe` 用 `sh.Run(cmd, 0, True)` 隐藏启动既有的 `lms-launcher-update.ps1`。生成逻辑放进新模块 `src-main/update-bootstrap.ts`（可测），`main.ts` 只做接线；`wscript.exe` 缺失时回退 `.cmd`（可见窗口，但更新照常完成）。

**技术栈**：Electron 主进程（TypeScript, CommonJS, `tsc -p tsconfig.main.json`）、vitest、Windows 计划任务 + WSH + PowerShell 5.1。

**设计规格**：[2026-10-08-hidden-update-launcher-design.md](../specs/2026-10-08-hidden-update-launcher-design.md)（F1–F16 事实、H1–H13 决策、§4 行为规格、§5 契约）

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `src-main/update-bootstrap.ts` | 新建 | 生成 `.vbs`/`.cmd` 启动器内容并落盘，返回 `/TR` 值与是否降级 |
| `src-main/update-bootstrap.test.ts` | 新建 | 规划断言 + 生成内容断言 + 用 `cscript`/`cmd` 实跑生成文件的集成守卫（含中文目录） |
| `src-main/main.ts` | 修改 | `run_update` 改用新模块；新增 `WSCRIPT_PATH` 常量与降级日志 |
| `src-main/i18n/dict.ts` | 修改 | `wroteBootstrap` 参数改名 `launcher`；新增 `wscriptFallback` |
| `scripts/verify-relaunch.ps1` | 修改 | 新增 `-Watch` 可见窗口采样；C3 重定义为「无新增可见控制台窗口」；conhost 差值降为 `[INFO]` |
| `scripts/lms-launcher-update.ps1` | **不改** | 参数契约与逻辑保持原样（规格 §2 非目标） |

约束（贯穿所有任务）：生成的启动器文本必须纯 ASCII/英文（`src-main/i18n/no-hardcoded.test.ts` 会扫 main.ts 的字面量）；`.vbs` 里不得出现三连引号；不得改 `lms-launcher-update.ps1`。

---

## 任务 1：`update-bootstrap.ts` —— 规划、`.vbs` 内容与落盘编码

**- [ ] 1. 写失败测试** 新建 `src-main/update-bootstrap.test.ts`：

```ts
// src-main/update-bootstrap.test.ts
// 更新启动器生成（2026-10-08 隐藏控制台）。引号与编码是本次全部风险所在：VBScript 少写一个引号
// = WSH 弹模态错误框 = 正是要消除的可见窗口，所以既有内容断言，也有用 cscript/cmd 实跑生成文件
// 的集成守卫（规格 F10/F11/F12/F13）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BOOTSTRAP_CMD_NAME, BOOTSTRAP_VBS_NAME,
  BootstrapInput, cmdContent, vbsContent, writeUpdateBootstrap,
} from './update-bootstrap';

const WIN = process.platform === 'win32';
const base = mkdtempSync(join(tmpdir(), 'lms-boot-'));
const input: BootstrapInput = {
  installDir: base,
  wscriptPath: 'C:\\Windows\\System32\\wscript.exe',
  ps1Path: join(base, 'lms-launcher-update.ps1'),
  zipPath: join(base, 'downloads', 'lms-launcher-update.zip'),
  updateLogPath: join(base, 'lms_launcher_update.log'),
};
const esc = (s: string): string => s.replace(/"/g, '\\"');

describe('writeUpdateBootstrap：wscript 存在 → .vbs 隐藏启动', () => {
  it('返回 vbs 计划，/TR 为「引号包裹的 wscript + 引号包裹的 vbs」且内部引号已转义', () => {
    const plan = writeUpdateBootstrap(input, true);
    expect(plan.kind).toBe('vbs');
    expect(plan.degraded).toBe(false);
    expect(plan.filePath).toBe(join(base, BOOTSTRAP_VBS_NAME));
    expect(plan.trValue).toBe(esc('"' + input.wscriptPath + '" "' + plan.filePath + '"'));
    // /TR 有 261 字符上限（规格 F2）：留足余量，路径变长也不会被 schtasks 拒绝
    expect(plan.trValue.length).toBeLessThan(261);
  });

  it('.vbs 用 Chr(34) 拼引号，不含 VBScript 三连引号陷阱，三个绝对参数都在内', () => {
    const c = vbsContent(input);
    expect(c).toContain('q = Chr(34)');
    expect(c).toContain('sh.Run(cmd, 0, True)');
    expect(c).not.toContain('"""');
    expect(c).toContain(input.ps1Path);
    expect(c).toContain(input.zipPath);
    expect(c).toContain(input.installDir);
  });

  it('生成的启动器不含汉字（i18n 零硬编码守护，规格 F16）', () => {
    expect(vbsContent(input)).not.toMatch(/\p{Script=Han}/u);
    expect(cmdContent(input)).not.toMatch(/\p{Script=Han}/u);
  });

  it('.vbs 落盘为 UTF-16LE + BOM（WSH 只按 BOM 识别 UTF-16，规格 F11）', () => {
    const plan = writeUpdateBootstrap(input, true);
    const buf = readFileSync(plan.filePath);
    expect(buf.subarray(0, 2).toString('hex')).toBe('fffe');
    expect(buf.subarray(2).toString('utf16le')).toContain('q = Chr(34)');
  });
});
```

**- [ ] 2. 运行确认失败**：`npx vitest run src-main/update-bootstrap.test.ts` → 模块不存在，报错。

**- [ ] 3. 实现** 新建 `src-main/update-bootstrap.ts`：

```ts
// src-main/update-bootstrap.ts
// 更新启动器（bootstrap）生成。计划任务 /TR 有 261 字符上限（main.ts:569 的 2026-09-05 复盘），
// ps1/zip/installDir 三个绝对参数必须经安装目录里的一个短启动器文件中转；本模块生成它并给出 /TR 值。
// 2026-10-08：默认生成 .vbs —— wscript + sh.Run(cmd, 0, True) 实测全程 0 个可见窗口；
// 原先的 .cmd 实测新增 2 个可见顶层窗口（默认控制台宿主是 Windows Terminal）。
// wscript.exe 缺失（Win11 已把 WSH 列为可选组件）→ 回退 .cmd：会出现可见窗口，但更新照常完成。
// 规格：docs/superpowers/specs/2026-10-08-hidden-update-launcher-design.md
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const BOOTSTRAP_VBS_NAME = 'lms_launcher_update.vbs';
export const BOOTSTRAP_CMD_NAME = 'lms_launcher_update.cmd';

export interface BootstrapInput {
  installDir: string;
  wscriptPath: string;
  ps1Path: string;
  zipPath: string;
  updateLogPath: string;
}

export interface BootstrapPlan {
  kind: 'vbs' | 'cmd';
  filePath: string;
  /** 放进 schtasks /TR "…" 里的内容；内部双引号已按 CommandLineToArgvW 规则转义（规格 H8）。 */
  trValue: string;
  /** true = 回退到可见窗口的 .cmd，调用方需记一条降级日志。 */
  degraded: boolean;
}

// VBScript 里表示一个双引号要写 4 个引号，少写一个就是「未结束的字符串常量」（800A0409），
// 而 WSH 的编译错误弹窗本身就是一个可见窗口（2026-10-08 实测）。引号一律由 Chr(34) 提供。
// 路径直接写进 VBScript 字符串字面量：Windows 路径不可能含双引号，含 & 空格中文均安全。
export function vbsContent(i: BootstrapInput): string {
  return [
    "' LMS Launcher update bootstrapper - generated by the app before every update, do not edit.",
    "' Starts the update script with a hidden console (window style 0 = SW_HIDE) and waits for it.",
    "' Quotes come from Chr(34) on purpose: a VBScript quote-literal mistake is a compile error,",
    "' and WSH would answer it with a modal error dialog - the visible window this file removes.",
    'Option Explicit',
    'Dim sh, fso, ts, cmd, rc, q, n, stamp',
    'Set sh = CreateObject("WScript.Shell")',
    'q = Chr(34)',
    'cmd = q & "powershell.exe" & q & " -NoProfile -ExecutionPolicy Bypass -File " & q & "' + i.ps1Path + '" & q',
    'cmd = cmd & " " & q & "' + i.zipPath + '" & q & " " & q & "' + i.installDir + '" & q',
    'On Error Resume Next',
    'rc = sh.Run(cmd, 0, True)',
    'If Err.Number <> 0 Then',
    "  ' No WSH error dialog: append to the update log instead; the app replays that log on next start.",
    "  ' Keep this line ASCII-only: WSH writes it in the system ANSI codepage, the log is UTF-8.",
    '  Set fso = CreateObject("Scripting.FileSystemObject")',
    '  Set ts = fso.OpenTextFile("' + i.updateLogPath + '", 8, True)',
    '  n = Now',
    '  stamp = Year(n) & "-" & Right("0" & Month(n), 2) & "-" & Right("0" & Day(n), 2)',
    '  stamp = stamp & " " & Right("0" & Hour(n), 2) & ":" & Right("0" & Minute(n), 2) & ":" & Right("0" & Second(n), 2)',
    '  ts.WriteLine stamp & " [ERROR] [vbs] Could not start the update script: " & Err.Description',
    '  ts.Close',
    '  WScript.Quit 1',
    'End If',
    'WScript.Quit rc',
    '',
  ].join('\r\n');
}

// 回退启动器：cmd.exe 按当前控制台代码页解码批处理正文，因此第二行先 chcp 65001，
// 之后出现的非 ASCII 安装路径才不会被解错（2026-10-08 实测：'ascii' 写法在中文目录下直接失败）。
export function cmdContent(i: BootstrapInput): string {
  return [
    '@echo off',
    'rem LMS Launcher update bootstrapper - fallback used only when wscript.exe is unavailable.',
    'rem A console window is visible with this path; the update itself still completes.',
    'chcp 65001 >nul',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + i.ps1Path + '" "' + i.zipPath + '" "' + i.installDir + '"',
    '',
  ].join('\r\n');
}

const quote = (s: string): string => '"' + s + '"';
const escapeForTr = (s: string): string => s.replace(/"/g, '\\"');

export function writeUpdateBootstrap(i: BootstrapInput, hasWscript: boolean): BootstrapPlan {
  if (hasWscript) {
    const filePath = join(i.installDir, BOOTSTRAP_VBS_NAME);
    // Node 的 'utf16le' 不写 BOM，而 WSH 只按 BOM 识别 UTF-16：缺 BOM 会按 ANSI 解，中文路径乱码。
    writeFileSync(filePath, '\uFEFF' + vbsContent(i), 'utf16le');
    return { kind: 'vbs', filePath, trValue: escapeForTr(quote(i.wscriptPath) + ' ' + quote(filePath)), degraded: false };
  }
  const filePath = join(i.installDir, BOOTSTRAP_CMD_NAME);
  writeFileSync(filePath, cmdContent(i), 'utf8'); // 无 BOM：cmd.exe 会把 BOM 当命令字符
  return { kind: 'cmd', filePath, trValue: escapeForTr(quote(filePath)), degraded: true };
}
```

**- [ ] 4. 运行确认通过**：`npx vitest run src-main/update-bootstrap.test.ts` → 4 passed。

**- [ ] 5. 提交**：`feat(main): 新增更新启动器生成模块（wscript 隐藏启动 .vbs）`

---

## 任务 2：`.cmd` 回退路径的规划断言

**- [ ] 1. 追加失败测试**（接在 `src-main/update-bootstrap.test.ts` 末尾）：

```ts
describe('writeUpdateBootstrap：wscript 缺失 → .cmd 回退（可见窗口，但更新完成）', () => {
  it('返回 cmd 计划并标记 degraded，/TR 只引用 .cmd', () => {
    const plan = writeUpdateBootstrap(input, false);
    expect(plan.kind).toBe('cmd');
    expect(plan.degraded).toBe(true);
    expect(plan.filePath).toBe(join(base, BOOTSTRAP_CMD_NAME));
    expect(plan.trValue).toBe(esc('"' + plan.filePath + '"'));
  });

  it('.cmd 落盘无 BOM，且 chcp 65001 出现在任何路径之前（规格 F12/F13/H7）', () => {
    const plan = writeUpdateBootstrap(input, false);
    const c = readFileSync(plan.filePath, 'utf8');
    expect(c.startsWith('\uFEFF')).toBe(false);
    expect(c).toContain('chcp 65001');
    expect(c.indexOf('chcp 65001')).toBeLessThan(c.indexOf(input.ps1Path));
  });
});
```

**- [ ] 2. 运行确认失败**（`chcp` 断言失败）。
**- [ ] 3. 实现**：任务 1 的 `cmdContent`/`writeUpdateBootstrap` 已覆盖；若 1 中未写全，补齐。
**- [ ] 4. 运行确认通过**：6 passed。
**- [ ] 5. 提交**：`test(main): 覆盖更新启动器 .cmd 回退的编码与 /TR 形态`

---

## 任务 3：用 `cscript` / `cmd` 实跑生成文件（含中文安装目录）

这是把「语法正确 + 参数原样送达」钉住的守卫：`cscript` 会把 VBScript 语法错误打到 stderr 并非零退出（不弹模态框），所以 `execFileSync` 会 throw。

**- [ ] 1. 追加失败测试**：

```ts
// 中文子目录：安装目录含非 ASCII 字符是本次一并修掉的既存缺陷（规格 F12），也是编码断言的真实场景
function makeFakeScript(dir: string): { ps1: string; marker: string } {
  const ps1 = join(dir, 'fake-update.ps1');
  writeFileSync(ps1,
    "param([string]$ZipPath, [string]$InstallDir)\r\n" +
    "Set-Content -LiteralPath (Join-Path $InstallDir 'marker.txt') -Value ($ZipPath + '|' + $InstallDir) -Encoding UTF8\r\n",
    'utf8');
  return { ps1, marker: join(dir, 'marker.txt') };
}

describe('生成的启动器在 Windows 上实跑（cscript / cmd.exe）', () => {
  it('.vbs 经 cscript 无语法错误，并把 zip/installDir 原样传给脚本（中文目录）', () => {
    if (!WIN) return;
    const dir = join(base, '中文目录');
    mkdirSync(dir, { recursive: true });
    const { ps1, marker } = makeFakeScript(dir);
    const plan = writeUpdateBootstrap(
      { ...input, installDir: dir, ps1Path: ps1, zipPath: join(dir, 'pkg.zip'), updateLogPath: join(dir, 'lms_launcher_update.log') },
      true,
    );
    execFileSync('cscript.exe', ['//nologo', plan.filePath], { encoding: 'utf8' });
    expect(existsSync(marker)).toBe(true);
    expect(readFileSync(marker, 'utf8')).toContain(join(dir, 'pkg.zip') + '|' + dir);
  });

  it('.cmd 回退经 cmd.exe 同样把参数原样送达（chcp 65001 生效）', () => {
    if (!WIN) return;
    const dir = join(base, '中文目录-cmd');
    mkdirSync(dir, { recursive: true });
    const { ps1, marker } = makeFakeScript(dir);
    const plan = writeUpdateBootstrap(
      { ...input, installDir: dir, ps1Path: ps1, zipPath: join(dir, 'pkg.zip'), updateLogPath: join(dir, 'lms_launcher_update.log') },
      false,
    );
    execFileSync('cmd.exe', ['/c', plan.filePath], { encoding: 'utf8' });
    expect(existsSync(marker)).toBe(true);
    expect(readFileSync(marker, 'utf8')).toContain(join(dir, 'pkg.zip') + '|' + dir);
  });
});
```

**- [ ] 2. 运行确认失败**（若任务 1/2 的实现不完整则在此暴露；否则直接通过——此时删除多余的实现再重跑，确认测试确实约束了行为）。
**- [ ] 3. 实现/修正**：按失败信息修（例如 `cmd.exe /c` 对含空格路径的引号处理、`chcp` 位置）。
**- [ ] 4. 运行确认通过**：8 passed。
**- [ ] 5. 提交**：`test(main): 用 cscript 与 cmd.exe 实跑更新启动器生成物`

---

## 任务 4：i18n 词条

**- [ ] 1. 修改** `src-main/i18n/dict.ts`（zh 在 `log.launcher.upd.wroteBootstrap` 处，en 同步）：

```ts
// zh
'log.launcher.upd.wroteBootstrap': '已写入更新启动器 · launcher={launcher} · ps1={ps1} · zip={zip}',
'log.launcher.upd.wscriptFallback': 'LMS 启动器 · 更新 · 未找到 wscript.exe，已回退可见窗口启动器 · cmd={path}',
// en
'log.launcher.upd.wroteBootstrap': 'Update bootstrapper written · launcher={launcher} · ps1={ps1} · zip={zip}',
'log.launcher.upd.wscriptFallback': 'LMS Launcher · Update · wscript.exe not found, fell back to the visible-window bootstrapper · cmd={path}',
```

**- [ ] 2. 运行确认通过**：`npx vitest run src-main/i18n` → `dict.test.ts` 的 zh/en key 齐平、非空、`{name}` 占位符断言均通过；`no-hardcoded.test.ts` 通过（词典本身允许汉字）。
**- [ ] 3. 提交**：`feat(i18n): 更新启动器日志词条改为 launcher 参数并新增回退说明`

---

## 任务 5：`main.ts` 接线

**- [ ] 1. 新增常量**（`src-main/main.ts`，紧跟 `START_TASK_NAME` 之后）：

```ts
// 更新启动器宿主（2026-10-08）：存在 → .vbs 隐藏启动；缺失 → .cmd 回退（可见窗口）。
// WSH 在 Win11 是可选组件，不能假定必然存在。
const WSCRIPT_PATH = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');
```

并在文件顶部 import：`import { writeUpdateBootstrap } from './update-bootstrap';`

**- [ ] 2. 替换 `run_update` 中的启动器生成**（删除 `const bootstrapCmd = join(installDir, 'lms_launcher_update.cmd');` 与那行 `writeFileSync(bootstrapCmd, …, 'ascii')`）：

```ts
  // 启动器：/TR 只引用它（261 上限，见上方复盘注释）。2026-10-08 起默认是 .vbs ——
  // 任务直接跑 .cmd 会弹控制台窗口（本机实测新增 2 个可见顶层窗口，默认控制台宿主为 Windows
  // Terminal）；wscript + sh.Run(..., 0, True) 实测全程 0 可见窗口。wscript.exe 缺失时回退
  // .cmd：会出现可见窗口，但更新照常完成。规格 docs/superpowers/specs/2026-10-08-hidden-update-launcher-design.md
  const bootstrap = writeUpdateBootstrap(
    { installDir, wscriptPath: WSCRIPT_PATH, ps1Path: ps1, zipPath, updateLogPath },
    existsSync(WSCRIPT_PATH),
  );
  try {
    if (bootstrap.degraded) {
      appendFileSync(updateLogPath, stamp + ' [INFO] [node] ' + t('log.launcher.upd.wscriptFallback', { path: bootstrap.filePath }) + '\r\n', 'utf8');
    }
    // Node 侧先写一行，之后无论脚本是否被拉起都能从日志判断任务是否创建
    appendFileSync(updateLogPath, stamp + ' [INFO] [node] ' + t('log.launcher.upd.wroteBootstrap', { launcher: bootstrap.filePath, ps1, zip: zipPath }) + '\r\n', 'utf8');
  } catch { /* 日志失败不阻断更新 */ }
```

**- [ ] 3. 替换两处 `/TR` 与日志取值**：

```ts
    execSync('schtasks /Create /F /SC ONCE /ST ' + futureTime + ' /TN "' + UPDATE_TASK_NAME + '" /TR "' + bootstrap.trValue + '"', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    // …
    appendFileSync(updateLogPath, stamp + ' [INFO] [node] ' + t('log.launcher.upd.taskCreated', { name: UPDATE_TASK_NAME, st: futureTime, tr: bootstrap.trValue }) + '\r\n', 'utf8');
```

**- [ ] 4. 类型与既有测试**：`npx tsc -p tsconfig.main.json --noEmit` 无错；`npx vitest run` 全绿（`src/App.test.ts` 只断言 IPC 返回结构，不涉及启动器内容，应无需改动；若有用例断言了 `.cmd` 文案，按新契约更新）。
**- [ ] 5. 提交**：`fix(main): 自更新改用 wscript 隐藏启动，消除更新时的 cmd 弹窗`

---

## 任务 6：`verify-relaunch.ps1` —— `-Watch` 可见窗口采样器

**- [ ] 1. 参数块**（替换现有 `param`）：

```powershell
param(
  [string]$InstallDir = 'D:\AI\LMS-Launcher',
  [switch]$Snapshot,
  [switch]$Watch,
  [int]$Seconds = 240,
  [int]$IntervalMs = 150
)
```

**- [ ] 2. 新增采样器**（接在 `Get-ConhostIds` 之后）：

```powershell
# 可见控制台窗口检测（2026-10-08，C3 重定义的配套）。
# 本机默认控制台宿主是 Windows Terminal：窗口类名 CASCADIA_HOSTING_WINDOW_CLASS，不是
# ConsoleWindowClass；conhost 的 MainWindowHandle 恒为 0，不能当可见性信号。
# 判定 = EnumWindows + 类名白名单 + IsWindowVisible + 排除有属主的窗口（GetWindow GW_OWNER）。
$script:ProbeReady = $false
function Get-VisibleConsoleWindows {
  if (-not $script:ProbeReady) {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class LmsConsoleWindowProbe {
  public class WinInfo { public long Hwnd; public string Class; public string Title; public long Pid; }
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int max);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int max);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  public static List<WinInfo> VisibleWindows() {
    var outp = new List<WinInfo>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      if (GetWindow(h, 4) != IntPtr.Zero) return true; // GW_OWNER
      var sb = new StringBuilder(256);
      GetClassName(h, sb, 256);
      string cls = sb.ToString();
      if (cls != "ConsoleWindowClass" && cls != "CASCADIA_HOSTING_WINDOW_CLASS") return true;
      int len = GetWindowTextLength(h);
      string title = "";
      if (len > 0) { var tb = new StringBuilder(len + 2); GetWindowText(h, tb, tb.Capacity); title = tb.ToString(); }
      uint pid; GetWindowThreadProcessId(h, out pid);
      WinInfo w = new WinInfo();
      w.Hwnd = h.ToInt64(); w.Class = cls; w.Pid = pid;
      w.Title = title.Replace('\r', ' ').Replace('\n', ' ');
      outp.Add(w);
      return true;
    }, IntPtr.Zero);
    return outp;
  }
}
'@
    $script:ProbeReady = $true
  }
  return [LmsConsoleWindowProbe]::VisibleWindows()
}
```

**- [ ] 3. 新增 `-Watch` 模式**（接在 `-Snapshot` 模式块之后）：

```powershell
$WatchPath = Join-Path $InstallDir 'console-watch.txt'

# ---------- -Watch 模式：更新前启动，记录更新期间新增的可见控制台窗口 ----------
# 窗口是瞬态的（cmd 启动→退出只有几秒），更新结束后再枚举必然抓不到，所以必须在更新前开始采样。
# 基线 = 采样器启动时已存在的窗口句柄：用户自己的终端窗口因此不会被记为命中。
# 已知局限：窗口销毁后句柄可能被复用；采样间隔内复用概率极低，视为可接受。
if ($Watch) {
  if (-not (Test-Path $InstallDir)) {
    Write-Host ('[FAIL] Install directory not found: ' + $InstallDir)
    exit 1
  }
  $seen = @{}
  foreach ($w in Get-VisibleConsoleWindows) { $seen[[int64]$w.Hwnd] = $true }
  $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  Set-Content -LiteralPath $WatchPath -Value ('watch start ' + $ts + ' seconds=' + $Seconds + ' intervalMs=' + $IntervalMs + ' baseline=' + $seen.Count) -Encoding UTF8
  $end = (Get-Date).AddSeconds($Seconds)
  $samples = 0; $hits = 0
  while ((Get-Date) -lt $end) {
    $samples++
    foreach ($w in Get-VisibleConsoleWindows) {
      if (-not $seen.ContainsKey([int64]$w.Hwnd)) {
        $seen[[int64]$w.Hwnd] = $true
        $hits++
        Add-Content -LiteralPath $WatchPath -Value ('HIT ' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + ' hwnd=' + $w.Hwnd + ' class=' + $w.Class + ' pid=' + $w.Pid + ' title=' + $w.Title) -Encoding UTF8
      }
    }
    Start-Sleep -Milliseconds $IntervalMs
  }
  Add-Content -LiteralPath $WatchPath -Value ('watch end ' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + ' samples=' + $samples + ' hits=' + $hits) -Encoding UTF8
  Write-Host ('[OK] console window watch finished: ' + $WatchPath + ' (samples ' + $samples + ', hits ' + $hits + ')')
  exit 0
}
```

**- [ ] 4. 语法与冒烟**：
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-relaunch.ps1 -Watch -Seconds 3 -InstallDir .` → 输出 `[OK] … (samples ≥10, hits 0)`，`console-watch.txt` 含 `watch start`/`watch end`。
再手动开一个 cmd 窗口重跑 → `hits ≥1` 且 HIT 行含 `CASCADIA_HOSTING_WINDOW_CLASS`（证明采样器能抓到窗口）。
**- [ ] 5. 清理**：删除冒烟产生的 `console-watch.txt`（在仓库根目录时）。
**- [ ] 6. 提交**：`feat(scripts): verify-relaunch 新增可见控制台窗口采样模式`

---

## 任务 7：`verify-relaunch.ps1` —— C3 重定义 + conhost 降为 `[INFO]`

**- [ ] 1. 替换 C3 整块**（现 88–116 行）：

```powershell
# C3 更新期间无新增可见控制台窗口（2026-10-08 重定义）。
# 旧口径「无新增 conhost 进程」是错的：隐藏启动（wscript + sh.Run style 0）之后仍会存在不可见的
# cmd/conhost/OpenConsole 进程（.temp/hide-console/probe3.ps1 实测），而用户要的是「看不到窗口」。
# 窗口是瞬态的 → 由更新前启动的 -Watch 采样器记录，这里只读它的结果。
if (-not (Test-Path $WatchPath)) {
  Write-Host ('[INFO] C3 no visible console window: no watch log (' + $WatchPath + '); run -Watch before the update, skipping (not a failure)')
  $skip++
} else {
  $wl = @(Get-Content -LiteralPath $WatchPath -Encoding UTF8)
  $started = @($wl | Where-Object { $_ -match '^watch start ' }).Count -gt 0
  $ended = @($wl | Where-Object { $_ -match '^watch end ' }).Count -gt 0
  $hitLines = @($wl | Where-Object { $_ -match '^HIT ' })
  if (-not $started) {
    Write-Host ('[INFO] C3 no visible console window: watch log has no "watch start" header (' + $WatchPath + '); skipping (not a failure)')
    $skip++
  } elseif ($hitLines.Count -gt 0) {
    Write-Host ('[FAIL] C3 no visible console window: the watch recorded ' + $hitLines.Count + ' newly visible console window(s) during the update:')
    foreach ($h in $hitLines) { Write-Host ('    ' + $h.Trim()) }
    $fail++
  } elseif (-not $ended) {
    Write-Host ('[INFO] C3 no visible console window: watch did not reach its end marker (stopped early?); skipping (not a failure)')
    $skip++
  } else {
    Write-Host ('[PASS] C3 no visible console window: the watch log has no HIT lines (' + $wl.Count + ' lines, no newly visible console window)')
    $pass++
  }
}

# C3b（仅信息，不计入 PASS/FAIL）conhost 进程差值：保留旧实现作为诊断线索。
# 隐藏启动仍会创建不可见的 conhost/cmd，因此它只能说明「有没有多进程」，不能说明「有没有窗口」。
if (-not (Test-Path $SnapPath)) {
  Write-Host ('[INFO] C3b conhost process delta (informational): no baseline snapshot (' + $SnapPath + ')')
} else {
  $snapLines = @(Get-Content -LiteralPath $SnapPath -Encoding UTF8 | Where-Object { $_ -match '^\s*\d+\s+\d+\s*$' })
  $snapIds = @($snapLines | ForEach-Object { [int]($_ -split '\s+')[0] })
  $current = @(Get-ConhostIds)
  $newOnes = @($current | Where-Object { $snapIds -notcontains $_ })
  Write-Host ('[INFO] C3b conhost process delta (informational, not a failure): ' + $newOnes.Count + ' new conhost process(es) outside the baseline of ' + $snapIds.Count + '; hidden launch still creates invisible conhost/cmd')
}
```

**- [ ] 2. 更新头部注释**（第 2–14 行）：用法加 `-Watch` 两行；C3 描述改为「更新期间无新增可见控制台窗口（需更新前跑 -Watch）」，并加一行说明 conhost 差值已降为信息项。

**- [ ] 3. 冒烟**：
- 无 `console-watch.txt` 时跑默认模式 → C3 输出 `[INFO] … skipping`，`SUMMARY: passed 4/5 (FAIL 0, skipped 1)`，exit 0。
- 用任务 6 生成的含 HIT 的文件 → C3 FAIL，exit 1。
- 含 `watch start` + `watch end` 无 HIT → C3 PASS。
**- [ ] 4. 提交**：`fix(scripts): verify-relaunch 的 C3 改为判定可见控制台窗口而非 conhost 进程`

---

## 任务 8：隔离端到端复测（不改产品代码，产物留在 `.temp/`）

**- [ ] 1.** 编译主进程：`npm run build`。
**- [ ] 2.** 用编译后的模块在 `.temp/hide-console/prod/` 生成**生产形态**启动器（`require('./dist-main/update-bootstrap.js')`，installDir 用 `.temp/hide-console/prod/中文目录`，ps1 用只写 marker 的假脚本）。
**- [ ] 3.** 注册真实计划任务：`schtasks /Create /F /SC ONCE /ST 23:59 /TN LMSProbeProd /TR "<trValue>"` → `/Run`。
**- [ ] 4.** 同时用任务 6 的采样器（`-Watch`，改 `$WatchPath` 到 `.temp`）覆盖整个窗口期 → 期望 **hits=0** 且 marker 写入。
**- [ ] 5.** 对照组：用旧 `.cmd` 形态再跑一次 → 期望 hits≥2（复现 F4，证明采样器不是漏检）。
**- [ ] 6.** `schtasks /Delete /F /TN LMSProbeProd`，把结论（含 hits 数字）追加到规格 §1 的 F5/F4 行备注里。

## 任务 9：全量验证与自检

**- [ ] 1.** `npm test` 全绿（含 `no-hardcoded.test.ts`、`dict.test.ts`、`App.test.ts`）。
**- [ ] 2.** `npx tsc -p tsconfig.main.json --noEmit` 无错。
**- [ ] 3.** 自检清单：规格 §4 每个场景都有对应测试或冒烟；`lms-launcher-update.ps1` 未被改动（`git diff --stat` 确认）；无新增依赖；`.temp/` 外的临时文件已清理。
**- [ ] 4.** 把「真机验收」步骤（规格 §7）交给用户执行——本计划不跑真实更新。
