# 任务 1 实现报告 · `isLaunchableExe` 预检 + 词典键 + `launchShellExe` 门

- 派单：AGENTS.md 工作流第 4 步（子代理驱动），本任务 = 一个子代理
- check 表：`docs/superpowers/checks/2026-10-15-quick-launch-exe-path-precheck/task-01-exe-precheck-gate.md`（A→J 已逐行执行，J 段已填真实命令与输出）
- 状态：**代码与文档改动全部在工作区，未 `git add`、未 commit（G8）**
- 一句话结论：预检门本身**全绿**（定向 14/14、tsc 干净、i18n 三门绿、全量总数 905 = 901+4）；但**全量有 2 条红落在本任务不许改的 `ipc-ql.test.ts`**，根因是 plan 的任务切分与一处真实设计缺口，需主代理裁决（见「偏离 1 / 偏离 2」）

## 1. 做了什么（按 D1→D5 + D7）

| 步 | 内容 |
|---|---|
| D1 | 先在 `src-main/shell-execute.test.ts` 写 4 条失败测试（用例名逐字：`missing_absolute_path_is_not_launchable` / `directory_and_non_exe_file_are_not_launchable` / `existing_exe_and_bare_name_through_PATH_are_launchable` / `precheck_blocks_before_the_shell_is_called`），并把 `:12` 的 `EXE` 夹具从 `E:\\QiYou\\QiYou.exe` 换成 `process.execPath`（K6）。跑红：`4 failed \\| 10 passed (14)`，既有 10 条未被撞红 |
| D2 | `src-main/i18n/dict.ts` 加 `err.proc.exeNotFound` 两行（先 en 现 `:647`，再 zh 现 `:302`，避免行号漂移），逐字按 §6.3；i18n 三门仍绿 |
| D3 | `src-main/shell-execute.ts`：① import `node:fs` / `node:path`（`:10-12`）；② `isLaunchableExe`（`:228-243`）+ 未导出的内部件 `isRegularFile`（`:197-200`）与 `resolveLaunchTarget`（`:205-219`），解析①–④ / 判定①–③ 逐字按 §6.1，可访问性用 `openSync`+`closeSync`（K4，无 `accessSync`）；③ `launchShellExe` 在 `api.shellExecute` 之前加门（`:251-256`，逐字按 §6.2）；④ 同步两处旧注释（现 `:33` 与 `:103-106`，A4 / K7）。定向 `14 passed (14)` |
| D4 | 夹具换 `process.execPath` 后既有 10 条仍绿；两条 verb 用例断言一字未改（RF4） |
| D5 | tsc 干净；全量 = `2 failed \\| 903 passed (905)` —— 总数符合 K9，2 红见「偏离」 |
| D6 | **未跑**（会弹 Shell 系统错误框需人点「确定」，按派单第 7 条归主代理；check 表 D6 行已写成显式未勾，J-6 留空） |
| D7 | 同步前置规格 `docs/superpowers/specs/2026-10-13-quick-launch-elevated-exe-design.md` 三处：§6.5 表第一行加「且已通过 2026-10-15 规格 §6.1 的启动前预检」语境（并注明 §3-P1…P5 的 1223 撞码）；§7.1-4 标注「不存在的 exe → `win32Error=2`」从未在真机上证过、实测 1223 / `hInstApp=2`；§9-R8 改为「已由 2026-10-15 的启动前预检取代」并指向新 spec §6.1 / §6.2。改后 Markdown 列数与表头一致 |

**未动的东西（G3 / G4 / F3 / F4）**：真接缝 `winShell.shellExecute` 的**代码**一字未动（`fMask` / `lpVerb` / `lpFile` / `lpParameters` / `lpDirectory` / `GetLastError` / 只读 `hProcess`；该 hunk 只有注释行变化，注释变化是 A4/K7 明确要求的）；1223 分支本体未动；`ShellExecProcess` 未动；`ql-elevated.ts` / `process.ts` / `main.ts` / `App.vue` / `QuickLaunch*.vue` / 对话框过滤 / `package.json` 均未动。

## 2. 命令与真实输出（check 表 J 段同内容）

| # | 命令 | 真实输出摘要 |
|---|---|---|
| J-1 | `npx vitest run src-main/shell-execute.test.ts`（23:28:07，实现前） | `Tests 4 failed \\| 10 passed (14)`；3× `TypeError: isLaunchableExe is not a function` + 1× `expected "" to match /^PROC: /`（门缺失 → 假接缝被调用并返回 ok=true）；既有 10 条绿 |
| J-2 | `npx vitest run src-main/i18n`（23:28:27） | `Test Files 4 passed (4)` / `Tests 18 passed (18)`；`git diff --numstat src-main/i18n/dict.ts` = `2 0` |
| J-3 | `npx vitest run src-main/shell-execute.test.ts`（23:30:13 首绿 / 23:34:25 最终态复跑） | `Tests 14 passed (14)`。中间 23:30:03 一次 `1 failed \\| 13 passed`：`ReferenceError: delimiter is not defined`（我的测试文件漏 import），补 import 后即绿 —— 与实现无关，如实记录 |
| J-4 | `npx tsc --noEmit -p tsconfig.main.json`（23:34:25） | 无输出，`TSC_EXIT=0` |
| J-5 | `npm test`（23:31:59，代码最终态） | `Test Files 1 failed \\| 51 passed (52)` / `Tests 2 failed \\| 903 passed (905)`，Duration 9.45s；总数 905 = 901 + 4 ✓ |
| J-6 | `node .temp/ql-diag/missing-exe-probe.cjs missing` | 未跑（归主代理） |
| J-7 | `npx vitest run src-main/ipc-ql.test.ts src-main/quick-launch.test.ts` | `quick-launch.test.ts` 全绿；`ipc-ql.test.ts` = `2 failed \\| 25 passed (27)`。`git diff --name-only` = 恰 B1–B4 四份，不含这两份 |
| J-8 | `git diff --stat` | `4 files changed, 118 insertions(+), 8 deletions(-)`；前置规格 = 3 行改 |
| J-9 | `node .temp/ql-diag/alias-probe.cjs`（新增取证脚本，`.temp/` 不入库）+ `where.exe mspaint.exe` + `Test-Path C:\\Windows\\System32\\mspaint.exe` | alias：`statSync=THROW EACCES` / `lstatSync: isSymbolicLink=true isFile=false` / `openSync=THROW EACCES` / `realpathSync=THROW EACCES`；对照 `C:\\Windows\\System32\\notepad.exe` 与 `process.execPath` 三项全 OK。`where.exe` → `…\\WindowsApps\\mspaint.exe`（该目录在 PATH 内），`System32\\mspaint.exe` = `False` |
| J-10 | `node .superpowers/sdd/…/tick-census.mjs` | `task-01 … ☑=34 裸☐=0 I段 -[ ]=0 H2=未提交`，显式未勾 = D5 / D6 / E7 / G2 / G5 / H1 / H2 / H3（均带原因），`CENSUS_EXIT=0` |

## 3. 偏离清单（不改设计，只报告）

### 偏离 1（阻塞 G5 / D5 / G2）：任务 1 的红必然落在 `ipc-ql.test.ts`，而该文件不在本任务可改范围

- 现象：`ipc-ql.test.ts:352-377`「exe 启动失败：前缀由 shell-execute 自带」用裸名 `no-such-exe-zzz.exe`（`:353`），断言 sys 日志含 `err.proc.uacCancelled`（`:371`）。预检门生效后，该目标在假接缝之前就被挡下，日志变成 `[lms_launcher] PROC: no-such-exe-zzz.exe 不存在、不是 .exe 文件或不可访问` → 用例红。
- 证据：J-5 的失败原文（`expected "…no-such-exe-zzz…" to contain "…已取消管理员权限请求"`）。
- 与文档的冲突：plan 任务 2 步骤 6 正是把这条改成 `notepad.exe`（真存在 → 预检放行 → 假接缝仍回 1223 → 仍断言 `uacCancelled`）；但任务 1 的 check 表 G2/G5/D5 与索引 V 组要求「任务 1 末尾 `ipc-ql.test.ts` 仍绿、全量 905 全绿」。两者不可能同时成立：**只要门生效，这条用例必红**（它测的正是「不存在的 exe 走到 Shell」这条被本次设计挡掉的路径）。
- 我没有自行改设计、也没有越界改 `ipc-ql.test.ts`（G9）。可选裁决（任选其一，需同步改两份表 + 索引 V 组）：
  1. 把任务 2 的步骤 6 并入任务 1 的提交（任务 1 的 B 段加 `ipc-ql.test.ts` 一行）；
  2. 接受任务 1 收尾时这 1 条红，把「全量 905 全绿」门移到任务 2 之后（改本表 D5/G5 与索引 V 组的「任务 1 末尾」行）；
  3. 重派任务 1 并允许改该文件。

### 偏离 2（真实设计缺口）：裸名解析只覆盖 PATH，覆盖不到 WindowsApps 的 app execution alias

- 现象：`ipc-ql.test.ts:717` 的并发用例用裸名 `mspaint.exe`（`EXE_OF.qlconc02`）。预检判它 `false` → `Error: PROC: mspaint.exe 不存在、不是 .exe 文件或不可访问`（`:738` 抛错栈经 `main.ts:1065` → `launchShellExe:255`）。
- 根因（J-9 实测）：`mspaint.exe` 在 PATH 里的位置是 `C:\\Users\\Gelomen\\AppData\\Local\\Microsoft\\WindowsApps\\mspaint.exe`，它是 **app execution alias（reparse point）**：`lstatSync` 报 `isSymbolicLink=true / isFile=false`，`statSync` / `openSync` / `realpathSync` 全抛 `EACCES`；`C:\\Windows\\System32\\mspaint.exe` 不存在。§6.1 判定①要求「`statSync` 成功且 `isFile()`」→ 这一类必然判 false。
- 影响面：这不是测试夹具的偶然——用户手输 `mspaint.exe` 这类 Store 别名（记事本 / 画图 / Windows Terminal 等）在今天的代码里能走到 Shell，本次之后会被判「不存在、不是 .exe 文件或不可访问」。**残留不确定**：我没有真机验证「打包版填 `mspaint.exe` 今天确实能起」（该用例走假接缝，从未真起进程），要证它需要任务 3 的真机门加一条。
- plan 未覆盖：任务 2 只改 `:352-377`，并明确「既有裸名用例 `:330-350` / `:381-416` 不改断言」；`:717` 这条并发用例不在任务 2 的改动清单里 → 按现 plan 走完任务 2，全量仍不会是绿的。
- 可选裁决：
  1. 夹具修正：把 `:717` 的 `mspaint.exe` 换成 PATH 中真实存在的普通 `.exe`（如 `cmd.exe`），并在任务 2 的 B 段登记（我倾向这条：该用例测的是「并发时 `qlStartContext` 槽不串」，与用哪个 exe 无关）；
  2. 扩 §6.1 解析③以覆盖 Shell 的裸名解析（App Paths 注册表 / reparse point / 等价 `where`）—— 属设计变更，须先改 spec 再改代码；
  3. 明确「app execution alias 不支持」为已知边界，写进新 spec 的 §9 风险 + 任务 3 真机清单。
- 我按 spec §6.1 逐字实现，没有自行扩口径。

### 偏离 3（文档字面过期，不影响判定）：check 表 A1 的 HEAD 值

- 表里写 HEAD 应为 `4c4f15f docs: … spec + plan`；实测 HEAD = `cefca90 docs: … 3 个任务的 check 表`（即本表自身的提交），`git merge-base --is-ancestor 4c4f15f HEAD` → exit 0，`git status --porcelain` 只有未跟踪 `.superpowers/sdd/…/task-01-brief.md` → 「无已跟踪改动」这一实质条件成立。A1 已按实测落勾并注明。

### 偏离 4（执行细节，非设计）

- 测试里「本仓 `package.json`」写成 `join(__dirname, '..', 'package.json')`（plan 说「本仓 package.json」）：与 cwd 无关，判定对象不变。
- 我在 check 表 J 段追加了 J-7…J-10 四行（G2 相邻回归、D7 文档核对、偏离 2 取证、H3 普查输出）——J 段是执行记录，原表只到 J-6；列数与该表表头一致。
- 新增取证脚本 `.temp/ql-diag/alias-probe.cjs`（`.temp/` 在 gitignore 内，不入库），用于偏离 2 的取证。
- 中途一次定向测试红是我测试文件漏 import（`delimiter`），已如实记在 J-3，不是实现问题。

## 4. check 表未落勾的行与原因

| 行 | 状态 | 原因 |
|---|---|---|
| D5 / G2 / G5 | `☐（原因 + 去处）` | 偏离 1 + 偏离 2：`ipc-ql.test.ts` 2 红（tsc / 定向 / i18n / `quick-launch.test.ts` 全绿；全量总数 905 与 K9 一致） |
| D6 | `☐（原因 + 去处）` | 会弹 Shell 系统错误框需人点「确定」→ 归主代理在验收时跑；J-6 留空 |
| E7 | 原表已写成 `☐（原因 + 去处见左列）` | 索引 K5 / 规格 §9-R7：ACL 夹具跨机器不稳 → 由任务 3 真机门 §7.2-8 守 |
| H1 / H2 / H3 | `☐（归主代理…）` | G8：子代理不 `git add`、不 commit；H3 普查输出已在 J-10 供核对（`☑=34 裸☐=0 I段 -[ ]=0`） |
| I 段两行 | `- ☐（原因 + 去处…）` | 对应 D5/G5 与 D6；其余 5 行已 `- [x]` |

## 5. 自查门（完成判据）实测

- `npx vitest run src-main/shell-execute.test.ts` → `Tests 14 passed (14)` ✅
- `npx tsc --noEmit -p tsconfig.main.json` → 无输出 ✅
- `npx vitest run src-main/i18n` → `Tests 18 passed (18)` ✅
- `npm test` → `Tests 2 failed \\| 903 passed (905)` ⚠（总数对，2 红见偏离 1/2）
- check 表 A/B/C/D/E/F/G/H/I：除 D5 / D6 / E7 / G2 / G5 / H1-H3 写成显式未勾外全部落勾；`裸☐=0`、`I段 -[ ]=0`（J-10）

---

# 续做轮 2（2026-10-16 00:0x，任务 1 剩余三件事）

- 派单：主代理裁决后的三件事 —— ① E8 先写失败测试；② C6 实现重解析点那一支；③ B5 / D8 改 `ipc-ql.test.ts` 的夹具。按 TDD 顺序执行。
- check 表：本轮证据落在 J 段 **J-11 … J-21**；新增的 **B5 / C6 / D8 / E8 四行按派单留 `☐`**（落勾归主代理）。
- 状态：改动仍在工作区，**未 `git add`、未 commit（G8）**。
- 一句话结论：三件事都做完，**五道门全绿且数字与 K9 逐字一致**（定向 `15 passed (15)`、`ipc-ql`+`quick-launch` `61 passed (61)`、tsc 无输出、i18n `18 passed (18)`、全量 `52 passed (52)` / `906 passed (906)`）。上一轮的 2 条红全部消失，`:717` 的 `mspaint.exe` 并发用例转绿。两处口径偏差见「偏离 5 / 偏离 6」。

## 1. 做了什么

| # | 内容 | 证据 |
|---|---|---|
| E8 | `src-main/shell-execute.test.ts` 新增用例，名字逐字 `app_execution_alias_in_PATH_is_launchable`（现 `:196-228`）。夹具 = 在 `process.env.PATH` 的目录里找 `mspaint.exe` 且 `lstatSync().isSymbolicLink()` 为真（只要重解析点这一支：普通 `.exe` 已由上一条用例守）；找不到 → `it.skipIf(aliasFixture === null)` 跳过，注释写明「硬门归真机 §7.2-9（索引 K12 / 规格 §9-R9）」。用例内先钉夹具形状（只有 `lstatSync` 看得见），再断言**裸名**与**全路径**都 `true`（P13 的两半）。新增 import `lstatSync`（`node:fs`，不新增依赖） | J-12 夹具在位；J-13 跑红：`Tests 1 failed \| 14 passed (15)`，红在 `isLaunchableExe('mspaint.exe')` → false，其余 14 条未被撞红、无 skip |
| C6 | `src-main/shell-execute.ts`：`isRegularFile`（`statSync`）换成 `targetShape`（`:204-212`，返回 `'file' \| 'reparse' \| null`，用 `lstatSync`）；解析③ 的「存在」口径同步改用它（`:227-228`）；`isLaunchableExe` 判定① 分两支（`:245-250`）：普通文件 → 继续②③；重解析点 → 只做②、**跳过** `openSync`。import 由 `statSync` 改 `lstatSync`（`:11`）。文档注释同步到新 §6.1 口径 | J-14 跑绿：`Tests 15 passed (15)` |
| B5 / D8 | `src-main/ipc-ql.test.ts`：`:353` 夹具 `no-such-exe-zzz.exe` → `notepad.exe`；**另需** `:371` 断言的 `{ exe: ... }` 占位值同步（见「偏离 5」）。其余 26 条用例一字未改；`:717` 的 `mspaint.exe` 夹具**未动** | J-15 只改一行 → 该用例仍红（证据）；J-16 改完 → `Tests 61 passed (61)`（`ipc-ql` 27 条全绿、条数不变；`quick-launch` 34 条全绿） |

## 2. 命令与真实输出（check 表 J 段 J-11…J-21 同内容）

| # | 命令 | 真实输出摘要 |
|---|---|---|
| J-12 | `node .temp/ql-diag/alias-probe.cjs` + `where.exe mspaint.exe` + PATH 过滤 WindowsApps | 别名 `…\WindowsApps\mspaint.exe`：`statSync=THROW EACCES` / `lstatSync: isSymbolicLink=true isFile=false` / `openSync=THROW EACCES` / `realpathSync=THROW EACCES`；`notepad.exe` 与 `node.exe` 三项全 OK；PATH 里确有该 WindowsApps 目录 → 夹具真实、用例不会被 skip |
| J-13 | `npx vitest run src-main/shell-execute.test.ts`（00:02:23，实现前） | `Tests 1 failed \| 14 passed (15)`；唯一红 = 别名用例 `expected false to be true`（`:226` 裸名断言）；夹具形状断言 `:225` 先过 → 红在实现、不在夹具 |
| J-14 | `npx vitest run src-main/shell-execute.test.ts`（00:03:03，实现后） | `Tests 15 passed (15)` |
| J-15 | `npx vitest run src-main/ipc-ql.test.ts`（00:03:29，只改 `:353` 后） | `Tests 1 failed \| 26 passed (27)`，红在 `:371`：`expected '[lms_launcher] PROC: notepad.exe 已取消…' to contain 'no-such-exe-zzz.exe 已取消管理员权限请求'` |
| J-16 | `npx vitest run src-main/ipc-ql.test.ts src-main/quick-launch.test.ts`（00:04:10） | `Test Files 2 passed (2)` / `Tests 61 passed (61)`；`两个 exe 配置并发 ql_start`（`:714`，`mspaint.exe` 真起进程）转绿 |
| J-17 | `npx tsc --noEmit -p tsconfig.main.json`（00:04:27） | 无输出，`TSC_EXIT=0` |
| J-18 | `npx vitest run src-main/i18n`（00:04:27） | `Test Files 4 passed (4)` / `Tests 18 passed (18)`；本轮未新增词典键 |
| J-19 | `npm test`（00:04:33） | `Test Files 52 passed (52)` / `Tests 906 passed (906)`，Duration 9.14s，exit 0 = **K9 的 906 逐字一致** |
| J-20 | `git diff --numstat -- src-main` / `git diff -U2 -- src-main/ipc-ql.test.ts` | 本轮只碰 `shell-execute.ts` / `shell-execute.test.ts` / `ipc-ql.test.ts` 三份（G9 未越界）；`ipc-ql.test.ts` = `2 2`，恰两处 `-/+` |
| J-21 | 用例数口径核对 | `ipc-ql.test.ts` 的 vitest 真实条数 = **27**（24 条静态 `it(` + `:687-702` 循环生成 3 条），见「偏离 6」 |

## 3. 偏离（不改设计，只报告）

### 偏离 5：check 表 B5 / 派单写的「改**一行**」不足以让该用例绿，实际必须改两处

- 实测：只改 `:353` 的夹具 → 该用例红在 `:371`（J-15 的失败原文）。原因：同一字面量 `no-such-exe-zzz.exe` 还作为 `t('err.proc.uacCancelled', { exe })` 的占位值出现在断言里。
- 我做的最小改动：`:353` 夹具 + `:371` 的 `{ exe: 'notepad.exe' }`（同一字面量的两处，跟着夹具走）。**断言的形状与所钉的行为一字未变**：仍是「sys 日志含 `err.proc.uacCancelled`（带本次条目的 exe）」+「不含 EACCES」+「`ql_start` reject `^PROC: `」+「不残留状态」，1223 分支未被削弱（RF3）。
- 请主代理把 B5 / D8 的「改一行」写成「改两处（夹具 + 该断言的 `{exe}` 占位值）」，或把该 exe 提成常量让两处同源。

### 偏离 6：D8 / G2 / 索引 K9 的「`ipc-ql.test.ts` = 29 条」与 vitest 真实条数 27 不符

- 实测：vitest 报 `27 tests`（本轮前后都是 27，**条数不变**这一实质条件成立）；上一轮 J-5 / J-7 同样是 27。
- 口径来源：`:687-702` 的 `for (const key of ['constructor','toString','__proto__']) { it(...) }` —— 1 处 `it(` 生成 3 条用例；按 `it(` 计数与按 vitest 计数天然不等。
- 全量 906 与 K9 一致，所以数字门按 vitest 口径成立。建议把 K9 / D8 / G2 的「29」改成「27（含循环生成 3 条）」或注明计数口径。

### 注意（不是偏离，但需要主代理落笔）

1. **check 表 C2 行的判定① 字面已被 C6 取代**：C2 仍写「判定① `fs.statSync` 成功且 `isFile()`」，而 spec §6.1（已按裁决改写）与本轮代码用 `lstatSync` + `isFile() || isSymbolicLink()`。该行的 `☑` 是上一轮按旧口径落的 → 按 AGENTS.md「后续更新」第 3 条，C2 的判定① 文字需同步（代码跟 spec 走，我没有自行改表）。
2. **D5 / G2 / G5 三行的 `☐（原因…）` 文字已被本轮证据取代**：那三行还写着「2 红 / 905」，现在全量 = `906 passed (906)` 全绿（J-19）。验收时请按 J-16 / J-19 改写并落勾。
3. **别名用例是机器条件的**（K12 / §9-R9）：本机夹具在位、用例真跑（J-12 / J-13 / J-14 无 skip）；换机器若 `mspaint.exe` 不在 PATH 则 skip → 硬门仍归任务 3 真机 §7.2-9。
4. **残留边界（属 §9-R8 家族，未额外处理）**：重解析点这一支只看「链接自身名字」的扩展名、不看目标 —— 断链别名、以及名字以 `.exe` 结尾的 junction / 符号链接会被放行，由 Shell 失败兜到 1223（与今天同，不恶化）。

## 4. 未动的东西（G3 / G4 / F3 / F4 复核）

- 真接缝 `winShell.shellExecute` 的 `fMask` / `lpVerb` / `lpFile` / `lpParameters` / `lpDirectory` / `GetLastError` / 只读 `hProcess`：一字未动；1223 分支本体未动；`ShellExecProcess` 未动。
- 词典：本轮零改动（`git diff --numstat src-main/i18n/dict.ts` 仍是上一轮的 `2 0`）；无新键、无新前缀；i18n 三门绿（J-18）。
- `ql-elevated.ts` / `process.ts` / `main.ts` / `App.vue` / `QuickLaunch*.vue` / 对话框过滤 / `package.json` / lockfile：均未动（`git diff --name-only` 不含它们）。
- `ipc-ql.test.ts` 其余 26 条用例、`:717` 的 `mspaint.exe` 夹具：一字未动（`git diff -U2` 只有两处 `-/+`）。

## 5. 自查门（本轮实测）

- `npx vitest run src-main/shell-execute.test.ts` → `Tests 15 passed (15)` ✅
- `npx vitest run src-main/ipc-ql.test.ts src-main/quick-launch.test.ts` → `Tests 61 passed (61)` ✅
- `npx tsc --noEmit -p tsconfig.main.json` → 无输出 ✅
- `npx vitest run src-main/i18n` → `Tests 18 passed (18)` ✅
- `npm test` → `Test Files 52 passed (52)` / `Tests 906 passed (906)` ✅
- check 表 Markdown 完整性：逐行按各表表头列数核对 → 破损行 = 0；`node .superpowers/sdd/2026-10-15-quick-launch-exe-path-precheck/tick-census.mjs` → `task-01-exe-precheck-gate.md ☑=34 裸☐=4 I段 -[ ]=0`，`CENSUS_EXIT=0`。裸 `☐` 恰 = 派单要求留白的 **B5 / C6 / D8 / E8** 四行（归主代理落勾）
