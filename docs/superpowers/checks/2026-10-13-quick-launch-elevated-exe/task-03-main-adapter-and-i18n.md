# 任务 3 · `main.ts` 适配器接线 + 新词典键 + `ipc-ql.test.ts` 两处改写 — check 表

> 计划：[2026-10-13-quick-launch-elevated-exe.md](../../plans/2026-10-13-quick-launch-elevated-exe.md) §任务 3 · 规格：[2026-10-13-quick-launch-elevated-exe-design.md](../../specs/2026-10-13-quick-launch-elevated-exe-design.md) §6.1 / §6.5 / §6.6 / §7.1 / §8-K6 · 关联审查重点 **R1 / R3 / R6**（索引 R 组）
> 前置：任务 2（消费其导出；索引清单表第 15 行）
> 现状锚点（本表生成时实测）：`src-main/main.ts:1038-1052`（旧口径注释块）、`:1053-1074`（`spawnExeProcess`）、`:1084`（接线）、`:1012`（`qlStartContext` 槽）、`:1022-1027`（`qlStartContextOrThrow`）、`:64`（`ps` 单例）、`:13`（`ProcessState` import）、`:1067`（旧 `emitLog(error,'sys')`）；`src-main/i18n/dict.ts:299`（zh）/ `:641`（en）；`src-main/ipc-ql.test.ts:101-103` / `:324-344` / `:346-357` / `:423-468`；`src-main/quick-launch.ts:5-6`（注释）/ `:171`（签名）；`src/App.vue:456-482`（`:464` 预置红「...」、`:477-478` catch → `clearQlState`）；`tsconfig.main.json` 无 `noUnusedParameters`
> 索引：[00-index.md](00-index.md) 的 G1-G3、G5、G8-G11、K2 / K6 / K7 / K9

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 起点 = 任务 2 已提交 | `git log --oneline -2`；`git status --porcelain` | HEAD 链含任务 2 的 `feat(main): shell-execute.ts …` 提交；无已跟踪改动 | ☐ |
| A2 | 全量基线（索引 G9：由主代理实测，子代理不重跑） | `npm test` | 起点应为 48 / 834（任务 2 之后）；本任务不增不减用例，收尾仍 48 / 834 | ☑（基线由主代理实测 2026-10-13 19:25：`Test Files 47 passed (47)` / `Tests 826 passed (826)`，exit 0 —— 规格 E18。任务 2 之后的 48 / 834 是 plan 步骤 5 的预期，尚未实测 → 在 G5 行取证） |
| A3 | 锚点行号属实 | 读 `main.ts:1038-1074` / `:1084` / `:1012` / `:1022-1027` / `:64` / `:13`、`dict.ts:299` / `:641`、`ipc-ql.test.ts:101-103` / `:324-344` / `:346-357` / `:423-468`、`quick-launch.ts:5-6` / `:171` | 与本表引用一致 | ☑（本表生成时实测：注释块起于 `main.ts:1038`（`/**`）、止于 :1052；`spawnExeProcess` 在 :1053-1074（:1058 `new ProcessState()`、:1060 `takePipes()`、:1061-1062 `stdout.resume()` / `stderr.resume()`、:1067 `if (error) emitLog(error, 'sys');`）；接线在 :1084 = `spawnExe: (exe) => spawnExeProcess(exe, qlStartContextOrThrow('spawnExe').configId),`；槽在 :1012、守卫在 :1022-1027（抛 `STATE:`）；`ps` 单例在 :64、`ProcessState` import 在 :13；`dict.ts:299`（zh）/ :641（en）= `err.proc.spawnFail`；`ipc-ql.test.ts:101-103` = `import * as mainModule from './main'` / `import './preload'` / `import { ProcessState } from './process'`，:324-344 / :346-357 / :423-468 三处用例与 plan 描述一致；`quick-launch.ts:5-6` 现值 = 「边界：不 import src-main/process.ts，也不改它（check B4 / G4）。exe 类型走 deps.spawnExe 接缝，/ 生产侧由任务 6 接 ProcessState 适配器…」，:171 签名未变） |
| A4 | 与 plan / 规格行号不一致处（以实测为准） | 同上 | 记录差异，不在表里留「二选一」 | ☑（本表生成时实测三处：① plan「全局约束」写 `main.ts`（`:1039-1074` 一段），实测注释块起于 **:1038**（`/**` 行）—— plan 任务 3 标题与索引 G1 写的 `:1038-1074` 与实测一致，本表按 :1038-1074；② plan 步骤 3 的新注释块与旧注释 `main.ts:1040` 都写「:59 的 ps 单例」，实测 `ps` 单例在 **main.ts:64**（:59 是 `app.on('second-instance')` 那一段），`ipc-ql.test.ts:330` / `:461` 的注释同样写 :59，规格 §7.1 也写「`main.ts:59` 的 `ps` 单例」→ 落笔按 :64，并请主代理登记索引 K 组；③ 规格 §6.4 写 `log.app.exit` 在 `quick-launch.ts:292-294`，实测该调用在 **:282**（:292-294 是 `write()`）） |
| A5 | `tsconfig.main.json` 无 `noUnusedParameters`（保留未使用的 `configId` 形参不会红） | 读 `tsconfig.main.json` | 无该选项 | ☑（本表生成时实测：全文 16 行，`compilerOptions` 只有 target / module / moduleResolution / strict / esModuleInterop / skipLibCheck / outDir / rootDir / types / forceConsistentCasingInFileNames，无 `noUnusedParameters`、无 `noUnusedLocals` → 索引 K9 成立） |
| A6 | `ipc-ql.test.ts` 用例数 = 23（本任务只改写、不增删） | 静态数 it( 调用并展开循环 | 23 | ☑（本表生成时实测：字面 it( 共 21 处，其中 :397 处在 `for (const key of ['constructor', 'toString', '__proto__'])`（:396）里展开成 3 条 → 21 − 1 + 3 = **23**，与 plan 步骤 5 的 `Tests 23 passed (23)` 一致） |
| A7 | 前置任务 | 读索引清单表 | 任务 2 | ☑（索引第 15 行） |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src-main/main.ts` | 替换 :1038-1074（注释块 + `spawnExeProcess`）为 plan 步骤 3 的逐字块；新增一行 import | 只这一段 + 一行 import；`:1084` 接线、`:1012` 槽、`:1022-1027` 守卫、`:64` 的 `ps` 单例、`:13` 的 `ProcessState` import 一字不动 | ☐ |
| B2 | `src-main/i18n/dict.ts` | **核对，不改**：两条键随任务 2 落地（索引 K15 / plan 任务 2 步骤 2b） | 本任务不得再改词典；核对 zh :299 后与 en :641 后各有一行 `err.proc.uacCancelled`、占位符只有 `{exe}`。缺任一行 → 停下回任务 2 补 | ☐ |
| B3 | `src-main/quick-launch.ts` | **只改 :5-6 两行注释** | 该文件可执行代码零改动（含 :171 签名、:272 调用、:282、:285） | ☐ |
| B4 | `src-main/ipc-ql.test.ts` | 改写 :324-344（标题与注释）、:346-357（失败路径）、:423-468（观察点） | 用例总数不变（23 条，见 A6）；其余用例一字不改 | ☐ |
| B5 | 其余全部文件 | 不改 | `process.ts` / `src/App.vue` / `src/modules/*` / `quick-launch-terminals.ts` / `package.json` / `electron-builder.yml` / 两份 lockfile 都不动 | ☐ |

## C. 接口契约

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | 新注释块 + `spawnExeProcess(exe, configId)` 函数体逐字 = plan 步骤 3 的块（含 `void configId;`、`try { proc = launchShellExe(winShell, exe); } catch (e) { emitLog(String(e), 'sys'); throw e; }`、返回 `{ onExit, stopGraceful, isRunning }`） | plan 步骤 3 / 规格 §6.6 | ☐ |
| C2 | 注释里「:59 的 ps 单例」按实测写 **:64**（见 A4）；`:1084` 的调用保持 `qlStartContextOrThrow('spawnExe')` | 实测 `main.ts:64` / 索引 G3 / K9 | ☐ |
| C3 | 新增 import 逐字：`import { launchShellExe, winShell, type ShellExecProcess } from './shell-execute';`；`import { ProcessState } from './process';`（:13）保留（:64 的 `ps` 单例仍在用） | plan 步骤 3 | ☐ |
| C4 | 词典两键逐字（**由任务 2 落地**，本任务只核对）：zh `'err.proc.uacCancelled': '{exe} 已取消管理员权限请求',`；en `'err.proc.uacCancelled': '{exe}: elevation request cancelled',`；占位符只有 `{exe}` | 规格 §6.5 / plan 任务 2 步骤 2b / 索引 G5 / K2 / K15 | ☐ |
| C5 | 不登记 `src-main/i18n/err-keys.ts` 的 `IPC_ERROR_KEYS`（该文案只进日志，不经 IPC 传 key） | 规格 §6.5 / plan 步骤 2 | ☐ |
| C6 | `quick-launch.ts:5-6` 注释改为「…生产侧接 shell-execute（ShellExecuteEx，2026-10-13-quick-launch-elevated-exe §6.6）」；`:171` 的 `QlDeps.spawnExe` 签名逐字不变 | 规格 §8-K6 / plan 步骤 4 / 索引 G3 / K6 | ☐ |
| C7 | 三处改写后的用例标题逐字按 plan 步骤 1：「每配置一个新 ShellExecProcess（规格 §6.6）」、「exe 启动失败：前缀由 shell-execute 自带（规格 §6.5），经既有日志通道反馈且 `ql_start` 被拒」 | plan 步骤 1 | ☐ |
| C8 | 失败用例断言改为 `await expect(invoke('ql_start', 'qlshape04')).rejects.toThrow(/^PROC: /)`，并删除 `expect(res).toEqual({ tabId: null })`（旧「先返回、错误异步到」已被同步失败取代） | plan 步骤 1-2 / 规格 §6.6 / §7.1 | ☐ |
| C9 | 并发用例观察点换成 `winShell.shellExecute`（`import { winShell } from './shell-execute'`；保存原函数、替换属性、`finally` 还原）；删除 `launch(exe, [], configId)` 的 `args` 逐字断言（K13 口径作废） | plan 步骤 1-3 / 规格 §7.1 / 索引 K7 | ☐ |
| C10 | 前缀只用 `PROC:`（旧 feature 索引 G7 的五前缀口径），不新增前缀、不新增日志通道 | 规格 §6.5 / 索引 G5 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先改测试（三处，见 C7-C9 与 E1-E9） | — | 三处改写落盘；:324-344 的断言一条不动 | ☐ |
| D2 | 步骤 1 后半：验证红 | `npx vitest run src-main/ipc-ql.test.ts` | FAIL —— 三处都红（`winShell` 尚不存在 / `ql_start` 仍按旧路径返回）；输出贴进本表 J 段 | ☐ |
| D3 | 步骤 2：核对词典键已在任务 2 落好（索引 K15） | `Select-String -Path src-main/i18n/dict.ts -Pattern uacCancelled` | 恰两行（zh / en 各一）；本任务不写词典 | ☐ |
| D4 | 步骤 3：改 `main.ts` 适配器（:1038-1074） | — | 见 C1-C3 | ☐ |
| D5 | 步骤 4：`quick-launch.ts:5-6` 注释同步 | — | 见 C6（可执行代码零改动） | ☐ |
| D6 | 步骤 5-1：定向绿 | `npx vitest run src-main/ipc-ql.test.ts` | PASS，`Tests 23 passed (23)`（用例数不变，只是三处改写） | ☐ |
| D7 | 步骤 5-2：i18n 三门 | `npx vitest run src-main/i18n/dict.test.ts src-main/i18n/key-coverage.test.ts src-main/i18n/no-hardcoded.test.ts` | 全绿（`key-coverage` 认到字面量 `t('err.proc.uacCancelled', { exe })` 且占位符一致） | ☐ |
| D8 | 步骤 5-3：类型门 + 渲染端语法门 | `npx tsc -p tsconfig.main.json --noEmit`；`npx vite build` | tsc 无输出、exit 0；build exit 0（本次未改渲染端，跑一次确认没连带弄坏） | ☐ |
| D9 | 步骤 5-4：全量 | `npm test` | `Test Files 48 passed (48)` / `Tests 834 passed (834)`（= 任务 2 之后的计数，本任务不增不减用例） | ☐ |

## E. 必须钉住的行为断言（`ipc-ql.test.ts` 三处改写后的行为；「变异」列 = 靠什么证明它有牙 + 预期红因）

| # | 断言 | 出处 | 变异取证（预期） | ✓ |
|---|---|---|---|---|
| E1 | `ql_start` 对被拒的 exe **同步 reject**：`rejects.toThrow(/^PROC: /)`（旧行为「先返回 `{tabId:null}`、错误异步到」被取代） | 规格 §6.6 / §7.1 / plan 步骤 1-2 | 牙：适配器只 `emitLog` 不 rethrow → 预期红因 `promise resolved "{ tabId: null }" instead of rejecting`；丢掉 `PROC: ` 前缀 → `expected '…' to match /^PROC: /`。渲染端 `App.vue:477-478` 的 `clearQlState` 回落依赖 reject（实测 :456-482） | ☐ |
| E2 | `sys` 日志出现 `PROC:` 行：`log-line` 里存在 `stream === 'sys'` 且 `/^PROC:/` 的行（`App.vue:477-478` 的回落只负责回落按钮，原因行只由这条日志负责） | 规格 §6.6 / plan 步骤 1-2 | 牙：删掉 `emitLog(String(e), 'sys')` → 预期红因 `waitFor` 超时「PROC: 日志行」+ `expected false to be true`；写成别的 stream → `stream === 'sys'` 断言红 | ☐ |
| E3 | UAC 取消文案可辨认且带 exe：日志出现 `PROC: <exe> 已取消管理员权限请求`，**不再出现 `EACCES`**，且无残留「运行中」假状态 | 规格 §6.5 / §4-3 / 索引 R1 / K2 | 牙：词典占位符名与调用点参数名不一致 → `key-coverage.test.ts:131-151` 报 `PlaceholderDrift` 红；只走通用 `spawnFail` → 含译文断言红 | ☐ |
| E4 | 并发两条各自的 `file` 不串：两次 `ql_start` 记录到 `winShell.shellExecute` 的 `file` 分别是两条配置的 exe | 规格 §7.1 / plan 步骤 1-3 / 索引 R3 | 牙：适配器把 exe / configId 存进共享变量或复用实例 → 两条 `file` 相同 → 预期红因 `expected [...] to equal [...]`（只有按两条配置的 exe 逐字断言时才红；两条都写 notepad.exe 就抓不到串） | ☐ |
| E5 | 调用时 `guardOf()('probe')` 返回的 configId 与本次一致（`ctxOk` 两条都 true） | 规格 §6.6（:1084 接线不动）/ plan 步骤 1-3 / 索引 G3 / K9 | 牙：把 :1084 改成 `spawnExeProcess(exe, null)` 或删掉 `qlStartContextOrThrow` → 预期红因 `expected [false, false] to equal [true, true]`；守卫被删 → `guardOf()` 返回 undefined → 同一断言红，且 :415-421 的守卫用例红 | ☐ |
| E6 | `get_state` 不被污染：`{ running: false, stopping: false, configId: null }`（读的是 `main.ts:64` 的 `ps` 单例，实测行号） | 规格 §7.1 / plan 步骤 1-1 / 索引 G2 | 牙：若复用 `ps` 单例 → `get_state` 返回 `running: true` → 预期红因 `expected { running: true, … } to deep equal { running: false, … }`；:324-344 的同断言同样守 | ☐ |
| E7 | `ql_states` 两条各自 running、`ql_stop` 后清空（:324-344 的既有断言一条不动） | plan 步骤 1-1 / 规格 §7.1 | 牙：新适配器 `isRunning()` 恒 false → `ql_states` 断言红；`stopGraceful` 不幂等或不摘实例 → 清空断言红 | ☐ |
| E8 | 不需要管理员的 exe（notepad）走 Shell 路径照常启动 / 停止（并发用例真起两个 notepad） | 规格 §7.1 / E8 / 索引 R3 | 牙：`lpVerb` 写成 `"runas"` 单测抓不到 → 靠任务 2 的 C5 源码逐字 + 真机清单第 4 步守「不多弹一次 UAC」 | ☐ |
| E9 | 退出码链路不变：`ql-exit { configId, code }` 与 `log.app.exit` 格式不变 | 规格 §6.4（实测 `quick-launch.ts:364-369` 的 `finalize` 与 :282 的 `log.app.exit`；规格写 :292-294，见 A4） | 牙：适配器 `onExit` 里改签名或吞掉 code → `ql-exit` 载荷断言红 | ☐ |

## F. 本任务相关的硬约束（索引 G 组子集）

| # | 约束 | 索引 | ✓ |
|---|---|---|---|
| F1 | 改动文件只有 `main.ts` / `dict.ts` / `quick-launch.ts`（仅 :5-6 注释）/ `ipc-ql.test.ts` | G1 | ☐ |
| F2 | 不改 `process.ts`、不改 `main.ts:64` 的 `ps` 单例、不改 `quick-launch.ts` 任何可执行语句、不改 `src/App.vue` / `src/modules/*` / `quick-launch-terminals.ts` | G2 | ☐ |
| F3 | `QlDeps.spawnExe(exe)` 返回形状逐字不变；`main.ts:1084` 接线与 `qlStartContextOrThrow`（:1022-1027）、`qlStartContext`（:1012）不动 | G3 / K9 | ☐ |
| F4 | 前缀只用 `PROC:`；新键只有 `err.proc.uacCancelled`（zh / en 同时、占位符只有 `{exe}`）；调用点必须字面量 `t('…')` | G5 | ☐ |
| F5 | 命令口径：定向 vitest、i18n 三份、`npx tsc -p tsconfig.main.json --noEmit`、`npx vite build`、全量 | G8 | ☐ |
| F6 | 计数不变（48 / 834）：本任务不增不减用例 | G9 / K11 | ☐ |
| F7 | 不扩范围：不加提权额外日志、不加参数 / cwd、不做 manifest 检测、不做「以管理员身份重启」引导 UI | G11 / 规格 §5 / Q11-Q12 | ☐ |
| F8 | 旧口径（旧规格 §7.3 / 索引 K13）的 `launch(exe, [], configId)` 逐字断言作废，但 :324-344 的行为断言一条不删 | K7 / plan 步骤 1-1 | ☐ |
| F9 | 子代理不 `git add`、不 commit（H 段归主代理） | G10 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src-main/ipc-ql.test.ts` | `Tests 23 passed (23)`（用例数不变，见 A6） | ☐ |
| G2 | `npx vitest run src-main/i18n/dict.test.ts src-main/i18n/key-coverage.test.ts src-main/i18n/no-hardcoded.test.ts` | 全绿：`key-coverage` 认到字面量 `t('err.proc.uacCancelled', { exe })`（:117-129）且占位符双向一致（:131-151）；`no-hardcoded` 不因新键报错（`dict.ts` 在 :10 的 EXCLUDE 白名单里） | ☐ |
| G3 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出、exit 0 | ☐ |
| G4 | `npx vite build` | exit 0（本次未改渲染端，跑一次确认没连带弄坏） | ☐ |
| G5 | `npm test` | `Test Files 48 passed (48)` / `Tests 834 passed (834)`，与任务 2 之后逐字相同 | ☐ |
| G6 | `git diff --name-only` + `git diff -U0 -- src-main/quick-launch.ts` | 恰为三个文件（`main.ts`、`quick-launch.ts`、`ipc-ql.test.ts`；词典键属任务 2 的提交，索引 K15）；`quick-launch.ts` 的删除/新增行只在 :5-6；`:171` / `:272` / `:282` / `:285` 现值一字未变 | ☐ |

## H. 提交门（**由主代理在验收通过后执行**；子代理不 `git add`、不 commit —— 索引 G10）

| # | 项 | 命令 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 = 三个文件（plan 步骤 6 逐字；词典键已在任务 2 提交，索引 K15） | `git add src-main/main.ts src-main/quick-launch.ts src-main/ipc-ql.test.ts` | ☐ |
| H2 | commit message 逐字（plan 步骤 6） | `git commit -m "fix(main): 快捷启动 exe 改走 ShellExecuteEx 提权路径，UAC 取消给出可辨文案（规格 §6.1/§6.5/§6.6）"` | ☐ |
| H3 | 勾完整性门：本表 `裸☐=0` 且 `I段 -[ ]=0`，退出码 0 | `node .superpowers/sdd/2026-10-13-quick-launch-elevated-exe/tick-census.mjs` | ☐ |

## I. 完成判据

- [ ] B1-B5 / C1-C10 / D1-D9 / E1-E9 / F1-F9 / G1-G6 全部成立并落勾
- [ ] J 段有真实命令与真实输出（含 D2 的三处红输出与 D6-D9 的绿输出）
- [ ] H1-H3 由主代理在验收通过后执行

## J. 执行记录（命令 + 真实输出摘要）

| 命令 / 动作 | 真实输出摘要 | 判定 |
|---|---|---|
| （实现时填） | | |
