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
