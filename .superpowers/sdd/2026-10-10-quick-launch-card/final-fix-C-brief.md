# 修复轮 C · 给两条「已实现但没有测试钉」的分支补用例（只改一个测试文件）

最终审查的 Minor 6：两条分支代码里已实现、注释专门解释了为什么需要，但没有任何用例喂那个顺序。审查原话：「这两项都是『断言能不能失败』的自检，成本各几分钟。」

**只改 `src-main/quick-launch.test.ts`。实现文件一字不动**（`src-main/quick-launch.ts` 与 `src-main/quick-launch-terminals.ts` 都不许改）。

## 要补的两条

1. **`PtyProcess.onExit` 的「注册晚于退出则补发」**（`src-main/quick-launch.ts:126-129`）：构造一个「进程已经退出、之后才调用 `onExit(cb)`」的顺序，断言 `cb` 仍被调用一次且带退出码。注释专门解释了为什么需要它（管理器可能在 `spawn` 返回前就已经收到 exit），没有用例喂这个顺序 = 这段保护可以删掉而全绿。
2. **`stopInternal` 在 `stopGraceful` 早退时把 `exitCode` 记为 -1 并立即摘除实例**（`src-main/quick-launch.ts:333-345`，双 `stop()` 路径）：对同一实例连停两次（或让第一次停在 `stopping` 分支早退），断言最终只 finalize 一次、`exitCode === -1`、`instances` 被摘干净、`states()` 不再报它。

**先取证再写断言**：读这两处的真实实现与既有 fake/stub 的构造方式（本文件里已有 `silentStop` / `onStopStart` / `onShellCreated` 这类可选开关，沿用同一风格加开关，不要改既有 stub 的默认行为）。断言必须钉的是**可观察后果**（回调被调几次、`exitCode`、表里还有没有），不是内部字段。

## 边界

- 只改 `src-main/quick-launch.test.ts`。既有断言一字不改，用例数只增不减（基线 25 条 → ≥27）。
- 不改实现。若发现某条分支**其实不可达**（写不出能喂到它的顺序），停下来报告，不要为了凑数写空断言，也不要顺手改实现。
- 不 `git add`、不 commit（K5）；不跑 `npm run dev`（K33）。

## 门（真实输出贴进回传）

1. 基线：`npx vitest run src-main/quick-launch.test.ts`（应为 25 passed）
2. 变异门（先证「没有用例」）：临时注释掉 `quick-launch.ts:126-129` 的补发保护 → 跑测试，**必须全绿**（这就是补用例前的现状，贴输出）；还原。
3. TDD：新用例先红（贴红摘要），再实现/调整到绿。注意：**不许改实现**，所以「红」只能来自新用例本身写错或 stub 不喂那个顺序——若两条新用例在现有实现下直接绿，就用第 2 步那种「删掉保护 → 红」的变异来证明它们有牙（贴出变异后红的用例名）。
4. `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts src-main/quick-launch-config.test.ts` → 全 PASS
5. `npm test` → 47 files 全绿，总数 ≥ **812** + 新增（基线 812）
6. `npx tsc -p tsconfig.main.json --noEmit` → exit 0；并 `npx tsc --noEmit --strict --target ES2022 --module CommonJS --moduleResolution node --esModuleInterop --skipLibCheck --types node src-main/quick-launch.test.ts` → exit 0（测试文件不在类型门，索引 K39(4)）
7. 卫生门：`npm test` 跑完 4s 后 notepad 计数 = 0
8. 变异门（证新用例有牙）：(a) 删 `:126-129` 补发 → 新用例①红；(b) 把 `:346-349` 的 `exitCode = -1` 改成不记（或去掉 finalize）→ 新用例②红。全部还原后报 `git hash-object src-main/quick-launch.ts src-main/quick-launch.test.ts`（实现文件必须与开工前逐字相同）