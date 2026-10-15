# SDD ledger — plan: docs/superpowers/plans/2026-10-14-quick-launch-admin.md

- 分支：`feat/quick-launch-admin`；账本起点 HEAD `6245f37`（四份文档提交，代码一行未改）
- 基线（主代理 2026-10-14 19:15 实测，`npx vitest run`）：`Test Files 48 passed (48)` / `Tests 835 passed (835)`，`Duration 9.24s`，exit 0
- 执行契约（AGENTS.md 工作流第 4 步优先于 skill 默认）：子代理**不 add / 不 commit**；主代理逐行核对 check 表 + 独立复跑该表 G 段命令后才提交；**串行 1→9**，一次一个子代理
- 派单输入：该任务的 brief（plan 任务段）+ 该任务 check 表 + spec 相关小节，三份都以文件路径交接

## 起飞前扫描（plan 通读 + 现状取证）

| 涉及任务 | 产出 ↔ 消费 | 发现 | 裁决 |
|---|---|---|---|
| 全部（G5） | plan G5 的类型门 ↔ 仓库真实 tsconfig | plan G5 写 `npx tsc --noEmit -p tsconfig.json`，仓库根**只有** `tsconfig.main.json`（glob 实测）；index G5 与 9 张表的 D/G 段已用后者 | **R-01**：一律用 `tsconfig.main.json`；plan G5 的笔误在同一 docs commit 里改掉。代价：无 |
| 1 ↔ 3 | 任务 1 给 `normalizeEntry` 加 `admin` ↔ `ipc-ql.test.ts:245` 断言 `ql_list` 加载结果 | 该断言是 `toEqual({name,type,shell,cmd})`，任务 1 之后**必红**；而 plan 任务 1 步骤 5 写「此时不应变红」、任务 1 B2 写「不动其它测试文件」 | **R-02**：`ipc-ql.test.ts:245` 属任务 1 的机械夹具修正（加 `admin: false`），写进 T1 B3/D3/G2/H1 并登记索引 K28；plan 步骤 5 那句同步改正。代价：任务 1 多改一行断言 |
| 3 ↔ 7 | 任务 3 要 `spawnExeProcess` 拿到 `admin` ↔ `QlDeps.spawnExe(exe)` 签名不带 configId/entry（`quick-launch.ts:171`） | 唯一可行来源是 `qlStartContext` 槽（`main.ts:1013`/`:1118`），槽现只有 `{configId, available}` | **R-03（K16 落定）**：槽加 `admin: boolean`（`:1118` 从 `entry` 写），`spawnExeProcess(exe, configId, admin)` 用**显式形参**、`:1082` 接线从槽取。理由：显式形参让适配器可测、槽仍是「本次 start 上下文」唯一来源、不破坏 `QlDeps` 签名。落 T3 C3/C4 + B3 边界。代价：main.ts 多两行 |
| 3 ↔ spec §6.4-3 | spec 的第三参类型 `{ verb?: string; parameters?: string }` ↔ 代码要传 `admin ? 'runas' : null` | spec 的窄类型接不住 `null` | **R-04**：取 plan 的 `string \| null`（plan 是 spec 的论证，且 T3 C1 已逐字写 `\| null`）；登记索引 K29。代价：无 |
| 5 ↔ 现有代码 | 宿主 `import './quick-launch'` 取 `shellExe` ↔ 该模块的 import 链 | 实测 `quick-launch.ts` 只 import `node:child_process` / `@lydell/node-pty` / `./i18n`；`i18n/index.ts` 是纯模块 → **不会**把 electron 带进宿主（spec §6.6-9 成立）；`PtyProcess` 已 `export`（`:74`），§6.6-7 的「复用 stopGraceful」无需改可见性 | 无需改动（取证留此） |
| 6 ↔ 现有代码 | `ElevatedPtyProcess` 要复用宿主句柄生命周期 ↔ `ShellExecProcess` | 已 `export`，构造签名 `(api, handle, pid)`（`shell-execute.ts:124-140`） | 无需改动 |
| 7 ↔ 全部 | `QlDeps` 加必填成员 → 构造点 | 全仓只有两处：`main.ts:1076`、`quick-launch.test.ts:151`（grep 实测），都在任务 7 的 B 段内；`ipc-ql.test.ts` 经 `main.ts` 间接构造，不需改夹具 | 无需改动 |
| 8 ↔ 现有测试 | 两态各 3 个控件格 ↔ `QuickLaunchModal.test.ts:681-683` 计数器 | 计数器只数 `.flag-grid` 的**直接**子节点（索引 K17 已实测）→ 嵌套 `.term-field` 不增计数 | 无需改动（沿用 K17） |
| 每任务 | 表 A2 基线行 | 已 ☑（48/835） | 无需改动 |

## 提交口径（每个任务两次提交，AGENTS.md「与代码提交分开」）
1. 代码提交：只暂存该表 H1 列出的文件，message 逐字取 H2
2. 文档提交：该表（J 段 + 落勾）+ 受影响的索引 K 行 + 本账本，message 前缀 `docs(checks):`

## 任务账

- Task 1: complete (code 待提交 / 验收 2026-10-14 19:5x，主代理独立复跑 G1-G5 = 23 / 23 / tsc 0 / 18 / 48 files 839 tests；diff 逐行核对 = 5 行 + 1 行 + 4 条用例名逐字)
- Task 1: Ruling R-05（= 索引 K31）—— 「总是显式落盘」只作用于本次保存的那一条，不整份补齐；理由：规格 §6.1 把实现点定在 `validateEntry` + `qlSave:138`，§4-4 要的是行为一致而非重写全表。代价：若用户其实想要「打开一次就整份补齐」，改动只在 `qlSave` 一处，可回退
- Task 1: minor (deferred) —— E4 的字节级断言绑在 `yaml` 默认 2 空格缩进（与既有字节级断言同口径）；`admin` 脏值静默规整为 false 无提示（规格 §6.1 末条明确不新增校验）。留给最终整分支审查甄别

- Task 2: complete (验收 2026-10-14 20:0x，主代理独立复跑 G1-G4 = 5 / 18 / tsc 0 / 49 files 844 tests；新模块 43 行、零 import、零 throw；五条用例名逐字；非注释行零汉字)
- Task 2: Ruling R-06（= 索引 K32）—— 帧 payload 一律 string（含 DATA），不改「原始字节」。理由：非提权路径的 onData 已是 JS 字符串并原样进 IPC，提权路径必须逐字一致（规格 §6.3）；改字节要动渲染端 = 规格 §5 非目标。代价：若真机上出现乱码（§7.2-2），要改协议 + 渲染端两处，代价是一个新任务
- Task 2: Ruling（= 索引 K33）—— 不设帧长上限、半帧缓冲不由协议模块回收：私有管道不可能出现脏字节；YAGNI，登记不做。代价：若宿主崩溃留下半帧，只是解析器实例里的几字节，随实例回收
- Task 2: minor (deferred) —— 解析器对「未知 type 的半帧」会等满再丢弃（行为正确，只是多等几字节）；留给最终整分支审查甄别

- Task 2: 交接提醒（来自任务 2 实现者，随 K32 生效）—— 宿主发帧处**不要**自己拼 Buffer 字节再 `toString()`：K32 的「UTF-8 往返无损」前提是 node-pty 交出的已是合法 JS 字符串。派任务 5 / 6 时必须带进派单
- Task 2: 工作区遗留两行未提交的文档更正（task-02-report.md 的 D4 行、task-02 表 J-3 行：「两次全量」→「三次全量，最终 20:07:26」）→ 并入任务 3 的 docs 提交
- Task 3: dispatched (subagent b022ce7d, 起点 HEAD dbf4f09)

- Task 3: complete (验收 2026-10-14 20:3x，主代理独立复跑 G1-G5 = 34 / 24 / tsc 0 / 18 / 49 files 847 tests；diff 逐行核对 = C1/C2/C3 逐字，既有 exe 用例一字未改)
- Task 3: Ruling（= 索引 K34）—— `launchShellExe` 的 `verb === undefined` 与显式 `null` 两条写法都保 `lpVerb = null`，但**实参 arity 不同**（既有用例按 `toHaveBeenCalledWith(EXE, 1)` 钉 arity）；起提权宿主传 `parameters` 的那条路必须直接调 `winShell.shellExecute(file, 0, {verb, parameters})`，不借道 `launchShellExe`。派任务 4 / 6 时随派单下发。代价：两条写法并存，读代码时要看注释
- Task 3: minor (deferred) —— `ipc-ql.test.ts:109-112` 的 `guardOf()` 仍按两字段断言槽（不看 `admin`）：不在 B4 边界内、也不在类型门覆盖范围（`tsconfig.main.json` 排除 `*.test.ts`），不改。留给最终整分支审查甄别
- Task 3: 真机门未跑（UAC 弹窗、5.7s 同步阻塞、提权后 taskkill 打不到进程树）→ 归任务 9 的 §7.2 同批构建

## 停点（人类伙伴 2026-10-14 20:2x 指示：「开始 任务4 之前停下来」）

- 已完成并验收提交：任务 1（`d9cf9a7` + `0be4614`）、任务 2（`474bc77` + `dbf4f09`）、任务 3（`b0986fc` + `c15fbdd`）；HEAD = `c15fbdd`，`git status --porcelain` 干净，普查 exit 0（三张已提交表 裸☐=0 / I段 -[ ]=0）
- 当前全量：`Test Files 49 passed (49)` / `Tests 847 passed (847)`（基线 48/835 → +1 份测试文件、+12 条用例）
## 恢复后已做（2026-10-14 22:3x）
- 人类伙伴说「继续」→ 先落裁决 **R-07**（= 索引 K35）：`hostStartError(win32Error, userTarget)` 归任务 4（plan 任务 4 步骤 1 把 `win32_1223_…` 列在任务 4，而 T4 B1 写「不含 i18n 文案」，唯一合并式 = 映射器单独导出、`launch()` 不带文案）；任务 6 用 `opts.logTarget` 调它，不得再写一份。同一提交 `aa8c4a8` 同步了 plan 签名块 + T4 表 C6/E5/I 段 + 索引 K35（AGENTS.md「偏离先改文档，同一 commit」）
- 任务 4 已派单（子代理 5942ef91，起点 HEAD `aa8c4a8`，基线 49 / 847，收尾应为 50 files）

## 停点（上一轮，人类伙伴 2026-10-14 20:2x 指示：「开始 任务4 之前停下来」）

- 恢复时派**任务 4**（`task-04-pipe-and-launch-host.md`，前置 = 任务 2 + 任务 3，都已交付）。派单必须带：
  - brief `.superpowers/sdd/2026-10-14-quick-launch-admin/task-04-brief.md` + 该表 + 规格 §6.4 / §6.5（管道部分）/ §6.7 / §6.10
  - **K34**：起宿主直接调 `winShell.shellExecute(file, 0, { verb: 'runas', parameters })`，不得给 `launchShellExe` 加形参
  - **K32 交接提醒**：宿主侧发帧不得自己拼 Buffer 字节再 `toString()`
  - 起点 HEAD = `c15fbdd`；基线 49 / 847；本任务新增 1 份测试文件 → 收尾应为 50 files
  - 本表 D3 要求复跑取证探针 `.temp/ql-admin-probe/probe9.mjs`（管道 + 帧往返，P10）

- Task 4: complete (验收 2026-10-14 23:2x，主代理独立复跑 G1-G5 = 8 / 10 / tsc 0 / 18 / 50 files 855 tests；shell-execute 两文件未改；三处签名逐字 = C1/C2/C6；plan 的 5 条用例名逐字在位 + 3 条守 C/F 行；字符串字面量零汉字)
- Task 4: Ruling R-08（= 索引 K37）—— 建管道失败 → `err.proc.spawnFail` + `err: 'pipe=create'`，已补进规格 §6.10 第四行。代价：不报 win32 码（`WinPipeApi.createServer` 交不回错误码），为近乎不可能的路径换 C1 签名不值
- Task 4: Ruling（= K38）—— T4 的 E6 归任务 6（同一用例名在 plan 任务 6 步骤 1，读循环在 B1 边界外）→ T4 E6 写成显式未勾并指向 T6 E8
- Task 4: Ruling（= K39）—— `available()` 的 `-1` = 断管/Peek 失败，与 `0`（无数据）可分；任务 6 的读循环按此写
- Task 4: Ruling（= K40）—— 额外导出（`PipeKernel` / `startHost` / `winPipe` / `hostLauncher` 等）认可，C1/C2/C6 逐字未动；实测坑：koffi 的 `void *` 失败句柄是 BigInt `0xFFFF…`，只判 `null` 会漏
- Task 4: 环境事实（= K36）—— 本会话进程树里 electron-as-node 子进程开命名管道一律 EPERM（与代码无关，P10 是真机跑通的）；沙箱内冒烟用 `process.execPath` 作客户端 + `probe18.cjs` 用真实现跑真管道；真机门仍归 §7.2
- Task 4: minor (deferred) —— 硬链接身份只按 size 判定（规格 §6.4-1 只给这一条判据）；用户放一个 size 恰好相同的 node.exe 会误判复用。留给最终整分支审查甄别

- 主代理自己的缺陷（已修）：我用脚本往 Markdown 里插行时写了 `\\n`（模板字符串里那是**字面反斜杠 + n**，不是换行），造成 00-index.md 的 K 组 9 行挤成一行、T4 验收块与 T6 的 C5 行各断一处。修复 = 把 `\\n` 后接 `|` 或 `>` 的替换成真换行；列数自检按「未转义 `|`」重算 → 9 张表 + 索引 **0 处破损**（之前那次「列数不一致」的报警是 `\\|` 转义竖线造成的误报，规则要按未转义竖线数）。教训：AGENTS.md 的自检里「代码片段前后不得多出反斜杠」与「列数一致」两条要**在每次脚本插行后**跑，不是只在生成时跑
- Task 5: complete (验收 2026-10-15 00:1x，主代理独立复跑 G1-G5 = 6 / 27 / tsc 0 / 18 / 51 files 861 tests；quick-launch.ts 与 quick-launch.test.ts 一字未改；无 electron import；spawn 选项与非提权路径逐字一致且无 encoding)
- Task 5: Ruling R-09（= 索引 K41，并**修正 K22**）—— 以系统 node 作宿主的子进程里真 ConPTY 可用：主代理亲自复跑 `probe20.cjs` 得到 READY→DATA(真 cmd.exe)→WRITE 回显→RESIZE→STOP→EXIT{code:-1073741510}，退出码与子进程退出码同源（C4 成立），退出后 available()→-1（K39）。原 K22「本环境跑不了 ConPTY」按进程身份区分后改写。代价/机会：任务 9 的真机清单可加一条「非提权宿主在 dev 布局下的自动化冒烟」；提权路径（runas + High IL + asar 内解析）仍未自动化覆盖，仍归 §7.2
- Task 5: Ruling R-10（= 索引 K43）—— 宿主新增 `ERR{stage:'pipe'}` + `exit 1`（管道连不上 / error 事件），已补进规格 §6.6 第 10 条。理由：没有 error 监听时未处理 error 会让宿主带栈崩掉，主进程收不到帧、退出码不可控
- Task 5: 表自身缺陷（已修）—— T5 的 C2 原写 `connect(name: string)`，plan 逐字是 `unknown`；实现者按 plan 执行并报告（= K42）。这是「表与 plan 不一致」的又一例，处理口径 = 以 plan/spec 为准改表
- Task 5: 交接任务 6 的三条实测事实（= K44，已写进 T6 的 C6 行）—— READY.shellPid 实测 0（不得依赖）；STOP 必须带数字 timeoutSecs；主进程侧 stopGraceful 必须真走到委托（否则留不退出、进程树已死的宿主）
- Task 5: minor (deferred) —— `PIPE_GONE_TIMEOUT_SECS = 3` 在宿主里写死（`quick-launch.ts:28` 的 `STOP_TIMEOUT_SECS` 未导出，改它属 B 段之外）；两处同值。留给最终整分支审查甄别是否值得导出
## 停点 2（已恢复）

- 人类伙伴 2026-10-15 13:0x 说「继续」→ 已恢复串行执行。派任务 6 前先落裁决 **R-11**（表 C7：握手期 `ERR` 帧 → `err.ql.ptySpawn`，`{err}='host='+stage`）与 **R-12 / K45**（`startElevatedHost` 必须是可 await 工厂），并把任务 6 表 C 段按编号重排（我插行时排错过）

（人类伙伴 2026-10-15 00:09 指示：「进入 任务6 之前停下来」）

- 已完成并验收提交：任务 1（`d9cf9a7`/`0be4614`）、任务 2（`474bc77`/`dbf4f09`）、任务 3（`b0986fc`/`c15fbdd`）、任务 4（`31e22f3`/`971f5e4`）、任务 5（`0462188`/`5b0a3b2`）；另有文档/账本提交 `b2026e2`、`aa8c4a8`、`7469da0`、`1aea1a0`。HEAD = `1aea1a0`，`git status --porcelain` 干净，普查 exit 0
- 当前全量：`Test Files 51 passed (51)` / `Tests 861 passed (861)`（基线 48/835 → +3 份测试文件、+26 条用例）
- 恢复时派**任务 6**（`task-06-elevated-pty-process.md`，前置 = 任务 2 + 4 + 5，都已交付）。派单必须带：brief + 该表 + 规格 §6.7 / §6.5；**K35**（复用 `hostStartError`，不得重写映射）、**K37**（`stage='pipe'` → `err='pipe=create'`）、**K38**（读侧那条用例归本任务的 E8）、**K39**（`available()` 的 `-1` 契约）、**K40**（用 `startHost(winPipe, hostLauncher)`；koffi 失败句柄是 BigInt）、**K44**（`shellPid` 不可依赖 / `STOP` 必带数字 / 必须走到委托那一步）、**K43**（主进程侧要处理 `ERR{stage:'pipe'}`）、**K41**（本会话可用系统 node 作宿主跑真 ConPTY，单测仍 mock）
- 真机门仍未跑：§7.2 的 9 条 + 前置 feature 的 E1-E7 → 归任务 9 同批构建，交用户执行

- 派任务 6 前的文档准备：任务 6 表 C 段按编号重排（我插行时把 C6/C5 排到了 C4 前面）+ 新增 C7（裁决 **R-11**：握手期 `ERR` 帧 → `err.ql.ptySpawn`，`{err}='host='+stage`，`{exe}` 仍是 `logTarget`）+ 索引行补 K 引用（`fd93f4b`、`a989c5a`）；登记 **R-12 / K45**（`startElevatedHost` 必须是可 await 的工厂，依据 plan 任务 7 步骤 4 + 规格 §6.8/§6.7）。起点 HEAD 变为 `a989c5a`，基线仍是 51 files / 861 tests（本轮只动文档）
- Task 6: complete（两轮：主体实现子代理 54e52bb4 + 按 R-13 的返工子代理 31a83177；主代理独立复跑 = 定向 19 / 相邻 48 / tsc 0 / i18n 18 / 全量 51 files 872 tests；八个相邻文件一字未改）
- Task 6: 主代理自己复现了形状取证（自建探针 + `tsc --noEmit` 零诊断），C1/C2/K45 成立；三个常量、`PROC:` 五处、零新词典键、`{exe}` 全是用户目标、`shellPid` 不参与判断 —— 逐条 grep 核对
- Task 6: 认可 K46（第三常量）/ K47（两个内部方法 + READY 之后才建 `ShellExecProcess`）/ K48（`{err}` 片段词表）；R-13 已改写规格 §6.7 并落 C8（`3c056b0`、`73684c4`）；K51 把阻塞 `ConnectNamedPipe` 的兜不住交任务 9 真机门 E7
- Task 6: minor (deferred，留给最终整分支审查) —— ① `stopAll` 仍逐个 `await`，N 个提权终端最坏 `N×(timeoutSecs+1s)`（与非提权路径同形，要压总时长得动 `quick-launch.ts`，不在本 feature 边界）；② `pendingData` 无上限（任务 7 在工厂返回后立即注册 `onData`，实际不积压）；③ 真机「`PeekNamedPipe` 说可读但 `ReadFile` 失败」只有假接缝覆盖，真机观察项归任务 9；④ 测试用 `vi.spyOn(ShellExecProcess.prototype, …)` 取证（已 `mockRestore`）

- 任务 7 派单前：落裁决 **R-14 / K52**（提权路径的失败不得二次包装：`startElevatedHost` 抛出的 message 已是最终文案，`quick-launch.ts:244` 的 catch 若照原样再包一次就会出现 `err=PROC:` 嵌套）→ 任务 7 表新增 C5 行（`fc2871b`）。派单 3c14c70d，起点 HEAD `fc2871b`，基线 51 files / 872 tests
- Task 7: complete（子代理 3c14c70d；主代理独立复跑 = 定向 61（34+27）/ tsc 0 / i18n 18 / 全量 51 files 882 tests；B 段外零改动）
- Task 7: 裁决 **R-15 / K53**（提权启动失败**要**写一行 sys 原因日志，与 `main.ts:1069-1071` 的 exe 路径同一分工；K10 与规格 §6.10 末句精确化为「成功路径不得有信息性行」）—— 三份文档同一提交 `85e0b45`
- Task 7: 认可「直通不按分支门控」（补注进 K52）；A3 的 main.ts 锚点 +2 位移按 K30 处理，不改 A 段文字
- Task 7: minor (deferred) —— ① 既有缺口：非提权 shell 启动失败今天没有原因行（修它要动非提权行为，受 G3/G4 约束，不在本期）；② `ipc-ql.test.ts` 的 `restore()` 里等 200ms 让假句柄上的 100ms 轮询收尾（测试侧代价，真机无此问题）；③ 端到端用例没走「委托停止」分支（由任务 6 的单测 + 真机 §7.2-7 守）
- Task 8: complete（子代理 3bc3c8ef；主代理独立复跑 = 定向 25 / 相邻 src/modules 13 files 314 / i18n 18 / tsc 0 / 全量 51 files 888 tests；范围恰好三个 B 段文件）
- Task 8: 主代理自己取证 `.bool-switch` 三段样式与 `TemplateModal.vue:567-588` **字节一致**（子串查询 true）；`dict.ts` diff 只有两行；218px 与 BOX_H 不在任何 hunk 里
- Task 8: 认可四条偏离（`dropdownOf()` 连带、第 6 条守 F4 的用例、三处注释改写、删 `width: auto` 回 C7 逐字）；查清并登记 **K54**（安装的是 Electron 28.3.3，`v18.18.2` 是 `ELECTRON_RUN_AS_NODE=1` 下的内置 Node 版本）；把「两态开关水平位置不同」加进任务 9 真机门 **E8**
- Task 8: minor (deferred) —— 探针脚本留在 `.temp/ql-admin-probe/ql-t8-*`（gitignore 内）；任务 9 跑无头探针必须先显式处理 `ELECTRON_RUN_AS_NODE`（K54）
- Task 9: 首版（子代理 6f5ee96c）的 `build.bat` 语义「已存在则跳过」被真实打包**证伪** → 主代理落裁决 **R-16 / 索引 K55**（复制件非硬链接、大小 176,813,568 ≠ 177,150,464），同一提交 `875019b` 改写规格 §6.11 + 本表 B1/D1
- Task 9: 返工（子代理 012f9622，只改 build.bat，四场景 harness 真跑）+ 主代理重跑打包：`BUILD_EXIT=0`、`fsutil` 两个名字同 inode、大小同为 177,150,464、asar 含 `ql-pty-host.js`、unpacked 原生件全 True
- Task 9: 主代理独立复测 build.bat = 纯 ASCII / 全 CRLF / 132 行 / 新块 echo 零右括号 / `git diff` 只有一个 hunk；认可「删掉重复的括号告诫 rem」的取舍（原文仍在 :91-92）
- Task 9: E1-E8 保持真机门（用户执行），清单已逐字交付；D4 等回报
- **Task 10（真机缺陷修复）**：用户 2026-10-15 18:0x 真机回报 —— [命令行] + 管理员：UAC 点「是」后不出页签、**应用卡死无响应**。主代理取证 = `ql-elevated.ts:455` 的阻塞 `ConnectNamedPipe` 让超时分支不可达（R-17 / K56）；宿主侧失败无任何通道（R-18 / K57）。**先改文档**（spec §6.5/§6.6-10..12/§6.7/§6.10/§7.2-10/§9-R9 + plan 任务 10 + check 表 + 索引）→ `fa2c6ff`
- Task 10: 实现（子代理 5c1551b9，四个代码文件；我先红后绿 7 条用例）→ 主代理独立复跑 = 定向 32 / 相邻 61 / tsc 0 / i18n 18 / 全量 51 files **895** tests（基线 888 +7）
- Task 10: 主代理逐条核对 C1-C8 属实（非阻塞轮询 `available()` → 补一次 `connect()` / `isAlive` 早退 → `handshake=exit(code=N)` / 留痕 `pipe=` 匹配才并 / 退出码 token=2 spawn=1 **pipe=3** **fatal=4**）；认可偏离 1（`main()` 加 `export` 作测试接缝，登记 K58）
- Task 10: minor (deferred) —— 既有「连上之后、READY 之前宿主死掉」那条路径（`finish()` → `failHandshake('handshake=exit')`）仍不带退出码、也不并留痕，留整分支终审
- Task 10: 诊断环境结论（供后续参考）—— 打包后的 `node.exe` 能读/`require` asar 内宿主脚本；真宿主脚本在打包态 exit=1 无 stderr（bogus 管道名的正确行为）；管道 DACL 实测 `D:(A;;GA;;;WD)`；本会话里工作区内的 exe 以 **Low 完整性**运行，连 Medium 管道必 EPERM（DSH 沙箱产物，**不是**真机缺陷）
- **R-19（2026-10-15 18:5x）：根因 = 硬链接 `node.exe` 机制从不成立。** 用户批注 4（手动跑 `node.exe <脚本>` **把应用启动了**）+ 主代理 A/B 对照（规格 §3-P13：带 `ELECTRON_RUN_AS_NODE=1` → 真 Node；删掉 → 应用模式、脚本没跑）+ 旧探针自己设过该变量 → P5/P8 的「按文件名进 Node 模式」是环境变量造成的误判。真机链路：提权子进程其实是**又起一遍应用**、不连管道、干净退 0 → `handshake=exit(code=0)`（任务 10 的 R-17/R-18 把它从「卡死」变成「可读的失败」）
- 裁决 **R-19 / K59 + K60**：宿主进程改用**应用自己的 exe + `--ql-pty-host` 宿主模式**（`ShellExecuteEx(runas, process.execPath, SW_HIDE, params)`），新入口 `dist-main/boot.js`（薄转发器：命中 → `hostMain`，否则 → `require('./main')`）；**`main.ts` 一字不改**、帧协议/`runHost`/握手/停止语义全部不动。连带：K13/K20/K21/K55 与 P5/P6/P8 作废、R-16 的 `build.bat` 硬链接块退场、`hostlink=` 词表退场、K12 修订（宿主不再是「纯 Node 进程」而是「被接管的 Electron 进程」，仍不建窗/不用 cmd 包装/不额外打包 exe）、UAC 弹窗改显示「LMS 启动器」
- 文档已改并提交：spec §1/§3-P13/§6.4/§6.6-1/§6.10/§6.11/§7.1/§7.2/§8-K2,K12,K13/§9-R5,R6,R10 + plan 任务 11 + check 表 task-11 + 索引（清单表行 11、K59/K60、K48 词表变更、K20/K21/K55 作废）
- 新增本地无 UAC 门（§9-R10 / task-11 D6）：`lms_launcher.exe --ql-pty-host "\\.\pipe\x" tok` 必须**不出现窗口**、退出码 **3**、`%TEMP%\lms-ql-host.log` 多一行 `stage=pipe` —— 这是「宿主模式真的被接管」的唯一直接证据，**不需要 UAC**

## 任务 11 派单前的计划扫描（2026-10-15 19:2x，逐对/逐任务取证）

- T11 × T4/T6（共用 `HostLauncher`）：签名从 `launch(exe, script, pipe, token)` 改成 `launch(pipe, token)` + 新增 `hostParameters`。消费方三处：`startHost`（`ql-elevated.ts:360-368` 的路径解析段要删）、`ElevatedPtyProcess` 构造（只调 `startHost`，不直接调 `launch` → 工厂签名不动）、假夹具 `ql-elevated.test.ts:326-341` 与 `ipc-ql.test.ts:446/491-492/523`。发现：表 B4 只写「换成新签名」，没写夹具三处 → 已在 B7/D1 里点名真实行号。裁决：不改 `startElevatedHost` 对外签名（K45 仍成立）。
- T11 × T5（共用 `ql-pty-host.ts`）：`main()` → `hostMain(argv)`，`require.main === module` 自跑块保留。取证：`boot.ts` 用 `require()` 加载它时该块不会自跑（`require.main !== module`），K58 的 `export` 接缝继续有效。风险：`hostMain` 内部若还读 `process.argv` 就会在宿主模式下取错值 → C8 逐字要求 `argv[0]/argv[1]` 只用入参（现 `:202` 的 `process.argv.slice(2)[0]` 是留痕用的管道名，必须换成入参）。
- T11 × T7/T10（错误词表）：`hostStartError` 的 `hostlink=` 分支与 `ql-elevated.ts:385` / `:449` 的注释都含 `hostlink=` → E5 的 `git grep hostlink` 为空要求把**注释**一并清掉（派单里显式写了「含注释」）。`main.ts:1099-1106` 的 `spawnElevatedShell` 接线不动（F3）。
- T11 × T9（打包）：`build.bat:108-128` 的硬链接块删除 = R-16/K55 作废；打包核对口径已改成 `app.asar\dist-main\boot.js`（spec §7.2 已改，任务 9 表的 D 段不再要求 `fsutil` 同 inode）。
- 逐任务自洽核对：D5 要求测试文件 51 → 52（新增 `ql-host-boot.test.ts`）与「用例只增不减」并存 —— 不矛盾：删 1 条退场用例、新增 ≥4 条，净增为正。`boot.ts` / `ql-host-boot.ts` 落在 i18n no-hardcoded 的扫描集内（`src-main/**/*.ts` 非 test，`no-hardcoded.test.ts:15-28`），注释不受限、字符串字面量必须 ASCII → 已在派单里写明。
- 入口引用的事实核对（不取证就是猜）：`grep "dist-main/main.js"` 全仓只有 `package.json:5` 一处 → 改 `main` 一行不会漏改别处；`tsconfig.main.json:4` `module: CommonJS` + `:14` include `src-main/**/*.ts` → `boot.js` 必然随 `tsc` 产出并进 asar（`electron-builder.yml:7` 的 `dist-main/**` 未变）。
- 锚点修正：本表与 plan 步骤 0 的 `ql-elevated.ts` 行号是任务 10 之前读的（+5/+6 位移），已在 HEAD 上逐处复核并改正（`4ffe34e`）。

- 派任务 11：子代理 `de03cf16-53f8-4c52-b326-5c031eddfa7e`，起点 HEAD `4ffe34e`，基线 51 files / 895 tests；派单输入 = spec + plan 任务 11 + task-11 表 + `task-11-brief.md`；D6/G6（`build.bat` + 本地无 UAC 门）明确归主代理，不在子代理范围。

## 任务 11 第一轮（R-19）验收：被主代理的 D6 本地门打回（2026-10-15 19:5x-20:2x）

- 子代理 `de03cf16-53f8-4c52-b326-5c031eddfa7e` 返回 DONE_WITH_CONCERNS（报告 `task-11-report.md`）。我独立复跑五道门，与它的自述逐字一致：定向 3 files / **37** tests、相邻 **61**、`tsc --noEmit` 退出码 0、i18n 4 files / **18**、全量 52 files / **900** tests（基线 51/895）。A–I 因此**未落勾**。
- 我跑 D6 / G6（`cmd /c build.bat` → exit 0，产物核对 + 本地无 UAC 门，脚本 `.temp/ql-admin-probe/d6-*.ps1`、`probe-entry-run.ps1`、`real-pipe-run2.ps1`、`verify-pack.ps1`）：**门的形状本身失败** —— `lms_launcher.exe --ql-pty-host "\\.\pipe\x" tok` → `bad option: --ql-pty-host`、退出码 **9**；`--ql-pty-host=…` 同样退 9；`-- --ql-pty-host …` 与裸位置参数 `ql-pty-host …` → `Cannot find module …`、退 **1**。→ **R-19 的「开关 + `boot.ts` 转发入口」在打包态物理上不成立**（Node 的命令行解析器在跑任何应用代码之前拒绝未知 `--x`），与提权无关、本机非提权即可复现。
- 成立的形状（同一批探针，P14）：`lms_launcher.exe "<…app.asar\\dist-main\\ql-pty-host.js>" "\\.\pipe\x" tok` → 退出码 **3**、stderr 空；换成探针入口 → `argv=[exe, 入口, 管道名, token]`、`defaultApp:"absent"`、`versions{node:18.18.2,electron:28.3.3}`；接**真实命名管道** → 客户端**活着等 HELLO**（`@lydell/node-pty` 已加载、`net.connect` 成功）。对照：无参数 → 退 0、无 stderr。全文 `.temp/ql-admin-probe/task11-round1-d6-evidence.md`。
- 顺带两条环境事实：① 本会话对 `%TEMP%` 是 **EPERM**（`probe-entry-out.json` 的 `tmpWrite`）→ 留痕文件 `stage=pipe` 那一行只能在真机核对；② `node_modules\\electron\\dist\\node.exe` 是早期探针留下的硬链接名（`fsutil hardlink list` 三条名共享同一 inode，176,813,568 字节），已删该名字并重建包 → 产物里不再有 169MB 的死 `node.exe`（`node.exe in win-unpacked present = False`）。
- 裁决 **R-21 / K61 + K62**：宿主 = 应用 exe + **Electron 的「应用入口参数」**（= HEAD 上 `hostScriptPath()` 与 `launch()` 的既有形状，只把 `hostExePath()` 从「建硬链接」换成 `process.execPath`）；`boot.ts` / `ql-host-boot.ts` / `parseHostMode` / `hostMain` / 改 `package.json` 的 `main` 整套作废。第一轮那 6 条偏离（含 `process.argv.splice` 归一化）随丢弃一并作废，不再裁决。
- 文档已改（与本轮代码同一 commit）：spec（修 P13 行内被换行打断的表格行 + 新增 P14 / §6.3 模块表 / §6.4 标题+引言+条目 1-4、6 / §6.6 标题与 1 / §6.11 / §7.1 / §7.2 / §8-K2,K12,K13 / §9-R1,R10）；plan 任务 11（标题、来历、步骤 0-6、计划自检那行）；check 表 task-11 **全表重写为第二轮**（第一轮的记录留在 J-1~J-5、J-7 并标注「已打回」，打回取证在 J-6，丢弃动作在 J-8，本轮 D6 留 J-9 显式未勾）；索引（清单表行 11、K59 作废标注、K60 修正、新增 K61/K62）。
- 工作区丢弃（2026-10-15 20:2x）：`git restore -- src-main build.bat package.json docs/superpowers/checks/…/task-11-host-mode-launch.md` + 删 `src-main/boot.ts` / `ql-host-boot.ts` / `ql-host-boot.test.ts`。核对：`package.json` 的 `main` 回到 `dist-main/main.js`、`ql-pty-host.ts:209` 的 `require.main` 块在位、`HostLauncher` 的四参 `launch` 就是本轮要的形状。
- 派任务 11（**第二轮**）：起点 = 本轮文档提交，基线 51 files / 895 tests；改动范围只剩 `ql-elevated.ts`（删硬链接族 + `hostExePath() → process.execPath` + `startHost` 去 try/catch + 三处注释）、`ql-elevated.test.ts`（删 1 加 2 + 场景 2 改写 + 五处换名）、`ipc-ql.test.ts:491`（假 exe 名）、`build.bat`（删块）。D6 / G6 仍归主代理。

## 任务 11 第二轮（R-21）验收（2026-10-15 20:4x-21:0x）

- 子代理 `5700436a-9eca-4679-99cc-2aac7af5e9c9`（报告 `task-11r2-report.md`）。**我独立复跑，与它的自述逐字一致**：G1+ 定向（`ql-elevated 25 + ipc-ql 27 + ql-pty-host 8`）= **60**；G2 相邻 = **61**；`tsc --noEmit -p tsconfig.main.json` = `TSC_EXIT=0`；G4 i18n = **18**；G5 `npm test` = **51 files / 896 tests**（两次：子代理一次、我在注释编辑后再一次）。改前定向基线（它的额外取证）= 51（24+27），与 A2 一致。
- 范围核对：`git diff --numstat` 只有 `build.bat 0/21`、`ipc-ql.test.ts 1/1`、`ql-elevated.test.ts 49/55`、`ql-elevated.ts 10/58`。逐行读 diff：`hostExePath(){ return execPath(); }`、`execPath` 接缝原样保留、`startHost` 的 try/catch 删成两行直取、`launch()` 函数体与 `HostLauncher` 签名、`launch_passes_runas_and_three_quoted_arguments`、`hostLauncherStub` 都不在 diff 的任何 hunk 里（= 一字未改）。`fs` 仍被 `:642` 的留痕读取用到，没有悬空 import。
- 新用例是真的、不是空转：`host_exe_is_the_app_executable` 钉生产单例 `=== process.execPath` + 接缝回原值 + 「路径不存在也不抛、不碰文件系统、不起进程」；`start_host_passes_the_app_exe_and_script_to_launch` 逐字钉 `exe`/`script`/`parameters`/`nShow=0`/`verb='runas'`。
- 两处文档侧偏离 → 裁决 **R-22 / K63**（同一 commit 改文档）：① **897 是我算错**（本表 D1 自己写「删 1 加 2」→ 896；897 来自 plan 的「加 3 条」）。已改 A2 / D5 / G5 与 plan 步骤 1/4 为 **896**，并把 plan 步骤 1 的第三条用例改成与 D1 一致（覆盖面由既有用例 + 场景 2 承担）。② **C7 与 B4/B5 冲突**：我逐处读了那 6 行 —— `ql-pty-host.ts:2/:207`、`main.ts:1093-1094/:1096`、`ipc-ql.test.ts:424` 的注释在新机制下**为假**，`ipc-ql.test.ts:637` 的 `not.toContain('node.exe')` 会**空转**。裁决：C7 拆两条 + 开 B5′ 例外（**只改注释 / 断言字符串**、不碰代码 token、**行数不变**）。这 6 处由我改（不是实现代码，属验收/提交侧），改后 `git grep hostlink` 与 `git grep node\\.exe` 在 `src-main` 都是**零命中**，numstat = `main.ts 3/3`、`ql-pty-host.ts 2/2`、`ipc-ql.test.ts 3/3`（行数不变）。
- 顺带修掉两处文档缺陷：索引 V 组「任务 9」那行还写着「`win-unpacked\\node.exe` 与 `lms_launcher.exe` 同 inode」（R-19/R-21 后为假）→ 改成「`app.asar\\dist-main\\ql-pty-host.js` 在 + **包内无 `node.exe`** + `main` 仍是 `dist-main/main.js`」；按 AGENTS.md 自检项把 check 表 / 索引 / spec / plan 里代码片段中**多余的转义反斜杠**核对一遍（任务 11 表 13 处、索引 3 处修掉；`\\\\.\\pipe\\x` 这类**有意**的双反斜杠与 JSON 里的 `D:\\\\Tools` 保留 —— 我第一次用批量折半改错了 4 个文件，已 `git restore` 回退再逐处手改）。
- 新增 **D6′ dev 布局门**（K63 ③）：`node_modules\\electron\\dist\\electron.exe <仓库>\\dist-main\\ql-pty-host.js <管道名> <token>` —— 补掉子代理疑虑 ①「dev 态没有任何门」。脚本 `.temp/ql-admin-probe/task11r2-d6.ps1`。
- 删除 `dist-main/boot.js` / `ql-host-boot.js`（第一轮 `tsc` 留下的陈旧产物，`tsc` 不会自己删）→ 新包不再带死文件。
- minor（deferred，进整分支终审清单）：① `startHost` 去掉 try/catch 后，「注入的 launcher 自己抛」不再关管道句柄（真实实现的两个取值都不抛 → 生产路径无泄漏）；② `ElevatedPtyProcess` 构造函数的 try/catch 按 B1 保留（只改注释）；③ `tsconfig.main.json:15` 的 `exclude` 含 `src-main/**/*.test.ts` → 类型门不覆盖测试文件（既有口径）。

## 任务 11 第二轮的 D6 门：本会话跑不了 app 模式，且 R-21 的机制被结构性证据否定（2026-10-15 21:0x-21:1x）

**先说结论：R-21（应用 exe + 「应用入口参数」）在打包布局里不成立。我上一轮的 K62 证据是环境假象。**

取证（全部本轮实测，脚本 `.temp/ql-admin-probe/task11r2-d6*.ps1` / `appmode-probe.ps1` / `entry-honored.ps1`）：

1. **K62 的「成立形状」是在 Node 模式跑的**：本会话预置 `ELECTRON_RUN_AS_NODE=1`（索引 K54），我那条 `lms_launcher.exe "<…ql-pty-host.js>" <管道> <token>` 的退出码 3 来自 **Node 把第一个位置参数当脚本**。把变量删掉再跑（脚本里 `Remove-Item Env:ELECTRON_RUN_AS_NODE` 并打印 `env present = False`）：
   - `lms_launcher.exe "<abs entry-probe2.js>" …` → **探针脚本没写出 json**（打包布局与 dev 布局都没有）→ 入口参数**没有被接管**。
   - 同一条式子换成 `node_modules\\electron\\dist\\electron.exe`（dev 布局）→ 同样没有 json。
2. **结构性证据（决定性）**：「把命令行里的路径当应用入口」这段逻辑只存在于 **`default_app.asar`** 的 `main.js`（我把它从 `node_modules\\electron\\dist\\resources\\default_app.asar` 解出来，`.temp/ql-admin-probe/default-app/main.js`，9351 字节）：它 `for (const arg of argv)` 里取 `option.file` → `loadApplicationPackage(packagePath)` → `Object.defineProperty(process, 'defaultApp', { value: true })` → `app.setAppPath(...)` → `await import(filePath)`。
   - `node_modules\\electron\\dist\\resources\\` = `default_app.asar`（108901 字节）
   - `dist-release\\win-unpacked\\resources\\` = `app.asar` / `app.asar.unpacked` / `icon.ico` —— **没有 `default_app.asar`**
   → 打包后的应用里没有那段代码，位置参数只是 `process.argv` 里的一项。**这与用户真机的观察逐字吻合**：「`.\\node.exe "resources\\app.asar\\dist-main\\ql-pty-host.js" …` → 然后自动启动了应用」。
3. **P14 的 `bad option: --ql-pty-host`（exit 9）同样是 Node 模式的现象**，不是 Electron app 模式的现象。外部两份独立来源都写明 `bad option:` 前缀是 **Node 的未知参数格式**、是「这个二进制在当 Node 跑」的标志（stackoverflow 49552703：打包后的应用会把命令行参数交给主进程的 `process.argv`；tranquillabs ADR-0014 / cypress#18224：`bad option` 只在 `ELECTRON_RUN_AS_NODE=1` 下出现）。→ **我打回第一轮的 D6 门，理由本身是错的。**
4. **本会话跑不了 app 模式**（所以 D6 这类门只能真机跑）：删掉 `ELECTRON_RUN_AS_NODE` 之后，`lms_launcher.exe` 无论带不带参数（含 `--user-data-dir=<工作区内可写目录>`）都在启动瞬间退出，退出码 `-2147483645` = `0x80000003`，无 stderr；带 `ELECTRON_RUN_AS_NODE=1` 时它进 Node 模式所以「正常退出 0」。这与 DSH 沙箱对子进程「打不开命名管道」的既有边界一致（Chromium/Electron 的多进程 IPC 要命名管道）。**登记为环境限制，不是产品缺陷。**

**待用户裁决的机制（我提议记为 R-23）**：回到第一轮的形状 —— 应用 exe + **argv 里的开关**，由应用自己的入口在最早处判别并接管（`boot.js` 作 `package.json main}`，或直接在 `main.js` 第一行判别），因为 app 模式下未知开关会原样进 `process.argv}`。真机只需 30 秒就能定：`.\\lms_launcher.exe --ql-host-probe "\\.\pipe\x" tok` —— 若应用照常起（托盘图标出现、没有报错框），开关形状成立。
**第二轮的工作区改动（4 个文件）留在工作区未提交**，等用户选：丢弃 / 保留其中可复用的部分（删硬链接、`hostExePath() = process.execPath`、`build.bat` 删块、测试改名 —— 这些在 R-23 下**仍然要**）。

## 裁决 R-23：机制第三次修正，回到「开关 + 入口分流」（2026-10-15 21:2x-21:4x）

- **用户真机回报（P15）**：第二轮的包，[命令行] + [管理员权限] → UAC 出现、点 [是] → 无页签，日志 `[lms_launcher] PROC: pwsh.exe 终端启动失败: handshake=exit(code=0)`。含义：提权子进程 = 应用 exe（app 模式），**接受**位置参数（无 `bad option`、无报错框）但没人解析它 → 应用又起一遍 → 撞单实例锁 → 退出 0。与硬链接机制的真机现象同形同因。
- 这条回报同时**正面证明**了 R-23 依赖的性质：app 模式下未知参数不被告拒、原样进 `process.argv`（那条命令一直跑到单实例锁）。外部来源同向（stackoverflow 49552703）。
- 用户决定（弹窗）：机制「回到第一轮的 argv 开关 + 入口自判别」；第二轮工作区改动**保留**，第三轮在其上继续。
- 文档先行（本轮已改，未提交）：spec §3 加 **P15** 并给 P14 加更正按语（K64 ①③）；§6.3 模块表加 `boot.ts` 行、改 `ql-pty-host.ts` 行；**§6.4 整节重写为 R-23**（9 条）；plan 任务 11 重写为第三轮（步骤 0-6，含 `boot.test.ts` 3 条 + `ql-pty-host.test.ts` 2 条 + 改串 2 条，预期 52 文件 / 901 用例）、G7 加「`main` 字段是 R-23 唯一例外」；索引加 **K65**（R-23 要点）与 **K66**（`npx asar extract-file` 往 CWD 写，本会话两次覆盖仓库根 `package.json`）、清单表任务 11 行改「第三轮」；任务 11 的 check 表 A-I 段整体重写为第三轮（J 段 J-1…J-19 保留作历史）。顺带修掉 spec §6.10 一行里未转义的 `|`（表格破损）。
- 三份文档 + 表列数自检：spec / plan / index / T11 全部 `mismatched rows: 0}`；`tick-census.mjs` 见下。
- 第三轮派单要点（保留第二轮成果，只做增量）：新建 `src-main/boot.ts`（分流 + `bootMain(argv, load)` 接缝）+ `boot.test.ts`；`package.json main -> dist-main/boot.js`；`runHost` 双形状取参；`launch()` 的 `parameters` 改成 `'--ql-host "<pipe>" "<token>"'`。**本地不跑 app 模式**（K64 ④），机制判据在真机门 §7.2。
