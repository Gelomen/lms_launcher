# 更新启动器隐藏控制台 · 设计文档

> 日期：2026-10-08 ｜ 状态：待评审（访谈已定稿） ｜ 实现计划：[../plans/2026-10-08-hidden-update-launcher.md](../plans/2026-10-08-hidden-update-launcher.md)

## 1. 背景（以下均为代码事实或本机实测）

| # | 事实 | 证据 |
|---|---|---|
| F1 | 更新链路：应用写安装目录短启动器 → `schtasks /Create /F /SC ONCE /ST <now+2min> /TN LMSLauncherUpdate /TR <启动器>` → `/Run` → `app.exit(0)`；脚本自删任务、等待旧实例退出、解压覆盖，再以 `CreateProcessW + DETACHED_PROCESS` 拉起新版 | `src-main/main.ts:562-624`、`scripts/lms-launcher-update.ps1` |
| F2 | `schtasks /TR` 有 261 字符上限：三个绝对路径内联会被拒 → 「启动器文件」这层间接是必需的，不能取消 | `src-main/main.ts:569-571`（2026-09-05 探针矩阵复盘注释） |
| F3 | 本机（Windows 11 专业工作站版 10.0.26300）默认控制台宿主是 Windows Terminal：控制台窗口类名为 `CASCADIA_HOSTING_WINDOW_CLASS`，**不是** `ConsoleWindowClass`；`conhost` 的 `MainWindowHandle` 恒为 0，不能当可见性信号 | `.temp/hide-console/probe.ps1`、`.temp/hide-console/probe2.ps1` |
| F4 | 现状（任务直接跑 `@echo off` 的 `.cmd`）实测**新增 1 个可见顶层窗口**（同一个 hwnd 的标题从 `Terminal` 变为 `C:\WINDOWS\SYSTEM32\cmd.exe`）——即用户报告的弹窗。旧探针按「class+title+pid」字符串去重会把这一次弹窗记成 2 条，**窗口计数以 hwnd 口径为准**（见证据列） | `.temp/hide-console/probe2.ps1` E 组。**2026-10-08 生产形态复测**（`.temp/hide-console/prod/`：编译产物 `dist-main/update-bootstrap.js` 生成 `.cmd`，注册真实任务 `LMSProbeProd` + `/Run`，采样器 `scripts/verify-relaunch.ps1 -Watch -Seconds 30 -IntervalMs 60`）：对照组两次实测 **hits=1**（18:37:54 hwnd=12781148、18:39:10 hwnd=4588402，均 `CASCADIA_HOSTING_WINDOW_CLASS`），不是 2。原因见 `.temp/hide-console/prod/title-trace.txt`：同一个 hwnd 的标题从 `Terminal`（18:39:10.570）变为 `C:\WINDOWS\SYSTEM32\cmd.exe`（18:39:10.615–13.773），probe2.ps1 按「class+title+pid」字符串去重，把一次弹窗计成 2 条；`-Watch` 按 hwnd 去重计成 1 条。「有可见窗口」的结论不变，窗口计数以 hwnd 口径为准。**对照组 `.cmd` 的形态**：当前 `hasWscript=false` 的回退形态（UTF-8 无 BOM + 第二行 `chcp 65001 >nul`；`.temp/hide-console/prod/tr-values.json` 里 `cmd.degraded=true`，产物首字节 `406563686f206f66`），不是 F12 那个以 `'ascii'` 写的历史 `.cmd`；历史 `'ascii'` 形态未复跑——可见窗口的成因是任务激活时给进程分配控制台，与文件编码、`chcp` 行无关。**19:26 补做一轮带留存产物的复测**：`console-watch-cmdfix1.txt`（`watch start 2026-10-08 19:26:34 seconds=30 intervalMs=60 baseline=1` → `HIT 19:26:36 hwnd=2294912 class=CASCADIA_HOSTING_WINDOW_CLASS pid=17452 title=Terminal` → `watch end 19:27:04 samples=439 hits=1`）、`query-cmdfix1.txt`（`Last Run Time: 2026/10/8 19:26:36`、`Last Result: 0`）、`marker-cmd-cmdfix1.txt`（19:26:39.631）。早先两轮的 marker 走假脚本的 `Add-Content` 同名追加、第 1 轮已被覆盖，只有 18:39:13 那行留存（`marker-cmd.txt`），当时的 `Last Result=0` 只在会话里查询过、未落盘 |
| F5 | `wscript.exe` + `.vbs`（`sh.Run(cmd, 0, True)`）实测新增 **0 个可见窗口**，脚本正常执行；本轮再用生产形态（UTF-16 BOM + `Chr(34)` + `/TR` 转义）复测通过 | **本条复测的范围限定**：只覆盖**启动器链**（`schtasks` → `wscript` → 隐藏 `powershell` → 更新脚本）。假更新脚本只写一行 marker 并 `Start-Sleep -Seconds 3`（所以「若有窗口」的存续期约 3 秒，60ms 采样必然覆盖）；真实 `scripts/lms-launcher-update.ps1` 的解压/覆盖/`CreateProcessW + DETACHED_PROCESS` 拉起都没有执行，「整条更新链无窗口」由 §7 真机验收判定。其余证据：同上 A 组；`.temp/hide-console/中文目录/`。**2026-10-08 隔离端到端复测（生产形态）**：用编译产物 `dist-main/update-bootstrap.js` 的 `writeUpdateBootstrap` 生成 `.vbs`（UTF-16LE+BOM 已核），installDir `.temp/hide-console/prod/中文目录`，`/TR` 121 字符（未超 261），`schtasks /Create /F /SC ONCE /ST 23:59 /TN LMSProbeProd` + `/Run`（任务 To Run 切分正确、Logon Mode Interactive only）；两轮 `-Watch -Seconds 30 -IntervalMs 60` 覆盖全程：18:37:02–18:37:32 → **hits=0**（samples=449）、18:41:30–18:42:00 → **hits=0**（samples=453，baseline=1）；第二轮并行跑 40ms 细粒度追踪器（`.temp/hide-console/prod/title-trace-vbs.txt`，517 次采样）确认全程没有任何新的可见控制台窗口句柄（只有采样前就存在的 hwnd=327810）。两轮假更新脚本 marker 均写入（18:37:08.911 → `marker-vbs-round1.txt`、18:41:38.057 → `marker-vbs.txt`，中文 installDir 原样回显），任务 Last Result 当时查询均为 0——这两轮的 `/Query /V` 输出未落盘。**19:27 补做一轮带留存产物的复测**：`console-watch-vbsfix1.txt`（`watch start 2026-10-08 19:27:11 seconds=30 intervalMs=60 baseline=1` → 无任何 `HIT` 行 → `watch end 19:27:41 samples=439 hits=0`）、`query-vbsfix1.txt`（`Last Run Time: 2026/10/8 19:27:13`、`Last Result: 0`）、`marker-vbs-vbsfix1.txt`（19:27:16.655）。同一采样器同日的 `.cmd` 对照组 hits=1（两次，另加 19:26 补做的带留存一轮，见 F4），证明 0 不是漏检。测完 `schtasks /Delete /F /TN LMSProbeProd` 已删（`/Query` 报 cannot find；19:28 补做复测后再次删除并核实不存在，机器上无任何 `LMS*` 任务）。产物 `.temp/hide-console/prod/`（复测驱动 `fix-round.cjs`、`console-watch-{cmd,vbs}fix1.txt`、`query-{cmd,vbs}fix1.txt`、`marker-{cmd,vbs}-*fix1.txt`） |
| F6 | `powershell -WindowStyle Hidden` 实测新增 **1 个可见窗口**（先出现再隐藏）——用户明确拒绝「先弹再缩」 | 同上 B 组 |
| F7 | `conhost.exe --headless cmd.exe /c …` 实测 0 可见窗口，但未采用：Windows 10 无 `--headless`，且多一层解释器 | 同上 C 组 |
| F8 | 改用 S4U 登录类型的 XML 注册需管理员：`schtasks /Create /TN … /XML …` → `ERROR: Access is denied.` | 同上 D 组 |
| F9 | 隐藏启动后仍会创建**不可见**的 `cmd`/`conhost`/`OpenConsole` 进程 → 「无新增 conhost 进程」不是正确验收口径 | `.temp/hide-console/probe3.ps1` |
| F10 | VBScript 引号陷阱：`"""` 是「未结束的字符串常量」（WSH 弹窗 `800A0409`）——而 WSH 错误弹窗本身就是一个可见窗口。必须用 `Chr(34)`（或 4 个引号） | 本轮实测弹窗（用户截图） |
| F11 | Node 的 `'utf16le'` **不写 BOM**。实测（2026-10-08 复现，`.temp/hide-console/probe-task3-results.md`）：WSH 只接受 UTF-16LE——无 BOM 的 UTF-16LE 也能解码，UTF-8（有/无 BOM）与 UTF-16BE+BOM 全部失败（后者报「VBScript 编译器错误: 无效字符」）。仍显式写 `'\uFEFF' + content`：BOM 是被测试钉住的、各方都认的形态 | 本轮实测 |
| F12 | 现状 `.cmd` 以 `'ascii'` 写：安装目录含非 ASCII 字符时启动器直接失败（`cmd` 退出码非 0、marker 未写）——既存缺陷，本次一并修 | 本轮实测（`.temp/hide-console/中文目录/a.cmd`） |
| F13 | `.cmd` 用 UTF-8（无 BOM）+ 第二行 `chcp 65001 >nul` 可正确处理中文路径；不加 `chcp` 则失败（2026-10-08 二次复现：`chcp 936` 与完全去掉 `chcp` 行均失败——PowerShell 报 `-File` 的 .ps1 不存在；`chcp 65001` 是必要条件。探针 `.temp/probe-t3.cjs`） | 本轮实测（`b.cmd` 成功 / `c.cmd` 失败）；二次复现见 `.temp/hide-console/probe-task3-results.md` A2/A3，可重跑脚本 `.temp/probe-t3.cjs` |
| F14 | `/TR "\"<wscript>\" \"<vbs>\""`（内层引号全部反斜杠转义）经 `execSync`（cmd.exe）注册成功，任务 XML 中 Command/Arguments 切分正确，实跑通过 | 本轮实测 |
| F15 | 更新日志 `<installDir>\lms_launcher_update.log` 在下次启动由 `replayUpdateLog()` 原样回显到应用日志区 | `src-main/main.ts:643-660` |
| F16 | 主进程与 `scripts/*.ps1` 的字符串字面量不得含汉字（词典除外）；生成的 `.vbs`/`.cmd` 内容来自 main.ts 的字面量 → 必须英文 | `src-main/i18n/no-hardcoded.test.ts` |

## 2. 目标与非目标

**目标**
- G1 更新全程（解压 + 拉起新版）**任何时刻都不出现控制台窗口**——不是「出现后立刻隐藏」。
- G2 不改变更新的功能语义：脚本参数契约、等待/解压/覆盖/拉起、任务自清理、日志回显全部不变。
- G3 不重新引入「新应用附着在控制台上」的耦合（2026-09-21 已修过的 bug）。
- G4 顺带修掉 F12：安装目录含中文等非 ASCII 字符时更新仍可用。
- G5 验收脚本能真正判定 G1。

**非目标**
- 不做更新进度提示/进度窗口（用户明确：范围只是「去掉窗口」；日志回显已存在）。
- 不改 `lms-launcher-update.ps1` 的任何逻辑与参数契约。
- 不清理启动器文件（用户明确：保留）。
- 不改计划任务的 ONCE + ST 兜底设计与 `cleanStaleUpdateTask()`。

## 3. 决策记录

| # | 议题 | 结论 | 理由 / 代价 |
|---|---|---|---|
| H1 | 用哪种隐藏机制 | **A：`wscript.exe` + 生成的 `.vbs`**，内部 `sh.Run(cmd, 0, True)` | 实测 0 可见窗口（F5）；不依赖 Win11 专有参数（排除 F7）；不需要管理员（排除 F8）；不是先弹再缩（排除 F6） |
| H2 | 验收口径 | 判定「**无新增可见顶层窗口**」，不是「无新增 conhost 进程」 | F3/F9。检测 = `EnumWindows` + 类名 ∈ {`ConsoleWindowClass`, `CASCADIA_HOSTING_WINDOW_CLASS`} + `IsWindowVisible` + 排除有属主的窗口（`GetWindow(GW_OWNER)`） |
| H3 | 启动器形态 | 每次更新由 main.ts 重新生成 `.vbs`，取代 `.cmd`；`.vbs` 把两个绝对参数原样传给既有 ps1，ps1 不改 | 保留 F1/F2 的间接层，契约不变 |
| H4 | VBS 内引号 | 一律用 `Chr(34)` 拼接，禁止 VBScript 双引号字面量 | F10：语法错误会弹 WSH 模态框，正是本改动要消除的窗口 |
| H5 | VBS 文件编码 | **UTF-16LE + 显式 BOM**（`'\uFEFF' + content`，`'utf16le'`） | F11；WSH 原生编码，中文/空格安装路径无损 |
| H6 | 回退 | 探测 `%SystemRoot%\System32\wscript.exe`；缺失 → 写 `.cmd`（可见窗口，但更新完成）+ 一条降级日志 | WSH 在 Win11 已是可选组件；不做三级回退（YAGNI），不引入硬失败 |
| H7 | 回退 `.cmd` 编码 | UTF-8（无 BOM）+ 第二行 `chcp 65001 >nul` | F12/F13；不新增依赖（Node 无 GBK 编码器，仓库无 iconv-lite） |
| H8 | `/TR` 写法 | `"\"<wscript>\" \"<vbs>\""`；回退时 `"\"<cmd>\""` | F14 实测；仍远低于 261 上限（生产路径约 75 字符） |
| H9 | VBS 自身失败路径 | `On Error Resume Next`；失败时**不弹 WSH 错误框**，改为向更新日志追加一行带时间戳的 `[ERROR]` 并 `WScript.Quit 1` | 弹窗就是可见窗口；日志会在下次启动回显（F15）。该行必须纯 ASCII（WSH 按系统 ANSI 写文件，与日志的 UTF-8 只在 ASCII 上等价） |
| H10 | 启动器文件残留 | 保留，不新增清理步骤 | 用户明确选择；每次更新覆盖重写，不累积 |
| H11 | 生成逻辑放哪 | 新模块 `src-main/update-bootstrap.ts` + 同名测试 | main.ts 无测试覆盖；生成内容（引号、BOM、编码）是本次全部风险所在，必须可测（F10 正是靠测试守住的） |
| H12 | 验收脚本 C3 | 改为「更新期间无新增可见控制台窗口」；新增 `-Watch` 采样模式（更新前启动，写 `console-watch.txt`），默认模式读该文件断言 0 命中；conhost 进程差值降为 `[INFO]` | 窗口是瞬态的，更新结束后再 diff 窗口句柄必然抓不到；采样器实测能区分 E（1 个新增句柄；旧探针按 class+title+pid 字符串去重会报 2 条，见 F4）/A（0 命中） |
| H13 | 真机验收 | 由用户执行真实更新；本次只改代码与验收脚本 | 用户明确选择 |

## 4. 行为规格

| 场景 | 期望 |
|---|---|
| wscript 存在（正常路径） | 生成 `.vbs`（UTF-16LE+BOM）；`/TR` 值为 `\"<wscript>\" \"<vbs>\"`；更新全程 0 新增可见窗口；日志 `wroteBootstrap` 的 `launcher=` 指向 `.vbs` |
| wscript 缺失 | 生成 `.cmd`（UTF-8 无 BOM + `chcp 65001`）；`/TR` 值为 `\"<cmd>\"`；日志多一条 `wscriptFallback` 降级说明；更新仍完成（此时允许出现可见窗口） |
| ps1 或 zip 不存在 | 不变：`{ ok:false, errorKey: ERR_UPDATE_FILES_MISSING }`，不生成任何启动器 |
| VBS 启动 powershell 失败（如 WSH 组件损坏） | 无 WSH 弹窗；更新日志出现一行 `… [ERROR] [vbs] Could not start the update script: …`；任务 LastTaskResult=1；下次启动回显该行 |
| 安装目录含中文/空格 | `.vbs` 与回退 `.cmd` 均正确传参（F11/F13） |
| 更新期间用户自己的终端窗口 | 基线只排除采样器**启动时已存在**的窗口句柄，这些不算命中；采样期间用户自己新开的终端会被记为 HIT——已知局限，见 `scripts/verify-relaunch.ps1:138-139` 与 §5.3 |
| 采样器未运行 | C3 记 `[INFO]` 跳过，不判失败；C1/C2/C4/C5 照常 |

## 5. 契约

### 5.1 新模块 `src-main/update-bootstrap.ts`

```ts
export const BOOTSTRAP_VBS_NAME = 'lms_launcher_update.vbs';
export const BOOTSTRAP_CMD_NAME = 'lms_launcher_update.cmd';
export interface BootstrapInput { installDir: string; wscriptPath: string; ps1Path: string; zipPath: string; updateLogPath: string }
export interface BootstrapPlan { kind: 'vbs' | 'cmd'; filePath: string; trValue: string; degraded: boolean }
export function vbsContent(i: BootstrapInput): string
export function cmdContent(i: BootstrapInput): string
export function writeUpdateBootstrap(i: BootstrapInput, hasWscript: boolean): BootstrapPlan
```

- `trValue`：放进 `/TR "…"` 里的内容，内部 `"` 已按 `CommandLineToArgvW` 规则转义为 `\"`（H8）。
- `hasWscript` 由调用方用 `existsSync` 计算；模块自身不探测环境（可测）。
- 落盘：`.vbs` → `'\uFEFF' + vbsContent`，`'utf16le'`；`.cmd` → `cmdContent`，`'utf8'`（无 BOM）。两者 CRLF。
- 生成的文本一律 ASCII/英文（F16、H9）。

### 5.2 词典 `src-main/i18n/dict.ts`

- 改 `log.launcher.upd.wroteBootstrap` 的参数名 `cmd` → `launcher`（值可能是 `.vbs` 或 `.cmd`）。
- 新增 `log.launcher.upd.wscriptFallback`（参数 `path`）。
- `dict.test.ts` 的 zh/en key 齐平与非空断言自动覆盖新 key。

### 5.3 `scripts/verify-relaunch.ps1`

- 新增 `-Watch [-Seconds <n>] [-IntervalMs <n>]`：基线 = 启动时可见控制台类窗口句柄集合；采样期内任何**新增**句柄写一行 `HIT …`；首行 `watch start …`，结束行 `watch end samples=… hits=…`；文件 `<InstallDir>\console-watch.txt`。
- C3 改为读该文件：无 `watch start` → `[INFO]` 跳过；有 `HIT` → FAIL；有 `watch end` 且无 `HIT` → PASS；有 start 无 end → `[INFO]` 跳过并打印已捕获的 HIT。
- 原 conhost 进程差值检查降为 `[INFO]`（C3b），不计入 PASS/FAIL。
- 已知局限：窗口句柄在窗口销毁后可能被复用；采样间隔内复用概率极低，记为可接受。

## 6. 顺序约束与不变量

1. 生成启动器 → 写 Node 侧日志 → `schtasks /Create` → `/Run` → `app.exit(0)`：顺序不变（`main.ts:591-622`）。
2. 新版进程必须与任何控制台解耦（`CreateProcessW + DETACHED_PROCESS`）——本改动不得触碰 ps1。
3. `LMSLauncherUpdate` 的 ONCE+ST 兜底与 `cleanStaleUpdateTask()` 不变。
4. 生成文件内容不得含汉字（F16）；`.vbs` 不得出现三连引号（F10）。

## 7. 交接给用户的手动事项（真机验收）

1. `npm run build` + `npx electron-builder`，把产物装到 `D:\AI\LMS-Launcher`。
2. 更新前，在任一终端里启动采样器（约 4 分钟）：
   `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-relaunch.ps1 -Watch -Seconds 240`
3. 在应用里点「重启以更新」。**全程不应看到任何 cmd / Terminal 窗口。**
4. 新版起来后运行：
   `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-relaunch.ps1`
   → 期望 C1/C2/C3/C4/C5 全 PASS（C3 读第 2 步留下的 `console-watch.txt`）。
