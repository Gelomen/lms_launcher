# 快捷启动「可执行程序」提权启动 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让快捷启动的「可执行程序」条目在 exe 需要管理员权限时**由系统提权启动**（该弹 UAC 就弹），并能照常跟踪退出码与停止；用户在 UAC 点「否」时日志给出可辨认的取消文案。

**架构：** 新增一个主进程模块 `src-main/shell-execute.ts`，用 koffi FFI 调 Win32 `ShellExecuteExW`（`SEE_MASK_NOCLOSEPROCESS | SEE_MASK_FLAG_NO_UI`）启动 exe，并用返回的进程句柄做存活判定（`WaitForSingleObject`）、退出码（`GetExitCodeProcess`）与终止（`taskkill /T /F` 失败则 `TerminateProcess`）。`main.ts` 的 `spawnExeProcess` 适配器从 `ProcessState` 换到它；`QlDeps.spawnExe(exe)` 接缝（`quick-launch.ts:171`）与 `quick-launch.ts` 的可执行代码一行不改。Win32 调用收在一个可替换的 `winShell` 对象后面，单测用假实现驱动。

**技术栈：** Electron 28 + Vue 3 + TypeScript + vitest（node 环境）；新增运行时依赖 `koffi@^3.3.3`（FFI，原生件由可选平台包 `@koromix/koffi-win32-x64` 提供，无需编译器）。

**规格：** `docs/superpowers/specs/2026-10-13-quick-launch-elevated-exe-design.md`（所有取值以规格为准，执行者两份都要读）

## 全局约束

- **改动范围只有这些文件**：`package.json`、`package-lock.json`、`electron-builder.yml`、新建 `src-main/shell-execute.ts` 与 `src-main/shell-execute.test.ts`、`src-main/main.ts`（`:1039-1074` 一段）、`src-main/i18n/dict.ts`（两条新键）、`src-main/ipc-ql.test.ts`（两处既有用例）、`src-main/quick-launch.ts`（**只有 :5-6 的注释**，可执行代码零改动）。规格 §5 非目标之外的一律不改。
- **不改 `src-main/process.ts`**，不改 `main.ts:64` 的 `ps` 单例，不改 `quick-launch.ts` 的任何可执行语句，不改 `src/App.vue`、`src/modules/*`、`src-main/quick-launch-terminals.ts`（规格 §5）。
- **`QlDeps.spawnExe(exe)` 返回形状逐字不变**：`{ onExit(cb); stopGraceful(s); isRunning() }`（`quick-launch.ts:171`）。`main.ts:1084` 的接线与 `qlStartContextOrThrow` 守卫不动（规格 §6.6）。
- **Win32 取值逐字按规格 §6.3**：`fMask = 0x40 | 0x04`、`lpVerb = null`（**不是 `"runas"`**）、`nShow = 1`、`lpParameters = null`、`lpDirectory = null`、`cbSize = koffi.sizeof(SHELLEXECUTEINFOW)`（x64 = 112）。
- **错误前缀只用 `PROC:`**（索引 G7）。新键只有 `err.proc.uacCancelled`（zh/en 同时加，占位符只有 `{exe}`），其余失败复用既有 `err.proc.spawnFail` 并把 Win32 错误码放进 `{err}`（规格 §6.5）。调用点必须是字面量 `t('…')`，否则 `key-coverage.test.ts` 认不到。
- **包管理器用 npm**（实测：`node_modules/.package-lock.json` 存在、`node_modules/@lydell` 是真实目录而非 pnpm 符号链接、`package-lock.json` 最近提交 `90c9320` 2026-10-11，`pnpm-lock.yaml` 停在 `fa8f87e` 2026-09-14）。**只改 `package.json` + `package-lock.json`，不动 `pnpm-lock.yaml`**（它已落后，刷新它属于另一件事）。
- **不加 `allowScripts` 条目**：koffi 的 `install` 脚本不执行也可用（规格 E12），任务 1 步骤 2 用真实加载取证。
- 单测命令 `npx vitest run <路径>`，全量 `npm test`；主进程类型检查 `npx tsc -p tsconfig.main.json --noEmit`；渲染端语法门 `npx vite build`（本次没改渲染端，任务 3 收尾跑一次即可）。
- 基线（主代理 2026-10-13 19:25 实测，规格 E18）：`Test Files 47 passed (47)` / `Tests 826 passed (826)`，exit 0。**实现者不重跑全量**，只在各任务末尾跑一次，计数必须 = 基线 + 该任务新增数，且不得有任何减少。
- 提交信息用 Conventional Commits + 中文（与仓库历史一致）。
- 本期不做的事见规格 §5，**不得顺手扩范围**。

## 审查重点（Review Focus）

规格隐含、单测容易漏掉、且最可能伤到使用者的六条；每条都钉在对应任务的测试或真机清单里：

1. **用户在 UAC 点「否」**（`GetLastError()=1223`）→ 期望日志出现 `PROC: <exe> 已取消管理员权限请求`、按钮回落绿 `[启动]`、**不残留「运行中」假状态**，而不是再报一次 `EACCES` 或让按钮卡在红「...」。钉住：任务 2 步骤 1 的第 3 条断言 + 任务 3 改写的「exe 启动失败」用例 + 真机清单第 3 步。
2. **提权进程 `taskkill /T /F` 打不到**（规格 E9 实测失败）→ 期望 `TerminateProcess(句柄)` 兜底真的停掉，且 `[停止]` 不挂死。钉住：任务 2 步骤 1 的第 5 条断言 + 真机清单第 2 步。
3. **不需要管理员的 exe 回退**（notepad 这类）→ 期望照常启动/停止/报退出码，且**不因为走 Shell 路径而多弹一次 UAC**（`lpVerb=null` 是关键）。钉住：任务 2 步骤 1 的第 6 条断言 + 任务 3 的并发用例（真起两个 notepad）+ 真机清单第 4 步。
4. **打包后 `koffi.node` 加载不了**（`.node` 不能从 asar 内 dlopen）→ 期望 `asarUnpack` 两条到位、真机第 5 步能在 `app.asar.unpacked` 里看到该文件。钉住：任务 1 步骤 1/2/3 + 真机清单第 5 步。
5. **定时器泄漏 / `onExit` 多次触发** → 期望退出只上报一次、`clearInterval` + `close()` 都执行（否则事件循环长醒、状态机被二次 `ql-exit` 打乱）。钉住：任务 2 步骤 1 的第 2 与第 7 条断言。
6. **i18n 三门**：新键必须 zh/en 同时存在、调用点字面量与占位符逐字一致、源码零中文字面量。钉住：任务 3 步骤 5 的 `dict.test.ts` / `key-coverage.test.ts` / `no-hardcoded.test.ts` 定向运行。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `package.json`（修改） | `dependencies` 加 `"koffi": "^3.3.3"` |
| `package-lock.json`（`npm install` 写） | 锁 `koffi` 与 `@koromix/koffi-win32-x64` |
| `electron-builder.yml:16-17`（修改） | `asarUnpack` 增加 koffi 两条 + 注释同步 |
| `src-main/shell-execute.ts`（新建） | `WinShellApi` 接缝 + `winShell` 真实现 + `launchShellExe` + `ShellExecProcess` 生命周期 |
| `src-main/shell-execute.test.ts`（新建） | 假 `WinShellApi` 的 7 条行为断言 + 1 条真接缝冒烟门 |
| `src-main/main.ts:1039-1074`（修改） | `spawnExeProcess` 改用 `launchShellExe(winShell, exe)`；失败先 `emitLog` 再 rethrow；注释同步新口径 |
| `src-main/i18n/dict.ts:299` 后 / `:641` 后（修改） | 新增 `err.proc.uacCancelled`（zh / en） |
| `src-main/ipc-ql.test.ts:423-468` 与「exe 启动失败」用例（修改） | 观察点从 `ProcessState.prototype.launch` 换到 `winShell.shellExecute`；失败路径断言改到新路径 |
| `src-main/quick-launch.ts:5-6`（**仅注释**） | 文件头「生产侧接 ProcessState 适配器」改为新口径（规格 §8-K6） |
| 不改 | `src-main/process.ts`、`src-main/quick-launch.ts` 的可执行代码、`src/App.vue`、`src/modules/*`、`src-main/quick-launch-terminals.ts`、`pnpm-lock.yaml`、旧规格文档 |

---

### 任务 1：引入 koffi 依赖 + 打包解包声明

**文件：**
- 修改：`package.json`（`dependencies`）、`package-lock.json`（由 npm 写）、`electron-builder.yml:13-17`

- [ ] **步骤 0：起点取证（已由主代理完成，写进 check 索引）**

生效包管理器 = npm 11.19.0（`node_modules/.package-lock.json` 存在、`node_modules/@lydell` 为真实目录、两份 lockfile 的最近提交 `90c9320`/`fa8f87e`）；`electron-builder.yml:16-17` 现只有 `**/node_modules/@lydell/**`；`build.bat:83`/`:90` 用 `--win dir` 只产出 `dist-release\win-unpacked\`；`koffi@3.3.3` 在 npm 下 `added 2 packages in 7s`、`install` 脚本被 `allowScripts` 拦下仍可用（规格 E12/E14）。

- [ ] **步骤 1：安装**

运行：`npm install koffi@^3.3.3 --save`
预期：exit 0，输出含 `added 2 packages`（或 `1 added, 1 changed`）；`package.json` 的 `dependencies` 出现 `"koffi": "^3.3.3"`；`package-lock.json` 出现 `koffi` 与 `@koromix/koffi-win32-x64`。
再运行：`Test-Path node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node`
预期：`True`。**若为 `False`：停下报告，不要改 `allowScripts`、不要 `npm rebuild koffi` 试运气**（规格 R5）。

- [ ] **步骤 2：加载冒烟（证明 `install` 脚本被拦下不影响可用）**

运行：`node --input-type=module -e "import koffi from 'koffi'; const k=koffi.load('shell32.dll'); console.log(typeof koffi.load, typeof k.func, koffi.sizeof(koffi.struct('T',{a:'uint32',b:'void *'})))"`
预期：`function function 16`（x64 对齐：`uint32` 4 字节 + 4 字节填充 + 8 字节指针 = 16；**实测 2026-10-13 21:12**，索引 K16 —— 原写 `= 8` 是漏算填充）。任何 `Cannot find module 'koffi'` 或 `dlopen` 类错误 = 本任务不通过。

- [ ] **步骤 3：`asarUnpack` 两条**

把 `electron-builder.yml:13-17` 的注释与列表替换为（保留原有对 node-pty 的说明，追加 koffi 的说明）：

```yaml
# 规格 §7.2（硬门）：.node 无法从 asar 内 dlopen，conpty.dll / OpenConsole.exe 也无法从 asar 内执行，
# 必须解到 app.asar.unpacked 才能被 node-pty 按包内相对路径加载。
# 显式声明，不依赖 electron-builder 对原生模块的自动探测（它只按「检测到 .node」解出平台包本身）。
# 2026-10-13-quick-launch-elevated-exe §6.8：koffi 同理 —— 入口包在 node_modules/koffi，
# 真正的 koffi.node 在可选平台包 @koromix/koffi-win32-x64/win32_x64/ 下，两个都要解出。
asarUnpack:
  - "**/node_modules/@lydell/**"
  - "**/node_modules/koffi/**"
  - "**/node_modules/@koromix/**"
```

只改这一处；`files` / `extraFiles` / `win` / `portable` 段一行不动。

- [ ] **步骤 4：类型与语法门**

运行：`npx tsc -p tsconfig.main.json --noEmit`
预期：无输出、exit 0（此时还没有代码 import koffi，这条只证明没弄坏既有编译）。

- [ ] **步骤 5：全量回归**

运行：`npm test`
预期：全绿，`Test Files 47 passed (47)` / `Tests 826 passed (826)`（本任务不加用例，计数必须与基线逐字相同）。

- [ ] **步骤 6：Commit（由主代理在验收通过后执行）**

```bash
git add package.json package-lock.json electron-builder.yml
git commit -m "build: 引入 koffi FFI 依赖并声明 asarUnpack（快捷启动提权，规格 §6.8）"
```

**`pnpm-lock.yaml` 不 `git add`**（全局约束）。

---

### 任务 2：`src-main/shell-execute.ts` —— Win32 接缝与进程生命周期

**文件：**
- 新建：`src-main/shell-execute.ts`
- 测试：`src-main/shell-execute.test.ts`（新建）
- 修改：`src-main/i18n/dict.ts`（zh `:299` 后、en `:641` 后各一条键）—— **必须与本任务同一提交**：实现里的字面量 `t('err.proc.uacCancelled', { exe })` 会让 `key-coverage.test.ts:117-129` 在缺键时报红（索引 K15）

- [ ] **步骤 1：编写失败的测试**

按规格 §7.1 的 8 条写。骨架（假 `WinShellApi` 用 `vi.fn()`，句柄用普通对象 `{ id: 'h1' }` 代替真 `HANDLE`）：

```ts
// src-main/shell-execute.test.ts
// 2026-10-13-quick-launch-elevated-exe §7.1：生命周期用假 Win32 接缝驱动（不真起进程）。
// 真 Win32 只在最后一条冒烟门里出现，且只调一个必然失败的路径，无副作用。
import { describe, expect, it, vi } from 'vitest';
import { t } from './i18n';
import { launchShellExe, winShell, type WinShellApi } from './shell-execute';

function fakeApi(over: Partial<WinShellApi> = {}): WinShellApi & { calls: string[] } {
  const calls: string[] = [];
  const h = { id: 'h1' };
  const api = {
    shellExecute: vi.fn(() => { calls.push('shellExecute'); return { ok: true, handle: h, win32Error: 0 }; }),
    pidOf: vi.fn(() => 4242),
    isAlive: vi.fn(() => true),
    exitCodeOf: vi.fn(() => 0),
    terminate: vi.fn(() => { calls.push('terminate'); return true; }),
    close: vi.fn(() => { calls.push('close'); }),
    killTree: vi.fn(() => { calls.push('killTree'); return true; }),
    ...over,
  } as WinShellApi & { calls: string[] };
  return Object.assign(api, { calls });
}
```

八条断言（逐条对应规格 §7.1 的 1–8）：

1. `launchShellExe(api, 'E:\QiYou\QiYou.exe')` → `pid === 4242`、`isRunning() === true`、`pidOf` 收到 `shellExecute` 返回的句柄
2. `isAlive` 第二次起返回 `false`、`exitCodeOf` 返回 `7` → `onExit` 回调收到 `7`，**只一次**；`close` 被调用；再等 300ms 不会有第二次回调（定时器已清）
3. `shellExecute` 返回 `{ ok: false, handle: null, win32Error: 1223 }` → `expect(() => launchShellExe(api, EXE)).toThrow(/^PROC: /)`，且消息含 `t('err.proc.uacCancelled', { exe: EXE })`；`pidOf` / `isAlive` 均未被调用
4. `win32Error: 2` → 消息含 `t('err.proc.spawnFail', { exe: EXE, err: 'win32=2' })`
5. `killTree` 返回 `false`（提权进程，规格 E9）→ `stopGraceful(0)` 后 `terminate` 被调用且第二参数为 `1`
6. `killTree` 返回 `true` 且 `isAlive` 随即 `false` → `terminate` **未**被调用
7. `stopGraceful` 连调两次 → 第二次立即返回（`killTree` 只被调用一次）
8. 真接缝：`winShell.shellExecute('Z:\\no-such-dir\\no-such.exe', 1)` → `ok === false`（不断具体错误码）

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src-main/shell-execute.test.ts`
预期：FAIL — `Failed to load... shell-execute`（模块不存在）。把输出贴进 check 表 J 段。

- [ ] **步骤 2b：加词典键（先改行号大的 en，再改 zh，避免行号漂移）**

`dict.ts` zh 侧 `err.proc.spawnFail`（`:299`）之后插入一行，en 侧 `:641` 之后插入一行，逐字：

```ts
'err.proc.uacCancelled': '{exe} 已取消管理员权限请求',          // zh
'err.proc.uacCancelled': '{exe}: elevation request cancelled',  // en
```

不登记 `src-main/i18n/err-keys.ts` 的 `IPC_ERROR_KEYS`（规格 §6.5）。**这两条键不能拖到任务 3**：任务 2 的实现一落地，`key-coverage.test.ts` 就会扫到调用点（索引 K15）。

- [ ] **步骤 3：实现 `src-main/shell-execute.ts`**

接口逐字见规格 §6.2。实现要点（踩过的坑，照做不要再试）：

- `koffi.struct('SHELLEXECUTEINFOW', { cbSize:'uint32', fMask:'uint32', hwnd:'void *', lpVerb:'str16', lpFile:'str16', lpParameters:'str16', lpDirectory:'str16', nShow:'int', hInstApp:'void *', lpIDList:'void *', lpClass:'str16', hkeyClass:'void *', dwHotKey:'uint32', hIcon:'void *', hProcess:'void *' })`；函数声明写成 `koffi.load('shell32.dll').func('bool ShellExecuteExW(SHELLEXECUTEINFOW *psei)')`。**不能写 'struct' 作为类型名**（实测 `Unknown or invalid type name 'struct'`）
- `koffi.load('kernel32.dll')` 取 `GetProcessId` / `WaitForSingleObject` / `GetExitCodeProcess` / `TerminateProcess` / `CloseHandle` / `GetLastError`
- `GetLastError` 必须在 `ShellExecuteExW` 返回 false 后**立刻**取，中间不要插别的 Win32 调用
- `winShell` 是 `export const` 的普通对象，方法内惰性 `koffi.load`（首次调用才加载，测试替换属性时不必碰 koffi）
- `killTree` = `spawnSync('taskkill', ['/T','/F','/PID', String(pid)], { windowsHide: true, encoding: 'utf16le' })` → `status === 0`。**注意**：中文 Windows 下 taskkill 的输出是 UTF-16LE，故 `encoding: 'utf16le'`（仓库的 utf16le 先例实测是 `src-main/quick-launch-terminals.ts:96` 的 `buf.toString('utf16le')`；`process.ts:87` 只是 taskkill 调用本身、不带 encoding —— 索引 K12）。PID 开关两种写法 taskkill 都接受：仓库两处先例（`process.ts:87`、`quick-launch.ts:134`）用 `-PID`，本计划按 `/PID` 逐字落笔
- 轮询 `setInterval(…, 100)`；退出分支必须 `clearInterval` + `api.close(handle)` + 只触发一次 `onExit`（规格 §6.4 / R6）
- `stopGraceful` 按规格 §6.7 五步；`stopping` 标志保证幂等（先例 `src-main/process.ts:74`）
- 抛错文案按规格 §6.5，`t()` 用字面量 key

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src-main/shell-execute.test.ts`
预期：PASS，8 条全绿。

- [ ] **步骤 5：类型门 + 全量回归**

运行：`npx tsc -p tsconfig.main.json --noEmit` → 无输出、exit 0。
运行：`npm test`
预期：全绿，`Tests 834 passed (834)`（基线 826 + 本任务 8），`Test Files 48 passed (48)`，无既有用例减少。

- [ ] **步骤 6：Commit（由主代理在验收通过后执行）**

```bash
git add src-main/shell-execute.ts src-main/shell-execute.test.ts src-main/i18n/dict.ts
git commit -m "feat(main): shell-execute.ts —— ShellExecuteEx 提权启动与句柄生命周期，含 err.proc.uacCancelled 词典键（规格 §6.2-§6.7 / §6.5）"
```

---

### 任务 3：`main.ts` 适配器接线 + 新词典键 + `ipc-ql.test.ts` 两处改写

**文件：**
- 修改：`src-main/main.ts:1038-1074`（注释 + `spawnExeProcess` 函数体）、`src-main/quick-launch.ts:5-6`（**仅注释**）
- 核对不改：`src-main/i18n/dict.ts` 的两条键已在任务 2 步骤 2b 落地（索引 K15）—— 本任务只核对它们仍在、占位符只有 `{exe}`
- 测试：`src-main/ipc-ql.test.ts:324-344`（标题与注释）、`:346-357`（失败路径）、`:423-468`（观察点）

- [ ] **步骤 0：起点核对（真实行号，2026-10-13 实测）**

`main.ts:1038-1052` 是旧口径的注释块（索引 K13 / 旧规格 §7.3），`:1053-1074` 是 `spawnExeProcess`（`new ProcessState()` + `takePipes()` + `stdout.resume()`），接线在 `:1084`；`dict.ts:299`（zh）/ `:641`（en）是 `err.proc.spawnFail`；`ipc-ql.test.ts:101-103` 导入 `mainModule` / `ProcessState`，`:324-344` 是「每配置一个新 ProcessState」用例（**断言全是行为断言，没有引用 ProcessState 代码**），`:346-357` 断言 `ql_start` **正常返回** + `PROC:` 日志异步到达，`:423-468` 改写 `ProcessState.prototype.launch` 观察 `launch(exe, [], configId)`；`quick-launch.ts:5-6` 的文件头注释写着「生产侧由任务 6 接 ProcessState 适配器」。`tsconfig.main.json` 无 `noUnusedParameters` → 保留未使用的 `configId` 形参不会红。

- [ ] **步骤 1：先改测试（三处），验证它们变红**

1. `:324-344`：只改标题与注释——「每配置一个新 ProcessState」→「每配置一个新 ShellExecProcess（规格 §6.6）」；**断言一条不动**（两条 `ql_start` 各自 `{tabId:null}`、两条各自 running、`get_state` 不被污染、`ql_stop` 后清空）
2. `:346-357`：改为新路径。标题改「exe 启动失败：前缀由 shell-execute 自带（规格 §6.5），经既有日志通道反馈且 `ql_start` 被拒」；断言改为 `await expect(invoke('ql_start', 'qlshape04')).rejects.toThrow(/^PROC: /)` + 仍断言 `log-line` 里出现 `stream==='sys'` 且 `/^PROC:/` 的行（`App.vue:477-478` 的回落路径依赖这条日志）。删除 `expect(res).toEqual({ tabId: null })`——旧行为（先返回、错误异步到）已被同步失败取代（规格 §6.6）
3. `:423-468`：观察点换成 `winShell.shellExecute`（`import { winShell } from './shell-execute'`；保存原函数、替换属性、finally 还原）。保留同等强度的断言：两次并发 `ql_start` 记录到的 `file` 分别是两条配置的 exe、调用时 `guardOf()('probe')` 返回的 configId 与本次一致、`ql_states` 两条各自 running、`get_state` 不被污染。删掉 `launch(exe, [], configId)` 的 `args` 逐字断言（K13 口径作废，规格 §7.1）

运行：`npx vitest run src-main/ipc-ql.test.ts`
预期：FAIL —— 三处都红（`winShell` 尚不存在 / `ql_start` 仍按旧路径返回）。输出贴进 check 表 J 段。

- [ ] **步骤 2：核对词典键已在任务 2 落好（索引 K15）**

本任务不再改 `dict.ts`。核对 zh `:299` 后与 en `:641` 后各有一行 `err.proc.uacCancelled`、占位符只有 `{exe}`；缺任一行 → 停下回任务 2 补，不在这里补写。下面三行是核对基准（逐字）：

`dict.ts` zh 侧 `err.proc.spawnFail`（`:299`）之后插入一行，en 侧 `:641` 之后插入一行，逐字：

```ts
'err.proc.uacCancelled': '{exe} 已取消管理员权限请求',          // zh
'err.proc.uacCancelled': '{exe}: elevation request cancelled',  // en
```

不登记 `err-keys.ts` 的 `IPC_ERROR_KEYS`（规格 §6.5）。

- [ ] **步骤 3：改 `main.ts` 适配器**

把 `:1038-1074` 整段（注释块 + 函数）替换为：

```ts
/**
 * exe 类型的进程适配器（2026-10-13-quick-launch-elevated-exe §6.6，取代旧 §7.3 / 索引 K13）：
 * **每个配置一个新 ShellExecProcess**，绝不复用 :59 的 ps 单例——它只持一个 child 与
 * runningConfigId，会与 llama-server 撞车（这条不变量与旧口径相同，:324-344 的用例仍在守）。
 * 为什么不再走 spawn：CreateProcessW 不做 UAC 提权，manifest 为 requireAdministrator 的 exe
 * 直接 EACCES（规格 §2 / E1-E3）。ShellExecuteEx 才有权按 manifest 提权（E6）。
 * 失败（含用户在 UAC 点「否」= GetLastError 1223）先经既有日志通道 emitLog(…, 'sys') 再原样抛出：
 * 渲染端 App.vue:477-478 的 catch 只负责把按钮回落，原因行只由这里负责（旧路径也是这个分工）。
 * configId 形参不再被本函数使用，但 :1084 的接线必须保持调用 qlStartContextOrThrow('spawnExe')
 * ——那是「ql_start 在途」的槽守卫（修复轮 1 · 重要 #2），删掉它就退化成静默降级。
 */
function spawnExeProcess(exe: string, configId: string | null): {
  onExit(cb: (code: number) => void): void;
  stopGraceful(s: number): Promise<void>;
  isRunning(): boolean;
} {
  void configId; // 见上：只为保留 :1084 接线的语义，不参与启动
  let proc: ShellExecProcess;
  try {
    proc = launchShellExe(winShell, exe);
  } catch (e) {
    emitLog(String(e), 'sys'); // 与旧 :1067 同一通道、同一前缀（索引 G7）
    throw e;
  }
  return {
    onExit(cb) { proc.onExit((code) => cb(code)); },
    stopGraceful: (s: number) => proc.stopGraceful(s),
    isRunning: () => proc.isRunning(),
  };
}
```

`:1084` 的接线、`qlStartContextOrThrow`（`:1022-1027`）与 `qlStartContext`（`:1012`）**一行不改**。新增 import：`import { launchShellExe, winShell, type ShellExecProcess } from './shell-execute';`；`ProcessState` 的 import（`:13`）保留（`:64` 的 ps 单例仍在用）。

- [ ] **步骤 4：`quick-launch.ts:5-6` 注释同步（规格 §8-K6）**

只改文件头那两行注释，把「exe 类型走 deps.spawnExe 接缝，生产侧接 ProcessState 适配器」改为「…生产侧接 shell-execute（ShellExecuteEx，2026-10-13-quick-launch-elevated-exe §6.6）」。**该文件的可执行代码一行不改**；`QlDeps.spawnExe` 签名（`:171`）逐字不变。

- [ ] **步骤 5：定向 + 三门 + 全量**

运行：`npx vitest run src-main/ipc-ql.test.ts`
预期：PASS，`Tests 23 passed (23)`（用例数不变，只是三处改写）。
运行：`npx vitest run src-main/i18n/dict.test.ts src-main/i18n/key-coverage.test.ts src-main/i18n/no-hardcoded.test.ts`
预期：全绿 —— `key-coverage` 认到字面量 `t('err.proc.uacCancelled', { exe })` 且占位符一致；`no-hardcoded` 不因新键报错（词典文件本身在白名单内）。
运行：`npx tsc -p tsconfig.main.json --noEmit` → 无输出、exit 0。
运行：`npx vite build` → exit 0（本次未改渲染端，跑一次确认没连带弄坏）。
运行：`npm test`
预期：全绿，`Tests 834 passed (834)`（= 任务 2 之后的计数，本任务不增不减用例），`Test Files 48 passed (48)`。

- [ ] **步骤 6：Commit（由主代理在验收通过后执行）**

```bash
git add src-main/main.ts src-main/quick-launch.ts src-main/ipc-ql.test.ts
git commit -m "fix(main): 快捷启动 exe 改走 ShellExecuteEx 提权路径，UAC 取消给出可辨文案（规格 §6.1/§6.5/§6.6）"
```

---

### 任务 4：打包真机硬门（用户执行）

**文件：**
- 记录：`docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/task-04-packaged-realmachine.md`（J 段填真实回报）

- [ ] **步骤 1：打包**

运行：`.\build.bat`
预期：exit 0，末尾 `[build] Done. Output folder: dist-release\win-unpacked\`。若 rcedit 报 `Unable to commit changes`，按 `build.bat:87-100` 的自动重试；两次都失败就停下报告，不改打包配置试运气。

- [ ] **步骤 2：解包产物核对（主代理执行）**

运行：`Test-Path "dist-release\win-unpacked\resources\app.asar.unpacked\node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node"`
预期：`True`；`…\node_modules\koffi\` 也应存在。`False` = `asarUnpack` 没生效，本任务不通过，回到任务 1 步骤 3 修。

- [ ] **步骤 3：把清单交给用户**（逐字，规格 §7.2）

1. 对 `E:\QiYou\QiYou.exe` 这条点 `[启动]` → 出现系统 UAC 弹窗 → 点「是」→ 奇游启动，日志出现 `启动命令 · E:\QiYou\QiYou.exe`
2. 点 `[停止]` → 奇游进程真的消失（任务管理器里 `QiYou.exe` 与其子进程都要看），行按钮回落绿 `[启动]`
3. 再点 `[启动]`，在 UAC 点「否」→ 日志出现 `PROC: E:\QiYou\QiYou.exe 已取消管理员权限请求`，按钮回落，无残留运行态
4. 不需要管理员的条目（例：`C:\Windows\System32\notepad.exe`）→ 照常启动、停止、退出后 `进程退出 code=` 正常
5. 打包目录里存在 `resources\app.asar.unpacked\node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node`
6. 应用退出路径（托盘退出 / `[更新]`）仍不留孤儿进程

顺带观察（不判过否，回报现象即可）：UAC 挂起那几秒主界面是否只是红「...」、没有「未响应」或崩溃（规格 §9-R1 的接受前提）。

- [ ] **步骤 4：等回报并把结果填进该任务 check 表的 J 段**（逐条：通过 / 不通过 + 现象）。本实现环境起不了 Electron GUI（规格 §7.2 取证），**不得用「自动化已过」代替这一条**。

- [ ] **步骤 5：收尾**

全部通过 → 在 `docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/00-index.md` 的 K 组登记真机结论，并把规格状态行改为「已实现 + 真机已验收」；任一条不通过 → 工作区改动打回（丢弃或重派），先改规格 / plan / check 表再改代码。
