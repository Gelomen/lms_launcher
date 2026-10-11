# 任务 7 · `exit_app` 停止全部终端 — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 7 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §7.5（应用退出行） · 关联审查重点 **R3**（孤儿 PTY）
> 前置：任务 5（`stopAll`）、任务 6（`ql` 单例已在 `main.ts`）
> 现状锚点：`src-main/main.ts:371-375` = `stopGpuStats(); await ps.stopGraceful(3); app.exit(0);`

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☐ |
| A2 | 插入点确认（**两处**，索引 K17） | 读 `src-main/main.ts:376-380`（`exit_app`）与 `:642-644`（`run_update`） | 两处都必须在既有 `await ps.stopGraceful(3)` **之后**、`app.exit(0)` **之前**插入 `await ql.stopAll(3)`。`app.exit` 不触发 `will-quit`（`main.ts:53-54`），conpty/cmd 是独立进程不会被父进程带走 → 漏一处就是孤儿 PTY（R3） | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src-main/main.ts` | 修改 `exit_app`（`:376-380`）**与** `run_update`（`:642-644`） | 各只加一行 await（**主代理验收口径**：1 行代码 + 说明注释即符合本行，注释不改变行为且引用属实）；不动 `stopGpuStats()` / `ps.stopGraceful(3)` / `setTimeout(3000)` / `app.exit(0)` 本身 → 实测两处各 1 行代码 + 1-2 行注释，四个既有语句全是未变上下文行 | ☑ |
| B2 | `src-main/quick-launch.ts` | **无需改动**（已核实） | 逐个 await（:321-327）、空表早退（:334）、吞单点异常（:336-340）、透传秒数（:323）已由任务 5 落地 → 本任务一行未改：`git diff --stat HEAD -- src-main/quick-launch.ts` 为空，主代理另核 SHA 前缀 `3AD853E6378CB9B5` 与任务 5 提交时一致 | ☑ |
| B3 | `src-main/quick-launch.test.ts` | 追加 3 条用例：幂等（空表 / 未运行 configId）、单点异常隔离、**串行**（钉 F4） | 第 3 条超出计划 步骤 1 的字面「追加幂等用例」，但 F4 是本任务唯一没有测试保护的硬约束 → 主代理批准并登记 K18 | ☐ |

## C. 契约

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | `async stopAll(timeoutSecs: number): Promise<void>` 对**未运行**的配置不抛错（幂等） | 计划 步骤 1 | ☐ |
| C2 | `exit_app` 顺序：`stopGpuStats()` → `await ps.stopGraceful(3)` → `await ql.stopAll(3)` → `app.exit(0)` | 规格 §7.5 | ☐ |
| C3 | `run_update` 顺序：… → `await ps.stopGraceful(3)` → `await ql.stopAll(3)` → `await setTimeout(3000)` → `app.exit(0)`（`stopAll` 在 `app.exit` 之前即可，放在 `ps.stopGraceful` 之后与 C2 同构） | 规格 §7.5（K17 扩展） | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：补一条断言（`stopAll` 对未运行配置不抛错） | — | 用例落盘 | ☐ |
| D2 | 步骤 2：验证失败 —— **口径已更正（索引 K18）**：本任务的新行为在 `main.ts`（由 E5 的 diff 走查把关），而 `stopAll` 的语义已由任务 5 落地，所以这三条是**特征化用例**，首跑即绿属预期（不为此去改 `quick-launch.ts` 凑红、也不伪造红）。红由**变异自检**提供：去掉 `quick-launch.ts:334` 的 `if (!inst) return` → 幂等用例必须红；去掉 `:336-340` 的吞异常 → 隔离用例必须红；改成 `Promise.all` → 串行用例必须红；逐条还原后该文件 diff 必须为空 | `npx vitest run src-main/quick-launch.test.ts` | 首跑 `Tests 20 passed`（特征化）；三次变异各红 2/1/1 条；还原后 diff 为空 | ☐ |
| D3 | 步骤 3：实现 | — | `stopAll` 逐个 await、空表早退；`exit_app` 插入 await | ☐ |
| D4 | 步骤 4：验证通过 | `npx vitest run src-main/quick-launch.test.ts` | 全 PASS | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | 空表调用 `stopAll` → 立即返回、不抛错 | 计划 步骤 1 | ☐ |
| E2 | `stopAll` 对每个运行实例都调用 `stopGraceful(timeoutSecs)`（杀进程树，非只杀直接子进程） | 规格 §7.5 | ☐ |
| E3 | `stopAll` 后 `states()` 为空 | 规格 §7.5 | ☐ |
| E4 | 某个实例停止失败不得中断其余实例（逐个 await 且吞掉单点异常） | R3 | ☐ |
| E5 | `run_update` 路径也停了终端：`git diff` 里 `:642` 之后确有 `await ql.stopAll(3)`，且在 `app.exit(0)` 之前。**不要求为 `run_update` 造测试**（它要 mock 计划任务 / 安装目录文件存在性，属既有未覆盖区），以 diff + 行号走查为证据 | K17 / R3 | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 违反的后果 | ✓ |
|---|---|---|---|
| F1 | 不得把 `ql.stopAll` 放在 `app.exit(0)` 之后 | 进程来不及被杀 → 孤儿 PTY | ☐ |
| F2 | 不改 `ps.stopGraceful(3)` 与 `stopGpuStats()`（G4） | llama-server / GPU 采样链路受影响 | ☐ |
| F3 | 不新增「退出确认」之类交互 | 违反 G10 | ☐ |
| F4 | `stopAll` 保持**串行**（计划 步骤 3 逐字「逐个 await」），不得改成 `Promise.all`。已知代价：退出耗时上界 = N ×（`timeoutSecs` + `FORCE_EXIT_WAIT_MS`=1s）≈ 每个实例 4s；`exit_app` 与 `run_update` 都串行付这个代价。**`run_update` 的这份耗时计入更新流程的 60s 预算**（`scripts/lms-launcher-update.ps1:67` 等待超时后 `:104` 直接中止更新）；把 `stopAll` 与 `setTimeout(3000)` 调换顺序对总时长无影响，故现顺序（C3 逐字）不是缺陷 | 并行化会改任务 5 已审的停止语义；真机若不可接受再回来改口径 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src-main/quick-launch.test.ts src-main/process.test.ts` | 全 PASS | ☐ |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无错 | ☐ |
| G3 | 真机：`npm run dev` 开一个终端 → 退出应用 → `tasklist \| findstr -i "cmd pwsh conpty OpenConsole"` | 无残留进程。**本环境不可运行**（`ELECTRON_RUN_AS_NODE=1` → `requestSingleInstanceLock` 崩；去掉后 `0x80000003`，规格 §13.2）→ **保持未勾，推到任务 14**。真 node-pty 探针（`.temp/task07-probe.cjs`：3 个真 cmd → `stopAll(3)` 318ms、`onExit 0xC000013A`、`states()={}`、进程表残留 0）算作对**机制**的取证，**不算 G3 通过**（索引 K19） | ☐（任务 14） |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src-main/main.ts src-main/quick-launch.test.ts`（计划里的 `src-main/quick-launch.ts` 实际无改动，暂存它是空操作 → 已按 B2 的取证从本行移除） → 已执行（主代理，复审通过后） | ☑ |
| H2 | 提交信息逐字 | `feat(main): exit_app 一并终止所有快捷启动终端` → `9680c3a`（2 files, +73）；口径与表更正另做 docs 提交（与代码分开） | ☑ |

## I. 完成判据

- [ ] D1-D4 先红后绿
- [ ] E1-E4 有测试或真机证据；E5 有 diff + 行号走查
- [ ] G1-G2 通过（G3 输出记入 J）；**G3 未勾 → 推到任务 14**（K19）
- [x] H1-H2 完成（`9680c3a`）

## J. 执行记录（实现时填写）

> 实现者：任务 7 子代理。HEAD 起点 `86aeb19`，改动留在工作区未提交（口径 K5）。时间 2026-10-11。

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| A1 | `git status --porcelain` | 无输出（HEAD `86aeb19`） | 起点干净 |
| A2 补充取证 | `grep -n "app\.exit\(0\)"`、`grep -n "app\.quit\(\)"`、`grep -n "will-quit"`（三次单独 grep，不用管道） | 显式 `app.exit(0)` 共 **3** 处：`:56`（单实例锁失败）、`:382`（exit_app）、`:649`（run_update）；另有 `:1191 app.on('will-quit', () => stopGpuStats())`、`:1197 app.quit()` | `:56` 在模块求值期就退出：那时 `ql`（`:1080`）尚未构造、也没有窗口/渲染端能调 `ql_start` → 不可能存在 PTY，无需 stopAll。K17 的「两条」在「能存在终端的退出路径」这个意义上准确，未扩范围 |
| D1 | 编辑 `src-main/quick-launch.test.ts`：给 `FakeShell` 加 `stopThrows`（:32-33，生效点 :50）与 `stopHeld`/`stopHeldStarted`/`releaseStopNow`（:34-37、:51-54、:62-63）两个测试开关；新增三条用例：幂等（:315）、单点异常隔离（:336）、串行（:351） | 用例落盘 | 覆盖 E1 / E4 / F4；E2/E3 复用任务 5 的 :272（E8）与 :300（E9），不造同义用例 |
| D2 | `npx vitest run src-main/quick-launch.test.ts` | `✓ src-main/quick-launch.test.ts (20 tests) 288ms` / `Test Files 1 passed (1)` / `Tests 20 passed (20)`（exit 0） | **未出现红**（如实记录，不伪造）：三条断言在 HEAD 上已成立 —— `stopAll` 的「串行 / 吞单点异常 / 空表早退 / 透传秒数」已由任务 5 落地（`quick-launch.ts:320-329`、`:332-346`）。本表 D2 的「新用例 FAIL」预期不成立，B2 无需改动 |
| D2′ 反向自检（证明新用例有牙，沿用任务 5 表 J 段的做法） | 对 `quick-launch.ts` 做三处临时变异，各跑一次 `npx vitest run src-main/quick-launch.test.ts`，然后逐条还原 | P1 去掉 `if (!inst) return`（:334）→ `Tests 2 failed \| 18 passed (20)`，红的正是「stopAll 对空表与未运行的配置都不抛错」+ 任务 5 的 E8；P2 去掉 `:336-340` 的吞异常 → `Tests 1 failed \| 19 passed (20)`，红的正是「单个实例 stopGraceful 抛错不影响其余实例」；P3 把 `:321-327` 改成 `Promise.all` → `Tests 1 failed \| 19 passed (20)`，红的正是「逐个 await」。还原后 `git diff --stat -- src-main/quick-launch.ts` 无输出 | E1 / E4 / F4 各被对应用例钉住，不是空跑；`quick-launch.ts` 最终一字未改 |
| D3 | 编辑 `src-main/main.ts`：`exit_app` 在 `await ps.stopGraceful(3)`（现 :378）之后、`app.exit(0)`（现 :382）之前插入 `await ql.stopAll(3)`（现 :381）；`run_update` 在 :645 之后、:649 之前插入同一行（现 :647） | `git diff -- src-main/main.ts` 只有两个 hunk（`@@ -376,6 +376,9 @@`、`@@ -640,6 +643,8 @@`），每处 = 1 行代码 + 2 行注释；`stopGpuStats()` / `ps.stopGraceful(3)` / `setTimeout(3000)` / `app.exit(0)` 一字未改 | C2 / C3 / F1 / F2 / B1 成立；E5 的证据就是第二个 hunk |
| D4 | `npx vitest run src-main/quick-launch.test.ts` | `✓ src-main/quick-launch.test.ts (20 tests) 267ms` / `Tests 20 passed (20)`（exit 0） | 绿 |
| G1 | `npx vitest run src-main/quick-launch.test.ts src-main/process.test.ts` | `✓ quick-launch.test.ts (20 tests)` / `✓ process.test.ts (5 tests) 6309ms` / `Tests 25 passed (25)`（exit 0） | 过；`process.ts` / `process.test.ts` 未改（G4：`git status --porcelain` 只有两个文件） |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无诊断输出，`TSC_EXIT=0` | 过。`ql`（`:1080`）在 :381/:647 的处理器体内前向引用：编译通过、运行时也成立（处理器体在退出时才执行，模块早已求值完） |
| V2 | `npx vitest run src-main/ipc-ql.test.ts src/App.test.ts` | `✓ src/App.test.ts (48 tests)` / `✓ src-main/ipc-ql.test.ts (23 tests)` / `Tests 71 passed (71)` | 任务 6 的 23 条形状门仍绿，接线段未被碰 |
| V4 | `npx vitest run src-main/i18n src/i18n.test.ts` | `index(3) / no-hardcoded(2) / dict(11) / key-coverage(2) / i18n.test(4)` → `Tests 22 passed (22)` | 未新增 i18n 键（K8/K16 口径不变） |
| 额外回归 | `npm test`（全量） | `Test Files 44 passed (44)` / `Tests 741 passed (741)` / Duration 8.28s | 全仓库无红 |
| G3 | `npm run dev`（真跑） | `[dev:vite] VITE v6.4.3 ready` → `[dev:electron] Connected!` → `dist-main/main.js:87 ... TypeError: Cannot read properties of undefined (reading 'requestSingleInstanceLock')` / `Node.js v18.18.2` / `npm run dev:electron exited with code 1`（shell 继承 `ELECTRON_RUN_AS_NODE=1` → `require('electron')` 是 npm stub）；去掉该变量后 `npx electron .` → `ELECTRON_EXIT=-2147483645` = `0x80000003` STATUS_BREAKPOINT | **本环境起不了应用**（与规格 §13.2、任务 6 的复现一致）→ G3 按简报推到任务 14 真机验收，不勾 |
| G3 替代取证（真 PTY，**不是** G3 本身） | `npx tsc -p tsconfig.main.json --outDir .temp/task07-build` → `node .temp/task07-probe.cjs` / `node .temp/task07-probe2.cjs` | 真 node-pty 起 3 个 cmd 终端：`start t1..t3 → {"tabId":"ql:tN"}`、`states()` 三条 running；`stopAll(3) 用时 ms = 318`；`onExit = t1/t2/t3 = -1073741510`（`0xC000013A` STATUS_CONTROL_C_EXIT：优雅终止即生效，没走到 taskkill）；`states() = {}`。进程表 diff：新增 `cmd.exe:9728`、`cmd.exe:19688`、`conhost.exe` ×2，stopAll 后**残留 0**（唯一多出来的是探针自己的 `tasklist.exe`） | 「stopAll 真的杀掉真实 ConPTY 进程树、不留孤儿」这一实质（R3）在真机成立；但仍不替代 G3 的「应用退出后无残留」 |
