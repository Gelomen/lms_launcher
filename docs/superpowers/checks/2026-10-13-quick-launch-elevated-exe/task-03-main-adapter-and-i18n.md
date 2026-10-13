# 任务 3 · `main.ts` 适配器接线 + 新词典键 + `ipc-ql.test.ts` 两处改写 — check 表

> 计划：[2026-10-13-quick-launch-elevated-exe.md](../../plans/2026-10-13-quick-launch-elevated-exe.md) §任务 3 · 规格：[2026-10-13-quick-launch-elevated-exe-design.md](../../specs/2026-10-13-quick-launch-elevated-exe-design.md) §6.1 / §6.5 / §6.6 / §7.1 / §8-K6 · 关联审查重点 **R1 / R3 / R6**（索引 R 组）
> 前置：任务 2（消费其导出；索引清单表第 15 行）
> 现状锚点（本表生成时实测）：`src-main/main.ts:1038-1052`（旧口径注释块）、`:1053-1074`（`spawnExeProcess`）、`:1084`（接线）、`:1012`（`qlStartContext` 槽）、`:1022-1027`（`qlStartContextOrThrow`）、`:64`（`ps` 单例）、`:13`（`ProcessState` import）、`:1067`（旧 `emitLog(error,'sys')`）；`src-main/i18n/dict.ts:299`（zh）/ `:641`（en）；`src-main/ipc-ql.test.ts:101-103` / `:324-344` / `:346-357` / `:423-468`；`src-main/quick-launch.ts:5-6`（注释）/ `:171`（签名）；`src/App.vue:456-482`（`:464` 预置红「...」、`:477-478` catch → `clearQlState`）；`tsconfig.main.json` 无 `noUnusedParameters`
> 索引：[00-index.md](00-index.md) 的 G1-G3、G5、G8-G11、K2 / K6 / K7 / K9

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 起点 = 任务 2 已提交 | `git log --oneline -2`；`git status --porcelain` | HEAD 链含任务 2 的 `feat(main): shell-execute.ts …` 提交；无已跟踪改动 | ☑（主代理实测：HEAD = `1fef4e4 docs: 任务 2 验收落勾 + J 段取证…`，其父 `0a67692 feat(main): shell-execute.ts …` = 任务 2 的提交；`git status --porcelain` 无已跟踪改动（只有 `?? .superpowers/`）。见 J-1) |
| A2 | 全量基线（索引 G9：由主代理实测，子代理不重跑） | `npm test` | 起点应为 48 / 834（任务 2 之后）；本任务不增不减用例，收尾仍 48 / 834 | ☑（基线由主代理实测 2026-10-13 19:25：`Test Files 47 passed (47)` / `Tests 826 passed (826)`，exit 0 —— 规格 E18。任务 2 之后的 48 / 834 是 plan 步骤 5 的预期，尚未实测 → 在 G5 行取证） |
| A3 | 锚点行号属实 | 读 `main.ts:1038-1074` / `:1084` / `:1012` / `:1022-1027` / `:64` / `:13`、`dict.ts:299` / `:641`、`ipc-ql.test.ts:101-103` / `:324-344` / `:346-357` / `:423-468`、`quick-launch.ts:5-6` / `:171` | 与本表引用一致 | ☑（本表生成时实测：注释块起于 `main.ts:1038`（`/**`）、止于 :1052；`spawnExeProcess` 在 :1053-1074（:1058 `new ProcessState()`、:1060 `takePipes()`、:1061-1062 `stdout.resume()` / `stderr.resume()`、:1067 `if (error) emitLog(error, 'sys');`）；接线在 :1084 = `spawnExe: (exe) => spawnExeProcess(exe, qlStartContextOrThrow('spawnExe').configId),`；槽在 :1012、守卫在 :1022-1027（抛 `STATE:`）；`ps` 单例在 :64、`ProcessState` import 在 :13；`dict.ts:299`（zh）/ :641（en）= `err.proc.spawnFail`；`ipc-ql.test.ts:101-103` = `import * as mainModule from './main'` / `import './preload'` / `import { ProcessState } from './process'`，:324-344 / :346-357 / :423-468 三处用例与 plan 描述一致；`quick-launch.ts:5-6` 现值 = 「边界：不 import src-main/process.ts，也不改它（check B4 / G4）。exe 类型走 deps.spawnExe 接缝，/ 生产侧由任务 6 接 ProcessState 适配器…」，:171 签名未变） |
| A4 | 与 plan / 规格行号不一致处（以实测为准） | 同上 | 记录差异，不在表里留「二选一」 | ☑（本表生成时实测三处：① plan「全局约束」写 `main.ts`（`:1039-1074` 一段），实测注释块起于 **:1038**（`/**` 行）—— plan 任务 3 标题与索引 G1 写的 `:1038-1074` 与实测一致，本表按 :1038-1074；② plan 步骤 3 的新注释块与旧注释 `main.ts:1040` 都写「:59 的 ps 单例」，实测 `ps` 单例在 **main.ts:64**（:59 是 `app.on('second-instance')` 那一段），`ipc-ql.test.ts:330` / `:461` 的注释同样写 :59，规格 §7.1 也写「`main.ts:59` 的 `ps` 单例」→ 落笔按 :64，并请主代理登记索引 K 组；③ 规格 §6.4 写 `log.app.exit` 在 `quick-launch.ts:292-294`，实测该调用在 **:282**（:292-294 是 `write()`）） |
| A5 | `tsconfig.main.json` 无 `noUnusedParameters`（保留未使用的 `configId` 形参不会红） | 读 `tsconfig.main.json` | 无该选项 | ☑（本表生成时实测：全文 16 行，`compilerOptions` 只有 target / module / moduleResolution / strict / esModuleInterop / skipLibCheck / outDir / rootDir / types / forceConsistentCasingInFileNames，无 `noUnusedParameters`、无 `noUnusedLocals` → 索引 K9 成立） |
| A6 | `ipc-ql.test.ts` 用例数 = 23（本任务只改写、不增删） | 静态数 it( 调用并展开循环 | 23 | ☑（本表生成时实测：字面 it( 共 21 处，其中 :397 处在 `for (const key of ['constructor', 'toString', '__proto__'])`（:396）里展开成 3 条 → 21 − 1 + 3 = **23**，与 plan 步骤 5 的 `Tests 23 passed (23)` 一致） |
| A7 | 前置任务 | 读索引清单表 | 任务 2 | ☑（索引第 15 行） |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src-main/main.ts` | 替换 :1038-1074（注释块 + `spawnExeProcess`）为 plan 步骤 3 的逐字块；新增一行 import | 只这一段 + 一行 import；`:1084` 接线、`:1012` 槽、`:1022-1027` 守卫、`:64` 的 `ps` 单例、`:13` 的 `ProcessState` import 一字不动 | ☑（主代理实测：`git diff --numstat -- src-main/main.ts` = `23\t27`；`git diff -U0` 只有两处 hunk —— 新增一行 import（:22）与替换 :1039-1070 的注释块 + 函数体；`:1080` 接线、`:1012` 槽、`:1022-1027` 守卫、`:64` 的 `ps` 单例、`:13` 的 `ProcessState` import 一字未动（J-22）) |
| B2 | `src-main/i18n/dict.ts` | **核对，不改**：两条键随任务 2 落地（索引 K15 / plan 任务 2 步骤 2b） | 本任务不得再改词典；核对 zh :299 后与 en :641 后各有一行 `err.proc.uacCancelled`、占位符只有 `{exe}`。缺任一行 → 停下回任务 2 补 | ☑（主代理实测：`Select-String -Path src-main/i18n/dict.ts -Pattern uacCancelled` → 恰两行（zh `:300`、en `:643`，即原 :299 / :641 之后各一行；行号因任务 2 的插入而下移）；本任务 `git status --porcelain` 不含 `dict.ts`（J-2 / J-22）) |
| B3 | `src-main/quick-launch.ts` | **只改 :5-6 两行注释** | 该文件可执行代码零改动（含 :171 签名、:272 调用、:282、:285） | ☑（主代理实测：`git diff -U0 -- src-main/quick-launch.ts` 只有一个 hunk `@@ -6 +6 @@`（注释第二行）；`:5` 未动，`:171` / `:272` / `:282` / `:285` 一字未改（J-22）) |
| B4 | `src-main/ipc-ql.test.ts` | 改写 :324-344（标题与注释）、:346-357（失败路径）、:423-468（观察点） | 用例总数不变（23 条，见 A6）；其余用例一字不改 | ☑（主代理实测：`git diff --numstat -- src-main/ipc-ql.test.ts` = `47\t33`，改动集中在 import（:103-105）与三处用例；用例数不变（A6 的 23 条，实测 `Tests 23 passed (23)`，J-8）) |
| B5 | 其余全部文件 | 不改 | `process.ts` / `src/App.vue` / `src/modules/*` / `quick-launch-terminals.ts` / `package.json` / `electron-builder.yml` / 两份 lockfile 都不动 | ☑（主代理实测：`git status --porcelain` 不含 `process.ts` / `src/App.vue` / `src/modules/*` / `quick-launch-terminals.ts` / `package.json` / 两份 lockfile（J-22）) |

## C. 接口契约

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | 新注释块 + `spawnExeProcess(exe, configId)` 函数体逐字 = plan 步骤 3 的块（含 `void configId;`、`try { proc = launchShellExe(winShell, exe); } catch (e) { emitLog(e instanceof Error ? e.message : String(e), 'sys'); throw e; }`、返回 `{ onExit, stopGraceful, isRunning }`）。**实现期更正（规格 E21 / §8-K7，索引 K21）**：日志取 `e.message` 而非 `String(e)` —— `String(new Error('PROC: …'))` = `Error: PROC: …`，行首前缀就不是 `PROC:`（G7 口径 + 本表 E2 的 `/^PROC:/` 断言实测红因 `TIMEOUT waiting for PROC: 日志行`） | plan 步骤 3（已同步）/ 规格 §6.6 / E21 | ☑（读 `main.ts:1039-1070`：注释块 + 函数体按 plan 步骤 3（已同步 K21 的更正）落地：`void configId;`、`try { proc = launchShellExe(winShell, exe); } catch (e) { emitLog(e instanceof Error ? e.message : String(e), 'sys'); throw e; }`、返回 `{ onExit, stopGraceful, isRunning }`。注释里的 `:1084` 按实测写成 `:1080`（新块比旧块短 5 行 + 新增一行 import），见 J-7) |
| C2 | 注释里「:59 的 ps 单例」按实测写 **:64**（见 A4）；`:1084` 的调用保持 `qlStartContextOrThrow('spawnExe')` | 实测 `main.ts:64` / 索引 G3 / K9 | ☑（读 `:1041` 注释写 `:64 的 ps 单例`（实测 `ps` 在 `main.ts:64`，A4 已定）；`:1080` 的调用保持 `qlStartContextOrThrow('spawnExe').configId`（J-22 的 diff 证明该行未改）) |
| C3 | 新增 import 逐字：`import { launchShellExe, winShell, type ShellExecProcess } from './shell-execute';`；`import { ProcessState } from './process';`（:13）保留（:64 的 `ps` 单例仍在用） | plan 步骤 3 | ☑（读 `:22`：`import { launchShellExe, winShell, type ShellExecProcess } from './shell-execute';`；`:13` 的 `import { ProcessState } from './process';` 保留（`:64` 的 `ps` 仍在用）) |
| C4 | 词典两键逐字（**由任务 2 落地**，本任务只核对）：zh `'err.proc.uacCancelled': '{exe} 已取消管理员权限请求',`；en `'err.proc.uacCancelled': '{exe}: elevation request cancelled',`；占位符只有 `{exe}` | 规格 §6.5 / plan 任务 2 步骤 2b / 索引 G5 / K2 / K15 | ☑（读 `dict.ts:300` / `:643` 两行逐字（J-2）；占位符只有 `{exe}`（`key-coverage` 的占位符双向核对绿，J-9）) |
| C5 | 不登记 `src-main/i18n/err-keys.ts` 的 `IPC_ERROR_KEYS`（该文案只进日志，不经 IPC 传 key） | 规格 §6.5 / plan 步骤 2 | ☑（读 `src-main/i18n/err-keys.ts`：无 `err.proc.uacCancelled`（本任务与任务 2 都未登记，J-2 的 diff 不含该文件）) |
| C6 | `quick-launch.ts:5-6` 注释改为「…生产侧接 shell-execute（ShellExecuteEx，2026-10-13-quick-launch-elevated-exe §6.6）」；`:171` 的 `QlDeps.spawnExe` 签名逐字不变 | 规格 §8-K6 / plan 步骤 4 / 索引 G3 / K6 | ☑（读 `quick-launch.ts:5-6` 现值：第二行 = 「生产侧接 shell-execute（ShellExecuteEx，2026-10-13-quick-launch-elevated-exe §6.6）。」；`:171` 的 `spawnExe(exe: string)` 签名逐字未变（J-22）) |
| C7 | 三处改写后的用例标题逐字按 plan 步骤 1：「每配置一个新 ShellExecProcess（规格 §6.6）」、「exe 启动失败：前缀由 shell-execute 自带（规格 §6.5），经既有日志通道反馈且 `ql_start` 被拒」 | plan 步骤 1 | ☑（读 `ipc-ql.test.ts:326` / `:348` 两条标题逐字按 plan 步骤 1（「每配置一个新 ShellExecProcess（规格 §6.6）」「exe 启动失败：前缀由 shell-execute 自带（规格 §6.5），经既有日志通道反馈且 `ql_start` 被拒」）) |
| C8 | 失败用例断言改为 `await expect(invoke('ql_start', 'qlshape04')).rejects.toThrow(/^PROC: /)`，并删除 `expect(res).toEqual({ tabId: null })`（旧「先返回、错误异步到」已被同步失败取代）。**实现期补充（规格 E19 / §9-R8）**：用例必须临时替换 `winShell.shellExecute` 为返回 `{ ok:false, handle:null, win32Error:1223 }` 的假实现（`finally` 还原）——真路径打不存在的 exe 会弹 Shell 系统错误框卡住 worker；替换后顺带断言 UAC 文案（含 `t('err.proc.uacCancelled', { exe })`、不含 `EACCES`） | plan 步骤 1-2 / 规格 §6.6 / §7.1 | ☑（读 `:352-372`：`await expect(invoke('ql_start', 'qlshape04')).rejects.toThrow(/^PROC: /)`；`expect(res).toEqual({ tabId: null })` 已删；按 K21 / E19 补了 `winShell.shellExecute` 的临时替换（返回 1223）与 UAC 文案断言（J-4 / J-5）) |
| C9 | 并发用例观察点换成 `winShell.shellExecute`（`import { winShell } from './shell-execute'`；保存原函数、替换属性、`finally` 还原）；删除 `launch(exe, [], configId)` 的 `args` 逐字断言（K13 口径作废）。**实现期补充（E4 的牙）**：两条配置的 exe 必须不同（实测 `notepad.exe` / `mspaint.exe`），包装只透传参数、其余六个方法保持真实现（两条真进程照常启动 / 停止，E8） | plan 步骤 1-3 / 规格 §7.1 / 索引 K7 | ☑（读 `:438-485`：观察点 = `winShell.shellExecute`（保存原函数、只包一层记录参数、`finally` 还原）；`launch(exe, [], configId)` 的 `args` 逐字断言已删；两条配置的 exe 改为不同（`notepad.exe` / `mspaint.exe`，E4 的牙）) |
| C10 | 前缀只用 `PROC:`（旧 feature 索引 G7 的五前缀口径），不新增前缀、不新增日志通道 | 规格 §6.5 / 索引 G5 | ☑（读 `main.ts:1062`：只经既有 `emitLog(…, 'sys')`；前缀由 `shell-execute.ts` 的 `PROC:` 自带，本任务未新增前缀 / 通道（`git diff` 无新 `ipcMain.handle` / `webContents.send`，J-22）) |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先改测试（三处，见 C7-C9 与 E1-E9） | — | 三处改写落盘；:324-344 的断言一条不动 | ☑（三处改写先落盘（B4 / C7-C9），:324-344 的断言一条未动（diff 只有标题与两行注释，J-3）) |
| D2 | 步骤 1 后半：验证红 | `npx vitest run src-main/ipc-ql.test.ts` | FAIL —— 三处都红（`winShell` 尚不存在 / `ql_start` 仍按旧路径返回）；输出贴进本表 J 段 | ☑（红门成立：`Tests 2 failed \| 21 passed (23)` —— 失败用例 `promise resolved "{ tabId: null }" instead of rejecting`、并发用例 `expected [] to deeply equal [ 'notepad.exe', 'mspaint.exe' ]`（J-4）。:324-344 只改标题/注释 → 不红，符合预期（它的牙是 E6 / E7 的行为断言）) |
| D3 | 步骤 2：核对词典键已在任务 2 落好（索引 K15） | `Select-String -Path src-main/i18n/dict.ts -Pattern uacCancelled` | 恰两行（zh / en 各一）；本任务不写词典 | ☑（`Select-String -Path src-main/i18n/dict.ts -Pattern uacCancelled` → 恰两行（zh :300 / en :643），本任务未写词典（J-2）) |
| D4 | 步骤 3：改 `main.ts` 适配器（:1038-1074） | — | 见 C1-C3 | ☑（见 C1-C3（J-7）) |
| D5 | 步骤 4：`quick-launch.ts:5-6` 注释同步 | — | 见 C6（可执行代码零改动） | ☑（见 C6（J-7；可执行代码零改动，diff 只有 :6 一行注释）) |
| D6 | 步骤 5-1：定向绿 | `npx vitest run src-main/ipc-ql.test.ts` | PASS，`Tests 23 passed (23)`（用例数不变，只是三处改写） | ☑（`npx vitest run src-main/ipc-ql.test.ts` → `Test Files 1 passed (1)` / `Tests 23 passed (23)`，exit 0（J-8）) |
| D7 | 步骤 5-2：i18n 三门 | `npx vitest run src-main/i18n/dict.test.ts src-main/i18n/key-coverage.test.ts src-main/i18n/no-hardcoded.test.ts` | 全绿（`key-coverage` 认到字面量 `t('err.proc.uacCancelled', { exe })` 且占位符一致） | ☑（i18n 三份 → `Test Files 3 passed (3)` / `Tests 15 passed (15)`，exit 0（J-9）) |
| D8 | 步骤 5-3：类型门 + 渲染端语法门 | `npx tsc -p tsconfig.main.json --noEmit`；`npx vite build` | tsc 无输出、exit 0；build exit 0（本次未改渲染端，跑一次确认没连带弄坏） | ☑（`npx tsc -p tsconfig.main.json --noEmit` → 无输出、`TSC_EXIT=0`；`npx vite build` → `✓ built in 1.23s`、`BUILD_EXIT=0`（J-10）) |
| D9 | 步骤 5-4：全量 | `npm test` | `Test Files 48 passed (48)` / `Tests 834 passed (834)`（= 任务 2 之后的计数，本任务不增不减用例） | ☑（`npm test` → `Test Files 48 passed (48)` / `Tests 834 passed (834)`，exit 0（J-10）= 任务 2 之后的计数，本任务不增不减用例) |

## E. 必须钉住的行为断言（`ipc-ql.test.ts` 三处改写后的行为；「变异」列 = 靠什么证明它有牙 + 预期红因）

| # | 断言 | 出处 | 变异取证（预期） | ✓ |
|---|---|---|---|---|
| E1 | `ql_start` 对被拒的 exe **同步 reject**：`rejects.toThrow(/^PROC: /)`（旧行为「先返回 `{tabId:null}`、错误异步到」被取代） | 规格 §6.6 / §7.1 / plan 步骤 1-2 | 牙：适配器只 `emitLog` 不 rethrow → 预期红因 `promise resolved "{ tabId: null }" instead of rejecting`；丢掉 `PROC: ` 前缀 → `expected '…' to match /^PROC: /`。渲染端 `App.vue:477-478` 的 `clearQlState` 回落依赖 reject（实测 :456-482） **实测（J-11 / J-12）**：删掉 `throw e` → `expected [Function] to throw error matching /^PROC: / but got 'Cannot read properties of undefined (…'`（**不是**本表预测的 `promise resolved "{ tabId: null }"` —— 那条描述的是旧异步路径；新路径不 rethrow 会让 `proc` 为 undefined）；去掉 `PROC:` 前缀 → `expected [Function] to throw error matching /^PROC: / but got 'no-such-exe-zzz.exe 已取消管理员权限请求'` | ☑（断言落盘见 C8；牙的实测在本行「实测」列与 J-11 / J-12) |
| E2 | `sys` 日志出现 `PROC:` 行：`log-line` 里存在 `stream === 'sys'` 且 `/^PROC:/` 的行（`App.vue:477-478` 的回落只负责回落按钮，原因行只由这条日志负责） | 规格 §6.6 / plan 步骤 1-2 | 牙：删掉 `emitLog(String(e), 'sys')` → 预期红因 `waitFor` 超时「PROC: 日志行」+ `expected false to be true`；写成别的 stream → `stream === 'sys'` 断言红 **实测（J-13）**：删掉 `emitLog(…)` → `TIMEOUT waiting for PROC: 日志行`。这条断言还真抓到了实现缺陷：按 plan 原写法 `String(e)` 时行首是 `Error: ` → 同一红因（规格 E21 / §8-K7，索引 K21） | ☑（断言落盘见 C8；牙的实测见本行「实测」列与 J-13（真实缺陷 K21 就是这条断言抓到的）) |
| E3 | UAC 取消文案可辨认且带 exe：日志出现 `PROC: <exe> 已取消管理员权限请求`，**不再出现 `EACCES`**，且无残留「运行中」假状态 | 规格 §6.5 / §4-3 / 索引 R1 / K2 | 牙：词典占位符名与调用点参数名不一致 → `key-coverage.test.ts:131-151` 报 `PlaceholderDrift` 红；只走通用 `spawnFail` → 含译文断言红 **实测（J-14）**：去掉 1223 分支 → `expected 'PROC: no-such-exe-zzz.exe 启动失败: win32…' to contain 'no-such-exe-zzz.exe 已取消管理员权限请求'`；`not.toContain('EACCES')` 同时守旧文案回归 | ☑（断言落盘见 C8（含 `not.toContain('EACCES')`）；牙见本行「实测」列与 J-14) |
| E4 | 并发两条各自的 `file` 不串：两次 `ql_start` 记录到 `winShell.shellExecute` 的 `file` 分别是两条配置的 exe | 规格 §7.1 / plan 步骤 1-3 / 索引 R3 | 牙：适配器把 exe / configId 存进共享变量或复用实例 → 两条 `file` 相同 → 预期红因 `expected [...] to equal [...]`（只有按两条配置的 exe 逐字断言时才红；两条都写 notepad.exe 就抓不到串） **实测（J-15）**：把 exe 存进共享变量（模拟串台）→ `expected [ 'notepad.exe', 'notepad.exe' ] to deeply equal [ 'notepad.exe', 'mspaint.exe' ]`，正是预测的红因。（该变异把值挂在 `globalThis` 上会跨用例泄漏，顺带让失败用例也红 —— 变异自身的副作用，不影响判据） | ☑（断言落盘见 C9（两条 exe 不同才抓得到）；牙见本行「实测」列与 J-15) |
| E5 | 调用时 `guardOf()('probe')` 返回的 configId 与本次一致（`ctxOk` 两条都 true） | 规格 §6.6（:1084 接线不动）/ plan 步骤 1-3 / 索引 G3 / K9 | 牙：把 :1084 改成 `spawnExeProcess(exe, null)` 或删掉 `qlStartContextOrThrow` → 预期红因 `expected [false, false] to equal [true, true]`；守卫被删 → `guardOf()` 返回 undefined → 同一断言红，且 :415-421 的守卫用例红 **实测（J-16 / J-17，索引 K22）**：本表预测的变异（接线改成 `spawnExeProcess(exe, null)`）**不红**（`Tests 23 passed (23)`）—— 适配器 `void configId`，`ctxOk` 是 spy 自己调 `guard('probe')` 得到的，测的是「spawnExe 时刻槽非空且属于本次」，不是接线的传参。有牙的变异是把 `ql_start` 里的槽赋值置空 → 四条红，含 `STATE: ql_start context is missing at spawnExe` | ☑（断言落盘见 C9（`ctxOk` 两条 true）；牙位更正见本行「实测」列与 J-16 / J-17（索引 K22）) |
| E6 | `get_state` 不被污染：`{ running: false, stopping: false, configId: null }`（读的是 `main.ts:64` 的 `ps` 单例，实测行号） | 规格 §7.1 / plan 步骤 1-1 / 索引 G2 | 牙：若复用 `ps` 单例 → `get_state` 返回 `running: true` → 预期红因 `expected { running: true, … } to deep equal { running: false, … }`；:324-344 的同断言同样守 **实测（J-18）**：把适配器改成复用 `ps` 单例（`proc = (ps.launch(exe, [], configId), ps)`）→ `expected { Object (running, stopping, ...) } to deeply equal { running: false, …(2) }`（正是预测的红因），并连带 :324-344 / :423-468 两条红 | ☑（断言落盘：:324-344 与 :438-485 的 `get_state` 断言都在；牙见本行「实测」列与 J-18) |
| E7 | `ql_states` 两条各自 running、`ql_stop` 后清空（:324-344 的既有断言一条不动） | plan 步骤 1-1 / 规格 §7.1 | 牙：新适配器 `isRunning()` 恒 false → `ql_states` 断言红；`stopGraceful` 不幂等或不摘实例 → 清空断言红 **实测（J-19）**：`isRunning: () => false` → `expected { qlshape02: { …(2) }, …(1) } to deeply equal { …(2) }`（两条用例的 `ql_states` 断言红）。「ql_stop 后清空」的断言按 plan 未改，仍由 :324-344 末尾守 | ☑（:324-344 的 `ql_states` / `ql_stop` 后清空断言一条未改（B4 的 diff）；牙见本行「实测」列与 J-19) |
| E8 | 不需要管理员的 exe（notepad）走 Shell 路径照常启动 / 停止（并发用例真起两个 notepad） | 规格 §7.1 / E8 / 索引 R3 | 牙：`lpVerb` 写成 `"runas"` 单测抓不到 → 靠任务 2 的 C5 源码逐字 + 真机清单第 4 步守「不多弹一次 UAC」 **实测（J-8）**：并发用例真起 `notepad.exe` / `mspaint.exe` 两个进程、`ql_states` 两条各自 running、`ql_stop` 后清空，整文件 4.7s 内跑完 → Shell 路径对不需要提权的 exe 照常工作。「不多弹一次 UAC」仍只能靠 C5 的 `lpVerb = null` 源码逐字 + 任务 4 真机清单第 4 步（单测无牙，本行原注已写） | ☑（并发用例真起两个不需要提权的 exe 并正常停止（J-8）；「不多弹一次 UAC」无单测牙，靠 C5 源码逐字 + 任务 4 真机清单第 4 步（本行原注）) |
| E9 | 退出码链路不变：`ql-exit { configId, code }` 与 `log.app.exit` 格式不变 | 规格 §6.4（实测 `quick-launch.ts:364-369` 的 `finalize` 与 :282 的 `log.app.exit`；规格写 :292-294，见 A4） | 牙：适配器 `onExit` 里改签名或吞掉 code → `ql-exit` 载荷断言红 **实测（J-20，索引 K22）**：`onExit(cb) { proc.onExit(() => cb(0)); }`（吞掉退出码）→ **不红**（`Tests 23 passed (23)`）：exe 侧没有断言退出码取值的用例，`ql-exit` 的载荷断言（:310-322）走的是 shell 配置。链路不变的证据 = `git diff -U0 -- src-main/quick-launch.ts` 只动 :6 一行注释（:272 / :282 / :285 / finalize 一字未改，J-22）+ 任务 4 真机清单第 5 步 | ☑（链路未动：`git diff -U0 -- src-main/quick-launch.ts` 只改 :6 一行注释（J-22）；`cb(0)` 变异无牙的实测见本行「实测」列与 J-20（索引 K22）) |

## F. 本任务相关的硬约束（索引 G 组子集）

| # | 约束 | 索引 | ✓ |
|---|---|---|---|
| F1 | 改动文件只有 `main.ts` / `dict.ts` / `quick-launch.ts`（仅 :5-6 注释）/ `ipc-ql.test.ts` | G1 | ☑（改动只有 `main.ts` / `quick-launch.ts`（仅 :6 注释）/ `ipc-ql.test.ts`；`dict.ts` 未改（键属任务 2 提交，K15）→ B2 的「核对不改」成立（J-22）) |
| F2 | 不改 `process.ts`、不改 `main.ts:64` 的 `ps` 单例、不改 `quick-launch.ts` 任何可执行语句、不改 `src/App.vue` / `src/modules/*` / `quick-launch-terminals.ts` | G2 | ☑（见 B1 / B5：`process.ts`、`main.ts:64` 的 `ps`、`quick-launch.ts` 可执行语句、渲染端文件都不在 diff 里（J-22）) |
| F3 | `QlDeps.spawnExe(exe)` 返回形状逐字不变；`main.ts:1084` 接线与 `qlStartContextOrThrow`（:1022-1027）、`qlStartContext`（:1012）不动 | G3 / K9 | ☑（见 C6 / C2：`:171` 签名与返回形状逐字未变；`:1080` 接线、`qlStartContextOrThrow`（:1022-1027）、`qlStartContext`（:1012）一字未动（J-22）) |
| F4 | 前缀只用 `PROC:`；新键只有 `err.proc.uacCancelled`（zh / en 同时、占位符只有 `{exe}`）；调用点必须字面量 `t('…')` | G5 | ☑（见 C10 / C4 / C5 + J-2 / J-9：前缀只有 `PROC:`，键只有 `err.proc.uacCancelled`（zh / en、占位符只有 `{exe}`），调用点是字面量 `t('…')`) |
| F5 | 命令口径：定向 vitest、i18n 三份、`npx tsc -p tsconfig.main.json --noEmit`、`npx vite build`、全量 | G8 | ☑（命令逐字见 J-8 / J-9 / J-10（定向、i18n 三份、tsc、vite build、全量）) |
| F6 | 计数不变（48 / 834）：本任务不增不减用例 | G9 / K11 | ☑（计数不变：J-8 单文件 23 条（与 A6 的静态计数一致）+ J-10 全量 48 / 834 与任务 2 之后逐字相同（K11 判据）) |
| F7 | 不扩范围：不加提权额外日志、不加参数 / cwd、不做 manifest 检测、不做「以管理员身份重启」引导 UI | G11 / 规格 §5 / Q11-Q12 | ☑（未扩范围：`launchShellExe(winShell, exe)` 只传 exe 与 `nShow`；无提权额外日志、无 manifest 检测、无「以管理员身份重启」UI、无新词典键（源码核对 + J-22）) |
| F8 | 旧口径（旧规格 §7.3 / 索引 K13）的 `launch(exe, [], configId)` 逐字断言作废，但 :324-344 的行为断言一条不删 | K7 / plan 步骤 1-1 | ☑（`launch(exe, [], configId)` 的 `args` 逐字断言已删（C9）；:324-344 的行为断言一条未删（B4：该用例的 diff 只有标题与两行注释）) |
| F9 | 子代理不 `git add`、不 commit（H 段归主代理） | G10 | ☑（本次由主代理内联实现（索引 K14），不存在「子代理先提交」；提交由主代理在验收后按 H 段执行（J-23）) |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src-main/ipc-ql.test.ts` | `Tests 23 passed (23)`（用例数不变，见 A6） | ☑（J-8：`Tests 23 passed (23)`，exit 0) |
| G2 | `npx vitest run src-main/i18n/dict.test.ts src-main/i18n/key-coverage.test.ts src-main/i18n/no-hardcoded.test.ts` | 全绿：`key-coverage` 认到字面量 `t('err.proc.uacCancelled', { exe })`（:117-129）且占位符双向一致（:131-151）；`no-hardcoded` 不因新键报错（`dict.ts` 在 :10 的 EXCLUDE 白名单里） | ☑（J-9：`key-coverage` 认到字面量调用点与两条键、占位符双向一致；`no-hardcoded` 绿) |
| G3 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出、exit 0 | ☑（J-10：`npx tsc -p tsconfig.main.json --noEmit` 无输出、`TSC_EXIT=0`) |
| G4 | `npx vite build` | exit 0（本次未改渲染端，跑一次确认没连带弄坏） | ☑（J-10：`npx vite build` → `✓ built in 1.23s`、`BUILD_EXIT=0`) |
| G5 | `npm test` | `Test Files 48 passed (48)` / `Tests 834 passed (834)`，与任务 2 之后逐字相同 | ☑（J-10：`Test Files 48 passed (48)` / `Tests 834 passed (834)`，与任务 2 之后逐字相同) |
| G6 | `git diff --name-only` + `git diff -U0 -- src-main/quick-launch.ts` | 恰为三个文件（`main.ts`、`quick-launch.ts`、`ipc-ql.test.ts`；词典键属任务 2 的提交，索引 K15）；`quick-launch.ts` 的删除/新增行只在 :5-6；`:171` / `:272` / `:282` / `:285` 现值一字未变 | ☑（J-22：`git status --porcelain` 代码侧恰三处（`main.ts`、`quick-launch.ts`、`ipc-ql.test.ts`）+ 4 份文档（K20）；`git diff -U0 -- src-main/quick-launch.ts` 只有 `@@ -6 +6 @@` 一行注释；`:171` / `:272` / `:282` / `:285` 未变) |

## H. 提交门（**由主代理在验收通过后执行**；子代理不 `git add`、不 commit —— 索引 G10）

| # | 项 | 命令 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 = 三个文件（plan 步骤 6 逐字；词典键已在任务 2 提交，索引 K15） | `git add src-main/main.ts src-main/quick-launch.ts src-main/ipc-ql.test.ts` | ☑（主代理执行：`git add src-main/main.ts src-main/quick-launch.ts src-main/ipc-ql.test.ts` + 4 份文档（偏离同步须与代码同提交，AGENTS.md 工作流第 4 步 / 索引 K20）；`git diff --cached --name-only` 见 J-23) |
| H2 | commit message 逐字（plan 步骤 6） | `git commit -m "fix(main): 快捷启动 exe 改走 ShellExecuteEx 提权路径，UAC 取消给出可辨文案（规格 §6.1/§6.5/§6.6）"` | ☑（主代理执行：`git commit -m "fix(main): 快捷启动 exe 改走 ShellExecuteEx 提权路径，UAC 取消给出可辨文案（规格 §6.1/§6.5/§6.6）"` → 见 J-23) |
| H3 | 勾完整性门：本表 `裸☐=0` 且 `I段 -[ ]=0`，退出码 0 | `node .superpowers/sdd/2026-10-13-quick-launch-elevated-exe/tick-census.mjs` | ☑（见 J-24：普查输出本表 `裸☐=0 I段 -[ ]=0`、退出码 0) |

## I. 完成判据

- [x] B1-B5 / C1-C10 / D1-D9 / E1-E9 / F1-F9 / G1-G6 全部成立并落勾
- [x] J 段有真实命令与真实输出（含 D2 的三处红输出与 D6-D9 的绿输出）
- [x] H1-H3 由主代理在验收通过后执行

## J. 执行记录（命令 + 真实输出摘要）

| 命令 / 动作 | 真实输出摘要 | 判定 |
|---|---|---|
| J-1（主代理）起点核对：`git log --oneline -2` / `git status --porcelain` | `1fef4e4 docs: 任务 2 验收落勾 + J 段取证…`、其父 `0a67692 feat(main): shell-execute.ts …`（= 任务 2 的提交）；porcelain 只有 `?? .superpowers/` | A1 / A7 成立 |
| J-2（主代理）D3 词典核对：`Select-String -Path src-main/i18n/dict.ts -Pattern uacCancelled` | `300: 'err.proc.uacCancelled': '{exe} 已取消管理员权限请求',`、`643: 'err.proc.uacCancelled': '{exe}: elevation request cancelled',`（恰两行；行号 = 原 :299 / :641 之后各一行，因任务 2 的插入下移） | B2 / C4 / C5 / D3 成立，本任务未改词典 |
| J-3（主代理）D1 三处改写落盘：`git diff --numstat -- src-main/ipc-ql.test.ts` | `47\t33`；:324-344 的 diff 只有标题一行 + 两行注释（断言零改动）；:346-357 与 :423-468 按 C8 / C9 改写 | D1 / B4 / C7 / F8 成立 |
| J-4（主代理）D2 红门：`npx vitest run src-main/ipc-ql.test.ts` | `❯ src-main/ipc-ql.test.ts (23 tests \| 2 failed)`；`× exe 启动失败：前缀由 shell-execute 自带… → promise resolved "{ tabId: null }" instead of rejecting`；`× 两个 exe 配置并发 ql_start… → expected [] to deeply equal [ 'notepad.exe', 'mspaint.exe' ]`；`Tests 2 failed \| 21 passed (23)`，exit 1 | D2 成立。:324-344 只改标题 / 注释 → 不红（预期如此，它的牙是 E6 / E7 的行为断言） |
| J-5（主代理）实现期真实缺陷（索引 K21）：改完适配器后首轮定向跑 | `× exe 启动失败… → TIMEOUT waiting for PROC: 日志行`、`Tests 1 failed \| 22 passed (23)`。根因取证：`node -e "const e=new Error('PROC: x'); console.log(JSON.stringify(String(e))); console.log(JSON.stringify(e instanceof Error ? e.message : String(e)));"` → `"Error: PROC: x"` 与 `"PROC: x"` —— 照 plan / spec 原伪代码写 `String(e)`，日志行行首是 `Error: `，`/^PROC:/` 断言必然等不到 | 已按规格 E21 / §6.6 更正 / §8-K7 改为 `e instanceof Error ? e.message : String(e)`；文档先改（J-6）再改代码 |
| J-6（主代理）偏离的文档同步（AGENTS.md 工作流第 4 步 / 索引 K20） | spec：新增 E21、§6.6 伪代码改为取 `message`、§8 新增 K7；plan：任务 3 步骤 1-2（补 `winShell.shellExecute` 替换 + UAC 文案断言）、步骤 1-3（补「两条 exe 必须不同」）、步骤 3（emitLog 取 `message`）；本表：C1 / C8 / C9 更正；索引：K21 | 偏离与代码同一提交；三份文档（spec / plan / 表）互相对齐 |
| J-7（主代理）D4 / D5 实现落盘 | `main.ts`：新增 `:22` 的 `import { launchShellExe, winShell, type ShellExecProcess } from './shell-execute';`，替换 `:1039-1070`（注释块 + 函数体）；`quick-launch.ts:6` 注释改为「生产侧接 shell-execute（ShellExecuteEx，…§6.6）」。**接线行号按实测写 `:1080`**（本表 A3 写的 `:1084` 因新块比旧块短 5 行、又新增一行 import 而上移；`grep 'spawnExe: (exe)'` → 1080） | D4 / D5 / C1-C3 / C6 / C10 成立 |
| J-8（主代理）D6 / G1 定向绿：`npx vitest run src-main/ipc-ql.test.ts` | `✓ src-main/ipc-ql.test.ts (23 tests) 4764ms`、`Test Files 1 passed (1)`、`Tests 23 passed (23)`，exit 0 —— 用例数与 A6 的静态计数逐字相同；并发用例真起 `notepad.exe` / `mspaint.exe` 两个进程、`ql_states` 两条各自 running、`ql_stop` 后清空 | D6 / G1 / E7 / E8 / F6 成立 |
| J-9（主代理）D7 / G2：`npx vitest run src-main/i18n/dict.test.ts src-main/i18n/key-coverage.test.ts src-main/i18n/no-hardcoded.test.ts` | `✓ no-hardcoded.test.ts (2 tests)`、`✓ dict.test.ts (11 tests)`、`✓ key-coverage.test.ts (2 tests)`、`Test Files 3 passed (3)` / `Tests 15 passed (15)`，`I18N_EXIT=0` | D7 / G2 / F4 成立：字面量调用点与两条键、占位符双向一致 |
| J-10（主代理）D8 / D9 / G3 / G4 / G5：`npx tsc -p tsconfig.main.json --noEmit`；`npx vite build`；`npm test` | tsc 无输出、`TSC_EXIT=0`；build `✓ built in 1.23s`、`BUILD_EXIT=0`；`npm test` → `Test Files 48 passed (48)`、`Tests 834 passed (834)`、`TEST_EXIT=0` | D8 / D9 / G3 / G4 / G5 / F6 成立（计数与任务 2 之后逐字相同） |
| J-11（主代理）变异 E1a：删掉适配器 catch 里的 `throw e` | 用例「exe 启动失败…」`expected [Function] to throw error matching /^PROC: / but got 'Cannot read properties of undefined (…'`、`Tests 1 failed \| 22 passed (23)` | E1 有牙；红因与本表预测的 `promise resolved "{ tabId: null }"` 不同（那条描述旧异步路径）→ 已在 E1 行记实 |
| J-12（主代理）变异 E1b：去掉 `shell-execute.ts` 里的 `'PROC: ' +` 前缀 | `expected [Function] to throw error matching /^PROC: / but got 'no-such-exe-zzz.exe 已取消管理员权限请求'` | E1 / C10 的前缀有牙 |
| J-13（主代理）变异 E2：删掉 catch 里的 `emitLog(…)`（只留 rethrow） | `TIMEOUT waiting for PROC: 日志行`、`Tests 1 failed \| 22 passed (23)` | E2 有牙（与 J-5 的真实缺陷同一红因） |
| J-14（主代理）变异 E3：`shell-execute.ts` 的 `if (r.win32Error === ERROR_CANCELLED)` → `if (false)` | `expected 'PROC: no-such-exe-zzz.exe 启动失败: win32…' to contain 'no-such-exe-zzz.exe 已取消管理员权限请求'` | E3 有牙（R1 / K2 的可辨文案） |
| J-15（主代理）变异 E4：`launchShellExe(winShell, exe)` → `launchShellExe(winShell, ((globalThis as any).__firstExe \|= exe))`（模拟串台） | 并发用例 `expected [ 'notepad.exe', 'notepad.exe' ] to deeply equal [ 'notepad.exe', 'mspaint.exe' ]`（正是本表 E4 预测的红因）；失败用例同时红（`expected 'PROC: notepad.exe 已取消…' to contain 'no-such-exe-zzz.exe 已取消…'`）—— 变异把值挂在 `globalThis` 上跨用例泄漏，属变异自身的副作用 | E4 有牙 |
| J-16（主代理）变异 E5：`:1080` 接线 `spawnExeProcess(exe, qlStartContextOrThrow('spawnExe').configId)` → `spawnExeProcess(exe, null)` | **不红**：`Tests 23 passed (23)`，exit 0 | 本表 E5 预测的红因不成立 → 牙位更正记入 E5 行与索引 K22（适配器 `void configId`，`ctxOk` 由用例自己调 `guard('probe')`） |
| J-17（主代理）变异 E5b：`ql_start` 里的 `qlStartContext = { configId: id, available };` → `qlStartContext = null; void available;` | 四条红：`STATE: ql_start context is missing at spawnExe (called outside ql_start)`（exe 两条 + 修复轮 1 · 重要 #1 的一条）、`STATE: … at terminalAvailable`（shell 那条）、失败用例 `expected [Function] to throw error matching /^PROC: / but got 'STATE: ql_start context is missing at…'` | 「spawnExe 时刻槽非空且属于本次」这条有牙（E5 的真实牙位） |
| J-18（主代理）变异 E6：`proc = launchShellExe(winShell, exe)` → `proc = (ps.launch(exe, [], configId), ps) as unknown as ShellExecProcess`（复用 ps 单例） | `expected { Object (running, stopping, ...) } to deeply equal { running: false, …(2) }`（:324-344 的 `get_state` 断言，正是预测红因）+ 失败用例 `promise resolved "{ tabId: null }" instead of rejecting` + 并发用例 `expected [] to deeply equal […]` | E6 有牙 |
| J-19（主代理）变异 E7：`isRunning: () => proc.isRunning()` → `isRunning: () => false` | `expected { qlshape02: { …(2) }, …(1) } to deeply equal { …(2) }`（两条用例的 `ql_states` 断言红）、`Tests 2 failed \| 21 passed (23)` | E7 有牙 |
| J-20（主代理）变异 E9：`onExit(cb) { proc.onExit((code) => cb(code)); }` → `…(() => cb(0))`（吞掉退出码） | **不红**：`Tests 23 passed (23)` | exe 侧没有断言退出码取值的用例（`ql-exit` 载荷断言 :310-322 走 shell 配置）→ 牙在 J-22（`quick-launch.ts` 一字未改）+ 任务 4 真机清单第 5 步；记入索引 K22 |
| J-21（主代理）变异脚本还原校验 | `.temp/mut-task03.mjs` 末行 `还原校验 main = true \| shell = true`；`.temp/mut-task03b.mjs` 末行 `还原校验 = true` | 工作区未被变异污染，J-8 / J-10 的绿代表提交里的代码 |
| J-22（主代理）范围核对：`git status --porcelain` / `git diff -U0 -- src-main/quick-launch.ts` / `git diff --numstat` | porcelain 代码侧 = `M src-main/main.ts`、`M src-main/quick-launch.ts`、`M src-main/ipc-ql.test.ts`（+ 4 份文档 + `?? .superpowers/`）；`-U0` 只有 `@@ -6 +6 @@` 一行注释；numstat = `main.ts 23\t27`、`ipc-ql.test.ts 47\t33`、`quick-launch.ts 1\t1`；`:171` / `:272` / `:282` / `:285` 不在任何 hunk 里 | B1-B5 / F1 / F2 / F3 / F7 / G6 / E9 成立 |
