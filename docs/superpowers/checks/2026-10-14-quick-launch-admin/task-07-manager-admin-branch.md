# 任务 7 · `QuickLaunchManager` 的 admin 分支 + `main.ts` 接线 — check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 7 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §6.8 / §6.10 · 关联审查重点 **RF1 / RF2**（索引 R 组）
> 前置：任务 1（`e.admin`）、任务 6（`ElevatedPtyProcess`）
> 现状锚点（本表生成时实测，2026-10-14）：`src-main/quick-launch.ts:166-172`（`QlDeps` 五个成员）、`:223-225`（`protected createShellProcess`）、`:232-266`（`start()` 的 shell 分支：`:238` 读 `available`、`:241` 调接缝、`:242-245` 失败不残留、`:244` 的 `err.ql.ptySpawn` 带 `shellExe(shell).exe`、`:249-253` 先转渲染端再放自动命令、`:264` `scheduleAutoCommand`）、`:322`（`stopAll`）；`src-main/quick-launch.test.ts:151-156`（唯一的 `QlDeps` 夹具，`:156` = `spawnExe:`）；`src-main/main.ts:1076-1085`（`new QuickLaunchManager(` 在 `:1076`、`spawnExe:` 在 `:1082`）、`:1002-1025`（`qlStartContextOrThrow` 槽守卫）、`:1064`（`emitLog('[lms_launcher] ' + msg, 'sys')` 的分工）
> **主代理验收（2026-10-15 14:5x，G 段全部命令由主代理独立复跑）**
> 定向两文件 `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` → `Test Files 2 passed (2)` / **`Tests 61 passed (61)`**（= 34 + 27，与报告一致）；`npx tsc --noEmit -p tsconfig.main.json` → 无输出、`TSC_EXIT=0`；`npx vitest run src-main/i18n` → `4 passed` / `18 passed`；全量 `npm test` → **`51 passed (51)` / `882 passed (882)`**（基线 872 → 882，测试文件份数仍 51）。范围：`git status --porcelain` 只有 B 段四个文件 + 本表 J 段 + 报告（`ql-elevated.ts` / `ql-pty-host.ts` / `ql-host-protocol.ts` / `shell-execute.ts` / `quick-launch-config.ts` 及它们的测试都不在 diff 里）。
> 逐行核对属实：`quick-launch.ts:259-261` 的分流是 `e.admin === true`（不是 truthy）、提权分支 `await`、两条路径实参完全相同；`:262-270` 的 catch 先 `messageOf`、`:268` 已是 `PROC: ` 前缀就原样上抛、`:269` 否则按 C4 的既有形状包装（R-14/K52）；`main.ts:1099-1106` 的接线 `logTarget: shellExe(term).exe`（终端名，不是宿主 `node.exe`）；`ipc-ql.test.ts:624` 那条断言「只包一层 `PROC:` + sys 日志恰好一行 + 带 `cmd.exe` 不带 `node.exe`」。
> **疑虑 1 已裁决 = R-15 / 索引 K53**：那一行原因日志**保留**（与 `main.ts:1069-1071` 的 exe 路径同一分工，是规格 §7.2-4 真机门的前提）；K10 与 §6.10 末句已精确化为「成功路径不得有信息性行」（`85e0b45`）。**疑虑 2 认可**：直通不按分支门控，不改代码（补注已写进 K52）。A3 的 `main.ts` 锚点行号漂移（+2 位移）按索引 K30 的口径处理：不改 A 段文字，报告 §4-2 已登记。
>
> 索引：[00-index.md](00-index.md) 的 G1、G2、G3、G4、K3、K9、K10、**K35**（文案只在 `hostStartError` / 工厂里）、**K45**（`startElevatedHost` 是可 await 工厂）、**K47**（不得调 `handshake()` / `abortHandshake()`）、**K48**（`{err}` 片段词表）、**K50**（委托传剩余预算 → `stopGraceful` 总上限 `timeoutSecs+1s`）、**K52**（R-14 不得二次包装，见 C5）、**K53**（R-15 失败原因行，见 F2）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 上一任务已提交、工作区干净 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 6 的提交；porcelain 干净 | ☑ |
| A2 | 全量基线（索引头部「测试基线」行：由主代理实测，子代理不重跑） | `npm test` | `Test Files 48 passed (48)` / `Tests 835 passed (835)`，exit 0；本任务后用例数只增不减 | ☑（主代理实测 2026-10-14 19:07：`Test Files 48 passed (48)` / `Tests 835 passed (835)`、`Duration 9.35s`、exit 0；与本表生成时的静态计数 48 份 `*.test.ts` 一致。跑 `npm test` 需要完全访问沙箱，见索引 K23） |
| A3 | 本表引用的锚点行号属实 | 读 `quick-launch.ts:166-172` / `:223-225` / `:232-266` / `:322`、`quick-launch.test.ts:151-156`、`main.ts:1002-1025` / `:1076-1085` | 与本表引用一致 | ☑ |
| A4 | 前置任务交付的接口在（签名逐字可用） | 读 `ql-elevated.ts` 的 `startElevatedHost` 工厂签名 | 可用；不可用就停下来报告，不要自己补 | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/quick-launch.ts` | 改：`QlDeps` 加必填 `spawnElevatedShell`；加 `protected createElevatedShellProcess`；`start()` shell 分支按 `e.admin === true` 分流 | `write` / `resize` / `stop` / `stopAll` / `finalize` / `scheduleAutoCommand` 一字不动 | ☑ |
| B2 | `src-main/quick-launch.test.ts` | 改：`:151-156` 夹具补 `spawnElevatedShell` + 新增 5 条用例 | 不改既有断言文案 | ☑ |
| B3 | `src-main/main.ts` | 改：`:1076-1085` 的接线补 `spawnElevatedShell` | `:1082` 槽守卫不删；日志前缀与通道不变 | ☑ |
| B4 | `src-main/ipc-ql.test.ts` | 改：新增端到端形状门 | 不动其它通道用例 | ☑ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | `QlDeps` 新成员（必填） | `spawnElevatedShell(shell: TerminalId, cols: number, rows: number, cwd: string): Promise<ShellProcess>` —— 规格 §6.8 | ☑ |
| C2 | 新接缝 | `protected async createElevatedShellProcess(shell, cols, rows, cwd): Promise<ShellProcess>` —— 与 `:223-225` 同一手法 | ☑ |
| C3 | 分流条件 | `e.admin === true`（不是 truthy）—— 规格 §6.8 | ☑ |
| C4 | 错误文案 | 非提权路径逐字不变：`PROC: t('err.ql.ptySpawn', { exe: shellExe(shell).exe, err })` —— 规格 §6.10 / `:244`。提权路径见 **C5**（不得二次包装） | ☑ |
| C5 | 提权路径的失败**不得二次包装**（**主代理裁决 R-14**，2026-10-15 14:1x，索引 K52） | catch 里先取 `messageOf(err)`：**以 `PROC: ` 开头 → 原样上抛**（`startElevatedHost` / `hostStartError` 交出的就是最终文案）；否则按 C4 的既有形状包一层。要有一条用例断言最终 message 里 **只有一个 `PROC:` 前缀、只渲染一次**（不得出现 `err=PROC:` 嵌套）。`logTarget` 在 `main.ts` 的接线里取 `shellExe(shell).exe`，`QlDeps.spawnElevatedShell` 签名（C1）不带它、逐字不动 | ☑ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先改测试（plan 任务 7 步骤 1 的 5 条 + 夹具） | `npx vitest run src-main/quick-launch.test.ts` | 夹具缺成员 → 类型/构造红；新用例红 | ☑ |
| D2 | 实现 `quick-launch.ts` | 同上 | 全绿 | ☑ |
| D3 | `main.ts` 接线 + `ipc-ql.test.ts` 形状门 | `npx vitest run src-main/ipc-ql.test.ts` | 全绿 | ☑ |
| D4 | 类型门 + 全量 | `npx tsc --noEmit -p tsconfig.main.json`；`npm test` | 干净 / 全绿 | ☑ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | `admin:true` 走提权宿主、本地 `pty.spawn` 未被调用 | 规格 §6.8 | `admin_true_starts_through_the_elevated_host` | ☑ |
| E2 | `admin` 为假走本地 PTY（原路径不变） | 规格 §4-4 / RF2 | `admin_falsy_uses_the_plain_local_pty` | ☑ |
| E3 | 提权启动失败不残留实例 | `quick-launch.ts:242-245` 语义 | `admin_true_failure_leaves_no_instance` | ☑ |
| E4 | 自动命令在首批输出之后释放 | `quick-launch.ts:249-253` / RF1 | `admin_true_auto_command_released_after_first_output` | ☑ |
| E5 | [停止] / `stopAll` 与非提权同一调用路径 | 规格 §6.7 / RF6 | `admin_true_stop_goes_through_the_same_path` | ☑ |
| E6 | 两条提权条目并发各有独立管道与宿主 | 规格 §9-R8 | `two_elevated_entries_run_independently` | ☑ |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | `QlDeps` 成员必填，不静默降级 | 规格 §6.8 / `main.ts:1009-1011` 的既有口径 | ☑ |
| F2 | 不新增日志行、`[lms_launcher] ` 前缀分工不变 —— **主代理裁决 R-15（索引 K53）**：提权启动失败**要**写一行原因（`emitLog('[lms_launcher] ' + msg, 'sys')` 再原样抛出），与 `main.ts:1069-1071` 的 exe 路径同一分工，这是规格 §7.2-4 真机门的前提；K10 禁的是成功路径的信息性行 | 规格 §7.2-4 + plan 步骤 4 + 索引 K53 | ☑ |
| F3 | WSL / 已提权都不特判 | 索引 K9 | ☑ |
| F4 | 不改构造签名 | 索引 G4 / `quick-launch.ts:215-217` | ☑ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` | 全绿 | ☑ |
| G2 | 相邻回归（页签事件 / 自动命令 / 停止的既有门） | `npx vitest run src-main/quick-launch.test.ts` | 既有用例一字未改且绿 | ☑ |
| G3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☑ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿 | ☑ |
| G5 | 全量 | `npm test` | 全绿 | ☑ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/quick-launch.ts`、`src-main/quick-launch.test.ts`、`src-main/main.ts`、`src-main/ipc-ql.test.ts` | ☑ |
| H2 | commit message 逐字 | `feat: 快捷启动按 admin 分流到提权 PTY 宿主` | ☑ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☑ |

## I. 完成判据

- [x] A1-A4 成立
- [x] B1-B4 之外没有文件被改
- [x] C1-C5 逐字一致
- [x] D1→D4 先红后绿
- [x] E1-E6 有对应测试且绿
- [x] G1-G5 全绿
- [x] J 段有真实输出

## J. 执行记录（实现时填命令与真实输出）

> 实现者：子代理（2026-10-15 14:1x–14:2x，起点 HEAD `fc2871b`）。A1-A4 的核对证据在报告
> [.superpowers/sdd/2026-10-14-quick-launch-admin/task-07-report.md](../../../.superpowers/sdd/2026-10-14-quick-launch-admin/task-07-report.md) §1。
> 本表 A-I 段的勾由主代理验收后落（AGENTS.md 工作流第 4 步），实现者未动。

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `npx vitest run src-main/quick-launch.test.ts` | **D1 先红**：`Test Files 1 failed (1)` / `Tests 6 failed \| 28 passed (34)`、exit 1。红的全是本任务新增：`admin_true_starts_through_the_elevated_host` / `admin_true_failure_leaves_no_instance` / `admin_true_final_message_has_exactly_one_proc_prefix` / `admin_true_auto_command_released_after_first_output` / `admin_true_stop_goes_through_the_same_path` / `two_elevated_entries_run_independently`；`admin_falsy_uses_the_plain_local_pty` 首跑即绿（它守的是「非提权路径一字不改」= RF2，本就该绿）。夹具补 `spawnElevatedShell` 后既有 27 条一字未改仍绿。<br>**D2 后绿**：`Test Files 1 passed (1)` / `Tests 34 passed (34)`、exit 0 |
| J-2 | `npx vitest run src-main/ipc-ql.test.ts` | **D3**：`Test Files 1 passed (1)` / `Tests 27 passed (27)`、exit 0（24 条既有 + 3 条新增：端到端形状门 / `two_elevated_entries_run_independently` / 提权失败的一层包装 + 一行日志）。中途踩到两次并修好：① 还原接缝前没等 `ShellExecProcess` 的 100ms 轮询收尾 → 真 koffi 收到假句柄 `TypeError: Unexpected Object value, expected void *`（现 `restore()` 先把假宿主标死再等 200ms）；② shell 条目的 `cmd` 与 configId 形状由配置层校验（`VALIDATION: 命令不能为空` / `id 须为小写字母开头…`），用例补齐 |
| J-3 | `npx tsc --noEmit -p tsconfig.main.json` | 无诊断输出，`TSC_EXIT=0`（D4 / G3；在接线前后各跑一次，两次同结果） |
| J-4 | `npm test` | `Test Files 51 passed (51)` / `Tests 882 passed (882)`、exit 0。基线 872 → 882（+7 `quick-launch.test.ts` +3 `ipc-ql.test.ts`，只增不减）；测试文件数仍 51（本任务不新增测试文件） |
| J-5 | `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts`（G1 定向） | `Test Files 2 passed (2)` / `Tests 61 passed (61)`、exit 0 |
| J-6 | `npx vitest run src-main/i18n`（G4 i18n 三门） | `Test Files 4 passed (4)` / `Tests 18 passed (18)`（`index` / `no-hardcoded` / `key-coverage` / `dict` 全绿）、exit 0 —— 零新词典键（G2）、无汉字字面量（G6） |
| J-7 | `git status --porcelain`；`git diff --stat`（B 段边界） | 改动仅 `src-main/quick-launch.ts`（+29/-5 段内）、`src-main/quick-launch.test.ts`、`src-main/main.ts`、`src-main/ipc-ql.test.ts` 四个文件（`progress.md` 是主代理派单前已存在的改动，本任务未动）。未 `git add` / 未 commit（G8） |
