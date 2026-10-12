# 修复轮 A1 · 只改一个文件：`src-main/ipc-ql.test.ts`（测试卫生）

**不要读 `00-index.md` 与 `final-review.md` 全文**（太长，会把上下文吃光）。本简报就是全部所需信息。

## 要做的两件事

**(1) M10：去掉手维护的清理清单。** `src-main/ipc-ql.test.ts:171-174` 的 `KNOWN_STARTED_IDS` 是硬编码 8 个 id，新增用例会静默不清理。改成自动记录：在该文件已有的 `invoke()` 包装里加 `if (name === 'ql_start') startedIds.add(String(args[0]))`；`afterAll`（`:176-187`）改用 `startedIds` 逐个 `ql_stop`（保持原有吞异常语义）。

**(2) M23：兜住「Windows 11 记事本被强杀后自我再生」。** 根因我已取证，不用你再验：本文件用真 `notepad.exe` 当 exe 样本（`:219/:293-294/:333/:411-412`）；`ql_stop` 的 `child.kill(SIGTERM)` 确实杀掉了被跟踪 PID，但 Windows 11 打包版记事本会**自己重启**，新进程命令行带 `/SESSION:`、父 PID 就是刚被杀掉的那个，不在我们的实例表里 → 每跑一次漏一个空白窗口。
- **不要换样本进程**（我实测过：`spawnExe` 走 `p.launch(exe, [], configId)`，**不带参数**；无参数的 `cmd.exe` 立即退出（code 0）、无参数的 `ping.exe` 退出（code 1），都当不了「常驻 exe 样本」；而 D6a 的价值恰恰是真实进程 + 真实 `ProcessState`（K13）。
- 改法：在 `afterAll` 里做**精确清理**——文件开头快照一次 notepad 的 PID 集合（用 `execFileSync('tasklist', ['/FI', 'IMAGENAME eq notepad.exe'])` 解析即可，别引新依赖）；`ql_stop` 全部跑完后等约 1.5s，再对**不在快照里**的 notepad PID 逐个 `taskkill /F /PID`（吞异常）。只清测试自己造出来的窗口，不碰用户开着的记事本。
- 注释写清为什么需要这一步（机制见索引 M23），不要写成泛泛的「兜底清理」。

## 边界

- **只改 `src-main/ipc-ql.test.ts`。** 其他文件（含 `src-main/quick-launch.ts`、`src-main/main.ts`、`src/**`、词典）一字不动。
- 断言语义一字不改：exe 类型仍 `tabId = null`、仍断不调 `detectTerminals`、`ql_states` 仍含该条、`get_state` 不受影响（K13 的反证）。用例数不得减少。
- 不 `git add`、不 commit（K5）。不跑 `npm run dev`。

## 门（真实输出贴进回传消息，不必写报告文件）

1. 先跑一次 `npx vitest run src-main/ipc-ql.test.ts` 记下改前基线用例数与「跑完 notepad 计数 ≥ 1」的对照
2. 改后 `npx vitest run src-main/ipc-ql.test.ts` → 全 PASS，用例数与基线一致
3. `npm test` → 47 files 全绿（基线 800 passed，不得减少）
4. `npx tsc -p tsconfig.main.json --noEmit` → exit 0
5. **卫生门**：给出 `npm test` 跑前与跑后的 notepad 计数两个数（跑后必须是 **0**）
6. 变异门：把新加的 notepad 清理注释掉 → 卫生门必须变红（计数 ≥ 1）；去掉 `startedIds` 记录那行 → 依赖它的清理必须失效。还原后报该文件 SHA，且 `git diff --numstat` 只含这一个文件。