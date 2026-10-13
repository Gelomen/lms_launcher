# 快捷启动「可执行程序」需要管理员权限时提权启动 设计规格

- 日期：2026-10-13
- 状态：设计已由用户逐项确认（grill-me 共 13 问，口径见 §8）；**待写实现计划**，代码一行未改
- 取代关系：本规格修订 `docs/superpowers/specs/2026-10-10-quick-launch-card-design.md` §7.3 的「可执行程序类型走 `spawn(exe, [], { windowsHide, stdio: 'ignore' })`、实现口径复用 `src-main/process.ts` 的 `ProcessState`（索引 K13）」（旧文档 `:168-169`）。旧文档已在 `b330a5c chore: clean docs and temp working files` 从工作区删除且未被 git 跟踪，本规格自带所需上下文，**不改写旧文档**（沿用 `2026-10-13-grid-fill-width-design.md` §6-Q6 的口径）
- 取证方式：本文结论全部来自本机实测。探针脚本与原始输出在 `\temp\uac-probe\`（`.temp/` 被 `.gitignore:4` 的 `.*/` 忽略（实测：:4 = `.*/`，:5 = `!.superpowers/`）、不入库），关键数值在 §3 逐字记录

## 1 现象

用户回报（2026-10-13）：

```
[lms_launcher] 启动命令 · E:\QiYou\QiYou.exe
PROC: E:\QiYou\QiYou.exe 启动失败: spawn E:\QiYou\QiYou.exe EACCES
[lms_launcher] 进程退出 code=-1
```

两条既有日志（`log.launcher.start.cmd`、`log.app.exit`）都在，中间夹着 `PROC:`；**没有操作系统的用户账户控制（UAC）弹窗**。

## 2 根因

`child_process.spawn` 在 Windows 上走 `CreateProcessW`。**`CreateProcessW` 不做 UAC 提权**：目标 exe 的内嵌 manifest 声明 `requireAdministrator` 时，非提权进程调用它会被直接拒绝（`ERROR_ELEVATION_REQUIRED`），libuv 映射成 `EACCES` → `child.on('error')` → `PROC:` + `code=-1`。UAC 弹窗是 Shell（`ShellExecuteEx`）的能力，不是 `CreateProcess` 的能力。

**「启动失败」与「没有弹窗」是同一个原因的两面，不是两个缺陷。**

现状调用链：

| 环节 | 位置 |
|---|---|
| 卡片 `[启动]` → `ql_start` → `QuickLaunchManager.start()` 的 exe 分支 | `src-main/quick-launch.ts:268-287`（`:272` 调 `deps.spawnExe(exe)`） |
| 接缝签名（本期逐字不改） | `src-main/quick-launch.ts:171` |
| 生产侧适配器 | `src-main/main.ts:1053-1074`（`spawnExeProcess`），接线 `:1084` |
| 实际 spawn | `src-main/process.ts:32-36`（`spawn(exe, [], { stdio: ["ignore","pipe","pipe"], shell: false })`） |
| 失败上报 | `src-main/process.ts:37-47`（`child.on('error')` → `PROC: ` + `err.proc.spawnFail` → `onExit(-1, …)`） |
| 日志落地 | `src-main/main.ts:1067`（`emitLog(error,'sys')`）、`:1082`（`onSysLine` → `emitLog`） |
| 渲染端对 `ql_start` 被拒的处理 | `src/App.vue:456-482`（点下即置 `{running:true,stopping:true}` → 红「...」；`catch` → `clearQlState` 回落绿 `[启动]`，原因行由主进程 sys 日志负责） |

## 3 现状取证（本机实测，2026-10-13）

| # | 事实 | 取证 |
|---|---|---|
| E1 | `E:\QiYou\QiYou.exe` 内嵌 manifest = `<requestedExecutionLevel level="requireAdministrator" uiAccess="false">`；`asInvoker` 命中 0 次 | 读字节 + 正则 |
| E2 | `spawn` 该 exe → `code=EACCES errno=-4092 syscall=spawn E:\QiYou\QiYou.exe` | `.temp/uac-probe/probe.mjs` |
| E3 | 同法 `spawn` `C:\Windows\System32\msconfig.exe`（manifest 同为 `requireAdministrator`）→ **同样** `EACCES errno=-4092`；`notepad.exe`（`asInvoker`）→ `SPAWNED pid=14072` | 同上 |
| E4 | 本机 UAC 开着：`EnableLUA=1`、`ConsentPromptBehaviorAdmin=5`、`PromptOnSecureDesktop=1`、`FilterAdministratorToken=1`；**`TypeOfAdminApprovalMode=1`（Windows 11 的 Protected Admin）**、`ConsentPromptBehaviorEnhancedAdmin=1` | `HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System` |
| E5 | 探针所在会话是**交互会话**：`SessionId=1`（console / Gelomen / Active）；完整性级别 `Medium Mandatory Level S-1-16-8192`；`BUILTIN\Administrators` 标为 `Group used for deny only`（过滤令牌） | `query session`、`whoami /groups` |
| E6 | `ShellExecuteExW`（`fMask=SEE_MASK_NOCLOSEPROCESS`）对 **QiYou** → `ok=true`、**`elapsedMs=4135`**（这段时间就是 UAC 交互）、`GetLastError=0`；令牌 `TokenElevation=1`、`TokenElevationType=2 Full` → 确实提权 | `.temp/uac-probe/ffi-probe3.mjs` |
| E7 | 对 **msconfig** 同调用 → `ok=true`、**`elapsedMs=91`**、令牌同样 `1 / 2` → Protected Admin 下这类程序**静默提权、不弹窗** | `.temp/uac-probe/ffi-probe2.mjs` |
| E8 | 对 **notepad**（`asInvoker`）同调用（`fMask` 另加 `SEE_MASK_FLAG_NO_UI`）→ `ok=true`、`elapsedMs=86`、拿到句柄与 pid → 不需要管理员的程序走这条路径同样正常 | `.temp/uac-probe/ffi-probe4.mjs` |
| E9 | 现有停止口径 `taskkill /T /F /PID <提权进程>` → **失败**：`ERROR: The process with PID 10260 (child process of PID 7032) could not be terminated.`，进程仍在跑 | `ffi-probe3.mjs` |
| E10 | `TerminateProcess(句柄, 0)` → `true` → 进程消失。句柄在 `ShellExecuteEx` 创建时就带 PROCESS_ALL_ACCESS，所以**非提权的主进程能终止提权子进程** | 同上 |
| E11 | `WaitForSingleObject(句柄, 0)`：运行中 `258 WAIT_TIMEOUT`、终止后 `0 WAIT_OBJECT_0` → 用它判存活；**不用** `GetExitCodeProcess == 259(STILL_ACTIVE)`（真实退出码恰为 259 时会歧义） | `ffi-probe4.mjs` |
| E12 | `koffi@3.3.3`：`added 2 packages in 7s`；原生件在**可选平台包** `@koromix/koffi-win32-x64\win32_x64\koffi.node`（与 `@lydell/node-pty` 的 `@lydell/node-pty-win32-x64` 同构）；npm 的 `install` 脚本被 `allowScripts` 拦下**未执行**仍可用 → 本机无 Visual Studio 也能装、能用 | `npm install koffi --prefix .temp/uac-probe` |
| E13 | `sizeof(SHELLEXECUTEINFOW) = 112`（x64，含 `hIcon/hMonitor` 联合与 `hProcess`） | `ffi-probe.mjs` |
| E14 | 打包只产出 `dist-release\win-unpacked\`（`--win dir`）；`asarUnpack` 现只有 `**/node_modules/@lydell/**` | `build.bat:83`/`:90`/`:109`、`electron-builder.yml:16-17` |
| E15 | 词典既有键：`err.proc.spawnFail`（zh `dict.ts:299` / en `:641`，占位符 `{exe}{err}`）、`log.launcher.start.cmd`（`:219`/`:561`）、`log.app.exit`（`:323`/`:665`）。字面量 key 与占位符由 `key-coverage.test.ts:39-46` 双向守护；源码不得出现中文字面量（`no-hardcoded.test.ts:139`） | 读文件 |
| E16 | 主进程已有「同步阻塞」先例：终端探测用 `spawnSync`（最坏 3×3s），只包了一层 `setImmediate` | `src-main/main.ts:1034-1036`、`src-main/quick-launch-terminals.ts` |
| E17 | 现有测试里有两处**直接钉住旧实现**的用例：`src-main/ipc-ql.test.ts:423-468`（改写 `ProcessState.prototype.launch` 观察 `launch(exe, [], configId)` 与 `qlStartContext` 槽）与同文件「exe 启动失败：前缀由 ProcessState 自带（索引 K11(4)），并经既有日志通道反馈（check E4）」 | 读文件 + 基线运行输出 |
| E18 | 基线（写本规格时实测）：`npm test` → `Test Files 47 passed (47)`、`Tests 826 passed (826)`，exit 0 | `npm test` 2026-10-13 19:25 |
| E19 | **`SEE_MASK_FLAG_NO_UI` 压不住「文件 / 路径不存在」这一类 Shell 错误框**：`fMask` 取 `0x44`、`0x144`（另加 `SEE_MASK_FLAG_DDEWAIT`）、`0x104` 三种，`C:\no-such-dir\no-such.exe` 与 `Z:\no-such-dir\no-such.exe`（无效驱动器）**都弹**模态框并把调用线程卡死（node 进程 4s 未返回，需人点「确定」）；`SetErrorMode(0x3)` 也压不住。同一次调用里解码回读确认 `fMask_in_mem` 就是写入值、`cbSize=112`、`sizeof(SE)=112` → 不是传参错，是 Shell 在这条错误类上不认这个位。对照组：存在但无关联的 `.xyz` → `ok=true`、`hInstApp=42`、不阻塞（说明不是「所有 UI 都被禁掉」） | `.temp/uac-probe/no-ui-probe.mjs`（日志 `no-ui-A..E.log`）、`.temp/uac-probe/errmode-probe.mjs`（`errmode-G.log`），2026-10-13 21:44 |
| E20 | 真接缝冒烟可用的**无 UI、无副作用**真实 Win32 调用 = 当前进程伪句柄 `-1`：`GetProcessId(-1) = 本进程 pid`、`WaitForSingleObject(-1, 0) = 258`（WAIT_TIMEOUT）、`GetExitCodeProcess(-1,…) = true / code=259`、`CloseHandle(-1) = true`；koffi 对 JS 数字 `-1` 与 `0xffffffffffffffffn` 都按 `void *` 正确传（传字符串 `'0xffffffffffffffff'` 则退化成 0，不可用） | `.temp/uac-probe/pseudo-handle-probe.mjs`，2026-10-13 21:45 |
| E21 | `String(new Error('PROC: x'))` = `"Error: PROC: x"`；`e instanceof Error ? e.message : String(e)` = `"PROC: x"`（实测 `node -e`，2026-10-13 22:5x） | 适配器把异常写进日志通道时若照 §6.6 原伪代码写 `String(e)`，日志行以 `Error: ` 开头 → 破坏索引 G7「前缀在行首」的口径与本节「日志出现 `PROC: …`」的可观察要求。已定口径见 §8-K7；任务 3 的 `ipc-ql.test.ts` 用例（`/ ^PROC:/` 断言）实测红因正是 `TIMEOUT waiting for PROC: 日志行` |

## 4 目标

1. 快捷启动的「可执行程序」条目，对**需要管理员权限**的 exe：点 `[启动]` 后由系统按其 UAC 策略决定是否弹窗；用户同意后程序**正常启动**。
2. 启动后应用仍能**跟踪该进程**：`[停止]` 能停掉它；退出码照常经 `ql-exit` 与 `log.app.exit` 上报。
3. 用户在 UAC 点「否 / 取消」时，日志给出**可辨认且能定位到条目**的取消文案，且不残留「运行中」假状态。
4. 不需要管理员权限的 exe 行为不回退（能启动、能停止、能报退出码）。

## 5 非目标

- `llama-server` 的启动路径与 `src-main/process.ts`（含 `main.ts:64` 的 `ps` 单例）—— 不改（§8-Q9）
- 「以管理员身份重启 lms_launcher」的引导或任何新 UI（§8-Q9）
- 保存 / 编辑弹窗里「该 exe 需要管理员权限」的检测与提示（要一套 PE 资源解析，加壳 exe 会误判；§8-Q9）
- 启动参数、工作目录（旧规格 §2 非目标不变；`src/modules/QuickLaunchModal.vue:247-261` 的表单不加字段）
- 「shell（终端）」类型的任何路径（PTY 那套不动）
- 提权启动的额外日志行（§8-Q12）
- 提权进程的**进程树**终止能力（系统限制，见 §9-R2）
- 旧规格文档的改写（见开头「取代关系」）

## 6 设计

### 6.1 唯一路径：exe 类型一律走 `ShellExecuteExW`（§8-Q6）

不判断「这个 exe 要不要管理员」、不做 `EACCES` 改道、不读 manifest 预判。`spawn` 只留给 `llama-server`（`process.ts` 不改）。

理由（按权重）：

1. **无分支、无中间态**：`EACCES` 是异步 `child.on('error')`，改道方案要在「第一次失败」之后重建进程对象，改道窗口内 `isRunning()` 为假 → 按钮回落但再点又报「已在运行」。统一走 Shell 没有这个窗口。
2. **接缝不变**：`QlDeps.spawnExe(exe)`（`quick-launch.ts:171`）签名逐字不动 → `quick-launch.ts` 的可执行代码一行不改，改动半径收在 `main.ts` 的适配器 + 一个新模块。
3. **代价可接受**：Shell 路径没有 stdout/stderr 管道，而现状这两个管道在适配器里就是 `.resume()` 丢弃（`main.ts:1060-1062`）—— 没有实际能力损失。

### 6.2 新模块 `src-main/shell-execute.ts`（接口逐字）

命名用 Win32 API 名，避免与本功能的「终端 shell 类型」混淆。

```ts
/** Win32 接缝：真实现走 koffi；单测注入假实现（§7.1） */
export interface WinShellApi {
  /** ShellExecuteExW。ok=false 时 win32Error = GetLastError() */
  shellExecute(file: string, nShow: number): { ok: boolean; handle: unknown; win32Error: number };
  pidOf(handle: unknown): number;            // GetProcessId
  isAlive(handle: unknown): boolean;         // WaitForSingleObject(h, 0) === WAIT_TIMEOUT(258)（E11）
  exitCodeOf(handle: unknown): number;       // GetExitCodeProcess
  terminate(handle: unknown, code: number): boolean;
  close(handle: unknown): void;
  /** taskkill /T /F /PID。非提权进程可用；提权进程返回 false（E9） */
  killTree(pid: number): boolean;
}

/** 真实现（koffi 惰性绑定）。导出为可变对象：ESM 的导出绑定不可写，属性可写 → 测试可替换 */
export const winShell: WinShellApi;

/** 生产入口：构造即启动（与 ProcessState.launch「调用返回时已 spawn」同口径）。失败抛 PROC:（§6.5） */
export function launchShellExe(api: WinShellApi, exe: string): ShellExecProcess;

/** 生命周期包装：形状 = QlDeps.spawnExe 的返回类型（quick-launch.ts:171）+ pid */
export class ShellExecProcess {
  readonly pid: number;
  onExit(cb: (code: number) => void): void;
  isRunning(): boolean;
  stopGraceful(timeoutSecs: number): Promise<void>;
  drainExit(): number | null;
}
```

`main.ts` 只用 `launchShellExe(winShell, exe)`。

### 6.3 `ShellExecuteExW` 的取值（逐字）

| 字段 | 取值 | 理由 |
|---|---|---|
| `cbSize` | `koffi.sizeof(SHELLEXECUTEINFOW)` = 112（E13） | API 要求 |
| `fMask` | `SEE_MASK_NOCLOSEPROCESS (0x40) \| SEE_MASK_FLAG_NO_UI (0x04)` | 前者才返回 `hProcess`（E6/E10）。后者**保留**（它确实关掉一部分 Shell UI，例如无文件关联的「打开方式」路径，E19 对照组），但**实测它压不住「文件 / 路径不存在」的错误框**（E19）—— 该类仍会弹系统框并阻塞主线程，见 §9-R8（用户 2026-10-13 21:47 决定：接受，不加 `existsSync` 预检、不改设计） |
| `lpVerb` | `null`（默认动词 `open`） | **不用 `"runas"`**：`runas` 强制提权，对 `asInvoker` 程序反而可能多弹一次 UAC。`open` 下 `requireAdministrator` 仍按 manifest 自动提权（E6 实测弹了 UAC），`asInvoker` 正常启动（E8） |
| `lpFile` | 配置里的 `exe`（`quick-launch-config.ts:75-77` 已 trim） | — |
| `lpParameters` | `null` | 本期无参数字段（§5） |
| `lpDirectory` | `null` | 与现状一致：`spawnExeProcess` 不传 cwd（`main.ts:1059`），继承本进程工作目录 |
| `nShow` | `SW_SHOWNORMAL (1)` | §8-Q11。现状 `windowsHide:true` 只压控制台窗口、GUI 程序大多忽略 `nCmdShow`；改 Shell 后按「快捷启动是给人看的程序」取值 —— **这是本次唯一的行为变化：控制台类 exe 会显示窗口** |

### 6.4 存活与退出码

- `launchShellExe` 返回后启动 **100ms** 的 `setInterval` 轮询（与 `process.ts:82`、`quick-launch.ts:29` 同口径）：`isAlive()` 为假 → 读 `exitCodeOf()` → `close()` → `clearInterval` → 触发一次 `onExit(code)`。
- 判存活只用 `WaitForSingleObject(h, 0)`（E11）。
- `onExit` 只触发一次；若注册时已退出则立即补发（与 `quick-launch.ts:109-115` 的 `PtyProcess.onExit` 同口径，否则状态会卡住）。
- 退出码经既有链路 `ql-exit { configId, code }` 与 `log.app.exit`（`quick-launch.ts:364-369`、`:292-294`）上报，**格式不变**。

### 6.5 失败分类与 i18n（§8-Q8）

| 情况 | 抛出 |
|---|---|
| `ShellExecuteExW` 返回 false 且 `GetLastError() === 1223`（`ERROR_CANCELLED`：用户在 UAC 点「否 / 取消」） | `PROC: ` + `t('err.proc.uacCancelled', { exe })` |
| 其他 `ok === false` | `PROC: ` + `t('err.proc.spawnFail', { exe, err: 'win32=' + GetLastError() })` |

新键（`src-main/i18n/dict.ts`：zh 紧跟 `err.proc.spawnFail`（`:299`）、en 紧跟 `:641`）：

```
'err.proc.uacCancelled': '{exe} 已取消管理员权限请求'          // zh
'err.proc.uacCancelled': '{exe}: elevation request cancelled'  // en
```

- **必须带 `{exe}`**：这条路径上 `log.launcher.start.cmd` 不会写（它由 `quick-launch.ts:285` 在 `spawnExe` 返回之后才写），日志里只有这一行，不带 exe 就认不出是哪条配置。
- 调用点必须是**字面量** `t('err.proc.uacCancelled', { exe })`，占位符名与词典逐字一致（`key-coverage.test.ts:39-46` 双向比对）。
- 不登记 `src-main/i18n/err-keys.ts` 的 `IPC_ERROR_KEYS`：这条文案只进日志，不经 IPC 传 key。
- 前缀只用既有的 `PROC:`（索引 G7 五种前缀之一），不新增前缀、不新增日志通道。
- **日志行的行首是 `[lms_launcher] `，`PROC:` 紧随其后**（§8-K8）：抛出的 Error 仍以 `PROC: ` 开头（分类前缀不变），但写进 sys 日志通道的那一行必须带 `[lms_launcher] `——sys 通道的每一行都由启动器撰写，与 `main.ts:324` / `:1078` 同一口径。

### 6.6 适配器怎么接（`src-main/main.ts:1053-1074` 重写）

```
spawnExeProcess(exe, configId):
  try { proc = launchShellExe(winShell, exe) }
  catch (e) { emitLog('[lms_launcher] ' + (e instanceof Error ? e.message : String(e)), 'sys'); throw e }  // 通道与现状 :1067 一致；取 message 不取 String(e)（E21 / §8-K7：分类前缀 PROC: 不得被 Error: 吃掉）；行首加 [lms_launcher]（§8-K8）。rethrow 让 ql_start reject → App.vue:477 回落按钮
  return { onExit(cb) { proc.onExit((code) => cb(code)) },
           stopGraceful: (s) => proc.stopGraceful(s),
           isRunning: () => proc.isRunning() }
```

- 不再 `new ProcessState()`、不再 `takePipes()`（Shell 路径没有管道可排空）。
- `main.ts:1084` 的接线（`qlStartContextOrThrow('spawnExe').configId`）**不变**；`qlStartContextOrThrow` 守卫（`:1022-1027`）与 `qlStartContext` 槽（`:1012`）不变。
- 用户可见结果：UAC 期间按钮是红「...」（`App.vue:464` 预置），点「否」→ 日志出现 `[lms_launcher] PROC: E:\QiYou\QiYou.exe 已取消管理员权限请求`、按钮回落绿 `[启动]`、无残留运行态。

### 6.7 `[停止]`（§8-Q7）

```
stopGraceful(timeoutSecs):
  1. killTree(pid)                    // taskkill /T /F /PID —— 非提权进程走这条，与今天逐字同口径、能杀进程树
  2. 每 100ms 轮询 isAlive() 到 timeoutSecs
  3. 仍存活 → terminate(handle, 1)     // 提权进程走这条（E9/E10）
  4. 再等 1000ms 让退出落地（与 quick-launch.ts:32 FORCE_EXIT_WAIT_MS 同口径）
  5. 幂等：已在停止流程中直接返回（与 process.ts:74 同口径）
```

提权进程第 1 步必然失败（E9）、第 3 步成功；非提权进程第 1 步就杀掉整棵树。**已知边界：提权进程只能终止本体，杀不到它的子进程**（§9-R2）。

### 6.8 依赖与打包（§8-Q2 / Q5 / Q13）

- `package.json` 的 `dependencies` 加 `"koffi": "^3.3.3"`。原生件由**可选平台包** `@koromix/koffi-win32-x64` 提供（E12），与 `@lydell/node-pty` 同构；koffi 的 `install` 脚本不执行也可用 → 不需要 Visual Studio，也不需要进 `allowScripts`。**实现时必须实测 pnpm 下的真实安装结果**（E12 是 npm 实测），见计划任务 1 步骤 0。
- `electron-builder.yml:16-17` 的 `asarUnpack` 增加两条：`**/node_modules/koffi/**`、`**/node_modules/@koromix/**`。理由与既有注释同源：`.node` 无法从 asar 内 dlopen。
- 打包产物必须出现 `dist-release\win-unpacked\resources\app.asar.unpacked\node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node`（§7.2 第 5 条）。

### 6.9 主线程阻塞口径

`ShellExecuteExW` 是同步调用，会阻塞 Electron 主线程直到用户回答 UAC（E6 实测 4.1s）。本次**接受**这个阻塞，理由：

- 与既有口径一致：终端探测的 `spawnSync` 最坏 3×3s 也是同步阻塞主进程（E16）。
- `PromptOnSecureDesktop=1`（E4）下 UAC 在安全桌面，输入本来就被 consent UI 独占，这段时间主线程没有可交互内容。
- 不做 `worker_threads` 包装：跨线程传 koffi 指针要退化成数值句柄，复杂度换不到用户可感收益。真机若判定不可接受，按 §9-R1 升级。

## 7 验收

### 7.1 自动化单测（先红后绿）

新建 `src-main/shell-execute.test.ts`，用**假 `WinShellApi`**驱动，不真起进程：

1. 启动成功：`pid` 取自 `pidOf`；`isRunning()` 为真
2. 退出：轮询到 `isAlive() === false` → `onExit` 收到 `exitCodeOf()` 的值，**只一次**，且 `close()` 被调用、定时器被清
3. `ok=false, win32Error=1223` → 抛错以 `PROC: ` 开头且含 `t('err.proc.uacCancelled', { exe })` 的译文；不进入轮询（无定时器残留）
4. `ok=false, win32Error=2` → 抛错含 `t('err.proc.spawnFail', { exe, err: 'win32=2' })`
5. `[停止]` 提权进程：`killTree` 返回 false → 断言 `terminate(句柄, 1)` 被调用
6. `[停止]` 非提权进程：`killTree` 返回 true 且随后 `isAlive()` 为假 → 断言 `terminate` **未**被调用
7. `stopGraceful` 幂等：第二次调用立即返回
8. 真接缝冒烟门（无 UI、无副作用的真实 Win32 调用）：`winShell.pidOf(-1) === process.pid` 且 `winShell.isAlive(-1) === true`（当前进程伪句柄，E20）。**原写法 `winShell.shellExecute('Z:\\no-such-dir\\no-such.exe', 1)` 作废**：它确实返回 `ok=false`，但会弹 Shell 的系统错误框并把测试线程卡住（实测 vitest worker 卡 383s，直到进程被杀；E19）。真实 `ShellExecuteExW` 调用由 §3 E6/E8 的探针与 §7.2 真机门守，不在单测里跑

改写 `src-main/ipc-ql.test.ts` 的两处（E17）：

- `:423-468` 并发用例的观察点从 `ProcessState.prototype.launch` 换成 `winShell.shellExecute`；断言保持同等强度：两次并发 `ql_start` 各自的 `file` 不串、调用时 `qlStartContextOrThrow('probe')` 返回本次 configId、`ql_states` 两条各自 running、`get_state`（`main.ts:59` 的 `ps` 单例）不被污染。原「`launch(exe, [], configId)` 逐字」断言随 K13 口径一并作废
- 「exe 启动失败：前缀由 ProcessState 自带」用例改为新路径：不存在的 exe → `ok=false` → 日志通道收到 `[lms_launcher] PROC: ` 行、`ql_start` 被拒（`App.vue:477` 的回落路径不变）

### 7.2 打包真机硬门（用户执行）

本实现环境起不了 Electron GUI（旧规格 `2026-10-10-quick-launch-card-design.md:7`：`electron.exe` 立即退出 `0x80000003 STATUS_BREAKPOINT`），所以这一组只能由用户在 `dist-release\win-unpacked\lms_launcher.exe` 上执行（E14）。清单（≤6 步）：

1. 对 `E:\QiYou\QiYou.exe` 这条点 `[启动]` → **出现系统 UAC 弹窗**（本机实测会弹，E6）→ 点「是」→ 奇游启动，日志出现 `启动命令 · E:\QiYou\QiYou.exe`
2. 点 `[停止]` → 奇游进程真的消失（第 1 步 `taskkill` 打不到、第 3 步句柄兜底），行按钮回落绿 `[启动]`
3. 再点 `[启动]`，在 UAC 点「否」→ 日志出现 `[lms_launcher] PROC: E:\QiYou\QiYou.exe 已取消管理员权限请求`（行首 `[lms_launcher] `，§8-K8），按钮回落，无残留运行态
4. 不需要管理员的条目（例：`C:\Windows\System32\notepad.exe`）→ 照常启动、停止、退出后 `进程退出 code=` 正常
5. 打包目录里存在 `resources\app.asar.unpacked\node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node`
6. 应用退出路径（托盘退出 / `[更新]`）仍不留孤儿进程（`ql.stopAll` 走的是新的 `stopGraceful`）

顺带观察（不判过否，回报现象即可）：把某条目的 exe 改成一个**不存在的路径**再点 `[启动]` —— 按 E19 会弹系统的「找不到文件」错误框，点「确定」后我们的 `[lms_launcher] PROC: … win32=<码>` 日志才出现。本次接受（§9-R8），只观察现象。

**不得用「自动化已过」代替这一组。**

## 8 已定口径（grill-me 13 问，2026-10-13）

| # | 问题 | 用户决定 |
|---|---|---|
| Q1 | 需要管理员权限时期望行为 | **自动提权启动**，不要求用户预先勾选 |
| Q2 / Q5 | 提权实现路径 | **koffi FFI → `ShellExecuteExW` + `SEE_MASK_NOCLOSEPROCESS`**；确认引入该运行时依赖（含 `asarUnpack`） |
| Q3 | 是否先做真机取证 | **做**（结果即 §3 E6–E11） |
| Q4 | 是否用真实 QiYou 实测 | **跑，测完自动关掉**（结果即 E6/E9/E10） |
| Q6 | 何时走提权路径 | **exe 类型统一走 ShellExecuteEx**，不做 EACCES 改道、不做 manifest 预判 |
| Q7 | `[停止]` 语义 | **先 `taskkill /T /F`，仍存活则 `TerminateProcess(句柄)`** |
| Q8 | 失败文案 | **新增 `err.proc.uacCancelled` 一键**，其余复用 `err.proc.spawnFail` 带 Win32 码 |
| Q9 | 范围边界 | llama-server / `process.ts` / 弹窗提示 / 提权引导 / 参数与 cwd **全部不纳入** |
| Q10 | 测试与验收 | **单测 mock FFI + 打包真机硬门**（不加真机自动化用例） |
| Q11 | `nShow` | **`SW_SHOWNORMAL`** |
| Q12 | 是否为提权多写一条日志 | **不加** |
| Q13 | 是否落 spec + plan | **可以，两份都写并 commit**，随后停下等「开始实现」 |

主代理补充口径（非 grill 提问，按证据定；用户审本规格时可推翻）：

- **K1** 新模块名 `src-main/shell-execute.ts`（用 Win32 API 名，避免与「终端 shell 类型」混）
- **K2** `err.proc.uacCancelled` 带 `{exe}` 占位符（§6.5 理由）
- **K3** 判存活用 `WaitForSingleObject`，不用 `STILL_ACTIVE` 比对（E11）
- **K4** `fMask` 加 `SEE_MASK_FLAG_NO_UI`（§6.3）。**实现期更正**：实测它不覆盖「文件 / 路径不存在」那类弹窗（E19），该位仍保留（对其他 Shell UI 有效），该类弹窗作为已知边界接受（§9-R8）
- **K5** 主线程同步阻塞本次接受，与 `spawnSync` 同口径（§6.9）
- **K6** `quick-launch.ts:5-6` 文件头注释里「生产侧由任务 6 接 ProcessState 适配器」一句随实现同步改写（**只改注释，可执行代码零改动**）——仓库惯例是注释随其描述的取值一起更新，留着会指错
- **K7** 适配器写日志通道时取 `e.message`，不取 `String(e)`（E21）：`String(new Error('PROC: …'))` 会得到 `Error: PROC: …`，分类前缀 `PROC:` 就被 `Error: ` 挤到中间去了（索引 G7 的五前缀口径要求分类前缀紧跟行首的 `[lms_launcher] `，见 K8）。可观察要求（§6.6 末条「日志出现 `[lms_launcher] PROC: <exe> 已取消管理员权限请求`」）只有取 `message` 才成立
- **K8** sys 日志行的行首必须是 `[lms_launcher] `，`PROC:` 分类标记紧随其后（2026-10-13 23:1x 真机清单第 3 步：用户指出日志区出现裸 `PROC: E:\QiYou\QiYou.exe 已取消管理员权限请求`，与同卡片成功行 `[lms_launcher] 启动命令 · …` 不一致）。口径来源：`src/App.vue:107-110` 的 `appendSys` 注释「sys 行统一 `[lms_launcher]` 前缀」+ `main.ts` 全部 sys 调用点的既有写法（`:324` / `:364` / `:1078`）。**只改适配器写日志这一处**（`main.ts:1062`），抛出的 Error 仍以 `PROC: ` 开头（`shell-execute.ts:196/198` 不动，`ipc-ql.test.ts:357` 的 `rejects.toThrow(/^PROC: /)` 不变）；`main.ts:334`（llama-server 启动失败的 `PROC:` 行）同样缺前缀，属本次范围外（Q9 明确 llama-server 不纳入），另立改动

## 9 风险与未验证项

| # | 风险 | 处理 |
|---|---|---|
| R1 | `ShellExecuteExW` 同步阻塞主线程，UAC 挂起期间（实测 4.1s）主进程不处理 IPC / 托盘 / 窗口事件 | 本次接受（§6.9，与 E16 同口径）。真机若判定不可接受 → 升级为 `worker_threads` 包装，另立规格 |
| R2 | 提权进程只能终止本体，**杀不到它的子进程**（`taskkill` 打不到整棵树，E9） | 写进 §5 非目标与 §7.2 第 2 条；真机若出现「停了主程序但子进程还在」再议 |
| R3 | 是否弹 UAC 由系统决定：本机 Protected Admin（E4）下 msconfig 静默提权（E7）、QiYou 弹窗（E6）。换机器 / 换账户行为不同 | 代码不自己画弹窗、不假设一定弹；§7.2 第 1 条按「本机实测会弹」写，换环境时按实际现象记录 |
| R4 | `nShow=SW_SHOWNORMAL` 让控制台类 exe 开始显示窗口（现状是隐藏） | 用户决定（Q11）。真机清单第 4 条覆盖 |
| R5 | pnpm 下 koffi 的安装行为未实测（E12 是 npm 实测）；`optionalDependencies` 平台包在 pnpm 的构建脚本策略下是否照常装 | 计划任务 1 步骤 0 必须先实测并写进 check 表 J 段，不通过就停下报告 |
| R6 | `ShellExecProcess` 的 100ms 轮询定时器若未在退出时 `clearInterval`，事件循环会一直醒着 | §6.4 钉死「退出即 clear + close」；单测第 2 条断言 `close()` 被调用 |
| R7 | 旧规格 §7.3 / 索引 K13 的口径已被本规格取代，但旧文档不在工作区（开头「取代关系」） | 代码注释（`main.ts:1039-1052`、`quick-launch.ts:5-6`）随实现改写为新口径，避免注释领先 / 落后 |
| R8 | 用户配置的 exe **路径不存在**（被移动 / 删除、驱动器不在）时，Shell 会弹自己的系统错误框并阻塞主线程，我们的 `PROC:` 日志要等用户点「确定」才出现（E19：`SEE_MASK_FLAG_NO_UI` 与 `SetErrorMode` 都压不住） | **本次接受**（用户 2026-10-13 21:47 在「预检文件 / 接受弹窗 / 换回 spawn」三选一中选「接受弹窗，只改测试」）：不加 `existsSync` 预检、不改 §6.1 的唯一路径；`PROC:` 分类逻辑不变。真机清单加一条顺带观察（§7.2）。若日后判定不可接受 → 加预检，另立改动 |
