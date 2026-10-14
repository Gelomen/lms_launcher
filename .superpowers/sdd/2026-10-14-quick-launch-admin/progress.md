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