# LMS 启动器 i18n S11：更新脚本文案英文化 设计与实现规格

**日期：** 2026-10-04
**分支：** feat/i18n
**性质：** 分片级规格（有界分片；不命中设计总纲 §5 任何升级判据——无跨进程契约、无新依赖、无新状态机、预计 < 1 人日）
**上位文档：** 设计权威 `2026-09-22-i18n-design.md`；分片真源 `2026-09-22-i18n-slices.md` 的 S11 卡
**实现计划：** `../plans/2026-10-04-i18n-update-script.md`
**状态：** 定稿（grill-me 9 问，2026-10-04），待实现

---

## 1. 目标

把更新脚本链上的**用户可见输出**统一为英文／中性技术日志，作为 i18n 收尾分片：

1. `scripts/lms-launcher-update.ps1`：全部字符串字面量英文化（27 条 `Write-Log` + 参数错误 + 内部分隔符 + 计划任务 XML `<Description>`）。
2. `scripts/verify-relaunch.ps1`：**全量**英文化（21 处 `Write-Host` 输出 + 内部分隔符 + C5 锚点切换）。
3. 新增**结构化 run 标记**：更新脚本每次运行写一条稳定标记行，`verify-relaunch.ps1` 的 C5 以标记定位「本次运行段落」，**锚点与文案解耦**。
4. 把 `scripts/` 两个脚本纳入既有零硬编码中文守护用例（`src-main/i18n/no-hardcoded.test.ts`），使「脚本输出零中文」成为 CI 可验证的不变量。

依据：设计总纲 §1.1 覆盖「日志区」、附录 A 决策 11「更新脚本日志：统一英文/中性技术日志」。

### 1.1 为什么必须连带改 `verify-relaunch.ps1`

`verify-relaunch.ps1:143` 现以 `-match '更新脚本启动'`（更新脚本首行中文日志）定位日志最后一段，再断言该段无 `[ERROR]`（C5）。首行英文化后锚点必然失效：`$startIdx` 保持 `-1`、`$segment` 回落为**全文件**，历史残留段的 `[ERROR]` 会被计入，产生假阳性 FAIL。分片卡原「涉及文件」只列更新脚本，本 spec 修正为两脚本 + 守护用例。

---

## 2. 非目标 / 不译边界（在总体设计 §1.2 之上补充）

| # | 边界 | 说明 |
|---|---|---|
| N1 | **脚本中文注释不译** | 两脚本共 79 行中文注释（更新脚本 52、verify 27），保留仓库既有风格（`package-zip.ps1` / `build.bat` / `gpu-counters.ps1` 注释同为中文）。仅注释中**描述 C5 锚点**的措辞同步为标记行，避免文档与实现不符。 |
| N2 | `scripts/package-zip.ps1` 不动 | 发布打包脚本，3 处中文输出不属「更新脚本链」。 |
| N3 | `build.bat` / `src-main/gpu-counters.ps1` 不动 | 前者已全英文；后者仅中文注释、无中文输出串。 |
| N4 | **不接词典** | 脚本运行在应用进程之外，不 import `src-main/i18n`；英文文案硬编码，随脚本本体发布。 |
| N5 | **不改脚本行为逻辑** | 除新增 1 行标记日志外，控制流、退出码、`[INFO]/[ERROR]/[PASS]/[FAIL]` 标签语义、`schtasks` 调用序列、超时值全部不变。 |
| N6 | **不改文件编码与行尾** | 保持 UTF-8 with BOM + LF（`verify-relaunch.ps1` 头部声明的仓库约定；PS 5.1 兼容）。改后仍含非 ASCII 字符（中文注释）。 |
| N7 | **不改构建产物** | `dist-release/win-unpacked/lms-launcher-update.ps1` 是 gitignore 的构建产物；`scripts/` 是唯一真源，发布需重新 `build.bat` 才会刷新副本。 |
| N8 | 不译专名与固定值 | `lms_launcher.exe`、`llama-server`、`LMS Launcher`、`LMSLauncherUpdate`、`LMSLauncherStart`、`resources/app.asar`、`DETACHED_PROCESS`、`CreateProcess`、`svchost`、`Win32`、`PID`、`Job`、`flag`、路径、版本号、数值与单位。 |

### 2.1 验收必须区分「脚本行」与「node 行」

`lms_launcher_update.log` 是双写日志：**主进程**在 `run_update` 里用 `t()` 写 `[INFO] [node] …` 行（S10 范围，跟随应用当前语言，中文界面下就是中文），**脚本**写自己的行（S11 范围，恒英文）。因此 S11 验收口径是：

> **脚本自身写出的行无中文**；中文界面下日志中出现的 `[node]` 中文行属 S10 既有行为，不计入 S11 失败。

---

## 3. 涉及文件

| 文件 | 动作 |
|---|---|
| `scripts/lms-launcher-update.ps1` | 32 处含汉字字符串/XML 全量英文化 + 新增 1 行 run 标记 |
| `scripts/verify-relaunch.ps1` | 21 处含汉字输出串全量英文化 + C5 锚点改标记 + 2 行相关中文注释措辞同步 |
| `src-main/i18n/no-hardcoded.test.ts` | 新增 PS 词法提取器 + 两脚本 targets + 硬断言 + 提取器自检用例 |
| `docs/superpowers/specs/2026-09-22-i18n-slices.md` | 回写 S11 卡（状态 / 涉及文件 / 独立 spec / 已定契约 / 变更记录） |

零改动：`src-main/**`（词典除外本分片也不涉及）、`src/**`、`package.json`、`vitest.config.ts`、`electron-builder.yml`、`scripts/package-zip.ps1`、`build.bat`。

---

## 4. 契约一：run 标记与 C5 锚点

### 4.1 标记行

更新脚本在设置 `$LogPath` 之后、**任何其他 `Write-Log` 之前**写出（现 L35 位置之前的首行）：

```
[INFO] === update run ===
[INFO] Update script started | zip=<zipPath> | dir=<installDir>
```

- 标记常量：`=== update run ===`（ASCII，无正则元字符，跨语言稳定）。
- 标记独立成行 → 文案改动永不影响 C5；`Write-Log` 调用由 27 条变为 **28 条**。
- 标记行同时进入应用日志回显（主进程加 `[lms_launcher] ` 前缀），便于人工定位一次更新的起点。

### 4.2 C5 定位逻辑（`verify-relaunch.ps1`）

- 匹配方式由正则改为**字面包含**：`if ($lines[$i].Contains('=== update run ===')) { $startIdx = $i; break }`（`=` 虽非正则元字符，但 `.Contains` 语义更明确、零转义风险）。
- 仍从后向前扫，取**最后一个**标记；未找到标记（旧格式残留日志）时保持现状行为：`$segment = $lines`（全文件）——不引入新失败模式。
- C5 的 PASS/FAIL 文案引用标记常量（英文），不再引用中文首行。

---

## 5. 契约二：`scripts/lms-launcher-update.ps1` 英文文案全表（32 处）

标点规则（本分片统一）：半角标点；字段分隔用 ` | `；列表分隔 `", "`；括号 `(...)`；破折号 ` - `；省略号 `...`；句首大写；`[INFO]/[ERROR]` 前缀保留（C5 依赖 `[ERROR]`）。

| # | 行 | 原中文 | 英文定稿 |
|---|---|---|---|
| 1 | 31 | `缺少参数（用法：lms-launcher-update.ps1 <zipPath> <installDir>）` | `Missing arguments (usage: lms-launcher-update.ps1 <zipPath> <installDir>)` |
| 2 | 35a | （新增标记行） | `[INFO] === update run ===` |
| 3 | 35b | `[INFO] 更新脚本启动 · zip=X · dir=Y` | `[INFO] Update script started \| zip=X \| dir=Y` |
| 4 | 46 | `[ERROR] 安装目录不存在：X` | `[ERROR] Install directory not found: X` |
| 5 | 50 | `[ERROR] 更新包不存在：X` | `[ERROR] Update package not found: X` |
| 6 | 86 | `[INFO] 检测到其他位置的 lms_launcher.exe（不占用本安装目录，不影响本次更新）：PID 1 @ a；PID 2 @ b` | `[INFO] Found lms_launcher.exe in other locations (not locking this install directory, does not affect this update): PID 1 @ a, PID 2 @ b` |
| 7 | 90 | `[INFO] 有 lms_launcher.exe 读不到可执行文件路径（权限或正在退出），按「可能属于本安装目录」保守等待：a、b` | `[INFO] Some lms_launcher.exe processes have an unreadable executable path (access denied or exiting); waiting conservatively as they may belong to this install directory: a, b` |
| 8 | 96 | `$started = '未知'` | `$started = 'unknown'` |
| 9 | 97 | catch 分支 `$started = '未知'` | `$started = 'unknown'` |
| 10 | 100 | `[ERROR] 等待安装目录内的 lms_launcher.exe 退出超时（60s），中止更新 · 仍在运行：PID 5@12:00:00、…` | `[ERROR] Timed out after 60s waiting for lms_launcher.exe in this install directory to exit; aborting update \| still running: PID 5@12:00:00, …` |
| 11 | 111 | `[INFO] 解压更新包到临时目录…` | `[INFO] Extracting update package to temporary directory...` |
| 12 | 118 | `[ERROR] 更新包缺少 lms_launcher.exe，中止（未覆盖任何文件）` | `[ERROR] Update package is missing lms_launcher.exe; aborting (no files were overwritten)` |
| 13 | 122 | `[ERROR] 更新包缺少 resources/app.asar（或文件异常小），中止（未覆盖任何文件）` | `[ERROR] Update package is missing resources/app.asar (or the file is suspiciously small); aborting (no files were overwritten)` |
| 14 | 125 | `[INFO] 校验通过：lms_launcher.exe + resources/app.asar（N 字节）` | `[INFO] Validation passed: lms_launcher.exe + resources/app.asar (N bytes)` |
| 15 | 152 | `' · 当前 lms_launcher 进程：' + (… -join '、')` | `' \| current lms_launcher processes: ' + (… -join ', ')` |
| 16 | 153 | `[ERROR] 目标文件被占用，60s 内无法获得独占写权限：T … 中止更新（未覆盖任何文件）` | `[ERROR] Target file is locked; exclusive write access not obtained within 60s: T … aborting update (no files were overwritten)` |
| 17 | 158 | `[INFO] 覆盖安装目录…` | `[INFO] Overwriting install directory...` |
| 18 | 165 | `[INFO] 已移除旧版 update.exe` | `[INFO] Removed legacy update.exe` |
| 19 | 184 | `[ERROR] 未找到新版 X，请手动检查安装目录` | `[ERROR] New version not found at X; please check the install directory manually` |
| 20 | 196 | XML `<Description>LMS Launcher 启动新版（一次性；应用启动后自行清理）</Description>` | `<Description>LMS Launcher: start the new version (one-shot; cleaned up by the app on startup)</Description>` |
| 21 | 238 | `[INFO] 启动新版（独立计划任务 X，svchost 拉起）：EXE` | `[INFO] Launching new version (standalone scheduled task X, started by svchost): EXE` |
| 22 | 252 | `[INFO] 新版已启动（PID N，独立计划任务，与本脚本的任务/控制台/Job 均无关）` | `[INFO] New version started (PID N, standalone scheduled task; independent of this script's task, console and job object)` |
| 23 | 254 | `[ERROR] 启动任务已触发但 15s 内未见新版进程，回退 DETACHED 启动` | `[ERROR] Start task was triggered but no new-version process appeared within 15s; falling back to DETACHED launch` |
| 24 | 257 | `[ERROR] 创建启动任务失败（schtasks 退出码 N），回退 DETACHED 启动` | `[ERROR] Failed to create the start task (schtasks exit code N); falling back to DETACHED launch` |
| 25 | 260 | `[ERROR] 计划任务启动路线异常：MSG，回退 DETACHED 启动` | `[ERROR] Scheduled-task launch route failed: MSG; falling back to DETACHED launch` |
| 26 | 299 | `[INFO] 启动新版（DETACHED_PROCESS，与本脚本控制台解耦）：EXE` | `[INFO] Launching new version (DETACHED_PROCESS, decoupled from this script's console): EXE` |
| 27 | 310 | `[INFO] 新版已启动（PID N，无控制台关联）` | `[INFO] New version started (PID N, no console attached)` |
| 28 | 312 | `[ERROR] 新版启动后立即退出（PID N），请手动启动 lms_launcher.exe` | `[ERROR] New version exited immediately after launch (PID N); please start lms_launcher.exe manually` |
| 29 | 316 | `[ERROR] CreateProcess 失败（Win32 错误 N），请手动启动 lms_launcher.exe` | `[ERROR] CreateProcess failed (Win32 error N); please start lms_launcher.exe manually` |
| 30 | 319 | `[ERROR] 启动新版失败（DETACHED 回退）：MSG —— 请手动启动 lms_launcher.exe` | `[ERROR] Failed to launch the new version (DETACHED fallback): MSG - please start lms_launcher.exe manually` |
| 31 | 322 | `[INFO] 更新完成` | `[INFO] Update completed` |
| 32 | 323 | `[INFO] 更新完成（新版未自动启动，请手动启动）` | `[INFO] Update completed (the new version was not started automatically; please start it manually)` |
| 33 | 329 | `[ERROR] 更新失败：MSG` | `[ERROR] Update failed: MSG` |

> 行号以 2026-10-04 的 `scripts/lms-launcher-update.ps1`（333 行）为基准；实现时以**字符串内容**为锚，行号仅作导航。表中 #2/#3 由原 L35 一条拆为两条（标记 + 语义首行）。
> 表格中 `\|` 是 Markdown 转义，实际脚本内为单个 `|`。

---

## 6. 契约三：`scripts/verify-relaunch.ps1` 英文文案全表（21 处）

| # | 行 | 原中文 | 英文定稿 |
|---|---|---|---|
| 1 | 32 | `[FAIL] 安装目录不存在：X` | `[FAIL] Install directory not found: X` |
| 2 | 41 | `[OK] conhost 快照已保存：X（N 行）` | `[OK] conhost snapshot saved: X (N lines)` |
| 3 | 59 | `[FAIL] C1 新版存活：安装目录内未找到 lms_launcher.exe 进程（X）` | `[FAIL] C1 new version alive: no lms_launcher.exe process found in the install directory (X)` |
| 4 | 62 | `[PASS] C1 新版存活：lms_launcher.exe 在运行（PID N）` | `[PASS] C1 new version alive: lms_launcher.exe is running (PID N)` |
| 5 | 68 | `[INFO] C2 独立存活：lms_launcher 未运行，无法查父进程，跳过（不判失败）` | `[INFO] C2 independent: lms_launcher is not running; cannot check the parent process, skipping (not a failure)` |
| 6 | 73 | `[INFO] C2 独立存活：查不到 Win32_Process 记录（进程刚退出？），跳过（不判失败）` | `[INFO] C2 independent: no Win32_Process record (did the process just exit?); skipping (not a failure)` |
| 7 | 79 | `[PASS] C2 独立存活：父进程 PID N 已不存在，未挂在更新脚本进程树上` | `[PASS] C2 independent: parent PID N no longer exists; not attached to the update script's process tree` |
| 8 | 82 | `[FAIL] C2 独立存活：父进程 PID N（name）仍存在——DETACHED 形态下更新脚本 powershell 应已退出` | `[FAIL] C2 independent: parent PID N (name) still exists; in the DETACHED form the update script's powershell should have exited` |
| 9 | 93 | `[INFO] C3 conhost 无新增：无基线快照（X），请先在更新前跑一次 -Snapshot，跳过（不判失败）` | `[INFO] C3 no new conhost: no baseline snapshot (X); run -Snapshot before the update, skipping (not a failure)` |
| 10 | 101 | `[PASS] C3 conhost 无新增：当前 N 个 conhost 全部在基线快照内（基线 M 个）…` | `[PASS] C3 no new conhost: all N current conhost processes are in the baseline snapshot (M in baseline); none outside it` |
| 11 | 105 | `$pname = '未知'` | `$pname = 'unknown'` |
| 12 | 111 | `'PID ' + $_ + '（父进程：' + $pname + '）'` | `'PID ' + $_ + ' (parent: ' + $pname + ')'` |
| 13 | 113 | `[FAIL] C3 conhost 无新增：快照之外新增 conhost N 个：a；b` | `[FAIL] C3 no new conhost: N conhost processes outside the baseline snapshot: a, b` |
| 14 | 123 | `[PASS] C4 任务不残留：计划任务 LMSLauncherUpdate 不存在（schtasks 退出码 N）` | `[PASS] C4 no stale task: scheduled task LMSLauncherUpdate does not exist (schtasks exit code N)` |
| 15 | 126 | `[FAIL] C4 任务不残留：计划任务 LMSLauncherUpdate 仍存在（更新脚本应已自删）` | `[FAIL] C4 no stale task: scheduled task LMSLauncherUpdate still exists (the update script should have deleted it)` |
| 16 | 130 | `[INFO] C4 任务不残留：schtasks 不可用（MSG），跳过（不判失败）` | `[INFO] C4 no stale task: schtasks is unavailable (MSG); skipping (not a failure)` |
| 17 | 137 | `[INFO] C5 日志无 ERROR：lms_launcher_update.log 不存在，跳过（不判失败）` | `[INFO] C5 no ERROR in log: lms_launcher_update.log does not exist; skipping (not a failure)` |
| 18 | 143 | `if ($lines[$i] -match '更新脚本启动') { … }` | `if ($lines[$i].Contains('=== update run ===')) { … }` |
| 19 | 148 | `[PASS] C5 日志无 ERROR：最后一段（自「更新脚本启动」起 N 行）无 [ERROR] 行` | `[PASS] C5 no ERROR in log: the last segment (N lines since the run marker) has no [ERROR] lines` |
| 20 | 151 | `[FAIL] C5 日志无 ERROR：最后一段有 N 行 [ERROR]：` | `[FAIL] C5 no ERROR in log: the last segment has N [ERROR] lines:` |
| 21 | 159 | `SUMMARY：通过 N/5（FAIL F，跳过 S）` | `SUMMARY: passed N/5 (FAIL F, skipped S)` |

**注释措辞同步（中文，保持不译）**：L13（C5 行说明）、L134（C5 段说明）中「自最后一个「更新脚本启动」行起」改为「自最后一个 `=== update run ===` 标记行起」；L143 附近的注释同步说明锚点已与文案解耦。其余 24 行注释零改动。

---

## 7. 契约四：守护用例（`src-main/i18n/no-hardcoded.test.ts`）

### 7.1 目标与形态

- **硬断言**，不设 `PENDING` 白名单（S11 一次性改完）。
- 显式列出目标，**不使用 `scripts/*.ps1` 通配**（`package-zip.ps1` 含 3 处中文且已定不动）：

```ts
const PS_TARGETS = ['scripts/lms-launcher-update.ps1', 'scripts/verify-relaunch.ps1'];
```

- 新增独立 `it`：对每个目标，用 `psLiteralText(src)` 提取字符串字面量内容后断言 `HAS_HAN` 不匹配。现有 TS/`App.vue` 断言与 `PENDING` 机制零改动。

### 7.2 `psLiteralText(src)` 词法规则（只收集「字符串字面量内容」）

| 规则 | 处理 |
|---|---|
| `#` 行注释 | 跳到行尾（不收集） |
| `<# … #>` 块注释 | 整体跳过（防御性；当前两脚本未用） |
| `@'` / `@"` + 行尾 | here-string：从下一行起收集，直到行首 `'@` / `"@`（`@` 后必须紧跟引号且再后是换行，避免与数组 `@( … )` 混淆） |
| `'…'` 单引号 | 收集内容，`''` 视为一个转义单引号 |
| `"…"` 双引号 | 收集内容，反引号 `` ` `` 转义下一位；`""` 视为转义双引号；`$( … )` 不展开，其内部文本按原样收集（本分片脚本内嵌表达式不含字符串） |
| 其他字符 | 跳过 |

### 7.3 提取器自检用例（防「解析漏洞放过中文」）

新增 1 条 `it`，喂入合成 PS 片段并断言提取结果，至少覆盖：

1. 中文**注释** → 提取结果不含该文本（注释不算违规）；
2. 中文**单引号字符串** → 提取结果含该文本（必须报违规）；
3. 中文**双引号字符串** → 同上；
4. 中文 **here-string** 内容 → 同上；
5. 含 `''` 转义与 `@( )` 数组的片段 → 不误判、不吞掉后续字符串。

---

## 8. 验收标准

| # | 检查 | 命令／方式 | 期望 |
|---|---|---|---|
| A1 | 守护用例（含自检） | `npx vitest run src-main/i18n/no-hardcoded.test.ts` | 绿；两脚本字符串字面量零汉字 |
| A2 | 全量测试零回归 | `npm test` | 全绿（基线 35 文件 / 585 用例，S11 不新增渲染端用例） |
| A3 | PS 语法有效 | `[System.Management.Automation.Language.Parser]::ParseFile(...)` 对两脚本 | 零解析错误（改写前基线已实测 OK） |
| A4 | 字符串零中文（人工复核） | 逐行过滤注释后正则扫 `[\u4e00-\u9fff]` | 两脚本非注释行命中数 = 0 |
| A5 | 全表逐条落地 | 对照 §5 / §6 两张表 | 33 项 + 21 项，无遗漏、无残留中文串 |
| A6 | **人工真机**（用户执行） | 一次真实更新（build → 安装目录更新） | 更新日志回显中脚本行全英文、标记行存在；`verify-relaunch.ps1` 5 项全 PASS（含 C5） |
| A7 | 日志分段正确 | 人工构造含旧中文段 + 新标记段的日志 | C5 只断言标记之后的段（新行为）；无标记时回落全文件（旧行为） |

> A6/A7 由用户人工执行（grill-me Q7 决定：实现阶段**不执行任何 ps1**，避免 `schtasks /Delete` 与真实更新覆盖安装目录的副作用）。

---

## 9. 风险与开放问题

| # | 风险 | 处置 |
|---|---|---|
| R1 | 新标记行改变日志行数/内容 → 依赖日志文本的既有工具失效 | 全仓库检索：仅 `verify-relaunch.ps1:143` 依赖旧中文锚点，本分片一并修复；主进程 `replayUpdateLog` 为逐行透传、零解析，不受影响。 |
| R2 | 旧格式日志残留时 C5 回落全文件 → 可能假阳性 | 属**现状行为**，不改语义；日志在应用启动回显时即被删除，残留仅见于「脚本跑完但应用未启动」的异常场景，此时严格判定反而合理。 |
| R3 | `psLiteralText` 词法覆盖不足 → 漏报中文串，守护形同虚设 | §7.3 自检用例强制覆盖注释/单引号/双引号/here-string/数组五类；实现后以 A1 + A4 双重确认。 |
| R4 | 英文文案与中文语义漂移（如「未覆盖任何文件」被简化掉） | §5/§6 逐条给出定稿英文，保留全部诊断信息与括注；实现时逐条对照。 |
| R5 | 脚本非 ASCII 注释 + BOM 被编辑器改写（丢 BOM / 转 CRLF） | N6 明确编码约定；实现后校验首三字节与行尾（基线：BOM + 333 LF、0 CRLF）。 |
| R6 | 构建产物 `dist-release` 副本陈旧，验收时误用旧脚本 | N7；人工真机验收前必须重新 `build.bat`（`electron-builder.yml` 从 `scripts/` 复制）。 |
| R7 | 中文界面下日志混排 `[node]` 中文行被误判为 S11 未完成 | §2.1 明确口径；C5 只查 `[ERROR]`，与语言无关。 |

**开放问题：** 无（9 问已闭环；英文措辞如个别偏好不同，可在实现前以 spec 修订条目调整，不影响契约）。

---

## 10. 决策台账（2026-10-04 grill-me 9 问）

| # | 问题 | 决定 |
|---|---|---|
| Q1 | 范围边界 | 更新脚本本体 + `verify-relaunch.ps1` **全量**英文化；`package-zip.ps1` / `build.bat` / `gpu-counters.ps1` 不动 |
| Q2 | 零中文如何守护 | **扩展现有** `no-hardcoded.test.ts`：新增 PS 词法提取器，两脚本纳入 targets |
| Q3 | 英文标点风格 | 半角标点 + `\| ` 分隔字段；列表 `", "`；`(...)`；` - `；`...`；`未知`→`unknown` |
| Q4 | C5 锚点方案 | **结构化 run 标记**，锚点与文案解耦；无标记时回落全文件（现状行为） |
| Q5 | 中文注释 | **保持中文不动**（仅 C5 锚点描述措辞同步） |
| Q6 | 标记形态 | 独立标记行 `[INFO] === update run ===` + 语义首行 `[INFO] Update script started \| zip=… \| dir=…` |
| Q7 | 验证深度 | **仅静态守护 + PS 语法解析**；不执行 ps1；真实更新与 C5 由用户人工验收 |
| Q8 | 文档联动 | spec + plan + **回写 slices 卡**（不新增设计总纲条目：§1.1 与附录 A 决策 11 已覆盖） |
| Q9 | 守护断言形态 | **硬断言、不设 PENDING**；显式列两脚本，不用通配 |

---

## 11. 变更记录

- 2026-10-04：创建。grill-me 9 问定稿（范围扩展到 `verify-relaunch.ps1`、C5 锚点改结构化标记、守护用例纳入 scripts、注释保持中文、验证仅静态）；slices S11 卡同步回写（☐→◐）。
