# 任务 2 · `ipc-ql.test.ts` 的端到端门（Shell 不被调用） — check 表

> 计划：[2026-10-15-quick-launch-exe-path-precheck.md](../../plans/2026-10-15-quick-launch-exe-path-precheck.md) §任务 2 · 规格：[2026-10-15-quick-launch-exe-path-precheck.md](../../specs/2026-10-15-quick-launch-exe-path-precheck.md) §7.1-6..8 · 关联审查重点 **RF1 RF2 RF3**
> 前置：任务 1（预检已在 `launchShellExe` 里）
> 索引：[00-index.md](00-index.md) 的 G1、G4、G5、G6、G8、G9、RF1–RF3、**K8**（先红靠变异取证）、**K9**（用例数 906）
> 本任务**只改测试**：生产代码已由任务 1 完成。改到 `src-main/*.ts`（非 `.test.ts`）即越界。

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 任务 1 已提交、工作区干净 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 1 的提交（`fix(main): 快捷启动 exe 启动前预检目标…`）；porcelain 干净 | ☐ |
| A2 | 任务 1 之后的全量基线 | `npm test` | `Test Files 52 passed (52)` / `Tests 905 passed (905)`，exit 0 | ☐ |
| A3 | 本表引用的锚点行号属实 | 读 `ipc-ql.test.ts:105`（`import { winShell } from './shell-execute';`）、`:330-350`（裸名 exe 用例）、`:352-377`（既有「exe 启动失败」用例：`:353` 的 `no-such-exe-zzz.exe`、`:357-358` 替换 `winShell.shellExecute`、`:371` 断言 `uacCancelled`）、`:381-416`（提权形状门，`:397` 断言两条都是 `notepad.exe`） | 与本表引用一致（本表生成时实测） | ☐ |
| A4 | 任务 1 交付的门在位（签名逐字可用） | 读 `shell-execute.ts` 的 `isLaunchableExe` 与 `launchShellExe` 开头 | 可用；不可用就停下来报告，不要自己补 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/ipc-ql.test.ts` | 改：① `:353` 的 `exe: 'no-such-exe-zzz.exe'` → `exe: 'notepad.exe'`；② 新增一条 `exe_path_not_found_never_reaches_the_shell`（C2） | `:330-350` 与 `:381-416` 一字不改（RF2）；其余通道用例不动；不改任何 `src-main/*.ts` 生产文件 | ☐ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | 既有「exe 启动失败」用例的改法 | 只把条目 exe 换成 `'notepad.exe'`（真存在 → 预检放行 → 到假接缝）。其余一字不改：假接缝仍返回 `{ ok: false, handle: null, win32Error: 1223 }`，仍断言 `rejects.toThrow(/^PROC: /)`、sys 行含 `t('err.proc.uacCancelled', { exe: 'notepad.exe' })`、不含 `EACCES`（E2 / RF3） | ☐ |
| C2 | 新用例（名字逐字） | `it('exe_path_not_found_never_reaches_the_shell', …)`：`ql_save` 条目 exe = `'Z:\\no-such-dir\\no-such.exe'`；把 `winShell.shellExecute` 换成**计数** spy（照 `:357-358` / `:386-392` 的既有做法，`finally` 里还原）；断言：`ql_start` reject 以 `PROC: `开头、sys 日志行含 `t('err.proc.exeNotFound', { exe: 'Z:\\no-such-dir\\no-such.exe' })`、**spy 调用次数为 0**、`invoke('ql_states')` 为 `{}` | ☐ |
| C3 | 落地行号（实现时填） | 新用例 = `ipc-ql.test.ts:___`；`:353` 改动后现值 = `:___` | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先改测试（C1 + C2） | `npx vitest run src-main/ipc-ql.test.ts` | 新用例**绿**（任务 1 已实现）→ 不能只凭这条说「有牙」，必须做 D2 | ☐ |
| D2 | 变异取证（索引 K8）：临时注释掉 `launchShellExe` 的门，再跑 | `npx vitest run src-main/ipc-ql.test.ts` | 新用例**必红**：走到真 Shell（`shellExecute` 计数 ≥1、弹系统框、worker 被卡）或文案不是 `exeNotFound`。贴出红输出后**恢复门**，并复跑确认 `shell-execute.test.ts` 仍 14 绿 | ☐ |
| D3 | 定向 + 类型门 + i18n | `npx vitest run src-main/ipc-ql.test.ts`；`npx tsc --noEmit -p tsconfig.main.json`；`npx vitest run src-main/i18n` | 该文件 `Tests 30 passed (30)`（29 + 1）；tsc 无输出；i18n 全绿 | ☐ |
| D4 | 全量 | `npm test` | `Test Files 52 passed (52)` / `Tests 906 passed (906)`（K9） | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | 端到端：路径不存在 → `ql_start` 同步 reject、sys 行是 `err.proc.exeNotFound`、**真接缝一次都没被调用**（不弹系统框、不阻塞）、不残留状态 | 规格 §6.2 / §7.1-7 / RF1 | `exe_path_not_found_never_reaches_the_shell` | ☐ |
| E2 | 真 UAC 取消（1223）仍报 `err.proc.uacCancelled`，且 `{exe}` 是用户那一行的目标 | 规格 §6.4 / §7.1-6 / RF3；§3-P2 | 改写后的 `:352-377`（exe 换 `notepad.exe`，其余一字不改） | ☐ |
| E3 | 裸名写法不被误杀（`notepad.exe` 仍能起、仍能到接缝） | 规格 §7.1-8 / §8-Q12；§3-P10 | 既有 `:330-350` / `:381-416` 一字不改且绿 | ☐ |
| E4 | 失败不残留状态（`ql_states` 为 `{}`） | 前置规格 §7.5（`quick-launch.ts:293-297` 在 `set` 之前抛出） | 新用例的 `ql_states` 断言 | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 只改测试文件；生产代码一字不动 | 索引 G9 / 本表 B 段 | ☐ |
| F2 | 观察点仍是 `winShell.shellExecute` 属性替换（既有做法），不新建夹具形状 | `ipc-ql.test.ts:103-105` 的注释口径 | ☐ |
| F3 | 不动 `ql-elevated.ts:110-115` 那份 1223 拷贝（提权宿主的语境成立） | 规格 §5-1 / 索引 G4 | ☐ |
| F4 | 不新增词典键、不改前缀 | 索引 G1 / G2 | ☐ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/ipc-ql.test.ts` | `Tests 30 passed (30)` | ☐ |
| G2 | 相邻回归（未改的 exe 门仍绿） | `npx vitest run src-main/shell-execute.test.ts src-main/quick-launch.test.ts` | 14 passed / 全绿；两文件不在 `git diff --name-only` 里 | ☐ |
| G3 | 类型门 + i18n 三门 | `npx tsc --noEmit -p tsconfig.main.json`；`npx vitest run src-main/i18n` | 无输出 / 全绿 | ☐ |
| G4 | 全量 | `npm test` | `Tests 906 passed (906)`（K9） | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/ipc-ql.test.ts`（仅此一份） | ☐ |
| H2 | commit message 逐字 | `test(main): 快捷启动 exe 路径预检的端到端门（Shell 不被调用）` | ☐ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-15-quick-launch-exe-path-precheck/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☐ |

## I. 完成判据

- [ ] A1-A4 成立
- [ ] B1 之外没有文件被改
- [ ] C1-C3 逐字一致（C3 已填真实行号）
- [ ] D1→D4：D2 的变异红有真实输出
- [ ] E1-E4 有对应测试且绿
- [ ] G1-G4 全绿
- [ ] J 段有真实命令与真实输出（含 D2 的红与恢复后的绿）

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | | |
| J-2 | | |
| J-3 | | |
| J-4 | | |
