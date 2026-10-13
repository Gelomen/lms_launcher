# 快捷启动「可执行程序」提权启动 — check 表索引

- 计划：[2026-10-13-quick-launch-elevated-exe.md](../../plans/2026-10-13-quick-launch-elevated-exe.md) · 规格：[2026-10-13-quick-launch-elevated-exe-design.md](../../specs/2026-10-13-quick-launch-elevated-exe-design.md)
- 生成时间：2026-10-13 19:5x（主代理；文档提交 `0f7c597` 之后、「开始实现」之前）
- 工作基线：分支 `feat/quick-launch`，HEAD `0f7c597 docs: 快捷启动 exe 需要管理员权限时提权启动 —— spec + plan（代码一行未改）`，`git status --porcelain` 只要求**无已跟踪改动**（生成期未跟踪的 `.superpowers/` 与 `docs/superpowers/checks/` 是预期产物 —— 索引 K13）
- 测试基线（规格 E18，主代理 19:25 实测）：`npm test` → `Test Files 47 passed (47)` / `Tests 826 passed (826)`，exit 0
- 普查：`node .superpowers/sdd/2026-10-13-quick-launch-elevated-exe/tick-census.mjs`（已就位；H3 用它）

## 清单表

| # | 任务 | 表 | 前置 | 钉住的审查重点 |
|---|---|---|---|---|
| 1 | 引入 koffi 依赖 + 打包解包声明 | [task-01-koffi-dependency-and-asarunpack.md](task-01-koffi-dependency-and-asarunpack.md) | 无 | R4 |
| 2 | `src-main/shell-execute.ts` —— Win32 接缝与进程生命周期 | [task-02-shell-execute-module.md](task-02-shell-execute-module.md) | 任务 1（要 import koffi） | R1 R2 R3 R5 |
| 3 | `main.ts` 适配器接线 + 新词典键 + `ipc-ql.test.ts` 两处改写 | [task-03-main-adapter-and-i18n.md](task-03-main-adapter-and-i18n.md) | 任务 2（消费其导出） | R1 R3 R6 |
| 4 | 打包真机硬门（用户执行） | [task-04-packaged-realmachine.md](task-04-packaged-realmachine.md) | 任务 1–3 | R1 R2 R3 R4 |

派单粒度与顺序按 AGENTS.md 第 4 步：**一次一个子代理，按 1→2→3 串行**（编号即拓扑序），任务 4 由主代理打包 + 用户验收。

## G 组：全局约束（逐条可验证）

| # | 约束 | 怎么验 | 落在哪张表 |
|---|---|---|---|
| G1 | 改动文件只有：`package.json`、`package-lock.json`、`electron-builder.yml`、新建 `src-main/shell-execute.ts` / `src-main/shell-execute.test.ts`、`src-main/main.ts`（`:1038-1074`）、`src-main/i18n/dict.ts`、`src-main/ipc-ql.test.ts`、`src-main/quick-launch.ts`（**仅 :5-6 注释**） | 每任务末尾 `git diff --name-only` 逐字比对 | T1 B / T2 B / T3 B |
| G2 | 不改 `src-main/process.ts`、不改 `main.ts:64` 的 `ps` 单例、不改 `quick-launch.ts` 任何可执行语句、不改 `src/App.vue` / `src/modules/*` / `src-main/quick-launch-terminals.ts` | `git diff --name-only` + `Select-String` 复核 `quick-launch.ts:171` 签名与 `:272` 调用一字未变 | T3 B/F |
| G3 | `QlDeps.spawnExe(exe)` 返回形状逐字 = `{ onExit(cb); stopGraceful(s); isRunning() }`；`main.ts:1084` 接线与 `qlStartContextOrThrow` 守卫不动 | 读 `quick-launch.ts:171` 与 `main.ts:1084` 现值；`ipc-ql.test.ts` 的守卫用例仍绿 | T3 C/G |
| G4 | Win32 取值逐字：`fMask = 0x40 \| 0x04`、`lpVerb = null`（不是 `"runas"`）、`nShow = 1`、`lpParameters = null`、`lpDirectory = null`、`cbSize = koffi.sizeof(SHELLEXECUTEINFOW)` | 读 `shell-execute.ts` 源码逐字比对规格 §6.3 | T2 C/E |
| G5 | 错误前缀只用 `PROC:`（索引 G7 of 旧 feature 的五前缀口径）；**写进 sys 日志通道的行行首必须是 `[lms_launcher] `，`PROC:` 紧随其后**（索引 K23；抛出的 Error 仍以 `PROC: ` 开头）；新键只有 `err.proc.uacCancelled`（zh/en 同时、占位符只有 `{exe}`）；其余失败复用 `err.proc.spawnFail` 带 `win32=<码>`；调用点必须是字面量 `t('…')` | `key-coverage.test.ts` + `no-hardcoded.test.ts` + `dict.test.ts` 定向绿；读调用点 | T3 C/E/G |
| G6 | 包管理器 = npm（`node_modules/.package-lock.json` 存在、`node_modules/@lydell` 为真实目录、`pnpm-lock.yaml` 停在 `fa8f87e`）；**只改 `package.json` + `package-lock.json`**，`pnpm-lock.yaml` 不进暂存 | `git diff --name-only` 不含 `pnpm-lock.yaml` | T1 B/H |
| G7 | 不加 `allowScripts` 条目、不 `npm rebuild koffi`；koffi 的 `install` 脚本被拦下仍可用由加载冒烟证明 | 读 `package.json` 的 `allowScripts` 仍只有 electron；`node --input-type=module -e "import koffi …"` 输出 `function function 16`（索引 K16） | T1 D/F |
| G8 | 命令口径：定向 `npx vitest run <路径>`、全量 `npm test`、类型 `npx tsc -p tsconfig.main.json --noEmit`、语法 `npx vite build` | 每张表 D/G 段的命令逐字 | 全部 |
| G9 | 基线 = 47 files / 826 tests（规格 E18）。**实现者不重跑全量**；每任务末尾跑一次，计数必须 = 基线 + 该任务新增，且不得有任何减少 | 任务 2 后应为 `Tests 834 passed (834)` / `Test Files 48 passed (48)`；任务 3 后计数不变；差额必须在 J 段说明 | T2 G / T3 G |
| G10 | 提交信息 Conventional Commits + 中文；**由主代理在验收通过后执行**；子代理不 `git add`、不 commit | 各表 H 段 + J 段留 HEAD 证据 | 全部 |
| G11 | 不得扩范围（规格 §5 非目标：`process.ts`、提权引导、manifest 检测、参数/cwd、终端类型、额外日志、提权进程杀树） | 各表 F 段逐条对照 | 全部 |

## R 组：审查重点 → 钉住它的地方

| # | 风险（规格 §9 对应项） | 期望行为 | 钉住 |
|---|---|---|---|
| R1 | UAC 点「否」（`GetLastError()=1223`） | 日志 `[lms_launcher] PROC: <exe> 已取消管理员权限请求`（行首 `[lms_launcher] `，索引 K23）、按钮回落绿 `[启动]`、无残留运行态；**不再出现 `EACCES`** | T2 E3、T3 E（`ipc-ql.test.ts:346-357` 改写）、T4 清单第 3 步 |
| R2 | 提权进程 `taskkill /T /F` 打不到（E9） | `TerminateProcess(句柄, 1)` 兜底真停，`[停止]` 不挂死 | T2 E5、T4 清单第 2 步 |
| R3 | 不需要管理员的 exe 回退（notepad，E8） | 照常启动/停止/报退出码，且**不多弹一次 UAC**（`lpVerb=null`） | T2 E6、T3 E（并发用例真起两个 notepad）、T4 清单第 4 步 |
| R4 | `koffi.node` 无法从 asar 内 dlopen | `asarUnpack` 两条到位；打包目录里能看到该文件 | T1 D/E、T4 步骤 2 + 清单第 5 步 |
| R5 | 定时器泄漏 / `onExit` 多次（R6） | 退出只上报一次；`clearInterval` + `close()` 都执行 | T2 E2、E7 |
| R6 | i18n 三门 | 新键 zh/en 同时、字面量调用点与占位符逐字一致、源码零中文字面量 | T3 G（`dict.test.ts` / `key-coverage.test.ts` / `no-hardcoded.test.ts` 定向） |
| R7 | UAC 挂起期间主线程同步阻塞（实测 4.1s，规格 R1） | 本次接受（与 `detectTerminals` 的 `spawnSync` 同口径，E16）；真机只观察现象、不判过否 | T4 清单「顺带观察」 |
| R8 | 配置的 exe 路径不存在 → Shell 弹自己的系统错误框并阻塞主线程，`PROC:` 日志要等用户点「确定」（E19：`SEE_MASK_FLAG_NO_UI` / `SetErrorMode` 都压不住） | 本次接受（用户 2026-10-13 21:47 三选一选定），不加预检、不改 §6.1；单测不得用会弹框的目标（改伪句柄，E20） | T2 C5 / E8 / F8、T4「顺带观察 2」 |

## V 组：跨任务回归门

| 时机 | 必须跑 | 预期 |
|---|---|---|
| 任务 1 末尾 | `npm test` | 与基线逐字相同：47 / 826（本任务不加用例） |
| 任务 2 末尾 | `npx tsc -p tsconfig.main.json --noEmit`；`npm test` | tsc 无输出；48 / 834（+8 全在新文件） |
| 任务 3 末尾 | `npx vitest run src-main/ipc-ql.test.ts`；i18n 三份；tsc；`npx vite build`；`npm test` | ipc-ql 23 passed（用例数不变）；i18n 全绿；tsc/build exit 0；全量仍 48 / 834 |
| 每个任务验收前（主代理） | 独立复跑该表 G 段全部命令 | 与 J 段同值；不接受实现者自述 |
| 任务 4 | `.\\build.bat` + 解包核对 + 用户真机 6 步 | 产物里 `app.asar.unpacked\\node_modules\\@koromix\\koffi-win32-x64\\win32_x64\\koffi.node` 存在；6 步逐条回报 |

## K 组：已定口径（含生成表时的取证）

| # | 口径 | 依据 | 落在哪 |
|---|---|---|---|
| K1 | 新模块名 `src-main/shell-execute.ts`（Win32 API 名，避免与「终端 shell 类型」混） | 规格 §8-K1 | T2 |
| K2 | `err.proc.uacCancelled` 带 `{exe}` 占位符 | 规格 §8-K2（这条路径上 `log.launcher.start.cmd` 不会写，见 `quick-launch.ts:285`） | T3 |
| K3 | 判存活用 `WaitForSingleObject(h,0)`，不用 `STILL_ACTIVE=259` 比对 | 规格 §8-K3 / E11（真实退出码 259 会歧义） | T2 |
| K4 | `fMask` 必须含 `SEE_MASK_FLAG_NO_UI` | 规格 §8-K4（否则 Shell 自己弹错误框，绕过日志通道） | T2 |
| K5 | 主线程同步阻塞本次接受 | 规格 §8-K5 / §6.9 / E16 | T4 观察项 |
| K6 | `quick-launch.ts:5-6` 只改注释、可执行代码零改动 | 规格 §8-K6 | T3 |
| K7 | 旧口径「exe 走 spawn / 复用 ProcessState」（旧规格 §7.3 / 索引 K13）被本 feature 取代；`ipc-ql.test.ts:423-468` 的 `launch(exe, [], configId)` 逐字断言作废 | 规格开头「取代关系」/ §7.1 | T3 |
| K8 | 生效包管理器是 npm 11.19.0，`pnpm-lock.yaml` 已落后（`fa8f87e` 2026-09-14）→ 本次不刷新它 | 主代理实测（`node_modules/.package-lock.json` 存在、`@lydell` 非符号链接、两份 lockfile 的最近提交 `90c9320` / `fa8f87e`） | T1 B/H、G6 |
| K9 | 任务 3 的适配器保留未使用的 `configId` 形参（`void configId`），`main.ts:1084` 接线一字不改 | `tsconfig.main.json` 无 `noUnusedParameters`（实测）；:1084 的 `qlStartContextOrThrow('spawnExe')` 是修复轮 1 · 重要 #2 的槽守卫，删掉即静默降级 | T3 C/F |
| K10 | 打包产物不污染工作区：`dist-release/` 被 `.gitignore:2` 的 `dist-*/` 忽略 | 主代理实测 `git check-ignore -v` 命中 | T4 B |
| K11 | 计数「无减少」的判据：全量总数 = 基线 + 新增，且唯一改动的测试文件计数增量 = 新增数 ⇒ 其余文件不可能减少 | 沿用上一 feature 索引 K11 的算术判据 | T2 G / T3 G |
| K12 | `killTree` 的 PID 开关按 plan 逐字写 `/PID`（taskkill 对 `/PID` 与 `-PID` 都接受）；plan 原写「utf16le 先例 = `process.ts:87`」**不实**，已改为 `src-main/quick-launch-terminals.ts:96`（实测 `buf.toString('utf16le')`；`process.ts:87` 与 `quick-launch.ts:134` 是 taskkill 调用、用 `-PID`、无 encoding） | 任务 2 表 A4 的实测 + 本次复核 grep；plan 步骤 3 已同步更正（同一提交） | T2 A4 / C10 |
| K13 | 索引「工作基线」的 `git status --porcelain` 判据 = **无已跟踪改动**；生成期未跟踪的 `.superpowers/`（普查脚本）与 `docs/superpowers/checks/`（本表目录）属预期产物 | 实测：`git status --porcelain` 恰为 `?? .superpowers/` 与 `?? docs/superpowers/checks/`，`git diff --stat` 空 | T1 A1 |
| K14 | **本次由主代理内联实现**（用户 2026-10-13 21:04 明确「不使用 SDD，直接实现」）：不派实现子代理，但 check 表仍逐行执行并落勾、J 段填真实命令输出、提交仍按各表 H 段、顺序仍按 plan 任务号 | 用户指令 + AGENTS.md「例外」条款（写明并获明确同意的偏离）；执行载体改为 `executing-plans` | 全部四张表的 H/J 段 |
| K15 | **词典两条键（`err.proc.uacCancelled` zh/en）随任务 2 的实现同一提交落地**，任务 3 只核对不再改；任务 2 的 H1 暂存范围相应为三个文件、任务 3 的为三个文件 | 任务 2 表 G3 的实测：`key-coverage.test.ts:117-129` 扫 `src-main/**` 的非 `.test.ts` 文件，「有调用点、无键」必红 → plan 原排序（键放任务 3 步骤 2）会让任务 2 末尾的全量必为 1 failed。plan 任务 2 步骤 2b / 任务 3 步骤 2 与两张表的 B/G/H 段已同步（同一提交） | T2 B3/G3/G6/H1、T3 B2/D3/G6/H1 |
| K16 | 加载冒烟的预期输出是 `function function 16`，不是 `…8`：x64 下 `struct{uint32; void*}` = 4 字节字段 + 4 字节对齐填充 + 8 字节指针。同一程序里 `koffi.sizeof(SHELLEXECUTEINFOW)` 实测 **112**，与规格 E13 一致 | 主代理 2026-10-13 21:12 实测（`SMOKE_EXIT=0` / `SIZEOF_EXIT=0`）；plan 任务 1 步骤 2 与任务 1 表 C5/D3 已同步更正 | T1 C5 / D3、索引 G7 |
| K17 | **`SEE_MASK_FLAG_NO_UI` 不覆盖「文件 / 路径不存在」的 Shell 错误框**（`fMask=0x44/0x144/0x104` 都弹、`SetErrorMode(0x3)` 也压不住；解码回读证明 `fMask` 确实写进了结构体）。该位保留，弹窗作为已知边界**接受**：不加 `existsSync` 预检、不改 §6.1 唯一路径。连带：单测第 8 条「真接缝冒烟」不能用会弹框的目标（实测卡住 vitest worker 383s），改为当前进程伪句柄 `pidOf(-1)=本进程 pid` / `isAlive(-1)=true`（E20） | 用户 2026-10-13 21:47 在「预检 / 接受弹窗 / 换回 spawn」中选「接受弹窗，只改测试」；取证 `.temp/uac-probe/no-ui-probe.mjs`（`no-ui-A..E.log`）、`errmode-probe.mjs`（`errmode-G.log`）、`pseudo-handle-probe.mjs`；已同步 spec §3 E19/E20、§6.3、§7.1-8、§7.2、§8-K4、§9-R8 与 plan 任务 2 步骤 1/3、任务 4 步骤 3（同一提交） | T2 C5 / E8 / F8、T4 顺带观察 2、索引 R8 |
| K18 | `stopGraceful` 第 3 步的「仍存活」必须主动调 `api.isAlive(句柄)`，不能只看 `exited` 标志：`timeoutSecs=0` 时 100ms 轮询一次都没跑，只看标志会对已消失的进程多调一次 `terminate` | 任务 2 表 E6 的用例实测红（`expected "spy" to not be called at all, but actually been called 1 times`）；规格 §6.7 第 3 步原文就是「仍存活 → terminate」 | T2 E6、plan 任务 2 步骤 3 |
| K19 | **任务 2 三条用例的取证方式更正**（断言本身不变）：① E2 用 `vi.useFakeTimers()` + `vi.getTimerCount()===0` 才能证明 `clearInterval` 真的执行（真定时器下漏掉它不红：`finish()` 的 `exited` 守卫挡住后续 `isAlive` / `onExit`）；② E7 必须**并发**两次 `stopGraceful` 才碰得到 `stopping`（串行时第一次已置 `exited`，走「已退出直接返回」）；③ E5 的 `calls` 顺序断言补 `'close'`（terminate 后退出落地 → 关句柄，规格 §6.4）。另：G6 判据改用 `git status --porcelain`（新建文件不在 `git diff --name-only` 里） | 变异取证实测：`.temp/mut-task02.mjs` / `.temp/mut-task02b.mjs`（E2a → `expected 1 to be +0`；E7 串行写法 `Tests 8 passed (8)` 不红、改并发后 `called 1 times, but got 2 times`）；本表 E2 / E5 / E7 / G6 行已同步 | T2 E2 / E5 / E7 / G6、J-10 / J-11 / J-15 / J-17 / J-23 |
| K20 | 本次偏离（E19 / R8）的 **spec + plan + 两张 check 表与代码同一提交**，所以任务 2 的 H1 暂存范围在三个代码文件之外另加 4 份文档 | AGENTS.md 工作流第 4 步「偏离 spec：先改 spec / plan / check 表（同一 commit）再改代码」优先于 plan H1 的逐字范围；任务 1（纯依赖、无偏离）不受影响 | T2 H1、J-24 |
| K21 | 适配器写日志通道取 `e.message`，不取 `String(e)`：`String(new Error('PROC: x'))` = `Error: PROC: x`（实测 `node -e`），行首前缀被吃掉 → 违反索引 G7 与规格 §6.6 的可观察要求 | 规格 E21 / §6.6 伪代码更正 / §8-K7；plan 任务 3 步骤 3 已同步；实测红因 = `npx vitest run src-main/ipc-ql.test.ts` 的 `TIMEOUT waiting for PROC: 日志行` | T3 C1 / E2、J-4 |
| K22 | 任务 3 的 E5 牙位更正：`ctxOk` 测的是「spawnExe 时刻槽非空且属于本次」（由用例里的 spy 自己调 `guard('probe')`），**不测**接线的 configId 传参 —— 把接线改成 `spawnExeProcess(exe, null)` 实测不红（适配器 `void configId`）。有牙的变异是把 `ql_start` 的槽赋值置空 → `STATE: ql_start context is missing at spawnExe`。另：E9（退出码链路）在 exe 侧无单测牙（`cb(0)` 变异 23 全绿），牙在 `quick-launch.ts` 一字未改 + 任务 4 真机清单第 5 步 | 变异取证实测 `.temp/mut-task03.mjs` / `.temp/mut-task03b.mjs`（E5 变异 `Tests 23 passed (23)`；E5b 四条红） | T3 E5 / E9、J-16 / J-17 / J-20 |
| K23 | **sys 日志行的行首必须是 `[lms_launcher] `，`PROC:` 分类标记紧随其后**：`main.ts` 的 exe 失败适配器改为 `emitLog('[lms_launcher] ' + (e instanceof Error ? e.message : String(e)), 'sys')`。抛出的 Error 不变（`shell-execute.ts:196/198` 仍以 `PROC: ` 开头，`ipc-ql.test.ts:357` 的 `rejects.toThrow(/^PROC: /)` 不变）。K21 里「行首前缀」的措辞据此理解为「紧跟 `[lms_launcher] ` 之后」。`main.ts:334`（llama-server 启动失败的 `PROC:` 行）同样缺前缀，按规格 Q9（llama-server 不纳入）留在本次范围外，另立改动 | 真机清单第 3 步用户回报（2026-10-13 23:1x）：日志区出现裸 `PROC: E:\QiYou\QiYou.exe 已取消管理员权限请求`，与同卡片成功行 `[lms_launcher] 启动命令 · …` 不一致；口径依据 `src/App.vue:107-110`（`appendSys` 注释「sys 行统一 `[lms_launcher]` 前缀」）与 `main.ts:324` / `:364` / `:1078` 的既有写法。牙：去掉前缀 → `npx vitest run src-main/ipc-ql.test.ts` 的 `TIMEOUT waiting for [lms_launcher] PROC: 日志行`（实测）；带前缀 23 passed、全量 48 / 834、tsc exit 0。已同步 spec §6.5 / §6.6 / §7.1 / §7.2 / §8-K7 + 新增 §8-K8、plan 全局约束与任务 3 步骤 2/3、任务 4 清单第 3 步 | T3 C10 / E3、T4 E3、索引 G5 / R1 |
