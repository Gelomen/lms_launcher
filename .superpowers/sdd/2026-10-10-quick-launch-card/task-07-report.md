# 任务 7 报告 · `exit_app` 停止全部终端

> 计划 §任务 7 · 规格 §7.5（应用退出行，K17 扩展）· check 表 `task-07-exit-app-stop-all.md`（J 段已填真实输出）
> HEAD 起点 `86aeb19`；改动留在工作区，**未 `git add`、未 commit**（口径 K5）。

## 0. 状态

**DONE_WITH_CONCERNS** —— 两条退出路径都已停终端，定向与全量回归全绿（`npm test` 741 passed）；两条疑虑：① check 表 D2 的「新用例 FAIL」在本任务结构上不成立（任务 5 已实现该语义），我用变异自检替代并如实记录，没有伪造红；② G3 真机门本环境起不了应用，按简报推到任务 14。详见 §4、§5。

## 1. 改了什么（前后对照）

| 文件 | 动作 | 位置 |
|---|---|---|
| `src-main/main.ts` | 修改 `exit_app` 与 `run_update`：各插入一行 `await ql.stopAll(3)`（+各 2 行注释） | 现 :376-383 / :645-649 |
| `src-main/quick-launch.ts` | **未改动**（B2 结论见 §2） | — |
| `src-main/quick-launch.test.ts` | 新增 3 条用例 + `FakeShell` 的两个测试开关 | :32-37、:50-54、:62-63、:312-365 |

### 1.1 `exit_app`（原 :376-380 → 现 :376-383）

```ts
// 前
ipcMain.handle('exit_app', async (): Promise<void> => {
  stopGpuStats();
  await ps.stopGraceful(3);
  app.exit(0);
});
// 后
ipcMain.handle('exit_app', async (): Promise<void> => {
  stopGpuStats();
  await ps.stopGraceful(3);
  // 规格 §7.5 / 索引 K17：app.exit 不触发 will-quit（:53-54），conpty/cmd 是独立进程、父进程退出不会带走它们
  // → 必须在 app.exit 之前停掉全部快捷启动终端，否则就是孤儿 PTY（审查重点 R3）。超时与 llama-server 同口径 3s。
  await ql.stopAll(3);   // :381
  app.exit(0);           // :382
});
```

### 1.2 `run_update`（原 :642-644 → 现 :645-649）

```ts
// 前
  await ps.stopGraceful(3);
  await new Promise((resolve) => setTimeout(resolve, 3000)); // 等任务拉起脚本落地…
  app.exit(0);
// 后
  await ps.stopGraceful(3);                                            // :645
  // 同上（索引 K17）：run_update 也是显式 app.exit(0)，漏掉就是孤儿 PTY（R3）。放在 ps.stopGraceful 之后与 exit_app 同构。
  await ql.stopAll(3);                                                 // :647
  await new Promise((resolve) => setTimeout(resolve, 3000)); // 不变   // :648
  app.exit(0);                                                         // :649
```

`git diff -- src-main/main.ts` 只有两个 hunk（`@@ -376,6 +376,9 @@`、`@@ -640,6 +643,8 @@`）；`stopGpuStats()`、`ps.stopGraceful(3)`、`setTimeout(3000)`、`app.exit(0)` 一字未改（F2）。

## 2. B2：`QuickLaunchManager.stopAll` 无需改动 —— 结论与证据

先读代码取证，逐条对照 B2/C1/E1/E4/F4 的要求与现状：

| B2 / 契约要求 | 现状（`src-main/quick-launch.ts`） | 判定 |
|---|---|---|
| 逐个 await（串行，不得 `Promise.all`） | :321 `for (const configId of Array.from(this.instances.keys()))` + :323 `await this.stopInternal(...)` | 已满足 |
| 吞掉单点异常、不中断其余 | 双层：:322-326（`stopAll` 层）+ :336-340（`stopInternal` 层，停失败也收尾） | 已满足 |
| 空表直接返回 | :321 的循环对空 Map 不进入；:334 `if (!inst) return;` 兜住未运行/不存在的 configId | 已满足 |
| 透传 `timeoutSecs`（K11(1)） | :323 把参数交给 :332 的 `stopInternal(configId, timeoutSecs = STOP_TIMEOUT_SECS)`；默认值只在 `stop()` 路径生效 | 已满足（任务 5 修复轮 1 落地的） |

证据两条：① 最终 `git diff --stat -- src-main/quick-launch.ts` 无输出（一字未改）；② 三处临时变异（§4.2）分别让新用例变红 —— 说明「已满足」是被测试钉住的事实，不是我的猜测。

## 3. E1–E5 对应证据

| # | 落点 | 证据 |
|---|---|---|
| E1 空表 / 未运行的 configId 不抛错 | 新用例 `stopAll 对空表与未运行的配置都不抛错（幂等）`（`quick-launch.test.ts:315-332`） | 断：空表 `stopAll(3)` 后 `vi.getTimerCount() === 0`（不排任何计时器）；`stop('nope')` 不抛错；二次 `stopAll` 不重复发 `onExit`；自动命令的 5s 兜底计时器被清掉 |
| E2 每个实例都收到 `stopGraceful(timeoutSecs)` | 复用任务 5：`quick-launch.test.ts:300-310`（`stopAll(7)` → shell 与 exe 都收到 `[7]`）、:272-285（默认 3s） | 未造同义用例。「杀进程树」在生产侧：`quick-launch.ts:126-141`（`kill → 超时 → taskkill /T /F -PID`）与 `process.ts:71-92`（exe 侧，G4 不可改） |
| E3 `stopAll` 后 `states()` 为空 | 复用任务 5 :307；新用例 :346-347、:363 也各断一次 | — |
| E4 单点失败不中断其余 | 新用例 `stopAll：单个实例 stopGraceful 抛错不影响其余实例`（:336-348） | 第一个 `stopGraceful` 抛 `'stop boom'` → 第二个仍收到 `[3]`；两个都上报退出、`states()` 清空（失败的那个不卡在 stopping） |
| E5 `run_update` 也停了终端 | `git diff` hunk `@@ -640,6 +643,8 @@` | 走查：:645 `ps.stopGraceful(3)` → :647 `ql.stopAll(3)` → :648 `setTimeout(3000)` → :649 `app.exit(0)`，与 C3 逐字一致。按简报未为 `run_update` 造测试（要 mock 计划任务与安装目录文件存在性，属既有未覆盖区） |
| F4 串行（额外钉住） | 新用例 `stopAll 逐个 await：前一个未返回前不得开始停下一个`（:351-365） | 第一个 `stopGraceful` 挂起时，第二个 `stopArgs` 必须为空；放行后才继续 |

## 4. TDD 的真实过程（含「为什么没有红」）

### 4.1 D1 → D2：新用例首跑即绿，没有红

命令：`npx vitest run src-main/quick-launch.test.ts`（HEAD 上、只加了用例）

```
✓ src-main/quick-launch.test.ts (20 tests) 288ms
Test Files  1 passed (1)
     Tests  20 passed (20)
```

原因：本任务唯一的新行为在 `main.ts`（两处退出接线），而 check 表对它的判据是 E5 的 diff 走查、不要求测试；`quick-launch.test.ts` 里的 E1/E4 断言的是 `stopAll` 语义，而那份语义已由任务 5 落地（§2）。所以 D2 的「新用例 FAIL」在结构上不可能出现。我**没有**为了凑一个红去改 `quick-launch.ts`（简报第 2 条正是防这个），也没有伪造输出。

### 4.2 替代做法：变异自检，证明三条新用例真的有牙

沿用任务 5 表 J 段「反向自检」的做法。对 `quick-launch.ts` 做临时变异 → 跑同一命令 → 逐条还原：

| 变异 | 真实输出 | 红的是哪条 |
|---|---|---|
| P1 去掉 :334 的 `if (!inst) return` | `Tests 2 failed \| 18 passed (20)` | 新用例「stopAll 对空表…幂等」+ 任务 5 的 E8 |
| P2 去掉 :336-340 吞 `stopGraceful` 异常 | `Tests 1 failed \| 19 passed (20)` | 新用例「单个实例 stopGraceful 抛错不影响其余实例」 |
| P3 把 :321-327 改成 `Promise.all` | `Tests 1 failed \| 19 passed (20)` | 新用例「逐个 await」 |

还原后 `git diff --stat -- src-main/quick-launch.ts` 无输出。

### 4.3 D3 → D4

- D3：`main.ts` 两处插入（§1）。
- D4：`npx vitest run src-main/quick-launch.test.ts` → `Tests 20 passed (20)`。

### 4.4 回归门（全部真跑）

| 门 | 命令 | 真实结果 |
|---|---|---|
| G1 | `npx vitest run src-main/quick-launch.test.ts src-main/process.test.ts` | `Tests 25 passed (25)`（20 + 5） |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无诊断，`TSC_EXIT=0` |
| V2 | `npx vitest run src-main/ipc-ql.test.ts src/App.test.ts` | `Tests 71 passed (71)`（任务 6 的 23 条形状门仍绿） |
| V4 | `npx vitest run src-main/i18n src/i18n.test.ts` | `Tests 22 passed (22)`（未新增 i18n 键） |
| 额外 | `npm test` | `Test Files 44 passed (44)` / `Tests 741 passed (741)` |

G4 核对：`git status --porcelain` 只有 `src-main/main.ts`、`src-main/quick-launch.test.ts`（+ 我填的 check 表）；`src-main/process.ts` / `process.test.ts` 未出现在改动里。

## 5. G3 真机门的真实情况

### 5.1 真跑了，应用起不来（两条都复现）

`npm run dev`：

```
[dev:vite]   VITE v6.4.3  ready in 215 ms
[dev:electron] Waiting for localhost:1420..
[dev:electron] Connected!
[dev:electron] D:\Dev\Projects\lms_launcher\dist-main\main.js:87
[dev:electron] if (!electron_1.app.requestSingleInstanceLock()) {
[dev:electron] TypeError: Cannot read properties of undefined (reading 'requestSingleInstanceLock')
[dev:electron] Node.js v18.18.2
[dev:electron] npm run dev:electron exited with code 1
```

原因：本环境的 shell 继承 `ELECTRON_RUN_AS_NODE=1`（实测 `ELECTRON_RUN_AS_NODE=[1]`），`require('electron')` 返回 npm stub。去掉该变量再 `npx electron .`：`ELECTRON_EXIT=-2147483645` = `0x80000003`（STATUS_BREAKPOINT）—— 与规格 §13.2、任务 6 的复现一致。

**结论：G3 不勾，按简报推到任务 14（真机验收）。** 我没有用「逻辑上不会残留」代替实测。

### 5.2 能测的那一半我实测了（真 ConPTY，非 G3 本身）

G3 的实质风险是 R3（孤儿 PTY）。应用 UI 驱动不了，但「`stopAll` 到底杀不杀得掉真 ConPTY 进程」可以真跑：把主进程源码编译到临时目录（`npx tsc -p tsconfig.main.json --outDir .temp/task07-build`），用**真** `QuickLaunchManager` + 真 node-pty 起终端，再用 `tasklist` 做进程表 diff（脚本：`.temp/task07-probe.cjs`、`.temp/task07-probe2.cjs`，`.temp` 已被 gitignore）：

```
start t1 → {"tabId":"ql:t1"}   start t2 → {"tabId":"ql:t2"}   start t3 → {"tabId":"ql:t3"}
新增进程 = 5  conhost.exe:20428 | conhost.exe:9304 | cmd.exe:9728 | cmd.exe:19688 | tasklist.exe:14276
states() = {"t1":{"running":true,...},"t2":{...},"t3":{...}}
stopAll(3) 用时 ms = 318
onExit 上报 = t1=-1073741510, t2=-1073741510, t3=-1073741510
states() = {}
stopAll 后残留 = 0（第二次探针里唯一多出来的是它自己调用的 tasklist.exe）
```

读法：真 `cmd.exe` 与它的 `conhost.exe` 确实起来了，`stopAll(3)` 之后全部消失；退出码 `0xC000013A`（STATUS_CONTROL_C_EXIT）说明走的是优雅终止、没到 `taskkill` 强杀，所以 318ms 就结束（不是 3s+1s 的上界）。这条**只**支撑「`stopAll` 真能清干净真实进程」，不替代 G3 的「应用退出后无残留」。

## 6. 自审与疑虑

1. **D2 没有红（已如实记录，不伪造）。** check 表 D2 的预期「新用例 FAIL」与现状不符：本任务的新行为在 `main.ts`，而表对它的判据是 E5 的 diff 走查；`quick-launch.test.ts` 里的新用例是**特征化用例**（钉住任务 5 已实现的语义）。我用 §4.2 的三处变异给出真实的红/绿计数。**建议主代理**：把 D2 行的预期改成「首跑即绿 + 变异自检红」的口径，或按流程在 `00-index.md` K 组登记一行（我按指示没有改 A-I 段）。
2. **第三处 `app.exit(0)`（`main.ts:56`，单实例锁失败）没加 `stopAll`，是刻意的。** K17 写「所有显式 `app.exit(0)` 路径」，实测共三处；:56 在模块求值期就退出，那时 `ql`（:1080）还没构造、也没有窗口/渲染端能调 `ql_start` → 不可能存在 PTY（真去调还会踩 TDZ）。**建议**给 K17 补一句「:56 除外（构造前退出）」，免得后续整分支审查把它当成漏了一处。
3. **Minor（未改，留给最终整分支审查）：`stopAll` 末尾的 `instances.clear()` 有理论竞态。** :321 先快照 keys、逐个 await；若这期间有新的 `start` 完成，末尾的 `clear()` 会把它从表里摘掉而**不停它** → 又一个孤儿 PTY。真机退出路径上 `exit_app` 之后紧跟 `app.exit(0)`，不会再有 `ql_start`，所以到不了；修它要动任务 5 已审的停止语义 → 按「不扩范围」没动，只登记。
4. **F4 的代价（按要求承认，并给了实测数据）：** 串行停止的退出耗时上界 = N ×（`timeoutSecs` + `FORCE_EXIT_WAIT_MS`=1s）≈ 每个实例 4s，`exit_app` 与 `run_update` 都串行付这个代价。§5.2 实测 3 个真实终端只用了 318ms（优雅终止即生效），上界只在进程不响应终止信号时才出现。若真机不可接受，得回来改口径（不是本次范围）。
5. **`run_update` 里 `stopAll` 在 `setTimeout(3000)` 之前**（C3 逐字），所以该路径的退出时间 = stopAll 上界 + 3s。若嫌慢，把 `stopAll` 挪到 `setTimeout` 之后、`app.exit` 之前也不违反 F1。当前严格按 C3 执行，改动留给主代理决定。
6. **一处可能算越界的 additions：** 第 3 条用例（:351 串行）超出 B3 字面的「追加幂等用例」，它钉的是本任务 F4 硬约束。若主代理认为越界，删掉该用例即可，另两条不受影响（我倾向保留：F4 是表里唯一没有测试保护的硬约束）。
7. **临时产物：** `.temp/task07-build/`（`tsc --outDir` 的编译产物）、`.temp/task07-probe.cjs`、`.temp/task07-probe2.cjs`。`.temp` 被 gitignore，不进工作区改动；要清就删这三样。

## 7. 复跑命令清单

```
npx vitest run src-main/quick-launch.test.ts            # D2/D4：20 passed
npx vitest run src-main/quick-launch.test.ts src-main/process.test.ts   # G1：25 passed
npx vitest run src-main/ipc-ql.test.ts src/App.test.ts  # V2：71 passed
npx vitest run src-main/i18n src/i18n.test.ts           # V4：22 passed
npx tsc -p tsconfig.main.json --noEmit                  # G2：无错
npm test                                                # 全量：741 passed
npm run dev                                             # G3：本环境 Electron 起不来（见 §5.1）
npx tsc -p tsconfig.main.json --outDir .temp/task07-build && node .temp/task07-probe.cjs   # §5.2 真 PTY 取证
```

## 8. 未执行（按口径留给主代理）

- H1 `git add src-main/main.ts src-main/quick-launch.ts src-main/quick-launch.test.ts`（注意：`quick-launch.ts` 实际无改动，暂存它是个空操作 —— 主代理按 H 段执行时只需前两个文件 + 本 check 表）
- H2 `git commit -m "feat(main): exit_app 一并终止所有快捷启动终端"`（逐字，未执行）
