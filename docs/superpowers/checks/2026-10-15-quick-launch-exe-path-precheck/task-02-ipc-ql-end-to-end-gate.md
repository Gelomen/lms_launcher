# 任务 2 · `ipc-ql.test.ts` 的端到端门（Shell 不被调用） — check 表

> 计划：[2026-10-15-quick-launch-exe-path-precheck.md](../../plans/2026-10-15-quick-launch-exe-path-precheck.md) §任务 2 · 规格：[2026-10-15-quick-launch-exe-path-precheck.md](../../specs/2026-10-15-quick-launch-exe-path-precheck.md) §7.1-6..8 · 关联审查重点 **RF1 RF2 RF3**
> 前置：任务 1（预检已在 `launchShellExe` 里）
> 索引：[00-index.md](00-index.md) 的 G1、G4、G5、G6、G8、G9、RF1–RF3、**K8**（先红靠变异取证）、**K9**（用例数 906）
> 本任务**只改测试**：生产代码已由任务 1 完成。改到 `src-main/*.ts`（非 `.test.ts`）即越界。

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 任务 1 已提交、工作区干净 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 1 的提交（`fix(main): 快捷启动 exe 启动前预检目标…`）；porcelain 干净 | ☑ 主代理核对：`git log --oneline -1` = `17a4e6c fix(main): 快捷启动 exe 启动前预检目标…`（任务 1），`git status --porcelain` 无已跟踪改动（J-1） |
| A2 | 任务 1 之后的全量基线 | `npm test` | `Test Files 52 passed (52)` / `Tests 906 passed (906)`，exit 0 | ☑ 实现者与主代理各跑一次：`Test Files 52 passed (52)` / `Tests 906 passed (906)` exit 0；`ipc-ql.test.ts` 自报 `(27 tests)` = 索引 K13 口径 |
| A3 | 本表引用的锚点行号属实 | 读 `ipc-ql.test.ts:105`（`import { winShell } from './shell-execute';`）、`:330-350`（裸名 exe 用例）、`:352-377`（既有「exe 启动失败」用例：`:353` 的 `no-such-exe-zzz.exe`、`:357-358` 替换 `winShell.shellExecute`、`:371` 断言 `uacCancelled`）、`:381-416`（提权形状门，`:397` 断言两条都是 `notepad.exe`） | 与本表引用一致（本表生成时实测） | ☑ 动手前锚点属实（`:105` 的 `import { winShell }`、`:330-350`、`:352-377` 含 `:353`/`:371` = `notepad.exe`、`:717` 的 mspaint 并发用例）。**偏离 3**：新用例插入后提权门移到 `:425-460`、`:717` → `:761`，内容一字未改（`git diff --numstat` = `44 0`，0 删除），真实行号见 C3 |
| A4 | 任务 1 交付的门在位（签名逐字可用） | 读 `shell-execute.ts` 的 `isLaunchableExe` 与 `launchShellExe` 开头 | 可用；不可用就停下来报告，不要自己补 | ☑ 读 `shell-execute.ts:242-261`（`isLaunchableExe`）与 `:269-274`（门）在位可用，签名与 task-01 表 C1 逐字一致；无需补任何东西 |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/ipc-ql.test.ts` | 改：**只新增一条** `exe_path_not_found_never_reaches_the_shell`（C2）。原 ①（`:353` 的一行）已随任务 1 落地（索引 K10），本任务不得再改它 | `:330-350` 与 `:381-416` 一字不改（RF2）；其余通道用例不动；不改任何 `src-main/*.ts` 生产文件 | ☑ `git diff --numstat` = `44 0`，仅 `src-main/ipc-ql.test.ts`；diff 里没有 `:353` / `:371` / `:717` 的 hunk（= 任务 1 的夹具与别名用例都没再碰，K10 / K11） |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | （已随任务 1 落地，K10）既有「exe 启动失败」用例的改法 | 只把条目 exe 换成 `'notepad.exe'`（真存在 → 预检放行 → 到假接缝）。其余一字不改：假接缝仍返回 `{ ok: false, handle: null, win32Error: 1223 }`，仍断言 `rejects.toThrow(/^PROC: /)`、sys 行含 `t('err.proc.uacCancelled', { exe: 'notepad.exe' })`、不含 `EACCES`（E2 / RF3） | ☑ 已随任务 1 落地（索引 K10）：本次 diff 无该 hunk = 未再碰；现值 `exe: 'notepad.exe'` 与假接缝返回 1223 原样 |
| C2 | 新用例（名字逐字） | `it('exe_path_not_found_never_reaches_the_shell', …)`：`ql_save` 条目 exe = `'Z:\\no-such-dir\\no-such.exe'`；把 `winShell.shellExecute` 换成**计数** spy（照 `:357-358` / `:386-392` 的既有做法，`finally` 里还原）；断言：`ql_start` reject 以 `PROC: `开头、sys 日志行含 `t('err.proc.exeNotFound', { exe: 'Z:\\no-such-dir\\no-such.exe' })`、**spy 调用次数为 0**、`invoke('ql_states')` 为 `{}` | ☑ 逐字对照 `git diff`：用例名逐字；夹具 `Z:\\no-such-dir\\no-such.exe`；计数 spy 返回 `{ ok: false, handle: null, win32Error: 1223 }` 且**不委托真实现**（E19 / K17）；断言链 reject `^PROC: ` → 含 `t('err.proc.exeNotFound')` → 不含 `uacCancelled` / `spawnFail` → `shellCalls` `toBe(0)` → `ql_states` `toEqual({})`；`finally` 还原 spy + `ql_stop` |
| C3 | 落地行号（实现时填） | 新用例 = `ipc-ql.test.ts:379-421`（注释 379-383、`it(` 在 `:384`、收尾 `}, 30000);` 在 `:421`）；`:353` 现值仍是 `:353`（本任务一字未改，现值 = `exe: 'notepad.exe'`，归任务 1，索引 K10）。本任务对该文件是**纯增量**：`git diff --numstat` = `44 0`（44 增 0 删），故 `:330-350` 与 `:352-377` 行号不变，原 `:381-416`（提权形状门）整体后移到 `:425-460`，内容一字未改 | ☑ hunk 头 `@@ -376,6 +376,50 @@` 与 C3 填的行号一致：新用例 `:379-421`、`it(` 在 `:384`、收尾 `}, 30000);` 在 `:421`；`:353` 现值仍是 `exe: 'notepad.exe'` |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先写新用例（C2；C1 已随任务 1 落地） | `npx vitest run src-main/ipc-ql.test.ts` | 新用例**绿**（任务 1 已实现）→ 不能只凭这条说「有牙」，必须做 D2 | ☑ 主代理复跑：`Tests 28 passed (28)`（27 + 1，索引 K13）—— 绿，故必须靠 D2 才有牙 |
| D2 | 变异取证（索引 K8）：临时注释掉 `launchShellExe` 的门，再跑 | `npx vitest run src-main/ipc-ql.test.ts` | 新用例**必红**：走到真 Shell（`shellExecute` 计数 ≥1、弹系统框、worker 被卡）或文案不是 `exeNotFound`。贴出红输出后**恢复门**，并复跑确认 `shell-execute.test.ts` 仍 14 绿 | ☑ **主代理亲自复现（不采信自述）**：注释掉 `:272-274` 的门 → `Tests 1 failed \| 27 passed (28)`，红点 `ipc-ql.test.ts:409`，`Received: "[lms_launcher] PROC: Z:\\no-such-dir\\no-such.exe 已取消管理员权限请求"` —— 该文案只在真走到 Shell 并回 1223 后才可能产生（`shell-execute.ts:281-284`），故计数 spy 必 ≥1、`:414` 的 `toBe(0)` 同必红。恢复：`git checkout -- src-main/shell-execute.ts` → `git diff --quiet` 给 `IDENTICAL_TO_HEAD=True`。**偏离 4**：变异红表现为文案换掉，不真弹框/不卡 worker（spy 不委托真实现，F2）；「真弹框 / 真阻塞」归任务 3 真机 §7.2-1 |
| D3 | 定向 + 类型门 + i18n | `npx vitest run src-main/ipc-ql.test.ts`；`npx tsc --noEmit -p tsconfig.main.json`；`npx vitest run src-main/i18n` | 该文件 `Tests 28 passed (28)`（27 + 1，索引 K13：按 vitest 报的条数，本行原写 30 是 `it(` 字面计数）（29 + 1）；tsc 无输出；i18n 全绿 | ☑ 主代理复跑：定向 `Tests 28 passed (28)`；`npx tsc --noEmit -p tsconfig.main.json` 无输出 `TSC_EXIT=0`；`npx vitest run src-main/i18n` → `Tests 18 passed (18)`（本行原写 30 已按 K13 改为 28） |
| D4 | 全量 | `npm test` | `Test Files 52 passed (52)` / `Tests 907 passed (907)`（K9） | ☑ 主代理复跑 `npm test` → `Test Files 52 passed (52)` / `Tests 907 passed (907)`，exit 0（906 + 1，索引 K9） |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | 端到端：路径不存在 → `ql_start` 同步 reject、sys 行是 `err.proc.exeNotFound`、**真接缝一次都没被调用**（不弹系统框、不阻塞）、不残留状态 | 规格 §6.2 / §7.1-7 / RF1 | `exe_path_not_found_never_reaches_the_shell` | ☑ 断言在位且绿，且**去掉门就红**（D2 主代理复现）→ 不是空断言。`shellCalls` `toBe(0)` 就是「不弹系统框、不阻塞」的端到端牙（RF1） |
| E2 | 真 UAC 取消（1223）仍报 `err.proc.uacCancelled`，且 `{exe}` 是用户那一行的目标 | 规格 §6.4 / §7.1-6 / RF3；§3-P2 | 改写后的 `:352-377`（exe 换 `notepad.exe`，其余一字不改） | ☑ `:352-377` 一字未改（diff 无 hunk），全量里该用例绿：仍断 `uacCancelled`、仍不含 `EACCES`、仍 reject `^PROC: ` |
| E3 | 裸名写法不被误杀（`notepad.exe` 仍能起、仍能到接缝） | 规格 §7.1-8 / §8-Q12；§3-P10 | 既有 `:330-350` / `:381-416` 一字不改且绿 | ☑ `:330-350` 与提权形状门（现 `:425-460`）一字未改且绿；`:761` 的 mspaint 并发用例在全量里绿（别名放行由 task-01 C6 / E8 守） |
| E4 | 失败不残留状态（`ql_states` 为 `{}`） | 前置规格 §7.5（`quick-launch.ts:293-297` 在 `set` 之前抛出） | 新用例的 `ql_states` 断言 | ☑ `expect(invoke('ql_states'), …).toEqual({})` 在位且绿；预检抛错在 `quick-launch.ts:293-297` 的 `set` 之前，故不残留 |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 只改测试文件；生产代码一字不动 | 索引 G9 / 本表 B 段 | ☑ `git diff --name-only` 只有 `src-main/ipc-ql.test.ts`；生产文件与 HEAD 逐字节一致（主代理变异取证后 `git checkout` + `git diff --quiet` 取证） |
| F2 | 观察点仍是 `winShell.shellExecute` 属性替换（既有做法），不新建夹具形状 | `ipc-ql.test.ts:103-105` 的注释口径 | ☑ 观察点仍是 `winShell.shellExecute = …` 属性替换，形状照 `:357-358`（本表 F2 要求），未新建夹具形状 |
| F3 | 不动 `ql-elevated.ts:110-115` 那份 1223 拷贝（提权宿主的语境成立） | 规格 §5-1 / 索引 G4 | ☑ `src-main/ql-elevated.ts` 不在 `git diff --name-only` 里，那份 1223 拷贝一字未动 |
| F4 | 不新增词典键、不改前缀 | 索引 G1 / G2 | ☑ `git diff src-main/i18n` 空 = 无新键；断言只用既有 `err.proc.exeNotFound`；前缀仍只有 `PROC: `（`rejects.toThrow(/^PROC: /)`） |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/ipc-ql.test.ts` | `Tests 28 passed (28)`（27 + 1，索引 K13） | ☑ 主代理复跑 `Tests 28 passed (28)`（本行原写 30 已按索引 K13 改正） |
| G2 | 相邻回归（未改的 exe 门仍绿） | `npx vitest run src-main/shell-execute.test.ts src-main/quick-launch.test.ts` | `Tests 49 passed (49)`（`shell-execute.test.ts` 15 + `quick-launch.test.ts` 34；本行原写 14 是任务 1 之前的旧数）；两文件不在 `git diff --name-only` 里 | ☑ 主代理复跑 `npx vitest run src-main/shell-execute.test.ts src-main/quick-launch.test.ts` → `Tests 49 passed (49)`（15 + 34；本行原写 14 是任务 1 之前的旧数，已按 K13 改正），两文件不在 `git diff --name-only` 里 |
| G3 | 类型门 + i18n 三门 | `npx tsc --noEmit -p tsconfig.main.json`；`npx vitest run src-main/i18n` | 无输出 / 全绿 | ☑ 主代理复跑：tsc 无输出 `TSC_EXIT=0`；i18n `Test Files 4 passed (4)` / `Tests 18 passed (18)` |
| G4 | 全量 | `npm test` | `Tests 907 passed (907)`（K9） | ☑ 主代理复跑 `npm test` → `Tests 907 passed (907)`，exit 0（索引 K9） |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/ipc-ql.test.ts`（仅此一份） | ☑ 主代理暂存：`src-main/ipc-ql.test.ts`（唯一代码/测试文件）+ 本表 + `00-index.md`（K13 口径同步到 V 组）+ SDD brief/report（与 2026-10-14 那份同样入库）。`git status --porcelain` 无其它代码文件 |
| H2 | commit message 逐字 | `test(main): 快捷启动 exe 路径预检的端到端门（Shell 不被调用）` | ☑ 主代理按本行逐字 message 提交 |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-15-quick-launch-exe-path-precheck/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☑ 主代理在 `git commit` 之前跑普查：本表 `裸☐=0`、`I段 -[ ]=0`（输出见 J-8；J-7 是主代理的独立复跑行） |

## I. 完成判据

- [x] A1-A4 成立
- [x] B1 之外没有文件被改
- [x] C1-C3 逐字一致（C3 已填真实行号）
- [x] D1→D4：D2 的变异红有真实输出
- [x] E1-E4 有对应测试且绿
- [x] G1-G4 全绿
- [x] J 段有真实命令与真实输出（含 D2 的红与恢复后的绿）

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | A1/A2 起点核对：`git log --oneline -3`；`git status --porcelain`；`npm test`（基线） | HEAD = `17a4e6c fix(main): 快捷启动 exe 启动前预检目标…`（任务 1），分支 `feat/quick-launch`；porcelain 只有未跟踪 `?? .superpowers/sdd/…/task-02-brief.md`（派单简报，属预期），无已跟踪改动。基线全量：`Test Files 52 passed (52)` / `Tests 906 passed (906)`，`Duration 15.24s`，exit 0；其中 `✓ src-main/ipc-ql.test.ts (27 tests)` ← 印证索引 K13 的 27 条口径 |
| J-2 | D1 写新用例（C2）后定向：`npx vitest run src-main/ipc-ql.test.ts` | `✓ src-main/ipc-ql.test.ts (28 tests)` / `Test Files 1 passed (1)` / `Tests 28 passed (28)`，exit 0（27 + 1，K13）。**直接绿** → 按 K8 不能只凭这条说「有牙」，故有 J-3 |
| J-3 | D2 变异取证（索引 K8）：把 `shell-execute.ts:272-274` 的预检门整块注释掉，再跑同一条命令 | `❯ src-main/ipc-ql.test.ts (28 tests \| 1 failed)` / `Tests 1 failed \| 27 passed (28)`，exit 1。红在新用例：`FAIL src-main/ipc-ql.test.ts > C5-C9 + C12 … > exe_path_not_found_never_reaches_the_shell`；`AssertionError: expected '[lms_launcher] PROC: Z:\no-such-dir\n…' to contain 'Z:\no-such-dir\no-such.exe 不存在、不是 .ex…'`；`Expected: "Z:\no-such-dir\no-such.exe 不存在、不是 .exe 文件或不可访问"` / `Received: "[lms_launcher] PROC: Z:\no-such-dir\no-such.exe 已取消管理员权限请求"`；位置 `src-main/ipc-ql.test.ts:409:30`。即：门一去掉，文案换成 `err.proc.uacCancelled` —— 而该文案只在 `api.shellExecute` 返回 `{ok:false, win32Error:1223}` 之后才可能产生（`shell-execute.ts:281-284`），所以计数 spy 必被调用（≥1），`:414` 的 `toBe(0)` 同必红。其余 27 条不受影响 |
| J-4 | D2 恢复门 + 边界核对：`git diff -- src-main/shell-execute.ts`；`git diff --name-only`；复跑 `npx vitest run src-main/shell-execute.test.ts` | 恢复后 `git diff -- src-main/shell-execute.ts` **空输出**（与 HEAD 逐字节一致）；`git diff --name-only` = 只有 `src-main/ipc-ql.test.ts`（`git diff --numstat` = `44 0`）；`shell-execute.test.ts` 复跑 `Tests 15 passed (15)`（表 D2 写 14：按索引 K13/K9 的 vitest 口径实测 15，任务 1 已把该文件 10 → 15） |
| J-5 | D3 / G1 / G2 / G3：`npx vitest run src-main/ipc-ql.test.ts`；`npx vitest run src-main/shell-execute.test.ts src-main/quick-launch.test.ts`；`npx tsc --noEmit -p tsconfig.main.json`；`npx vitest run src-main/i18n` | 定向 `Tests 28 passed (28)`（表 D3/G1 写 30，见报告「偏离 1」）；相邻回归 `Test Files 2 passed (2)` / `Tests 49 passed (49)`（= shell-execute 15 + quick-launch 34，两文件均不在 `git diff --name-only` 里）；tsc **无输出**、`tsc exit=0`；i18n `Test Files 4 passed (4)` / `Tests 18 passed (18)`（key-coverage / dict / no-hardcoded 三门绿） |
| J-6 | D4 / G4 全量：`npm test` | `✓ src-main/ipc-ql.test.ts (28 tests)` / `Test Files 52 passed (52)` / `Tests 907 passed (907)`（906 + 1，索引 K9），`Duration 9.29s`，exit 0 |
| J-7 | **主代理验收复跑（00:3x，不接受自述）**：`npm test`；`npx vitest run src-main/ipc-ql.test.ts`；把 `shell-execute.ts:272-274` 的门注释掉再跑同一条命令；`git checkout -- src-main/shell-execute.ts`；`git diff --quiet -- src-main/shell-execute.ts`；`npx vitest run src-main/ipc-ql.test.ts src-main/shell-execute.test.ts`；`npx tsc --noEmit -p tsconfig.main.json`；`npx vitest run src-main/i18n`；`npx vitest run src-main/shell-execute.test.ts src-main/quick-launch.test.ts` | `Tests 907 passed (907)` exit 0；定向 `Tests 28 passed (28)`；**变异复现**：`Tests 1 failed \| 27 passed (28)`，红点 `ipc-ql.test.ts:409`，`Expected: "Z:\\no-such-dir\\no-such.exe 不存在、不是 .exe 文件或不可访问"` / `Received: "[lms_launcher] PROC: Z:\\no-such-dir\\no-such.exe 已取消管理员权限请求"`；恢复后 `IDENTICAL_TO_HEAD=True`；恢复后 `Tests 43 passed (43)`（28 + 15）；`TSC_EXIT=0`；i18n `Tests 18 passed (18)`；相邻 `Tests 49 passed (49)`（15 + 34） |
| J-8 | H3 普查：`node .superpowers/sdd/2026-10-15-quick-launch-exe-path-precheck/tick-census.mjs`（主代理在 `git commit` 之前跑） | `task-02-ipc-ql-end-to-end-gate.md ☑=27 裸☐=0 I段 -[ ]=0` → `通过：已提交的任务表没有裸 ☐ / - [ ]`，`CENSUS_EXIT=0`。另跑列数自检：本表与索引各 1 处破损（我在 D2 / K13 里写了未转义的 `\|`），已修 → 复检 `broken=0`；普查的 `☑` 计数从 26 变 27 正是那处破损造成的（两个自检互补：普查只数勾，列数自检抓结构破损） |
