# 任务 1 · `isLaunchableExe` 预检 + 词典键 + `launchShellExe` 门 — check 表

> 计划：[2026-10-15-quick-launch-exe-path-precheck.md](../../plans/2026-10-15-quick-launch-exe-path-precheck.md) §任务 1 · 规格：[2026-10-15-quick-launch-exe-path-precheck.md](../../specs/2026-10-15-quick-launch-exe-path-precheck.md) §6.1 / §6.2 / §6.3 / §7.1-1..5 · 关联审查重点 **RF1 RF2 RF3 RF4 RF5**
> 前置：无（本 feature 第一个任务）
> 索引：[00-index.md](00-index.md) 的 G1–G9、RF1–RF5、**K1**（实参原样）、**K2**（大小写 / 补 `.exe`）、**K3**（前置规格同步）、**K4**（用 `openSync` 不用 `accessSync`）、**K5**（不可访问分支无单测）、**K6**（夹具换 `process.execPath`）、**K7**（两处旧注释必须同步）
> 派单输入：spec + plan + 本表三份都给子代理；子代理不 `git add`、不 commit（G8）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 两份文档已提交、无已跟踪改动 | `git log --oneline -1`；`git status --porcelain` | HEAD = `4c4f15f docs: 快捷启动可执行程序启动前预检目标 —— spec + plan（代码一行未改）`；porcelain 只允许未跟踪的 `.superpowers/` 与 `docs/superpowers/checks/` | ☐ |
| A2 | 全量基线（索引头部「测试基线」行：主代理 2026-10-15 22:56 实测，子代理不重跑） | `npm test` | `Test Files 52 passed (52)` / `Tests 901 passed (901)`，exit 0；本任务后只增不减 | ☐ |
| A3 | 本表引用的锚点行号属实 | 读 `shell-execute.ts:7-9` / `:29-33` / `:83-107` / `:197-212`、`dict.ts:300-301` / `:644-645`、`shell-execute.test.ts:12` | 与本表引用一致（本表生成时实测） | ☐ |
| A4 | 旧注释与本次设计**矛盾**，必须一并改（索引 K7） | 读 `shell-execute.ts:30`（`SEE_MASK_FLAG_NO_UI` 行尾注释「本次接受这个弹窗，不加 existsSync 预检（规格 §9-R8…）」）与 `:100-101`（「不要「顺手」加 existsSync 预检去绕开它」） | 两处属实 → 本任务把它们改成「已加预检（2026-10-15 §6.1）；`SEE_MASK_FLAG_NO_UI` 仍保留，它压不住这一类错误框（§3-E19/P1）」 | ☐ |
| A5 | 取证探针在位（不入库，`.temp/` 被 gitignore） | `Test-Path .temp/ql-diag/missing-exe-probe.cjs, .temp/ql-diag/fs-access-probe.cjs` | 两份都在；D6 要复跑 `missing` 用例 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/shell-execute.ts` | 改：① 顶部加 `node:fs` / `node:path` 的 import（`:7-9` 之后）；② 新增导出 `isLaunchableExe`（C1/C2）；③ `launchShellExe`（`:197`）在 `api.shellExecute` 之前加 C3 的门；④ 同步 `:30` 与 `:100-101` 的注释（A4 / K7） | 真接缝 `:83-107` 一字不动（`fMask` `:89`、`lpVerb` `:91`、`lpFile` `:93`、`lpParameters` `:94`、`lpDirectory` `:95`、`GetLastError` `:104`、只读 `hProcess` `:105`）；1223 分支 `:205-209` 一字不动；`ShellExecProcess`（`:129` 起）的轮询 / 停止 / 关闭一字不动 | ☐ |
| B2 | `src-main/i18n/dict.ts` | 改：zh 在 `:301`（`err.proc.uacCancelled`）之后插一行、en 在 `:645` 之后插一行（先改行号大的 en，再改 zh，避免漂移） | 其余键一字不动；两侧占位符都只有 `{exe}` | ☐ |
| B3 | `src-main/shell-execute.test.ts` | 改：`:12` 的 `EXE` 常量换成 `process.execPath`（K6）；新增 4 条用例（E1–E4 的名字逐字） | 既有 10 条用例（`:49` / `:60` / `:88` / `:104` / `:119` / `:135` / `:148` / `:166` / `:174` / `:186`）的**断言一字不改**；`fakeApi`（`:16-29`）/ `recordingApi`（`:35-44`）不扩形状 | ☐ |
| B4 | `docs/superpowers/specs/2026-10-13-quick-launch-elevated-exe-design.md` | 改：§6.5 两行表第一行加「且已通过 2026-10-15 §6.1 预检」的语境；§7.1-4 的「不存在的 exe → `win32Error=2`」标注真机实测为 1223（新 spec §3-P1）；§9-R8 改为「已由 2026-10-15 预检取代」并指向新 spec §6.1 | 只改这三处；其余段落一字不动（K3 / RF5） | ☐ |

**不在本任务**：`main.ts`、`quick-launch.ts`、`ipc-ql.test.ts`、`ql-elevated.ts`、`App.vue`、`QuickLaunch*.vue`、对话框过滤（`main.ts:1167`）。出现即 G9 越界。

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | 新导出签名 | `export function isLaunchableExe(exe: string): boolean;` —— 解析步骤（C2 的 ①–④）不导出 | ☐ |
| C2 | 解析 + 判定（规格 §6.1，逐字实现） | 解析：① `path.isAbsolute(exe)` → 候选 = 原样；② 含路径分隔符 → 候选 = `path.resolve(exe)`；③ 裸名 → 按 `process.env.PATH` 目录顺序找，`path.extname(exe) === ''` 时同一目录先试原名再试 `exe + '.exe'`，第一个「存在且是普通文件」的即候选；④ 无候选 → `false`。判定：① `fs.statSync` 成功且 `isFile()`；② `path.extname(候选).toLowerCase() === '.exe'`（K2）；③ `fs.openSync(候选, 'r')` 成功并随即 `fs.closeSync(fd)` —— **不得**用 `fs.accessSync`（K4 / §3-P12）。任一不过 → `false` | ☐ |
| C3 | 门的位置与逐字（规格 §6.2） | 在 `launchShellExe` 函数体最前、`api.shellExecute` 之前：`if (!isLaunchableExe(exe)) { throw new Error('PROC: ' + t('err.proc.exeNotFound', { exe })); }`。放行后 `:201-203` 的调用形状不变（`exe` 原样，K1） | ☐ |
| C4 | 词典键（规格 §6.3，两侧各一行） | zh：`'err.proc.exeNotFound': '{exe} 不存在、不是 .exe 文件或不可访问',` · en：`'err.proc.exeNotFound': '{exe} does not exist, is not an .exe file, or is not accessible',` | ☐ |
| C5 | 落地行号（实现时填真实行号证据） | `isLaunchableExe` = `shell-execute.ts:___`；门 = `:___`；词典 zh = `:___` / en = `:___`；注释同步 = `:___` / `:___` | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先写 4 条失败测试（plan 步骤 1） | `npx vitest run src-main/shell-execute.test.ts` | 红：`Tests 4 failed \| 10 passed (14)`，失败原因是 `isLaunchableExe is not a function` / 门缺失（`shellExecute` 被调用），**不是**既有 10 条被撞红 | ☐ |
| D2 | 加词典两行（先 en `:645` 后、再 zh `:301` 后） | `npx vitest run src-main/i18n` | 三门仍绿（`key-coverage` 只查「调用点的键必须在词典里」，不查未使用的键；只加一侧会让 `dict.test.ts` 红 → 必须两侧同时加） | ☐ |
| D3 | 实现 `isLaunchableExe` + 门 + 同步两处旧注释（A4 / K7） | `npx vitest run src-main/shell-execute.test.ts` | 全绿：`Tests 14 passed (14)` | ☐ |
| D4 | 夹具换 `process.execPath` 后既有 10 条仍绿（K6） | 同上 | 14 条全绿；`verb_runas_is_passed_through_to_the_shell` / `no_opts_keeps_verb_and_parameters_null` 的断言一字未改（RF4） | ☐ |
| D5 | 类型门 + 全量 | `npx tsc --noEmit -p tsconfig.main.json`；`npm test` | tsc 无输出；全量 `Test Files 52 passed (52)` / `Tests 905 passed (905)`（901 + 4，K9） | ☐ |
| D6 | 真机复跑取证（证明「Shell 自己给不出可用信息」不是猜的） | `node .temp/ql-diag/missing-exe-probe.cjs missing` | 仍 `ok=false … GetLastError=1223 hInstApp=2`（会弹 Shell 系统框，需点「确定」；这是**旧路径**的取证，不是新行为） | ☐ |
| D7 | 同步前置规格（K3 / RF5） | 读 `docs/superpowers/specs/2026-10-13-quick-launch-elevated-exe-design.md` 的 §6.5 / §7.1-4 / §9-R8 | 三处已按 B4 改写；三份文档任一改动，另两份对应处已核对（AGENTS.md「后续更新」第 3 条） | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | 不存在的绝对路径（含无效驱动器）→ `false` | 规格 §6.1 判定①/③、§3-P1/P4 | `missing_absolute_path_is_not_launchable` | ☐ |
| E2 | 存在的**目录**、存在的**非 `.exe` 文件** → `false` | 规格 §8-Q4/Q5；§3-P6（目录今天会被 Shell 判成功、`hProcess=null` 留下假运行态） | `directory_and_non_exe_file_are_not_launchable` | ☐ |
| E3 | 存在的 `.exe` → `true`；**裸名经 PATH 解析** → `true`（不误杀） | 规格 §6.1 解析③ / §8-Q12；§3-P10 | `existing_exe_and_bare_name_through_PATH_are_launchable`（用 `process.execPath` 的目录临时前置进 `process.env.PATH`，`finally` 恢复） | ☐ |
| E4 | 预检不过 → 抛 `PROC: `+ `err.proc.exeNotFound`，且 `api.shellExecute` / `pidOf` / `isAlive` **均未被调用** | 规格 §6.2 / RF1 | `precheck_blocks_before_the_shell_is_called` | ☐ |
| E5 | 放行时交给接缝的实参逐字不变（`exe` 原样、`nShow=1`、`verb` / `parameters` 不变） | 规格 §6.1 末段 / 索引 K1 / RF4 | 既有 `verb_runas_is_passed_through_to_the_shell` / `no_opts_keeps_verb_and_parameters_null`（一字不改） | ☐ |
| E6 | 1223 → `err.proc.uacCancelled` 的映射未被削弱（语境收窄靠预检，不靠改这段） | 规格 §6.4 / RF3；§3-P2 | 既有用例 3（`:88`）一字不改；端到端归任务 2 | ☐ |
| E7 | 「存在但不可访问（ACL 拒读）」→ `false` | 规格 §6.1 判定③ / §8-Q11 / §3-P5/P12 | ☐（原因 + 去处：夹具要改 ACL、跨机器不稳，且 `fs.accessSync` 造不出这个红（索引 K4/K5、规格 §9-R7）→ 由任务 3 真机门 §7.2-8 守） | ☐（原因 + 去处见左列） |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 错误前缀只有 `PROC: `，不新增前缀 | 索引 G1 | ☐ |
| F2 | 词典只新增 `err.proc.exeNotFound` 一个键 | 索引 G2 | ☐ |
| F3 | 真接缝与 1223 分支一字不动；放行实参原样 | 索引 G3 / K1 | ☐ |
| F4 | 不动 `ql-elevated.ts:110-115` / `process.ts` / llama-server / 渲染端 / 对话框过滤 | 索引 G4、规格 §5 | ☐ |
| F5 | 不新增依赖（只用 `node:fs` / `node:path`） | 索引 G7 | ☐ |
| F6 | 不「顺手」扩范围：不加保存时校验、不加渲染端提示、不给 `hInstApp` 加字段 | 规格 §5 非目标 | ☐ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/shell-execute.test.ts` | `Tests 14 passed (14)` | ☐ |
| G2 | 相邻回归（**未改**的 exe 路径文件必须仍绿） | `npx vitest run src-main/ipc-ql.test.ts src-main/quick-launch.test.ts` | 全绿；`git diff --name-only` 不含这两份 | ☐ |
| G3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 无输出（索引 K27：仓库根只有 `tsconfig.main.json`） | ☐ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿；`git diff src-main/i18n/dict.ts` 恰两行新增 | ☐ |
| G5 | 全量 | `npm test` | `Test Files 52 passed (52)` / `Tests 905 passed (905)`（K9；对不上要在 J 段说明） | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/shell-execute.ts`、`src-main/i18n/dict.ts`、`src-main/shell-execute.test.ts`、`docs/superpowers/specs/2026-10-13-quick-launch-elevated-exe-design.md`（K3 / RF5：前置规格与代码同一提交） | ☐ |
| H2 | commit message 逐字 | `fix(main): 快捷启动 exe 启动前预检目标（不存在 / 非 .exe / 不可访问不调 Shell）` | ☐ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-15-quick-launch-exe-path-precheck/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0`（E7 写成 `☐（原因+去处）`，会被列为「显式未勾」供核对，不算违规） | ☐ |

## I. 完成判据

- [ ] A1-A5 成立
- [ ] B1-B4 之外没有文件被改（G9）
- [ ] C1-C5 逐字一致（C5 已填真实行号）
- [ ] D1→D5 先红后绿；D6 探针输出与 §3-P1 一致；D7 三份文档同步
- [ ] E1-E6 有对应测试且绿；E7 按 K5 记为显式未勾
- [ ] G1-G5 全绿
- [ ] J 段有真实命令与真实输出

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | | |
| J-2 | | |
| J-3 | | |
| J-4 | | |
| J-5 | | |
| J-6 | | |
