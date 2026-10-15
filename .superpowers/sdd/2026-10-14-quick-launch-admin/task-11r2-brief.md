# 任务 11（第二轮，R-21）派单说明

## 你要做什么（一句话）

把「提权 PTY 宿主」的启动方式从**硬链接 `node.exe`**改成**应用自己的 exe + Electron 的「应用入口参数」**：`shellExecute('runas', process.execPath, SW_HIDE, parameters)`，其中 `parameters = '"<宿主脚本绝对路径>" "<管道名>" "<token>"'`。

## 为什么（不要跳过这一段，它决定边界）

- 第一版机制（硬链接 `node.exe`）在真机上永远是**应用模式**：Electron 28.3.3 只认 `ELECTRON_RUN_AS_NODE` 环境变量，文件名不起作用；提权进程又不继承调用方环境块 → 那个 `node.exe` 把应用又起了一遍、不连管道、干净退 0（用户真机现象：UAC 点「是」后不出页签，日志 `handshake=exit(code=0)`）。
- 第一轮（R-19）改用「`--ql-pty-host` 开关 + `boot.ts` 转发入口 + 改 `package.json` 的 `main`」。**主代理的本地门把它打回了**（规格 §3-P14，不需要提权就能复现）：打包态下 `lms_launcher.exe --ql-pty-host …` → `bad option: --ql-pty-host`、退出码 9 —— Node 的命令行解析器在跑任何应用代码之前就拒绝未知 `--x`；`-- --ql-pty-host …` 与裸位置参数又被 Electron 当成**应用入口路径**去 require（`Cannot find module …`、退 1）。
- 主代理实测成立的形状（同一批探针）：`lms_launcher.exe "<…\\resources\\app.asar\\dist-main\\ql-pty-host.js>" "\\\\.\\pipe\\x" tok` → **退出码 3**（= 宿主的「管道连不上」码）、stderr 空；接**真实命名管道** → 进程活着等 `HELLO`（说明 `@lydell/node-pty` 已加载、`net.connect` 成功）；探针 `process.argv = [exe, 入口, 管道名, token]`。
- 结论：**「应用入口参数」正是 dev 里 `electron .` 用的那个位置参数**，dev 与打包同一条式子，不需要 `process.defaultApp` 特例。HEAD 上的 `hostScriptPath()` 与 `launch(exe, script, pipeName, token)` **已经是这个形状**，本轮唯一要改的是「起哪个 exe」。

## 起点与基线

- 起点 HEAD = 本轮的文档提交（`fdd30e0` 或其后），工作区干净。第一轮的代码改动已被主代理丢弃。
- 基线（主代理实测）：`npm test` → `Test Files 51 passed (51)` / `Tests 895 passed (895)`。你**不需要**重跑全量基线，但 D5 的收尾全量必须跑。

## 改动范围（越界即不勾，check 表 B 段）

1. `src-main/ql-elevated.ts`：
   - 删 `HOST_EXE_NAME`（`:32`）、`errnoOf`（`:119-123`）、`resolveHostLink`（含它上面的注释块，`:125-156`）、`HostPaths.hostDir`（`:84`）、`const hostDir = ...`（`:164`）。
   - `hostExePath() { return execPath(); }` —— `const execPath = () => paths?.execPath ?? process.execPath;`（`:163`）**原样保留**，它是本轮唯一的测试接缝。
   - `startHost`：删 `:360-368` 的 try/catch（两个路径取值都不再抛），直接 `const exe = launcher.hostExePath(); const script = launcher.hostScriptPath();`。stage 仍然只有 `'pipe'` / `'launch'`。
   - 注释里三处 `hostlink=`（`:47` / `:385` / `:449`）改掉；`HOST_SCRIPT_NAME`（`:33`）保留。
   - **不动**：`hostScriptPath()`、`launch()`（含 `parameters` 的拼法与失败时 `shell.close(r.handle)`）、`isAlive` / `exitCodeOf`、`winPipe` / `pipeKernel`、握手（R-17 的非阻塞有界等待）、读循环、`stopGraceful`、`startElevatedHost` 工厂签名、`hostStartError`$。
2. `src-main/ql-elevated.test.ts`：见 check 表 D1（删 `:141-177` 整条；加 `host_exe_is_the_app_executable` 与 `start_host_passes_the_app_exe_and_script_to_launch`；改写 `launch_failures_close_both_handles` 的场景 2 `:191-203`；五处 `not.toContain('node.exe')` → `not.toContain('lms_launcher.exe')`；删 `:24` 的 `resolveHostLink` import）。`launch_passes_runas_and_three_quoted_arguments`（`:125-139`）与 `hostLauncherStub`（`:326-330`）**一字不改**。
3. `src-main/ipc-ql.test.ts`：只改 `:491` 的假 `hostExePath` 返回值 `'node.exe'` → `'lms_launcher.exe'`。
4. `build.bat`：删掉硬链接块（`:108` 空行 + `:109-128`），保持 `echo.` 在前的结构；删完必须仍是**纯 ASCII + 全 CRLF + 111 行**（用字节级复核取证，别用文本工具改写）。

**不得改**：`src-main/ql-pty-host.ts`、`src-main/ql-host-protocol.ts`、`src-main/main.ts`、`src-main/quick-launch.ts`、`package.json`、词典、渲染端、`electron-builder.yml`、`tsconfig*.json`。
**不得新建**：`boot.ts` / `ql-host-boot.ts` / `parseHostMode` / `hostMain`（第一轮的机械已作废，索引 K61）。

## TDD 顺序（check 表 D 段）

1. 先改测试 → `npx vitest run src-main/ql-elevated.test.ts src-main/ipc-ql.test.ts` 必须**红**（新用例失败），贴真实输出。
2. 实现 → 同一命令**绿**（预期 25 + 27）。
3. `npx tsc --noEmit -p tsconfig.main.json` 干净。
4. `npx vitest run src-main/i18n` 全绿（零新词典键）。
5. `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` 全绿（34 + 27）。
6. `npm test` 全绿：文件数仍 **51**，用例 895 → **897**（删 1 加 2）。
7. 词表取证：`git grep -n "hostlink" -- src-main` 与 `git grep -n "node\\.exe" -- src-main` 都为空（含注释）。
8. `git diff --numstat` 与 `git status --porcelain` 贴进报告。

**D6 / G6（`build.bat` + 本地无 UAC 门）不归你**：打包与真机门由主代理跑（脚本已在 `.temp/ql-admin-probe/`）。

## 交付

- 报告写到 `.superpowers/sdd/2026-10-14-quick-launch-admin/task-11r2-report.md`：先红后绿的完整输出、C1-C7 逐条取证（带文件行号）、E1-E7 → 测试映射、五道门的真实输出与计数对比、偏离与替代方案、疑虑、`git status --porcelain` / `git diff --numstat` / `git grep` 原文。
- check 表 `docs/superpowers/checks/2026-10-14-quick-launch-admin/task-11-host-mode-launch.md` 的 **J 段**（J-1~J-5、J-7 是上一轮的记录，**不要动**；你填本轮的 J 段行：把 J-1~J-5 那几行的「（第一轮，已打回）」保留，另起 J-10 起的新行写本轮命令与真实输出；J-9 归主代理）。A-I 段的勾**不要落**，那是主代理验收时做的事。
- **不要 `git add`、不要 commit**，改动留在工作区等验收。
