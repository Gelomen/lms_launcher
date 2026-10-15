# 任务 11 · 宿主启动机制重做：应用 exe 的「宿主模式」— check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 11 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §1 / §3-P13 / §6.4 / §6.6-1 / §6.10 / §6.11 / §7.1 / §7.2 / §8-K2、K12、K13 / §9-R5、R6、R10
> 前置：任务 1–10 全部已提交（任务 9/10 的真机门一路打回本机制）
> 来源（用户真机，2026-10-15 18:0x-18:4x）：「[命令行] + 管理员 → UAC 点「是」→ 不出页签、应用卡死」（任务 10 修掉卡死后变成 `handshake=exit(code=0)`）；用户手动验证「`.\node.exe "resources\app.asar\dist-main\ql-pty-host.js" …` **把应用启动了**」
> 现状锚点（本表生成时实测，2026-10-15 18:5x）：`src-main/ql-elevated.ts`：`HOST_EXE_NAME` `:32`、`HostLauncher` `:45-54`、`resolveHostLink` `:127-156`、`createHostLauncher` `:157-179`、`startHost` `:341-370`；`src-main/ql-pty-host.ts`：`main()` `:195-211`；`package.json`：`main = dist-main/main.js`；`build.bat`：硬链接块 `:108-128`；`src-main/ipc-ql.test.ts`：`:446` / `:491-492` / `:523`；`src-main/ql-elevated.test.ts`：`:137-170`（`hostScriptPath` + 4 条 `resolveHostLink`）、`:329-330`（假 launcher）
> 测试基线（主代理 2026-10-15 18:4x 实测）：`npm test` → `Test Files 51 passed (51)` / `Tests 895 passed (895)`
> 索引：[00-index.md](00-index.md) 的 G1、G2、G3、G7、K12（修订）、K13（作废）、K20/K21/K55（作废）、K48（词表变更）、**K59**、**K60**

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 任务 10 已提交、工作区干净 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 10 的验收提交；porcelain 干净 | ☐ |
| A2 | 全量基线（主代理实测，子代理不重跑） | `npm test` | `Test Files 51 passed (51)` / `Tests 895 passed (895)`，exit 0；本任务后用例数只增不减 | ☑（主代理 2026-10-15 18:4x 实测：51 files / 895 tests 全绿） |
| A3 | 本表引用的锚点行号属实 | 读上表点名的每一处 | 与本表引用一致 | ☐ |
| A4 | 前置接口在（签名逐字可用） | `shell-execute.ts` 的 `shellExecute(file, nShow, opts?: {verb?, parameters?})`；Electron 的 `process.defaultApp`；`ql-pty-host.ts` 导出 `runHost` | 可用；不可用就停下来报告，不要自己补 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/ql-host-boot.ts` | **新建**：纯函数 `parseHostMode(argv)` | 只此一个导出；不 import electron、不 import `./ql-pty-host`、无副作用 | ☐ |
| B2 | `src-main/boot.ts` | **新建**：打包入口转发器（宿主模式 → `hostMain`；否则 `require('./main')`） | 宿主模式分支**绝不** `require('./main')`；不 import electron | ☐ |
| B3 | `package.json` | 改：`main` → `dist-main/boot.js` | **只改这一行**；依赖段与 scripts 一字不动（G7） | ☐ |
| B4 | `src-main/ql-elevated.ts` | 改：删 `HOST_EXE_NAME` / `resolveHostLink` / `hostExePath` / `hostScriptPath`；`HostLauncher` 换成新签名；`startHost` 去掉路径解析 | `winPipe` / `pipeKernel` / 握手（R-17/C8）/ 读循环 / `stopGraceful` / `startElevatedHost` 工厂签名一律不动 | ☐ |
| B5 | `src-main/ql-pty-host.ts` | 改：加 `export function hostMain(argv: string[])`；`main()` = `hostMain(process.argv.slice(2))` | `runHost` / 帧协议 / 留痕 / 退出码（R-18）一行不改 | ☐ |
| B6 | `build.bat` | 改：删掉 R-16 的硬链接块（`:108-128`） | 删完必须仍是**纯 ASCII + 全 CRLF + 111 行** | ☐ |
| B7 | `src-main/ql-host-boot.test.ts`（新）、`src-main/ql-elevated.test.ts`、`src-main/ql-pty-host.test.ts`、`src-main/ipc-ql.test.ts` | 改：按 D1 清单增删用例；假 launcher 接缝对齐新签名 | 与本次无关的既有断言一字不改 | ☐ |
| B8 | `src-main/main.ts`、`src-main/ql-host-protocol.ts`、`src-main/quick-launch.ts`、词典、渲染端、`electron-builder.yml` | **不改** | 越界即不勾（`main.ts` 一字不改是本任务的关键收益：所有既有行号锚点继续有效） | ☐ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | `parseHostMode` | `export function parseHostMode(argv: string[]): { pipeName: string; token: string } \| null`：找到**第一个** `'--ql-pty-host'` 的下标 `i`，取 `argv[i + 1]` / `argv[i + 2]`；两者都存在且非空 → 返回对象；标志不存在、或任一参数缺失/为空 → `null`。**不靠固定下标**（Chromium 可能追加自己的开关） | ☐ |
| C2 | 入口分流 | `boot.ts`：`const req = parseHostMode(process.argv);` → 命中时 `require('./ql-pty-host').hostMain([req.pipeName, req.token])`（**不 import `./main`、不碰 electron `app`、不建窗/托盘/IPC/单实例锁**）；否则 `require('./main')` | ☐ |
| C3 | 打包入口 | `package.json` 的 `"main"` = `"dist-main/boot.js"` | ☐ |
| C4 | `HostLauncher` 新签名 | `hostExePath(): string`（= `process.execPath`）、`hostParameters(pipeName: string, token: string): string`、`launch(pipeName: string, token: string): { ok: boolean; handle: unknown; win32Error: number }`、`isAlive(handle: unknown): boolean`、`exitCodeOf(handle: unknown): number`；**`hostScriptPath` 删除** | ☐ |
| C5 | 参数串逐字 | 打包：`'"--ql-pty-host" "' + pipeName + '" "' + token + '"'`；dev（`process.defaultApp === true`）：最前面再补 `'"' + path.resolve(process.argv[1]) + '" '`（绝对路径——提权进程的 cwd 不保证是调用方目录） | ☐ |
| C6 | `launch` 的 Win32 形状 | `shell.shellExecute(this.hostExePath(), SW_HIDE, { verb: 'runas', parameters })`：`nShow` 仍 `SW_HIDE(0)`、`fMask` / `lpDirectory` 不变；失败时防御性 `shell.close(r.handle)` 保留 | ☐ |
| C7 | `startHost` 的 stage | 只剩 `'pipe' \| 'launch'`：管道建不出来 → `stage:'pipe'`（`pipe=create`）；`ShellExecuteEx` 失败 → `stage:'launch'`（`win32=1223` = UAC 取消，路径不变）。**`hostlink=` 族不再存在** | ☐ |
| C8 | `hostMain` | `export function hostMain(argv: string[]): void`：`argv[0]` = 管道名、`argv[1]` = token（其余逻辑与现 `main()` 逐字相同，含 R-18 的 `stage='fatal'` + `exit(4)`）；`main()` 保留为 `hostMain(process.argv.slice(2))` | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先改测试 | `npx vitest run src-main/ql-host-boot.test.ts src-main/ql-elevated.test.ts src-main/ql-pty-host.test.ts` | 新用例红（`parseHostMode` 不存在、`launch` 还是旧签名、`hostMain` 不存在）；删掉 `resolveHostLink` / `hostScriptPath` 那 5 条后总量下降 | ☐ |
| D2 | 实现 B1-B6 | 同上 | 全绿 | ☐ |
| D3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净、无输出 | ☐ |
| D4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿（本任务零新键） | ☐ |
| D5 | 全量 | `npm test` | 全绿；文件数 51 → **52**（新增 `ql-host-boot.test.ts`），用例只增不减 | ☐ |
| D6 | **本地无 UAC 门**（R-19 / §9-R10，主代理跑） | 先 `cmd /c build.bat`，再 `Start-Process dist-release\win-unpacked\lms_launcher.exe -ArgumentList '--ql-pty-host','\\.\pipe\x','tok' -Wait -PassThru` | **不出现窗口**；`ExitCode = 3`；`%TEMP%\lms-ql-host.log` 多一行含 `stage=pipe`。这是「宿主模式真的被接管」的唯一直接证据 | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试 / 取证守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | `parseHostMode` 按**位置**解析，标志在首/在尾/中间夹 Chromium 开关都对 | 规格 §6.4-3 / R-19 | `ql-host-boot.test.ts`：`parses_the_flag_at_any_position` | ☐ |
| E2 | 标志在但参数缺失/为空 → `null`（绝不误跑成宿主） | 规格 §6.4-3 | `ql-host-boot.test.ts`：`returns_null_when_arguments_are_missing` | ☐ |
| E3 | 参数串逐字 = `"--ql-pty-host" "<pipe>" "<token>"` | 规格 §6.4-1 / C5 | `ql-elevated.test.ts`：`host_parameters_carry_the_flag_pipe_and_token` | ☐ |
| E4 | dev（`process.defaultApp === true`）参数串最前面补**绝对**应用目录 | 规格 §6.4-1 / C5 | `ql-elevated.test.ts`：`dev_mode_prepends_the_absolute_app_path` | ☐ |
| E5 | 硬链接族彻底消失：`startHost` 只有 `pipe` / `launch` 两个 stage，`hostlink=` 不再出现 | 规格 §6.10 / §9-R5、R6 | `ql-elevated.test.ts`：`start_host_no_longer_resolves_a_hard_link` + `git grep hostlink` 为空 | ☐ |
| E6 | 「宿主模式真的被接管、没有又起一遍应用」 | 规格 §9-R10 | **D6 本地无 UAC 门**（无窗口 + 退出码 3 + 留痕 `stage=pipe`） | ☐ |
| E7 | 宿主入口行为不变：`hostMain` 与 `runHost` 的帧序 / 退出码 / 留痕与任务 10 一致 | 规格 §6.6 / R-18 | `ql-pty-host.test.ts` 既有 8 条 + 新增 `host_main_takes_explicit_argv` | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 错误前缀只用 `PROC:`；**零新词典键**（G1 / G2） | 索引 G1 / G2 | ☐ |
| F2 | 帧协议 / `ql-host-protocol.ts` / `HELLO`→`READY` 流程一行不改 | 索引 G3 | ☐ |
| F3 | `main.ts` 一字不改（既有行号锚点全部继续有效） | 规格 §6.4-3 | ☐ |
| F4 | 不新增依赖、不改依赖段（`boot.ts` 只用 `node:path` + 本项目模块；`parseHostMode` 零依赖） | 索引 G7 | ☐ |
| F5 | `build.bat` 删块后仍是**纯 ASCII + 全 CRLF**（逐字节复核） | 规格 §6.11 + 任务 9 口径 | ☐ |
| F6 | 不新增 extraFile、不改 `electron-builder.yml`（宿主脚本仍随 `dist-main/**` 进 asar） | 索引 G7 / 规格 §6.11 | ☐ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/ql-host-boot.test.ts src-main/ql-elevated.test.ts src-main/ql-pty-host.test.ts` | 全绿 | ☐ |
| G2 | 相邻回归（提权路径的调用方） | `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` | 全绿（34 + 27） | ☐ |
| G3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☐ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿 | ☐ |
| G5 | 全量 | `npm test` | 全绿；文件数 51 → 52、用例只增不减 | ☐ |
| G6 | **本地无 UAC 门** | 见 D6 | 无窗口 / 退出码 3 / 留痕 `stage=pipe` | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/ql-host-boot.ts`、`src-main/boot.ts`、`src-main/ql-host-boot.test.ts`、`src-main/ql-elevated.ts`、`src-main/ql-elevated.test.ts`、`src-main/ql-pty-host.ts`、`src-main/ql-pty-host.test.ts`、`src-main/ipc-ql.test.ts`、`package.json`、`build.bat` | ☐ |
| H2 | commit message 逐字 | `fix: 提权宿主改用应用 exe 的宿主模式启动（R-19，硬链接机制退场）` | ☐ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☐ |

## I. 完成判据

- [ ] A1-A4 成立
- [ ] B1-B7 之外没有文件被改（B8 确认未动）
- [ ] C1-C8 逐字一致
- [ ] D1→D6 先红后绿 + D6 本地门通过
- [ ] E1-E7 有对应测试或取证且绿
- [ ] G1-G6 全绿
- [ ] J 段有真实输出

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-0 | 主代理 P13 取证（2026-10-15 18:5x，规格 §3-P13） | 打包后的 `dist-release\win-unpacked\node.exe` + 写标记文件的探针：**带 `ELECTRON_RUN_AS_NODE=1` → marker=True（真 Node）**；**删掉该变量 → marker=False、进程 5s 后仍活着（= 应用模式，脚本没跑）**。旧探针自己设过该变量（`.temp/ql-admin-probe/probe1.mjs:58`、`probe2.mjs:53`），本会话环境也预置了它 → P5/P8 的「按文件名进 Node 模式」是环境变量造成的误判。用户真机手动跑 `.\node.exe <脚本>` **把应用启动了**，三次观测一致 |
| J-1 | `npx vitest run src-main/ql-host-boot.test.ts src-main/ql-elevated.test.ts src-main/ql-pty-host.test.ts` |  |
| J-2 | `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts` |  |
| J-3 | `npx tsc --noEmit -p tsconfig.main.json` |  |
| J-4 | `npx vitest run src-main/i18n` |  |
| J-5 | `npm test` |  |
| J-6 | 本地无 UAC 门（D6） |  |
| J-7 | `build.bat` 删块后的编码复核 |  |
