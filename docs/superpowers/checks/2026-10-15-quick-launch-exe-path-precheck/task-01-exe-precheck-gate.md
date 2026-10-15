# 任务 1 · `isLaunchableExe` 预检 + 词典键 + `launchShellExe` 门 — check 表

> 计划：[2026-10-15-quick-launch-exe-path-precheck.md](../../plans/2026-10-15-quick-launch-exe-path-precheck.md) §任务 1 · 规格：[2026-10-15-quick-launch-exe-path-precheck.md](../../specs/2026-10-15-quick-launch-exe-path-precheck.md) §6.1 / §6.2 / §6.3 / §7.1-1..5 · 关联审查重点 **RF1 RF2 RF3 RF4 RF5**
> 前置：无（本 feature 第一个任务）
> 索引：[00-index.md](00-index.md) 的 G1–G9、RF1–RF5、**K1**（实参原样）、**K2**（大小写 / 补 `.exe`）、**K3**（前置规格同步）、**K4**（用 `openSync` 不用 `accessSync`）、**K5**（不可访问分支无单测）、**K6**（夹具换 `process.execPath`）、**K7**（两处旧注释必须同步）
> 派单输入：spec + plan + 本表三份都给子代理；子代理不 `git add`、不 commit（G8）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 两份文档已提交、无已跟踪改动 | `git log --oneline -1`；`git status --porcelain` | HEAD = `4c4f15f docs: 快捷启动可执行程序启动前预检目标 —— spec + plan（代码一行未改）`；porcelain 只允许未跟踪的 `.superpowers/` 与 `docs/superpowers/checks/` | ☑ 实测：`git log --oneline -1` = `cefca90 docs: 快捷启动 exe 启动前预检 3 个任务的 check 表…`（本表自身的提交），`4c4f15f` 是它的父（`git merge-base --is-ancestor 4c4f15f HEAD` → exit 0）；`git status --porcelain` 只有未跟踪 `.superpowers/sdd/…/task-01-brief.md` → 无已跟踪改动 ✓。表里的 HEAD 字面值已被「check 表提交」推进，属过期，不是工作区问题 |
| A2 | 全量基线（索引头部「测试基线」行：主代理 2026-10-15 22:56 实测，子代理不重跑） | `npm test` | `Test Files 52 passed (52)` / `Tests 901 passed (901)`，exit 0；本任务后只增不减 | ☑ 基线按索引头部主代理 2026-10-15 22:56 实测（901，索引写明子代理不重跑）；本任务后总数 905 = 901 + 4（J-5），只增不减 ✓ |
| A3 | 本表引用的锚点行号属实 | 读 `shell-execute.ts:7-9` / `:29-33` / `:83-107` / `:197-212`、`dict.ts:300-301` / `:644-645`、`shell-execute.test.ts:12` | 与本表引用一致（本表生成时实测） | ☑ 锚点逐条读原文核对，全部属实：`shell-execute.ts:7-9` import 段 / `:29-33` 取值 / `:83-107` 真接缝 / `:197-212` `launchShellExe`（`:205` 1223 分支）/ `dict.ts:300-301` zh、`:644-645` en / `shell-execute.test.ts:12` `EXE` 夹具 |
| A4 | 旧注释与本次设计**矛盾**，必须一并改（索引 K7） | 读 `shell-execute.ts:30`（`SEE_MASK_FLAG_NO_UI` 行尾注释「本次接受这个弹窗，不加 existsSync 预检（规格 §9-R8…）」）与 `:100-101`（「不要「顺手」加 existsSync 预检去绕开它」） | 两处属实 → 本任务把它们改成「已加预检（2026-10-15 §6.1）；`SEE_MASK_FLAG_NO_UI` 仍保留，它压不住这一类错误框（§3-E19/P1）」 | ☑ 两处属实并已按本表口径改写：原 `:30`「本次接受这个弹窗，不加 existsSync 预检」→ 现 `:33`；原 `:100-101`「不要顺手加 existsSync 预检去绕开它」→ 现 `:103-106` |
| A5 | 取证探针在位（不入库，`.temp/` 被 gitignore） | `Test-Path .temp/ql-diag/missing-exe-probe.cjs, .temp/ql-diag/fs-access-probe.cjs` | 两份都在；D6 要复跑 `missing` 用例 | ☑ `Test-Path` 两份都 `True`（`missing-exe-probe.cjs` / `fs-access-probe.cjs`）；D6 归主代理 |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/shell-execute.ts` | 改：① 顶部加 `node:fs` / `node:path` 的 import（`:7-9` 之后）；② 新增导出 `isLaunchableExe`（C1/C2）；③ `launchShellExe`（`:197`）在 `api.shellExecute` 之前加 C3 的门；④ 同步 `:30` 与 `:100-101` 的注释（A4 / K7） | 真接缝 `:83-107` 一字不动（`fMask` `:89`、`lpVerb` `:91`、`lpFile` `:93`、`lpParameters` `:94`、`lpDirectory` `:95`、`GetLastError` `:104`、只读 `hProcess` `:105`）；1223 分支 `:205-209` 一字不动；`ShellExecProcess`（`:129` 起）的轮询 / 停止 / 关闭一字不动 | ☑ 四处都改：import `:10-12`；`isLaunchableExe` `:228-243`（内部件 `isRegularFile:197-200` / `resolveLaunchTarget:205-219` 未导出）；门 `:251-256`；注释 `:33` 与 `:103-106`。真接缝**代码**一字未动（该 hunk 只有注释行变化）、1223 分支（现 `:263-267`）未动、`ShellExecProcess` 未动 |
| B2 | `src-main/i18n/dict.ts` | 改：zh 在 `:301`（`err.proc.uacCancelled`）之后插一行、en 在 `:645` 之后插一行（先改行号大的 en，再改 zh，避免漂移） | 其余键一字不动；两侧占位符都只有 `{exe}` | ☑ zh 插在现 `:302`、en 插在现 `:647`（先改行号大的 en，再改 zh）；`git diff --numstat` = `2 0`，恰两行；两侧占位符都只有 `{exe}` |
| B3 | `src-main/shell-execute.test.ts` | 改：`:12` 的 `EXE` 常量换成 `process.execPath`（K6）；新增 4 条用例（E1–E4 的名字逐字） | 既有 10 条用例（`:49` / `:60` / `:88` / `:104` / `:119` / `:135` / `:148` / `:166` / `:174` / `:186`）的**断言一字不改**；`fakeApi`（`:16-29`）/ `recordingApi`（`:35-44`）不扩形状 | ☑ 夹具改 `process.execPath`（现 `:12-14`，含 K6 注释）；新增 4 条用例名字逐字（现 `:178-215`）。既有 10 条断言一字未改（该文件 diff 只有 import / 夹具 / 新用例三处 hunk）；`fakeApi` / `recordingApi` 形状未扩 |
| B4 | `docs/superpowers/specs/2026-10-13-quick-launch-elevated-exe-design.md` | 改：§6.5 两行表第一行加「且已通过 2026-10-15 §6.1 预检」的语境；§7.1-4 的「不存在的 exe → `win32Error=2`」标注真机实测为 1223（新 spec §3-P1）；§9-R8 改为「已由 2026-10-15 预检取代」并指向新 spec §6.1 | 只改这三处；其余段落一字不动（K3 / RF5） | ☑ 三处已改：§6.5 表第一行加「且已通过 2026-10-15 规格 §6.1 的启动前预检」语境；§7.1-4 标注真机实测 `GetLastError=1223` / `hInstApp=2`（§3-P1）；§9-R8 改为「已由 2026-10-15 的启动前预检取代」并指向新 spec §6.1 / §6.2。该文件 diff = 3 行改，其余段落未动 |

| B5 | `src-main/ipc-ql.test.ts` | 改**同一字面量共两处**：`:353` 条目值 + `:371` 的 `t('err.proc.uacCancelled', { exe })` 占位值，`no-such-exe-zzz.exe` → `notepad.exe`（索引 K10：预检生效的直接后果，归任务 1；只改一处会红在 `:371`，见 J-17） | 该文件其余一字不改；`:330-350` / `:381-416` / `:714-750` 一字不改（RF2 / RF6） | ☑ `git diff src-main/ipc-ql.test.ts` = 恰 2 行 -/+（`:353` 与 `:371`），无其它 hunk |

**不在本任务**：`main.ts`、`quick-launch.ts`、`ql-elevated.ts`、`App.vue`、`QuickLaunch*.vue`、对话框过滤（`main.ts:1167`）。出现即 G9 越界。

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | 新导出签名 | `export function isLaunchableExe(exe: string): boolean;` —— 解析步骤（C2 的 ①–④）不导出 | ☑ `export function isLaunchableExe(exe: string): boolean` = `shell-execute.ts:242`（主代理 00:1x 复核，行号随 C6 续做从 :228 移到 :242）；解析步骤（①–④）不导出（`resolveLaunchTarget` = `:217`、`targetShape` = `:204`，均未导出） |
| C2 | 解析 + 判定（规格 §6.1，逐字实现） | 解析：① `path.isAbsolute(exe)` → 候选 = 原样；② 含路径分隔符 → 候选 = `path.resolve(exe)`；③ 裸名 → 按 `process.env.PATH` 目录顺序找，`path.extname(exe) === ''` 时同一目录先试原名再试 `exe + '.exe'`，第一个「存在且是普通文件」的即候选；④ 无候选 → `false`。判定：① `fs.lstatSync` 成功且 `isFile()`（普通文件 → 继续②③）**或** `isSymbolicLink()`（重解析点 → 只做②、跳过③，见 C6 / §8-Q13）；② `path.extname(候选).toLowerCase() === '.exe'`（K2）；③ 仅普通文件做：`fs.openSync(候选, 'r')` 成功并随即 `fs.closeSync(fd)` —— **不得**用 `fs.accessSync`（K4 / §3-P12）。任一不过 → `false` | ☑ 逐字实现：①`isAbsolute` 原样 `:206`；②含 `[\/]` → `resolvePath(exe)` `:207`；③裸名按 `process.env.PATH.split(delimiter)` 顺序查找、无扩展名先原名再 `+ ".exe"` `:210-217`；④无候选 → null `:218`。判定①两支：`targetShape()` 用 `lstatSync` 返回 `'file' \| 'reparse' \| null` `:204-212`，`isLaunchableExe 内两支 `:245-250`（普通文件→②③；重解析点→只做②、跳过③）；②`extname().toLowerCase() === ".exe"` `:247`；③仅普通文件：`openSync(候选, "r")` + `closeSync` `:254-259`；全文无 `accessSync`、无 `statSync` |（主代理 00:1x 复核行号；C6 续做后行号已移动）
| C3 | 门的位置与逐字（规格 §6.2） | 在 `launchShellExe` 函数体最前、`api.shellExecute` 之前：`if (!isLaunchableExe(exe)) { throw new Error('PROC: ' + t('err.proc.exeNotFound', { exe })); }`。放行后 `:201-203` 的调用形状不变（`exe` 原样，K1） | ☑ 门在函数体最前、`api.shellExecute` 之前（`:254-256`），逐字 = `if (!isLaunchableExe(exe)) { throw new Error("PROC: " + t("err.proc.exeNotFound", { exe })); }`（源码用单引号，此处为避免表格转义改用双引号显示）；放行后调用形状不变（`:260-262`，`exe` 原样） |
| C4 | 词典键（规格 §6.3，两侧各一行） | zh：`'err.proc.exeNotFound': '{exe} 不存在、不是 .exe 文件或不可访问',` · en：`'err.proc.exeNotFound': '{exe} does not exist, is not an .exe file, or is not accessible',` | ☑ 两侧逐字：zh `dict.ts:302`、en `dict.ts:647`，与 C4 文本一字不差 |
| C6 | 重解析点口径（规格 §6.1 判定① 第二支 / §8-Q13 / 索引 K11） | 候选 `fs.lstatSync` 成功且 `isSymbolicLink()`（符号链接 / junction / WindowsApps app execution alias）→ 只做扩展名判定，**不做** `openSync`（P14：别名 `statSync`/`openSync`/`realpathSync` 全 `EACCES`）；普通文件仍做 `openSync`。依据 P13：Shell 起得了裸名与全路径别名 | ☑ `targetShape`（`lstatSync` → `'file' \| 'reparse' \| null`）= `:204-212`；解析③ 的「存在」口径同用它 = `:227-228`；判定① 两支 = `:245-250`（`if (shape === 'reparse') return true` = `:250`）；全文无 `statSync`。E8 用例真跑未 skip（J-14；主代理复跑 J-22） |
| C5 | 落地行号（实现时填真实行号证据） | `isLaunchableExe` = `shell-execute.ts:___`；门 = `:___`；词典 zh = `:___` / en = `:___`；注释同步 = `:___` / `:___` | ☑ 实测行号（主代理 00:1x 复核，含 C6 续做后的位移）：`isLaunchableExe` = `shell-execute.ts:242-261`；`targetShape` = `:204-212`；`resolveLaunchTarget` = `:217-234`；门 = `:269-274`（抛错 `:272-274`）；词典 zh = `dict.ts:302` / en = `dict.ts:647`；注释同步 = `shell-execute.ts:33` / `:103-106`；import = `:10-12` |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先写 5 条失败测试（plan 步骤 1） | `npx vitest run src-main/shell-execute.test.ts` | 红：`Tests 4 failed \| 10 passed (14)`，失败原因是 `isLaunchableExe is not a function` / 门缺失（`shellExecute` 被调用），**不是**既有 10 条被撞红 | ☑ 见 J-1：`Tests 4 failed \| 10 passed (14)`，3× `isLaunchableExe is not a function` + 1× 门缺失（`expected "" to match /^PROC: /`：假接缝被调用并返回 ok=true）；既有 10 条未被撞红 |
| D2 | 加词典两行（先 en `:645` 后、再 zh `:301` 后） | `npx vitest run src-main/i18n` | 三门仍绿（`key-coverage` 只查「调用点的键必须在词典里」，不查未使用的键；只加一侧会让 `dict.test.ts` 红 → 必须两侧同时加） | ☑ 见 J-2：i18n 四份文件 `Tests 18 passed (18)`；两侧同时加，`dict.test.ts` 未红 |
| D3 | 实现 `isLaunchableExe` + 门 + 同步两处旧注释（A4 / K7） | `npx vitest run src-main/shell-execute.test.ts` | 全绿：`Tests 15 passed (15)`（追加 E8 别名用例后；原 14 见 J-3） | ☑ 见 J-3：`Tests 14 passed (14)`（中途一次红 = 测试文件漏 import `delimiter` → `ReferenceError`，补后即绿，与实现无关）；续做轮 2 见 J-13/J-14：先红 `Tests 1 failed \| 14 passed (15)`（红在实现，不在夹具）→ 后绿 `Tests 15 passed (15)`。主代理 00:1x 亲自复跑：`Tests 15 passed (15)` |
| D4 | 夹具换 `process.execPath` 后既有 10 条仍绿（K6） | 同上 | 14 条全绿；`verb_runas_is_passed_through_to_the_shell` / `no_opts_keeps_verb_and_parameters_null` 的断言一字未改（RF4） | ☑ 14 条全绿；两条 verb 用例断言一字未改（diff 三处 hunk 不含它们） |
| D8 | 改 `ipc-ql.test.ts` 的两处同一字面量（`:353` + `:371`；B5 / K10） | `npx vitest run src-main/ipc-ql.test.ts` | 该文件 **27** 条全绿（条数不变；口径见索引 K13） | ☑ 见 J-15/J-16：只改 `:353` → `1 failed \| 26 passed (27)`（红在 `:371`）；两处同改 → `27 passed (27)`。主代理 00:1x 亲自复跑：`ipc-ql` + `quick-launch` + `i18n` = `Tests 79 passed (79)`（27 + 34 + 18） |
| D5 | 类型门 + 全量 | `npx tsc --noEmit -p tsconfig.main.json`；`npm test` | tsc 无输出；全量 `Test Files 52 passed (52)` / `Tests 906 passed (906)`（901 + 5，K9） | ☑（轮 1 曾红：tsc 干净（J-4，`TSC_EXIT=0`），但全量 = `Tests 2 failed \| 903 passed (905)` —— 总数 905 与 K9 一致，2 条红全在本任务不许改的 `ipc-ql.test.ts`：①`:352-377` 断言 `uacCancelled`（plan 把这条改写归任务 2 步骤 6）；②`:717` 裸名 `mspaint.exe` 是 WindowsApps 的 app execution alias，`statSync` 抛 EACCES → 预检判 false（偏离 2，plan 未覆盖）。需主代理裁决，见报告「偏离」）。**主代理裁决（23:5x）**：偏离 1 → 索引 K10，那条一行改写归本任务（B5 / D8）；偏离 2 → 成立且是真回归（P13：Shell 起得了裸名别名 `ok=true hInstApp=42 pid=9548`），按 §8-Q13 扩 §6.1 判定①（C6 / E8），不改 `:717` 的夹具 → 需复跑，预期 906）。**主代理验收（00:1x）☑**：`npx tsc --noEmit -p tsconfig.main.json` → 无输出 `TSC_EXIT=0`；`npm test` → `Test Files 52 passed (52)` / `Tests 906 passed (906)`，exit 0（= 901 + 5，K9 逐字一致）。两条红全部消除：①由 B5/D8 修夹具；②由 C6 让别名可启动 → `:717` 的并发用例（真起进程）在全量里绿（J-19） |
| D6 | 真机复跑取证（证明「Shell 自己给不出可用信息」不是猜的） | `node .temp/ql-diag/missing-exe-probe.cjs missing` | 仍 `ok=false … GetLastError=1223 hInstApp=2`（会弹 Shell 系统框，需点「确定」；这是**旧路径**的取证，不是新行为） | ☑ 主代理验收时取证：`.temp/ql-diag/missing-exe-probe.log`（本机今日 22:55 跑过，mtime `2026-10-15T14:55:24Z`）内两行 —— `CALL tag=missing-open-0x44 fMask=0x44 verb=null file=E:\V2rayN\no-such-v2ray.exe` / `RESULT tag=missing-open-0x44 ok=false elapsedMs=6134 GetLastError=1223 hInstApp=2 hProcess=null`。这正是 D6 要的**旧路径**取证（改代码之前），复跑只会再弹一次需人点「确定」的系统框、不新增信息 → 不重跑，证据引日志原文（J-6） |
| D7 | 同步前置规格（K3 / RF5） | 读 `docs/superpowers/specs/2026-10-13-quick-launch-elevated-exe-design.md` 的 §6.5 / §7.1-4 / §9-R8 | 三处已按 B4 改写；三份文档任一改动，另两份对应处已核对（AGENTS.md「后续更新」第 3 条） | ☑ 见 J-8：三处已按 B4 改写；新 spec §6.4 / §7.1-4 更正 / §9-R8 取代与本表对应处已核对 |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | 不存在的绝对路径（含无效驱动器）→ `false` | 规格 §6.1 判定①/③、§3-P1/P4 | `missing_absolute_path_is_not_launchable` | ☑ `missing_absolute_path_is_not_launchable` 绿（`Z:\no-such-dir\no-such.exe` + 本仓目录下随机后缀 `.exe`） |
| E2 | 存在的**目录**、存在的**非 `.exe` 文件** → `false` | 规格 §8-Q4/Q5；§3-P6（目录今天会被 Shell 判成功、`hProcess=null` 留下假运行态） | `directory_and_non_exe_file_are_not_launchable` | ☑ `directory_and_non_exe_file_are_not_launchable` 绿（`process.cwd()`；`join(__dirname, "..", "package.json")` 与 cwd 无关） |
| E3 | 存在的 `.exe` → `true`；**裸名经 PATH 解析** → `true`（不误杀） | 规格 §6.1 解析③ / §8-Q12；§3-P10 | `existing_exe_and_bare_name_through_PATH_are_launchable`（用 `process.execPath` 的目录临时前置进 `process.env.PATH`，`finally` 恢复） | ☑ `existing_exe_and_bare_name_through_PATH_are_launchable` 绿（`process.execPath`；把其目录临时前置进 `process.env.PATH` 后用 basename；`finally` 恢复） |
| E4 | 预检不过 → 抛 `PROC: `+ `err.proc.exeNotFound`，且 `api.shellExecute` / `pidOf` / `isAlive` **均未被调用** | 规格 §6.2 / RF1 | `precheck_blocks_before_the_shell_is_called` | ☑ `precheck_blocks_before_the_shell_is_called` 绿：`PROC: ` 前缀 + `err.proc.exeNotFound`，且 `shellExecute` / `pidOf` / `isAlive` 均未被调用（RF1） |
| E5 | 放行时交给接缝的实参逐字不变（`exe` 原样、`nShow=1`、`verb` / `parameters` 不变） | 规格 §6.1 末段 / 索引 K1 / RF4 | 既有 `verb_runas_is_passed_through_to_the_shell` / `no_opts_keeps_verb_and_parameters_null`（一字不改） | ☑ 两条 verb 用例一字未改且绿（J-3） |
| E6 | 1223 → `err.proc.uacCancelled` 的映射未被削弱（语境收窄靠预检，不靠改这段） | 规格 §6.4 / RF3；§3-P2 | 既有用例 3（`:88`）一字不改 + `ipc-ql.test.ts:352-377` 端到端（夹具换真 `notepad.exe`，B5 / K10 已随本任务落地） | ☑ 两层都绿：单元层既有用例 3 一字未改（预检放行 `process.execPath` → 假接缝回 1223 → 仍 `err.proc.uacCancelled`）；端到端层 `ipc-ql` 该用例仍断 `uacCancelled`、仍不含 `EACCES`、仍 reject `^PROC: `、不残留状态（J-16）。主代理亲自复跑 `npm test` 全绿（J-22） |
| E8 | **重解析点（WindowsApps app execution alias）→ `true`**（不误杀 `mspaint.exe` / `python.exe` / `code.exe`） | 规格 §6.1 判定① 第二支 / §8-Q13 / RF6；§3-P13/P14 | `app_execution_alias_in_PATH_is_launchable`（夹具 = `PATH` 里真实存在的别名；不在时 `it.skipIf` 跳过 → 硬门归真机 §7.2-9，索引 K12 / 规格 §9-R9） | ☑ 用例在位（`shell-execute.test.ts:196-228`，名字逐字）；夹具 = 在 `PATH` 各目录里找 `mspaint.exe` 且 `lstatSync().isSymbolicLink()`（只取重解析点这一支）；先钉夹具形状再断言裸名 + 全路径都 `true`。**主代理 00:1x 用 verbose 复跑亲自确认它是 `✓` 真跑、不是 skip**（先红 J-13 → 绿 J-14；主代理复跑 J-22）；`:717` 的并发用例（真起进程、夹具 `mspaint.exe`）在全量里绿 = 这条的端到端牙（J-19） |
| E7 | 「存在但不可访问（ACL 拒读）」→ `false` | 规格 §6.1 判定③ / §8-Q11 / §3-P5/P12 | ☐（原因 + 去处：夹具要改 ACL、跨机器不稳，且 `fs.accessSync` 造不出这个红（索引 K4/K5、规格 §9-R7）→ 由任务 3 真机门 §7.2-8 守） | ☐（原因 + 去处见左列） |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 错误前缀只有 `PROC: `，不新增前缀 | 索引 G1 | ☑ 新增 throw 只有 `PROC: ` 前缀（`:255`），无新前缀 |
| F2 | 词典只新增 `err.proc.exeNotFound` 一个键 | 索引 G2 | ☑ `git diff src-main/i18n/dict.ts` = 恰两行新增、同一个键 |
| F3 | 真接缝与 1223 分支一字不动；放行实参原样 | 索引 G3 / K1 | ☑ 真接缝代码与 1223 分支未动；放行实参原样（`exe` 未被替换成解析后的绝对路径） |
| F4 | 不动 `ql-elevated.ts:110-115` / `process.ts` / llama-server / 渲染端 / 对话框过滤 | 索引 G4、规格 §5 | ☑ `git diff --name-only` 不含 `ql-elevated.ts` / `process.ts` / `App.vue` / `QuickLaunch*.vue` / `main.ts` |
| F5 | 不新增依赖（只用 `node:fs` / `node:path`） | 索引 G7 | ☑ 只用 `node:fs` / `node:path`；`git diff package.json package-lock.json electron-builder.yml` 为空 |
| F6 | 不「顺手」扩范围：不加保存时校验、不加渲染端提示、不给 `hInstApp` 加字段 | 规格 §5 非目标 | ☑ 无保存时校验、无渲染端提示、`hInstApp` 未加字段（diff 范围即证） |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/shell-execute.test.ts` | `Tests 15 passed (15)`（追加 E8 后） | ☑ `Tests 14 passed (14)`（J-3） |
| G2 | 相邻回归 | `npx vitest run src-main/ipc-ql.test.ts src-main/quick-launch.test.ts` | 全绿；`quick-launch.test.ts` 一字不改；`ipc-ql.test.ts` 只允许 `:353` 一行（B5 / K10） | ☑ 主代理 00:1x 亲自复跑：`npx vitest run src-main/ipc-ql.test.ts src-main/quick-launch.test.ts src-main/i18n` → `Test Files 6 passed (6)` / `Tests 79 passed (79)`（27 + 34 + 18）。`quick-launch.test.ts` 不在 `git diff --name-only` 里 ✓；`ipc-ql.test.ts` 的 diff = 恰两处同一字面量（B5 / K10） |
| G3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 无输出（索引 K27：仓库根只有 `tsconfig.main.json`） | ☑ 无输出，`TSC_EXIT=0`（J-4） |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿；`git diff src-main/i18n/dict.ts` 恰两行新增 | ☑ `Test Files 4 passed (4)` / `Tests 18 passed (18)`；`git diff src-main/i18n/dict.ts` 恰两行新增（J-2） |
| G5 | 全量 | `npm test` | `Test Files 52 passed (52)` / `Tests 906 passed (906)`（K9；对不上要在 J 段说明） | ☑ 主代理 00:1x 亲自复跑 `npm test` → `Test Files 52 passed (52)` / `Tests 906 passed (906)`，exit 0（901 + 5，K9） |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/shell-execute.ts`、`src-main/ipc-ql.test.ts`（B5 / K10）、`src-main/i18n/dict.ts`、`src-main/shell-execute.test.ts`、`docs/superpowers/specs/2026-10-13-quick-launch-elevated-exe-design.md`（K3 / RF5：前置规格与代码同一提交） | ☑ 主代理核对：代码/测试暂存范围 = `src-main/shell-execute.ts`、`src-main/i18n/dict.ts`、`src-main/shell-execute.test.ts`、`src-main/ipc-ql.test.ts` + 前置规格（K3）；并按 AGENTS.md「偏离先改文档（同一 commit）」把本次裁决涉及的 spec / plan / 四张 check 表同提交（索引 K10-K13 / RF6）。`git status --porcelain` 实测无 B 段之外的代码文件 |
| H2 | commit message 逐字 | `fix(main): 快捷启动 exe 启动前预检目标（不存在 / 非 .exe / 不可访问不调 Shell）` | ☑ 主代理验收通过后提交，message 逐字 = 本行内容；本次提交同时带上裁决涉及的 spec / plan / 四张 check 表（AGENTS.md「偏离 spec：先改 spec / plan / check 表（同一 commit）再改代码」） |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-15-quick-launch-exe-path-precheck/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0`（E7 写成 `☐（原因+去处）`，会被列为「显式未勾」供核对，不算违规） | ☑ 主代理在 `git commit` 之前跑 `node .superpowers/sdd/2026-10-15-quick-launch-exe-path-precheck/tick-census.mjs`：本表 `裸☐=0`、`I段 -[ ]=0`（输出见 J-23；E7 / D6 类未满足项写成 `☐（原因 + 去处）`，被列作「显式未勾」供核对，不算违规） |

## I. 完成判据

- [x] A1-A5 成立（A1 的 HEAD 字面值已被「check 表提交」推进，见该行注）
- [x] B1-B4 之外没有文件被改（G9）：`git diff --name-only` 恰四份（J-7）
- [x] C1-C5 逐字一致（C5 已填真实行号）
- ☐（原因 + 去处：D1→D4 先红后绿 ✓、D7 三份文档同步 ✓；D5 全量 2 红见该行「偏离 1 / 偏离 2」，需主代理裁决；D6 归主代理）D1→D5 先红后绿；D6 探针输出与 §3-P1 一致；D7 三份文档同步
- [x] E1-E6 有对应测试且绿；E7 按 K5 记为显式未勾
- ☐（原因 + 去处：G1/G3/G4 绿；G2/G5 因 `ipc-ql.test.ts` 2 红未过，见 D5 行与报告偏离）G1-G5 全绿
- [x] J 段有真实命令与真实输出（J-1…J-10；J-6 按索引 K5/D6 归主代理）

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `npx vitest run src-main/shell-execute.test.ts`（23:28:07，实现前 = D1 红门） | `Test Files 1 failed (1)` / `Tests 4 failed \| 10 passed (14)`，Duration 2.93s。失败原因逐条：`TypeError: isLaunchableExe is not a function`（新用例 `:179` / `:186` / `:192`）+ `AssertionError: expected \"\" to match /^PROC: /`（`:212`：门缺失 → 假接缝被调用并返回 `ok=true`，故没抛错）。既有 10 条全绿 = 没被撞红 |
| J-2 | `npx vitest run src-main/i18n`（23:28:27，词典两行加完后） | `Test Files 4 passed (4)` / `Tests 18 passed (18)`（index 3 / no-hardcoded 2 / key-coverage 2 / dict 11）。`git diff --numstat src-main/i18n/dict.ts` → `2\t0`；diff 只有 zh `:302` 与 en `:647` 两行 `+`，两侧占位符都只有 `{exe}` |
| J-3 | `npx vitest run src-main/shell-execute.test.ts`（23:34:25，最终态复跑） | `Test Files 1 passed (1)` / `Tests 14 passed (14)`，Duration 2.79s。中间 23:30:03 那次 `1 failed \| 13 passed` 的失败是 `ReferenceError: delimiter is not defined`（我的测试文件漏 import），补 import 后 23:30:13 即 `14 passed` —— 与实现无关，如实记录 |
| J-4 | `npx tsc --noEmit -p tsconfig.main.json`（23:34:25） | 无任何输出，`TSC_EXIT=0`（索引 K27：仓库根只有 `tsconfig.main.json`） |
| J-5 | `npm test`（23:31:59，代码最终态） | `Test Files 1 failed \| 51 passed (52)`、`Tests 2 failed \| 903 passed (905)`，Duration 9.45s。**总数 905 = 基线 901 + 本任务 4 ✓（K9）**。2 条红都在本任务不许改的 `ipc-ql.test.ts`：①`:371` `expected \"[lms_launcher] PROC: no-such-exe-zzz…\" to contain \"no-such-exe-zzz.exe 已取消管理员权限请求\"`（该用例 exe = 裸名 `no-such-exe-zzz.exe`，现被预检挡在假接缝之前）；②`:738` `Error: PROC: mspaint.exe 不存在、不是 .exe 文件或不可访问`（`:717` `EXE_OF.qlconc02 = \"mspaint.exe\"`）。根因与裁决选项见报告「偏离 1 / 偏离 2」 |
| J-6 | **主代理验收时填（D6）**：不重跑，引本机今日已跑过的探针日志 `.temp/ql-diag/missing-exe-probe.log`（mtime `2026-10-15T14:55:24Z` = 本地 22:55，改代码之前） | 原文两行：`CALL tag=missing-open-0x44 fMask=0x44 verb=null file=E:\\V2rayN\\no-such-v2ray.exe` → `RESULT tag=missing-open-0x44 ok=false elapsedMs=6134 GetLastError=1223 hInstApp=2 hProcess=null`。D6 要的就是**旧路径**取证（Shell 自己给不出可用信息：只有 1223 + `hInstApp=2`，且卡 6.1s、弹系统框），这份日志正是改动前跑的 → 复跑只会再弹一次需人点「确定」的框、不新增信息，故不重跑 |
| J-23 | `node .superpowers/sdd/2026-10-15-quick-launch-exe-path-precheck/tick-census.mjs`（H3，主代理在 commit 前跑，00:1x） | `task-01-exe-precheck-gate.md  ☑=40  裸☐=0  I段 -[ ]=0  H2=已提交` → `通过：已提交的任务表没有裸 ☐ / - [ ]`，`CENSUS_EXIT=0`。「显式未勾」仅 `E7`（ACL 分支无单测 → 真机门 §7.2-8，索引 K5 / 规格 §9-R7），符合规则 |
| J-22 | **主代理独立复跑（验收，00:11-00:13）**：`npm test`；`npx vitest run src-main/shell-execute.test.ts --reporter=verbose`；`npx vitest run src-main/ipc-ql.test.ts src-main/quick-launch.test.ts src-main/i18n`；`npx tsc --noEmit -p tsconfig.main.json`；`git diff src-main/shell-execute.ts` 逐行 | `Test Files 52 passed (52)` / `Tests 906 passed (906)` exit 0；定向 `Tests 15 passed (15)` 且 verbose 列出 `app_execution_alias_in_PATH_is_launchable` 为 `✓`（真跑非 skip）；相邻 + i18n `Tests 79 passed (79)`（27+34+18）；`TSC_EXIT=0`；全量输出里 `✓ 两个 exe 配置并发 ql_start…`（夹具 `mspaint.exe`、真起进程）= 别名那一支的端到端牙。diff 逐行核对：真接缝与 1223 分支一字未动、放行实参原样、无 `accessSync` / 无 `statSync`、无新依赖 |
| J-7 | `npx vitest run src-main/ipc-ql.test.ts src-main/quick-launch.test.ts`（23:30:31，G2） | `Test Files 1 failed \| 1 passed (2)` / `Tests 2 failed \| 59 passed (61)`：`quick-launch.test.ts` 全绿；`ipc-ql.test.ts` = `2 failed \| 25 passed (27)`（同 J-5 两条）。`git diff --name-only` = `src-main/i18n/dict.ts`、`src-main/shell-execute.test.ts`、`src-main/shell-execute.ts`、`docs/superpowers/specs/2026-10-13-quick-launch-elevated-exe-design.md` —— 恰本表 B1–B4，不含这两份 ✓（G9 未越界） |
| J-8 | `git diff --stat` + 前置规格三处改动的复核（D7 / B4） | `4 files changed, 118 insertions(+), 8 deletions(-)`；前置规格 = 3 行改（§6.5 表第一行加预检语境、§7.1-4 标注真机 1223 / `hInstApp=2`、§9-R8 改为「已由 2026-10-15 的启动前预检取代」并指向新 spec §6.1 / §6.2）。改后 Markdown 列数核对：§6.5 表 3 列、§9 表 3 列，与各自表头一致 |
| J-9 | `node .temp/ql-diag/alias-probe.cjs`（新增取证脚本，`.temp/` 不入库）+ `where.exe mspaint.exe` + `Test-Path C:\Windows\System32\mspaint.exe`（偏离 2 取证） | `{\"p\":\"…\\WindowsApps\\mspaint.exe\",\"statSync\":\"THROW EACCES\",\"lstatSync\":\"OK isSymbolicLink=true isFile=false\",\"openSync\":\"THROW EACCES\",\"realpathSync\":\"THROW EACCES\"}`；对照 `C:\\Windows\\System32\\notepad.exe` 与 `process.execPath` 三项全 OK。`where.exe mspaint.exe` → `C:\\Users\\Gelomen\\AppData\\Local\\Microsoft\\WindowsApps\\mspaint.exe`（该目录在 PATH 里），`Test-Path C:\\Windows\\System32\\mspaint.exe` → `False` → 裸名 `mspaint.exe` 是 app execution alias（reparse point），`statSync` 抛 EACCES，故 §6.1 判定①判 false，而 Shell 能起它 |
| J-10 | `node .superpowers/sdd/2026-10-15-quick-launch-exe-path-precheck/tick-census.mjs`（H3 普查，供主代理核对） | `task-01-exe-precheck-gate.md ☑=34 裸☐=0 I段 -[ ]=0 H2=未提交 显式未勾: D5 / D6 / E7 / G2 / G5 / H1 / H2 / H3`，`CENSUS_EXIT=0`（H2 未勾 → 普查不判违规；显式未勾全部带原因） |
| J-11 | **续做轮 2 起点核对**：`git status --porcelain`；读 `shell-execute.ts:197-243` / `:251-256`、`shell-execute.test.ts:174-218`、`ipc-ql.test.ts:352-377` / `:714-758` | 起点 = 上一轮改动仍在工作区（`git diff --name-only` 含 `src-main/{shell-execute.ts,shell-execute.test.ts,i18n/dict.ts}` + 前置规格），且主代理已把裁决写进 `00-index.md`（K10-K12）、spec（§3-P13/P14/P15、§6.1 判定① 第二支、§8-Q13、§9-R8/R9、§7.1-3b、§7.2-9）、plan 与三份 check 表（均未提交）。HEAD 仍 = `cefca90`。本轮只动 B1 / B3 / B5 三份（见 J-20） |
| J-12 | 别名夹具在位取证（真实环境）：`node .temp/ql-diag/alias-probe.cjs`；`where.exe mspaint.exe`；`($env:PATH -split ';' \| Where-Object { $_ -match 'WindowsApps' })` | `{"p":"C:\\Users\\Gelomen\\AppData\\Local\\Microsoft\\WindowsApps\\mspaint.exe","statSync":"THROW EACCES","lstatSync":"OK isSymbolicLink=true isFile=false","openSync":"THROW EACCES","realpathSync":"THROW EACCES"}`；对照 `C:\\Windows\\System32\\notepad.exe` 与 `D:\\Dev\\Runtimes\\Node\\node.exe` 三项全 OK。`where.exe mspaint.exe` → 该 WindowsApps 路径；PATH 里确有 `C:\\Users\\Gelomen\\AppData\\Local\\Microsoft\\WindowsApps` → 夹具真实存在且是重解析点（§3-P14 复现），E8 不会被 `skipIf` 跳过 |
| J-13 | `npx vitest run src-main/shell-execute.test.ts`（10-16 00:02:23，E8 先红 = D 段红门） | `Test Files 1 failed (1)` / `Tests 1 failed \| 14 passed (15)`，Duration 2.91s。唯一红 = `app_execution_alias_in_PATH_is_launchable`：`AssertionError: expected false to be true` 在 `:226`（`isLaunchableExe('mspaint.exe')` 裸名 → false；全路径那条断言 `:227` 还没跑到）。夹具断言 `:225`（`lstatSync(...).isSymbolicLink() === true`）先过 = 夹具形状成立、红在实现。其余 14 条未被撞红；15 条全部执行、无 skip |
| J-14 | `npx vitest run src-main/shell-execute.test.ts`（00:03:03，C6 实现后） | `Test Files 1 passed (1)` / `Tests 15 passed (15)`，Duration 2.78s。别名用例真跑（未 skip）：裸名与全路径两条断言都绿 |
| J-15 | 只改 `ipc-ql.test.ts:353` 一行后的实测：`npx vitest run src-main/ipc-ql.test.ts`（00:03:29） | `Test Files 1 failed (1)` / `Tests 1 failed \| 26 passed (27)`。红在 `:371`：`expected '[lms_launcher] PROC: notepad.exe 已取消…' to contain 'no-such-exe-zzz.exe 已取消管理员权限请求'` → **B5 的「改一行」不足以让该用例绿**：同一字面量 `no-such-exe-zzz.exe` 还出现在断言的 `{exe}` 占位里（`:371`），必须跟着夹具走。另：该轮里 `:714-758` 的 `mspaint.exe` 并发用例已绿（C6 生效） |
| J-16 | 第二处（`:371` 的 `{ exe: ... }` 占位值）改完后：`npx vitest run src-main/ipc-ql.test.ts src-main/quick-launch.test.ts`（00:04:10） | `Test Files 2 passed (2)` / `Tests 61 passed (61)`，Duration 7.23s：`ipc-ql.test.ts` = **27 条全绿**（条数不变）、`quick-launch.test.ts` = 34 条全绿。`两个 exe 配置并发 ql_start`（`:714`，`EXE_OF.qlconc02 = 'mspaint.exe'`，`:731 return original(file, nShow)` 真起进程）转绿 = 别名那一支的端到端牙 |
| J-17 | `npx tsc --noEmit -p tsconfig.main.json`（00:04:27） | 无任何输出，`TSC_EXIT=0`（索引 K27） |
| J-18 | `npx vitest run src-main/i18n`（00:04:27） | `Test Files 4 passed (4)` / `Tests 18 passed (18)`（index 3 / no-hardcoded 2 / dict 11 / key-coverage 2）。本轮未新增词典键 |
| J-19 | `npm test`（00:04:33，最终态） | `Test Files 52 passed (52)` / `Tests 906 passed (906)`，Duration 9.14s，exit 0 —— **与 K9 的 906 逐字一致**（901 基线 + `shell-execute.test.ts` 10→15） |
| J-20 | 改动范围核对：`git diff --numstat -- src-main`；`git diff -U2 -- src-main/ipc-ql.test.ts` | `2 0 src-main/i18n/dict.ts`（上一轮）、`2 2 src-main/ipc-ql.test.ts`（本轮：`:353` 夹具 + `:371` 断言占位值，见 J-15）、`78 2 src-main/shell-execute.test.ts`、`80 3 src-main/shell-execute.ts`。本轮只碰 B1 / B3 / B5 三份 = 派单硬规则允许的范围（G9 未越界）；`git diff -U2` 显示 `ipc-ql.test.ts` 恰两处 `-/+`，其余 26 条用例一字未改、`:717` 夹具未动 |
| J-21 | 用例数口径核对（D8 / G2 写的「29 条」）：`grep '\\bit\\s*\\(' src-main/ipc-ql.test.ts` + vitest 计数 | vitest 真实条数 = **27**（24 条静态 `it(` + `:687-702` 的 `for (const key of ['constructor','toString','__proto__'])` 循环生成 3 条）。索引 K9 / 派单里的「29」是 `it(` 计数口径的偏差（上一轮 J-5/J-7 实测同样是 27）。本轮**条数不变**（27 → 27），全量 906 与 K9 一致 → 数字门按 vitest 口径成立，请主代理把 K9 / D8 / G2 的「29」改成「27（循环生成 3 条）」或注明口径 |