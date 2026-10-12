# 最终审查修复轮 A · 主进程退出路径 + 真机用例卫生

来源：最终整分支审查（`.superpowers/sdd/2026-10-10-quick-launch-card/final-review.md`，Important I-3 / Minor 1、6 / M 组 M10、M12、M23）。本轮**只做主进程侧与测试卫生**，渲染端（I-1/I-2/M19）是下一轮，别顺手做。

## 1. I-3 = M12：`stopAll` 末尾无条件 `instances.clear()` 会丢掉退出窗口内新起的实例
- 位置：`src-main/quick-launch.ts:317-327`（`:326` 的 `clear()`），调用点 `src-main/main.ts:376-381`（`exit_app`）与 `src-main/main.ts:640-648`（`run_update`）。
- 事实：`stopAll` 的 await 期间窗口仍活着、[启动] 仍可点 → 新实例进表 → 被 `clear()` 抹掉而**没被停** → `app.exit(0)` 后就是孤儿 ConPTY。这正是索引 R3 要防的，且 **K19 已登记这两处退出接线没有任何测试保护**。
- 修法（审查给的，我接受）：删掉 `clear()`（`finalize` 已逐个摘除实例，`clear()` 唯一能清掉的恰是「没被停的实例」）；把单次快照改成带上限的二轮循环（例如 `while (this.instances.size && ++guard <= 64)`）。**不得改停止语义**（任务 5 已审：终止 → 3s → `taskkill /T /F`）。
- **必须补测试**（K19 的缺口）：在 `src-main/quick-launch.test.ts` 造一条「`stopAll` 的 await 期间又起一个实例」的用例，断言两轮都停到、最终表为空、没有实例被静默丢弃。

## 2. M10 + M23：真机用例别再留窗口（用户已明确抱怨：任务栏十几个空白记事本）
- 位置：`src-main/ipc-ql.test.ts:219/:293-294/:333/:411-412`（真的 `ql_start` 了 `type: 'exe' 且 exe 为 `notepad.exe` 的配置）、`:171-174` 的手维护清单 `KNOWN_STARTED_IDS`。
- 我已取证的根因（索引 **M23**）：不是漏 `ql_stop`——`child.kill('SIGTERM')` 确实杀掉了被跟踪 PID，但 **Windows 11 打包版记事本会自我再生**（留下的进程命令行带 `/SESSION:`，父 PID 正是被杀掉的那个），再生进程不在表里，谁也停不掉。单跑一次那两条用例就漏 1 个窗口。
- 修法（两条都要做）：
  1. **换样本进程**：真机用例里的 exe 样本改成**无窗口且不自我再生**的进程，例如 `ping.exe -n 60 127.0.0.1`（真进程、真退出码、可被 `taskkill /T /F` 杀干净、不占任务栏）。**断言语义不得变**：exe 类型仍必须 `tabId = null`、不调 `detectTerminals`、`ql_states` 含该条、`get_state` 不受影响（K13 的反证）。
  2. **换清理清单**：删掉手维护的 `KNOWN_STARTED_IDS`，改为在测试的 `invoke()` 包装里记录（`if (name === 'ql_start') startedIds.add(String(args[0]))`），`afterAll` 用它兜底停一遍。
- 顺带（Minor 6，两处已实现但无测试钉的分支，各一条用例）：`src-main/quick-launch.ts:126-129` 的「`PtyProcess.onExit` 注册晚于退出时补发」与 `:333-345` 的「`stopInternal` 早退时把 exitCode 记 -1 并立即摘实例（双 stop 路径）」。
- 顺带（Minor 1 = M7，一行）：`src-main/quick-launch.ts:304-315` 的 `states()` 加 `&& inst.proc.isRunning()`，并补一条用例（进程已死、exit 事件未到 → `states()` 不得报 running）。**先写失败测试再改。**

## 边界（越界即打回）

- 只改 `src-main/quick-launch.ts`、`src-main/quick-launch.test.ts`、`src-main/ipc-ql.test.ts`。**渲染端（`src/**`）、`src-main/main.ts`、词典、`build.bat`、规格/计划 一字不动。**
- 不改停止语义、不改 `FORCE_EXIT_WAIT_MS`、不动 `src-main/process.ts`（K17 边界）。
- 不 `git add`、不 commit（K5）；不跑 `npm run dev`（K33）；不新增 i18n 键。

## 门（真实输出写进报告文件；已提交任务的 check 表不要改，我验收后统一登记）

- `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` → 全 PASS，用例数只增不减
- `npm test` → 47 files 全绿，总数 ≥ 800 + 新增数（基线 800）
- `npx tsc -p tsconfig.main.json --noEmit` → exit 0
- **卫生门（本轮验收重点）**：给出 `npm test` 跑前与跑后的 notepad 计数两个数，跑后必须是 **0**
- 变异门：保留 `stopAll` 的 `clear()` 不动 → 新用例必须红；去掉 `states()` 里的 `isRunning()` → 新用例必须红。还原后报文件 SHA。

报告写到 `.superpowers/sdd/2026-10-10-quick-launch-card/final-fix-A-report.md`。不派子代理。
回传给我（简短）：状态一行 + 各门真实计数 + notepad 跑前/跑后计数 + 两处变异各红几条 + 还原后的 SHA。