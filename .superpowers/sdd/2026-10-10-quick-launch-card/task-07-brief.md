# 任务 7 简报 · `exit_app` 停止全部终端

计划：docs/superpowers/plans/2026-10-10-quick-launch-card.md §任务 7（:283-291）
规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §7.5（应用退出行 :191，已按 K17 扩展）
check 表：docs/superpowers/checks/2026-10-10-quick-launch-card/task-07-exit-app-stop-all.md（A2/B1/C2/C3/E1-E5/F1-F4/G1-G3 全部照表执行，J 段填真实输出）
索引：docs/superpowers/checks/2026-10-10-quick-launch-card/00-index.md 的 K 组，尤其 K17（本任务口径）、K11(1)（stopAll 透传 timeoutSecs）、G7（错误前缀五种）、G4（不改 process.ts）、G10（不加退出确认）

## 要做什么（一句话）

在两条显式 `app.exit(0)` 路径上都先停掉全部快捷启动终端，避免孤儿 PTY（审查重点 R3）。

## 已核实的现状（照抄，别自己再找）

- `exit_app` 在 `src-main/main.ts:376-380`：`stopGpuStats(); await ps.stopGraceful(3); app.exit(0);` → 在 `ps.stopGraceful(3)` 之后、`app.exit(0)` 之前插入 `await ql.stopAll(3);`
- `run_update` 在 `src-main/main.ts:587-645`，收尾在 :642-644：`await ps.stopGraceful(3); await new Promise(setTimeout 3000); app.exit(0);` → 同样插入 `await ql.stopAll(3);`（放在 `ps.stopGraceful` 之后，与 `exit_app` 同构）。为什么也要改：`app.exit` 不触发 `will-quit`（`main.ts:53-54` 已记录），conpty/cmd 是独立进程、父进程退出不会带走它们。
- `ql` 单例在 `src-main/main.ts:1062` 声明（在 `exit_app` 处理器之后）。这没问题：处理器体在退出时才执行，那时模块早已求值完。不要为了「看起来更顺」把 `ql` 上移或重构那段接线。
- `QuickLaunchManager.stopAll`（`src-main/quick-launch.ts:320-329`）已经是：串行 for + 每个 try/catch 吞异常 + 末尾 `instances.clear()`；`stopInternal(configId, timeoutSecs = STOP_TIMEOUT_SECS)`（:332-346）透传秒数、`stopGraceful` 失败也收尾。空表时循环不执行 → 天然早退。所以 B2 大概率一行都不用改：先读代码确认，确认无需改动就在报告里写清「B2 无需改动 + 证据行号」。
- 任务 5 已有用例：`quick-launch.test.ts:268`（单实例 `stopArgs === [3]`）、:293-296（`stopAll(7)` → 每个 `[7]`，即 K11(1) 透传）。别重复造这两条。

## 本任务要新增的测试（check 表 E1 / E4）

- E1：`stopAll` 对没有运行实例的管理器（空表）与对未运行/不存在的 configId 都不抛错、立即返回（幂等）。
- E4：一个实例的 `stopGraceful` 抛错时，其余实例仍被停（用任务 5 已有的注入式假 ShellProcess 工厂，让第一个抛、第二个记录被调用）。
- E2/E3（每个实例都收到透传的 `stopGraceful(timeoutSecs)`、`stopAll` 后 `states()` 为空）已由任务 5 的 E8/E9 覆盖，报告里指出对应行号即可，不必再加同义用例。
- E5（run_update 也停了终端）：不要求为 run_update 造测试（它要 mock 计划任务与安装目录文件存在性，属既有未覆盖区）。以 git diff 片段 + 行号走查作为证据写进 J 段。

## 硬约束（表 F 段 + 索引）

- F1：`ql.stopAll` 不得放在 `app.exit(0)` 之后。
- F2：不改 `ps.stopGraceful(3)`、`stopGpuStats()`、run_update 里的 `setTimeout(3000)` 与 `app.exit(0)` 本身；不改 `src-main/process.ts`（G4）。
- F3：不加「退出确认」交互（G10）。
- F4（新增）：`stopAll` 保持串行，不得改成 `Promise.all`。已知代价要在报告里承认：退出耗时上界 = N ×（`timeoutSecs` + `FORCE_EXIT_WAIT_MS`=1s）≈ 每个实例 4s（quick-launch.ts 的强杀等待与 `process.ts:71-92` 的 `stopGraceful` 都是这个形状）。
- 不新增 i18n 键；`qlStartContextOrThrow` 的守卫消息仍不走 `t()`（K8/K16）。
- 范围：只碰 `src-main/main.ts`（两处退出）、`src-main/quick-launch.ts`（若确需）、`src-main/quick-launch.test.ts`。不动任务 6 刚落地的接线段、`preload.ts`、`src/ipc.ts`、`src/App.test.ts`、`src-main/ipc-ql.test.ts`。

## G3（真机门）怎么处理

表 G3 要求真机：npm run dev 开一个终端 → 退出应用 → `tasklist | findstr -i "cmd pwsh conpty OpenConsole"` 无残留。
本环境跑 Electron 有已知障碍：shell 继承 `ELECTRON_RUN_AS_NODE=1` 时 `require("electron")` 返回 npm stub；去掉后退出码 `0x80000003 STATUS_BREAKPOINT`（规格 §13.2 已记录，任务 6 也复现过）。
做法：真跑一次并把真实输出贴进 J 段；跑不起来就如实写「本环境不可运行 + 取证」，把 G3 标为推到任务 14（真机验收）。不许用「逻辑上不会残留」代替实测，也不许伪造输出。

## 流程与交付

- TDD：D1 先写失败用例（`npx vitest run src-main/quick-launch.test.ts` 看到新用例 FAIL）→ D3 实现 → D4 全 PASS。贴真实输出。
- 回归门 G1：`npx vitest run src-main/quick-launch.test.ts src-main/process.test.ts`；另跑 `npx vitest run src-main/ipc-ql.test.ts src/App.test.ts`（main.ts 被改，任务 6 的 23 条形状门必须仍绿）与 `npx tsc -p tsconfig.main.json --noEmit`、`npx vitest run src-main/i18n src/i18n.test.ts`。
- 把命令与真实输出填进 check 表 J 段；H 段（提交门）不要执行——按 K5 你不 `git add`、不 commit。
- 报告写到 .superpowers/sdd/2026-10-10-quick-launch-card/task-07-report.md：改了什么（前后对照）、每条 E 对应哪条用例或哪段 diff 证据、B2 是否需要改动的结论与证据、G3 的真实情况、自审与疑虑。
- 不派子代理。