# 快捷启动启动项的「管理员」权限开关 — check 表索引

- 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md)
- 生成时间：2026-10-14 18:5x（主代理；文档提交 `aaf5e0f` 之后、「开始实现」之前）
- 工作基线：分支 `feat/quick-launch-admin`（自 `feat/quick-launch` @ `b8dbdc0`），HEAD `aaf5e0f docs: 快捷启动启动项的管理员权限开关 —— spec + plan（代码一行未改）`；`git status --porcelain` 只要求**无已跟踪改动**（生成期未跟踪的 `.superpowers/`（普查脚本）与 `docs/superpowers/checks/`（本表目录）属预期产物 —— 索引 K24）
- 测试基线（主代理 2026-10-14 19:07 实测）：`npm test` → `Test Files 48 passed (48)` / `Tests 835 passed (835)`，`Duration 9.35s`，exit 0。跑这条命令需要完全访问沙箱（索引 K23）
  - 静态佐证（本表生成时实测）：仓库现有 `*.test.ts` 恰 **48** 份（`(Get-ChildItem -Recurse -Include *.test.ts -File | Measure-Object).Count` = 48）；本 feature 新增 4 份测试文件（`ql-host-protocol.test.ts` / `ql-elevated.test.ts` / `ql-pty-host.test.ts` + 既有文件内新增用例）→ 任务 2 之后应为 49 份、任务 4 之后 50 份、任务 5 之后 51 份
  - 上一 feature 的基线（供参考，不可直接用）：`docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/00-index.md:6` = 47 files / 826 tests（2026-10-13 19:25 实测）
- 普查：`node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs`（已就位；各表 H3 用它）
- 取证探针（`.temp/ql-admin-probe/`，gitignore 内，规格 §3 的 P1–P12 出处）：`probe3.mjs`（环境块继承对照）、`probe5.mjs`（硬链接 node.exe / cmd 包装）、`probe6.mjs` / `probe7.mjs`（经 Shell 起宿主，提权与非提权）、`probe8.mjs`（asar 内脚本）、`probe9.mjs`（管道 + 帧往返，任务 4 D3 复跑它）

## 清单表

| # | 任务 | 表 | 前置 | 钉住的审查重点 |
| --- | --- | --- | --- | --- |
| 1 | 配置层 `admin` 字段 | [task-01-config-admin-field.md](task-01-config-admin-field.md) | 无 | RF2 |
| 2 | 帧协议 `src-main/ql-host-protocol.ts` | [task-02-frame-protocol.md](task-02-frame-protocol.md) | 无（按 plan 顺序在任务 1 之后） | RF4 RF5 |
| 3 | 可执行程序的「管理员」= `runas` | [task-03-exe-runas.md](task-03-exe-runas.md) | 任务 1 | RF2 |
| 4 | 主进程侧命名管道与起宿主（`ql-elevated.ts` 第一段） | [task-04-pipe-and-launch-host.md](task-04-pipe-and-launch-host.md) | 任务 2、任务 3 | RF4 RF7 |
| 5 | 宿主入口 `src-main/ql-pty-host.ts` | [task-05-pty-host-entry.md](task-05-pty-host-entry.md) | 任务 2、任务 4 | RF6 RF7 |
| 6 | 主进程侧 `ElevatedPtyProcess`（`ql-elevated.ts` 第二段） | [task-06-elevated-pty-process.md](task-06-elevated-pty-process.md) | 任务 2、任务 4 | RF4 RF5 RF6 |
| 7 | `QuickLaunchManager` 的 admin 分支 + `main.ts` 接线 | [task-07-manager-admin-branch.md](task-07-manager-admin-branch.md) | 任务 1、任务 6 | RF1 RF2 |
| 8 | 弹窗两态的「管理员」开关 + 词典键 | [task-08-modal-admin-switch.md](task-08-modal-admin-switch.md) | 任务 1、任务 7 | RF3 |
| 9 | `build.bat` 预建硬链接 + 打包真机门（用户执行） | [task-09-packaging-realmachine.md](task-09-packaging-realmachine.md) | 任务 1–8 | RF7 |

派单粒度与顺序按 AGENTS.md 工作流第 4 步：**一次一个子代理，按 1→2→…→9 串行**（编号即拓扑序）；任务 9 由主代理打包 + 用户真机验收。

## G 组：全局约束（逐条可验证）

| # | 约束 | 怎么验 | 落在哪张表 |
| --- | --- | --- | --- |
| G1 | 错误前缀只用 `VALIDATION:` / `STATE:` / `PROC:`（`quick-launch-config.ts:22`、`quick-launch.ts:12` 的既有口径），不新增前缀 | 读新增模块的 `throw new Error(…)` 逐字；`Select-String -Pattern "(YAML\|VALIDATION\|STATE\|PROC):"` 复核 | T3 F / T4 F / T6 F / T7 F |
| G2 | 词典只新增 `ql.modal.admin` 一个键（zh `dict.ts:176` 之后、en `:519` 之后）；其余文案复用 `err.proc.uacCancelled` / `err.proc.spawnFail` / `err.ql.ptySpawn` | `npx vitest run src-main/i18n` 三门 + `git diff src-main/i18n/dict.ts` 只两行 | T8 B/C/G；T3 E3；T4 E5；T6 F1 |
| G3 | 不勾选的路径逐字节不变：exe 仍 `lpVerb=null`（`shell-execute.ts:87`）、非 admin 的 shell 仍走 `createShellProcess`（`quick-launch.ts:223-225`） | T3 E2 与 T7 E2 的用例；`git diff' 里 `shell-execute.ts' 只改签名与两处取值 | T3 E2 / T7 E2 |
| G4 | 不动 `src-main/process.ts`、不动 llama-server 启动路径、不动 `QuickLaunchManager` 构造签名（`quick-launch.ts:215-217`）与 `ShellProcess` 接口（`:175-182`） | `git diff --name-only' 不含 `process.ts`；读 `quick-launch.ts:175-182` 现值 | T6 F3 / T7 F4 |
| G5 | 每任务收尾门：`npx tsc --noEmit -p tsconfig.main.json` 干净 + 定向测试绿 + `npm test` 全绿 | 各表 D/G 段命令逐字 | 全部 |
| G6 | i18n 三门（`key-coverage` / `dict` / `no-hardcoded`）任何任务后不得变红；新增 `src-main/*.ts` 不含汉字字面量（`no-hardcoded.test.ts:26-28` 扫全部） | `npx vitest run src-main/i18n' | T2 F / T4 F / T5 F / T6 F / T8 G3 |
| G7 | 不新增依赖、不改 `package.json` 依赖段、不新增 `extraFile`（除非规格 §9-R1 命中并同 commit 改三份文档） | `git diff package.json package-lock.json electron-builder.yml' 为空 | T1 F / T2 F / T9 B2/F1 |
| G8 | 子代理不 `git add`、不 commit；改动留在工作区等验收 | 各表 A1 的 `git status --porcelain` 证据 + H 段由主代理执行 | 全部 |
| G9 | 只改该任务 B 段列出的文件，越界即不勾 | 每任务末尾 `git diff --name-only' 与 B 段逐字比对 | 全部 |

## R 组：审查重点 → 钉住它的地方

| # | 风险（规格 §9 / 用户澄清对应项） | 期望行为 | 钉住 |
| --- | --- | --- | --- |
| RF1 | 自动命令释放顺序在提权路径上被复制成另一套（`quick-launch.ts:249-253`：先转渲染端、再放命令） | 提权路径同一顺序：`onData` 转发在前、`releaseAutoCommand` 在后 | T7 E4 |
| RF2 | 「不勾选 = 行为不变」被破坏（exe 多弹 UAC、shell 走错分支） | exe 的 `verb === null`；shell 的非 admin 走本地 `createShellProcess` | T1 E5、T3 E2、T7 E2 |
| RF3 | 定高 218px 与「3 个控件格」门在两态不再同时成立 | 两态都数到 3 个网格直接子节点控件格；`:669` / `:688` 的 218px 断言不破；`BOX_H = 218`（`test.ts:736`）不改 | T8 E6 + D4 宽度取证 |
| RF4 | 失败路径泄漏管道句柄 / 进程句柄 | 启动失败与握手超时都关两个句柄 | T4 E4、T6 E7 |
| RF5 | 退出码来源搞错（宿主崩溃 vs 正常退出） | `EXIT` 帧优先；无帧时回落 `GetExitCodeProcess`（取证 P12） | T6 E3 / E4 |
| RF6 | [停止] / 退出应用留下孤儿 ConPTY | STOP 帧 → 宿主自己 `stopGraceful`（提权进程里 `taskkill` 打得到树）→ 仍活才委托句柄停止 | T5 E5 / E6、T6 E6、T7 E5 |
| RF7 | 提权宿主脚本在 asar 内不可执行 / 原生模块解析不到（规格 §9-R1） | 打包产物核对 + 真机门；命中就按回退口径改 `electron-builder.yml` 并同 commit 同步三份文档 | T9 C2 / E2、T4 D3、T5 D3 |

## V 组：跨任务回归门

| 时机 | 必须跑 | 预期 |
| --- | --- | --- |
| 任务 1 末尾 | `npm test' | 基线 + 新增用例数；`src-main/ipc-ql.test.ts' 与 `src/modules/QuickLaunchModal.test.ts' **未改**仍绿（改了就是越界） |
| 任务 2 末尾 | `npx vitest run src-main/ql-host-protocol.test.ts`；i18n 三门；tsc；`npm test' | 新文件全绿；i18n 全绿（新文件被 no-hardcoded 扫到）；tsc 干净 |
| 任务 3 末尾 | `npx vitest run src-main/shell-execute.test.ts src-main/ipc-ql.test.ts`；tsc；`npm test' | `ipc-ql.test.ts:327-349` 的既有 exe 用例一字未改且绿 |
| 任务 4 末尾 | `npx vitest run src-main/ql-elevated.test.ts`；`node .temp/ql-admin-probe/probe9.mjs`；tsc；`npm test' | 探针输出与规格 §3-P10 一致（`connected after …`、`WriteFile … ok true`、`child exit {"c":7}`） |
| 任务 5 末尾 | `npx vitest run src-main/ql-pty-host.test.ts`；`npx vitest run src-main/quick-launch.test.ts`；i18n 三门；tsc；`npm test' | 新文件全绿；`quick-launch.test.ts' 未改仍绿；冒烟的 `EPERM conpty` 属预期（索引 K22） |
| 任务 6 末尾 | `npx vitest run src-main/ql-elevated.test.ts src-main/quick-launch.test.ts src-main/shell-execute.test.ts`；tsc；`npm test' | 停止语义的既有用例一字未改且绿 |
| 任务 7 末尾 | `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts`；i18n 三门；tsc；`npm test' | 页签事件 / 自动命令 / 停止的既有用例一字未改且绿 |
| 任务 8 末尾 | `npx vitest run src/modules/QuickLaunchModal.test.ts`；`npx vitest run src/modules`；i18n 三门；tsc；`npm test' | `TemplateModal.test.ts' 一字未改且绿；`218px` 两处断言不破 |
| 每个任务验收前（主代理） | 独立复跑该表 G 段全部命令 | 与 J 段同值；不接受实现者自述 |
| 任务 9 | `npm test` → `cmd /c build.bat` → 产物核对三条命令 → 用户真机 9 条 + 前置 feature 的 E1–E7 | `win-unpacked\\node.exe` 与 `lms_launcher.exe` 同 inode；`app.asar\\dist-main\\ql-pty-host.js` 在；`app.asar.unpacked` 里 `@lydell` / `koffi` 在；真机逐条回报 |

## K 组：已定口径（含生成表时的取证）

| # | 口径 | 依据 | 落在哪 |
| --- | --- | --- | --- |
| K1–K15 | 规格 §8 的 15 条 grill-me 口径原样生效（提权 PTY 宿主 / argv 只带管道名与 token / 零新键 / `admin` 总是显式落盘 / `.bool-switch` / 列表不加标记 / 只一个词典键 / 两态各一行的布局 / WSL 与已提权不特判 / 不加日志 / 验收分工 / 纯 Node 宿主 / 硬链接 `node.exe` / 接受 5.7–5.9s 阻塞 / 样式复制）**——不再在表里以「待决」出现 | 规格 §8 逐条 | 各表 F 段与对应 E 段 |
| K16 | **已定（2026-10-14 19:2x，主代理裁决 R-03，见 T3 C3）**：取槽 + 显式形参的合并式，不再是二选一。原口径：`main.ts` 适配器取 `admin` 的实现二选一（T3 C3）：**(a)** `spawnExeProcess(exe, configId, admin)` 由 `:1082` 接线传；**(b)** 从 `qlStartContextOrThrow` 的槽里取。实现时选定并填 T3 C4，不改规格 | 两处的既有形态都实测过：`main.ts:1050` 的形参已含未使用的 `configId`（前置索引 K9），`:1025` 的槽守卫在 | T3 C3 / C4 |
| K17 | `QuickLaunchModal.test.ts:681-683` 的计数器只数 `.flag-grid` 的**直接**子节点（`[...grid.children]`）→ 在控件格内部嵌套 `.dropdown.term-field` **不**增加计数；两态的新控件格都用 `.field-cell`，故计数器过滤器**无需改**，只补「exe 态也数到 3」的断言 | 实测：读 `test.ts:677-683` 与 `QuickLaunchModal.vue:211-261` 现结构（shell 态 3 个：`.name-cell` + `.dropdown` + `.field-cell`；exe 态 2 个） | T8 B2 / C5 / C6 / E6 |
| K18 | koffi 的 `WriteFile` 形参必须声明为 `uint8 *` 并直接传 Buffer；用 `koffi.encode(b,'uint8',n)` 造缓冲再传 → `ok=false lastErr=998`（`ERROR_NOACCESS`） | 实测：`probe9.mjs` 第一版失败、改后 `written=113 lastErr=0` | T4 F2 |
| K19 | 提权进程**不继承**调用方环境块 → 放弃「注入 `ELECTRON_RUN_AS_NODE`」；`--ms-enable-electron-run-as-node` 在 Electron 28.3.3 不存在 → 没有命令行等价物 | 实测 P2（`[%LMS_PROBE_ENV%]` 未展开）/ P1（不提权时继承）/ P3（二进制内检索） | T4 C5 / T5 C1 |
| K20 | 硬链接的 `node.exe` 必须与 `electron.exe` **同目录**，否则 `0xC0000135 STATUS_DLL_NOT_FOUND` | 实测：`probe4.mjs` B 段在别处建链接失败、改到 `node_modules/electron/dist/` 内即成 | T4 C5 / T9 F2 |
| K21 | 宿主脚本留在 `app.asar/dist-main/` 内即可（不需要 extraFile） | 实测 P9：`@electron/asar` 打包后硬链接 `node.exe` 执行 asar 内脚本 → `ran:true`、退出码 9 | T5 B1 / T9 B2 |
| K22 | **（2026-10-15 00:1x 修正，见 K41）** ConPTY 的可用性按**进程身份**分：在 DSH 进程内 / vitest worker 里 `node-pty` 的 `spawn` 必失败（`EPERM … conpty-…-in`）→ 单测里 mock 掉；**以系统 node 作宿主的子进程里可以起真 ConPTY**（K41 实测跑通全往返）。提权路径（`runas` + High IL + asar 内原生模块）仍只在任务 9 真机门判 | 原实测 + 规格 §2-5 + 本次复核（K41） | T5 D3 / T6 / T9 E1 |
| K23 | 跑 `npm test` 需要**完全访问**沙箱：默认的 `workspace-write` 下 vitest 的 esbuild 报 `spawn EPERM`（`esbuild.ensureServiceIsRunning` 要 spawn 服务进程，被命名管道限制挡下）→ 基线只能在 `danger-full-access` 下取 | 实测两次：默认策略 → `failed to load config … spawn EPERM`；策略改完全访问后同一命令 exit 0、48 / 835 | 索引头部 / 各表 A2 |
| K24 | 生成期未跟踪的 `.superpowers/`（普查脚本）与 `docs/superpowers/checks/`（本表目录）属预期产物；`git status --porcelain` 的判据是**无已跟踪改动** | 沿用上一 feature 索引 K13；本次实测 porcelain 只有这两处 + 一个先前就存在的未跟踪目录 `unused/`（非本 feature 产物，未动） | 各表 A1 |
| K25 | 词典两处插入顺序：**先改行号大的 en（`dict.ts:519` 之后），再改 zh（`:176` 之后）**，避免行号漂移导致第二处插错位置 | 实测：两处锚点 `'ql.modal.exe'` 分别在 zh `:176` / en `:519` | T8 D2 |
| K26 | 上一 feature 的真机清单（`docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/task-04-packaged-realmachine.md` 的 E1–E7）至今未勾 → 本 feature 任务 9 的**同一次构建**里一并跑掉并回填那张表 | 实测：该表 E 段仍全 ☐；规格 §3 末段 / §7.2-9 | T9 E6 / C3 |

## 本索引自身的自检（生成后当场跑过）
| K41 | **本会话能自动化验证的比 plan 预期的多**：以**系统 node**（`D:\\Dev\\Runtimes\\Node\\node.exe`）作宿主跑 `dist-main/ql-pty-host.js`，真命名管道 + 真 ConPTY 全往返跑通 —— `READY` → `DATA`（真 `cmd.exe` 横幅）→ `WRITE`（回显 `PROBE20-MARKER`）→ `RESIZE`（帧里出现 `\\u001b[8;30;100t`）→ `STOP` → `EXIT{code:-1073741510}`（`0xC000013A` = `kill()` 的结果）；`EXIT` 的 code 与子进程退出码 `3221225786` 同源（C4 成立）；子进程退出后 `available() -> -1`（K39 的退出路径）。复现：`npx tsc -p tsconfig.main.json` 后 `node .temp/ql-admin-probe/probe20.cjs`（实现者与主代理各跑一次，输出一致）。**提权路径仍未自动化验证**（`runas` + High IL + asar 内解析），归 §7.2 | 任务 5 报告 §4-1 + 主代理独立复跑（2026-10-15 00:0x） | K22 修正 / T9 真机清单可加一条「非提权宿主在 dev 布局下的自动化冒烟」 |
| K42 | `runHost` 的 `connect` 形参是 **`name: unknown`**（plan 任务 5 签名块逐字）；本表 C2 原写 `string` 是**表的错**，已改。理由：`process.argv.slice(2)` 交出 `string \| undefined`，`string` 接不住 | plan 原文 vs 本表；实现者按「签名以 plan 逐字」执行并报告 | T5 C2 |
| K43 | **宿主新增一条退出路径**：管道 `error` 事件 → `ERR{stage:'pipe'}` + `process.exit(1)`，不带崩溃栈。规格 §6.6 原本只定义 `token`(2) / `spawn`(1) / `EXIT{code}`；没有 `error` 监听时未处理的 `error` 会让宿主带栈崩掉（无帧、退出码不可控）。已补进规格 §6.6（裁决 R-10） | 任务 5 报告 §4-2/§4-3：硬链接 electron-as-node 连管道 EPERM → 退出码 1、无栈（正是 K36 那条环境事实的可见结果） | 规格 §6.6 / T6 |
| K44 | **`READY` 的 `shellPid` 实测是 0**（ConPTY 的 innerPid 要等 agent 连上才赋值，`quick-launch.ts:71-73` 记过同一现象）→ 任务 6 **不得**用它做停止或判断依据，只当日志参考。另：`STOP` 帧**必须带数字 `timeoutSecs`**（宿主对缺失/非数取「不给宽限期」，立即升级 `taskkill`，不猜默认值） | 任务 5 报告 §6-2/§6-4 + 实测 `{hostPid:16616,shellPid:0}` | T6 C5/C6 |
| K36 | **本会话（DSH 沙箱）进程树里，硬链接 electron-as-node 子进程打开命名管道一律 `EPERM`**（带 SDDL 与默认 DACL 都一样；同进程客户端与系统 node 子进程都连得上）。与本任务的代码和 §6.5 的取值无关：规格 P10 是真机跑通的。沙箱内的管道冒烟改用 `process.execPath` 作客户端（`.temp/ql-admin-probe/probe9b.mjs`），并用 `probe18.cjs`（esbuild 打包本任务真实现 + 真管道 + 真客户端）给真实现背书；**真机那条门仍归 §7.2** | 任务 4 报告 §6-1 + J-2/J-9 的 `probe15/16/17` 诊断（`ConnectNamedPipe ok false lastErr 535`、系统 node 子进程 `CONNECTED try=0`） | T4 D3、T9 真机门 |
| K37 | **建管道失败**的文案 = `PROC: t('err.proc.spawnFail', { exe, err: 'pipe=create' })`（已补进规格 §6.10 第四行，裁决 R-08）。只报阶段不报 win32 码：`WinPipeApi.createServer` 的返回类型（`unknown`）交不回错误码，为一条近乎不可能的路径换掉 C1 的签名不值 | 规格 §6.10 补行（2026-10-14 23:2x）；`nMaxInstances=1` + 每次新名字 | 规格 §6.10 / T6 C5 |
| K38 | **T4 的 E6（读侧只用 `available()` 判断后才 `read()`）归任务 6**：同一个用例名 `read_polling_uses_available_not_blocking_read` 在 plan 任务 6 步骤 1 里，读循环在 `ElevatedPtyProcess`（T4 B1 边界外）。T4 的 E6 写成显式未勾并指向 T6 E8 | plan 任务 4 与任务 6 的用例名重复（实测两份 brief 都有）；T6 表 E8 已在位 | T4 E6 / T6 E8 |
| K39 | **`available()` 的 `-1` = 断管 / `PeekNamedPipe` 失败**（与「没有数据」的 `0` 可分），`read()` 失败交空 Buffer。任务 6 的读循环必须按这个契约写：`available() >= 0` 才 `read(h, available)`，`-1` 走 §6.7 的退出路径（`ERROR_BROKEN_PIPE=109` 体现在这里） | C1 把 `available` 定成 `number`、没有错误通道；不分开则读循环退不出（任务 4 报告疑虑 4 → 主代理认可）。契约写在 `ql-elevated.ts:302-310` | T4 C1 / T6 C5③ |
| K40 | 任务 4 的**额外导出已认可**（`PipeKernel` / `HostPaths` / `HostStart` / `resolveHostLink` / `createHostLauncher` / `hostLauncher` / `pipeKernel` / `winPipe` / `startHost` / `invalidHandle`）：C1/C2/C6 逐字未动。理由：C3/E1 的取值在只有一层 `WinPipeApi` 时单测无从观察；E4 的「两个句柄都关」需要接两个接缝的函数；`winPipe` / `hostLauncher` 必须导出任务 6/7 才接得上。另记一条实测坑：koffi 把 `void *` 交回 BigInt，`CreateNamedPipeW` 失败是 `18446744073709551615n`，只判 `null` 会把失败句柄当有效 | 任务 4 报告 §5-1 / §5-8、`ql-elevated.ts:227-233`、J-9 | T4 C7 / T6 B1 |
| K35 | **§6.10 前两行的文案映射器归任务 4**：`hostStartError(win32Error, userTarget): Error`（1223 → `err.proc.uacCancelled`，其它 → `err.proc.spawnFail` + `win32=<code>`）。理由：plan 任务 4 步骤 1 把 `win32_1223_maps_to_err_proc_uacCancelled_with_the_user_target` 列在任务 4，而任务 4 的表 B1 又写「不含 i18n 文案」——两者唯一的合并式是「映射器单独导出、`launch()` 不带文案」。任务 6 的 `ElevatedPtyProcess` 用构造参数 `opts.logTarget`（plan 任务 6 签名块逐字）作 `userTarget` 调它，**不得**再写一份映射 | 裁决 R-07（2026-10-14 22:4x）；规格 §6.10 + §6.7；plan 任务 4 签名块与任务 6 签名块 | T4 C6 / E5、T6 |
| K34 | `launchShellExe(api, exe, verb?)` 的两种写法有区别，**任务 4 / 6 不得给它加 `parameters` 形参**：`verb === undefined`（既有调用形状）→ 只交两个实参，接缝收到的与今天逐字节相同；显式 `null` → 交 `{ verb: null }`，到真实现仍是 `lpVerb = null`。起提权宿主要传 `parameters` 的路，按规格 §6.4-3 **直接**调 `winShell.shellExecute(file, 0, { verb, parameters })`，不借道 `launchShellExe`（它的边界是 exe 类型，规格 §5 明确 exe 条目没有参数字段） | 实测：既有用例 1 用 `toHaveBeenCalledWith(EXE, 1)` 钉 arity，多一个实参（哪怕 `undefined`）就红；`shell-execute.test.ts` 新增的 `no_opts_keeps_verb_and_parameters_null` 把两种写法都钉住 | T3 C2 / T4 C 段 / T6 F 段 |
| K32 | **帧的 payload 一律按 `string`（UTF-8）传，包括 `DATA`**（任务 2 子代理疑虑 3 → 主代理裁决 R-06，2026-10-14 20:0x）。理由：非提权路径上 node-pty 的 `onData` 本来就交 JS 字符串（`quick-launch.ts:104-106` → `deps.onData(tabId, data: string)` → IPC 结构化克隆 → 渲染端 `term.write(string)`），提权路径必须与它**逐字一致**（规格 §6.3「页签保真度一致」），改成原始字节要连渲染端与 IPC 一起改，属规格 §5 的非目标。UTF-8 往返对合法字符串无损；node-pty 自带 UTF-8 解码器会把跨读的不完整序列缓冲住，不产生孤立代理项。最终判据 = 真机门 §7.2-2（输入可用、输出正常） | 读 `quick-launch.ts:104-106` / `:249-253` 实测；plan 任务 2 签名块逐字 | T5 C 段（宿主发帧）/ T6（主进程收帧） |
| K33 | 帧协议**不设长度上限**、半帧缓冲不由协议模块回收：管道是私有的（`nMaxInstances = 1`，只有本项目的宿主会写），脏字节不可能出现；上限与「超限算哪类错误」规格未定义，加它要先改规格 | 规格 §6.5 未定义；主代理裁决（2026-10-14 20:0x）：YAGNI，登记不做 | T2 C2 / T4、T6 的持有方 |
| K30 | 任务 1 的起点 HEAD 是 `b2026e2`（主代理派单前落的预检裁决文档提交：R-01–R-04 + SDD 账本），不是 `aaf5e0f`；A1 的实质判据仍是「porcelain 不含 `src/` / `src-main/` 文件」（索引 K24） | 实测：`git log --oneline -1` = `b2026e2`；该提交 `--name-only` 只有 spec / plan / 索引 / T1 / T3 五份文档 + 账本 | T1 A1 |
| K31 | 「总是显式落盘」的作用面 = **本次保存的那一条**：`qlSave` 只把 `clean`（经 `validateEntry` 规整，带 `admin`）写进 map，其余条目走 `readRawMap` 原样写回 → 未编辑过的老条目在 yaml 里仍无 `admin` 键，直到它被保存一次。不扩范围成「整份文件补齐」 | 规格 §6.1（实现点 = `validateEntry` + `:138`）+ §4-4（老配置行为逐字节一致）；主代理裁决 R-05（2026-10-14 19:5x） | T1 C3 / T1 报告疑虑 1 |
| K27 | 类型门命令一律 `npx tsc --noEmit -p tsconfig.main.json`；plan 全局约束 G5 原写 `tsconfig.json` 是笔误（已同 commit 改掉） | 实测：仓库根 glob 只有 `tsconfig.main.json`，`package.json:9-10` 的 dev/build 脚本用的也是它 | plan G5 / 各表 D、G 段 |
| K28 | `src-main/ipc-ql.test.ts:245` 断言的是 `ql_list` 的**加载结果**（`qlLoad` → `normalizeEntry`），任务 1 加 `admin` 之后必红 → 该行的 `toEqual` 字面量加 `admin: false` 属**任务 1** 的机械夹具修正；渲染端夹具仍归任务 8 | 实测：`grep "toEqual({ name"` 全仓只有 `quick-launch-config.test.ts` 五处 + `ipc-ql.test.ts:245` | T1 B3 / D3 / G2 / H1；plan 任务 1 步骤 4-5 |
| K29 | `WinShellApi.shellExecute` 的第三参类型取 plan 的 `{ verb?: string \| null; parameters?: string \| null }`（spec §6.4-3 的窄类型接不住 `admin ? 'runas' : null` 这个实参） | 实测：`spawnExeProcess` 要按布尔传 `null`；T3 C1 已逐字写 `\| null` | T3 C1 / C2 |

- 9 张表的每张 `|` 行列数与该表表头一致 → 见 J 段前的机械校验输出（`column-count check`）
- 索引里的相对链接全部可解析（9 个任务文件 + spec + plan + 前置 feature 的表）
- 代码片段前后无多余反斜杠：生成时用 `String.raw` + 占位替换，机械校验（下方自检脚本）未在反引号前发现反斜杠
- 普查：`node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 9 张表 H2 均未提交，裸 ☐ 属预期（尚未实现）
