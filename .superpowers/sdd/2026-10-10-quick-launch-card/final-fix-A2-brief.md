# 修复轮 A2 · 主进程退出路径（两个文件）

**不要读 `00-index.md` 与 `final-review.md` 全文**（太长）。本简报就是全部所需信息。
允许改的文件只有：`src-main/quick-launch.ts` 与 `src-main/quick-launch.test.ts`。

## 1. I-3：`stopAll` 末尾无条件 `instances.clear()` 会丢掉退出窗口内新起的实例
- 位置：`src-main/quick-launch.ts:317-327`（`:326` 的 `clear()`）。调用点在 `src-main/main.ts:376-381`（`exit_app`）与 `src-main/main.ts:640-648`（`run_update`）——**这两处不改**，只作背景。
- 缺陷：`stopAll` 的 await 期间窗口仍活着、[启动] 仍可点 → 新实例进表 → 被 `clear()` 抹掉而**没被停** → `app.exit(0)` 之后就是孤儿 ConPTY。
- 修法：删掉 `clear()`（`finalize` 已逐个摘除实例，`clear()` 唯一能清掉的恰是「没被停的实例」）；把「取一次快照逐个停」改成**带上限的二轮循环**（例如 `let guard = 0; while (this.instances.size && ++guard <= 64) { … 逐个 stopInternal … }`）。**停止语义一字不改**：终止 → 3s → `taskkill /T /F`；`FORCE_EXIT_WAIT_MS` 不动。
- **必须补测试**（索引 K19 登记过：这两处退出接线没有任何测试保护）：在 `src-main/quick-launch.test.ts` 造一条「`stopAll` 的 await 期间又起一个实例」的用例——用假的进程桩（该文件已有桩基础设施），断言：两轮都被停到、`instances` 最终为空、没有任何实例被静默丢弃（新起那个的 `kill`/`taskkill` 路径被走到）。

## 2. M7：`states()` 从不问进程死活
- 位置：`src-main/quick-launch.ts:304-315`，`running` 只由 `!inst.stopping` 决定。
- 修法：加上 `&& inst.proc.isRunning()`（一行）。**先写失败测试**：进程已退出但 `onExit` 尚未到达 → `states()` 不得报 `running: true`。

## 3. Minor 6：两处已实现但没有测试钉住的分支，各补一条用例（不改实现）
- `src-main/quick-launch.ts:126-129`：`PtyProcess.onExit` 的订阅**晚于进程退出**时要补发退出（不补发就永远停在 running）。
- `src-main/quick-launch.ts:333-345`：`stopInternal` 的早退路径把 `exitCode` 记为 -1 并立即摘实例（双 `stop` 场景）。
- 这两条**只加测试**；若发现它们其实行为有误，停下来报告，不要自行改语义。

## 边界（越界即打回）

- 只改上面两个文件。`src-main/main.ts`、`src-main/process.ts`、`src/**`、词典、`ipc-ql.test.ts` 一字不动。
- 不新增 i18n 键；不 `git add`、不 commit（K5）；不跑 `npm run dev`。
- 现有用例的断言语义不得改，用例数只增不减。

## 门（真实输出贴进回传消息）

1. 先跑基线：`npx vitest run src-main/quick-launch.test.ts` 记下用例数（改前）
2. TDD：每条新用例先红（贴红时的失败摘要），再改实现变绿
3. `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts src-main/quick-launch-config.test.ts` → 全 PASS
4. `npm test` → 47 files 全绿，总数 ≥ 800 + 新增数（基线 800）
5. `npx tsc -p tsconfig.main.json --noEmit` → exit 0；**另跑** `npx tsc --noEmit --strict --target ES2022 --module CommonJS --moduleResolution node --esModuleInterop --skipLibCheck --types node src-main/quick-launch.test.ts` → exit 0（`tsconfig.main.json:15` 排除了 `*.test.ts`，主门覆盖不到测试文件）
6. 变异门（各贴真实结果）：(a) 把 `clear()` 放回去 → 新用例必须红；(b) 去掉 `states()` 里的 `isRunning()` → 新用例必须红；(c) 把二轮循环改成单次快照 → 新用例必须红。全部还原后报两个文件的 `git hash-object`，并确认 `git diff --numstat` 只含这两个文件
7. 卫生门：`npm test` 跑完 4s 后 `(Get-Process notepad -ErrorAction SilentlyContinue | Measure-Object).Count` 必须是 0（A1 刚修好，别把它弄回去）