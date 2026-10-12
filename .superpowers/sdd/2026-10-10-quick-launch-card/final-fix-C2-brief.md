# 修复轮 C2 · 给两条零测试保护的防御分支补用例（只改一个测试文件）

**只改 `src-main/quick-launch.test.ts`。实现文件一字不动**（`src-main/quick-launch.ts` 不许改，开工 hash 是 `fcf262eec9b6f5dcd363fb680301960415a75afc`，交回时必须逐字相同）。

两条分支**已实现、注释专门解释了为什么需要，但没有任何用例喂到**（我与你前面的同事各自独立实测：把它们删掉，`npx vitest run src-main/quick-launch.test.ts` 仍是 `25 passed`）：

1. **C：`PtyProcess.stopGraceful` 对 `handle.kill()` 的 try/catch**（`src-main/quick-launch.ts:125-129`，注释「进程已不在：等 exit 事件落地即可」）。
   用例：让 stub 的 `kill()` 抛异常 → 断言 **可观察后果**：`stop()` 不 reject；exit 事件不落地时仍按 `exitCode = -1` 收尾、实例被摘除、`states()` 不再报它。
2. **D：幂等守卫的 `|| this.stopping` 半边**（`src-main/quick-launch.ts:123`）。
   用例：**并发**对同一实例发起两次停止（`Promise.all` 两个 `stop()`，或第一个停在 await 中时再发第二个）→ 断言只发生一次 `kill()`（计数）、只上报一次退出、不重复 finalize。
   **别与既有 `:440` 那条重复**：那条钉的是**顺序**二次 stop；这条钉的是并发二次进入。

## 写法要求

- 先读实现与既有 stub：本文件已有 `silentStop` / `onStopStart` / `onShellCreated` 这类**可选开关**风格，沿用同一风格加开关，**不得改既有 stub 的默认行为**。
- 断言钉可观察后果（返回值/是否 reject、`exitCode`、`kill` 调用次数、退出上报次数、`states()`），不钉内部字段。
- 若某条分支实际写不出能喂到它的顺序，停下来报告，不要写空断言，也不要顺手改实现。
- 不 `git add`、不 commit（K5）；不跑 `npm run dev`（K33）。

## 门（真实输出贴进回传）

1. 基线：`npx vitest run src-main/quick-launch.test.ts`（应为 25 passed）
2. TDD：新用例先红（贴红摘要），再调到绿
3. `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts src-main/quick-launch-config.test.ts` → 全 PASS（基线 67）
4. `npm test` → 47 files 全绿，总数 ≥ **812** + 新增（基线 812）
5. `npx tsc -p tsconfig.main.json --noEmit` → exit 0；并 `npx tsc --noEmit --strict --target ES2022 --module CommonJS --moduleResolution node --esModuleInterop --skipLibCheck --types node src-main/quick-launch.test.ts` → exit 0（测试文件不在类型门，索引 K39(4)）
6. 卫生门：`npm test` 跑完 4s 后 notepad 计数 = 0
7. 变异门（证新用例有牙）：(a) 把 `:125-129` 的 try/catch 去掉 → C 用例红；(b) 把 `:123` 改成 `if (!this.running) return` → D 用例红。还原后报 `git hash-object src-main/quick-launch.ts src-main/quick-launch.test.ts`（实现必须仍是 `fcf262ee…5afc`）