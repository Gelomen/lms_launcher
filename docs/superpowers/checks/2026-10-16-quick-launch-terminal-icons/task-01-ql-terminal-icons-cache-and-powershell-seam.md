# 任务 1 · `ql-terminal-icons.ts` —— 缓存 + PowerShell 提取接缝 — check 表

> 计划：[2026-10-16-quick-launch-terminal-icons.md](../../plans/2026-10-16-quick-launch-terminal-icons.md) §任务 1 · 规格：[2026-10-16-quick-launch-terminal-icons.md](../../specs/2026-10-16-quick-launch-terminal-icons.md) §6.1 / §6.2 / §7.1-1..6 · 关联审查重点 **RF1 RF3**
> 前置：无（本 feature 第一个任务）
> 索引：[00-index.md](00-index.md) 的 G1 G3 G4 G5 G9 G10、RF1 RF3、**K1**（真实图标）、**K2**（PowerShell + System.Drawing 固定路径）、**K5**（取不到 = 不显示）、**K6**（缓存目录与键，不失效不清理）、**K8**（`execFile` + 超时 8000ms 的实测依据）
> 派单输入：spec + plan + 本表三份都交给子代理；子代理不 `git add`、不 commit（G9）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 两份文档已提交、无已跟踪改动 | `git log --oneline -1`；`git status --porcelain` | HEAD = 文档 commit（当前 `50c9e77 docs: 快捷启动 [终端] 真实图标的 5 个任务 check 表 + 索引 + 普查脚本（代码一行未改）`；`5c4313d` 是生成时的旧值，索引 K17）；porcelain 只允许未跟踪的 `.superpowers/` 与 `docs/superpowers/checks/` | ☑ |
| A2 | 全量基线（索引头部「测试基线」行：主代理 2026-10-16 16:07 实测，子代理不重跑） | 不重跑，直接引用 | `Test Files 52 passed (52)` / `Tests 912 passed (912)`，exit 0；本任务后 = 918 | ☑ |
| A3 | 要复用的既有写法锚点属实 | 读 `src-main/quick-launch-terminals.ts:17-20`（`TerminalInfo`，本任务只 import 类型）、`:26-28`（`systemRoot()` 的 `SystemRoot \| windir \| C:\\WINDOWS` 回退）、`:31-34`（powershell 固定路径写法）、`src-main/shell-execute.ts:14-15`（接缝：真实现是普通导出、单测注入假实现）、`src-main/main.ts:105-109`（`mkdirSync` 失败不阻断的写法） | 与本表引用逐字一致（本表生成时已实测） | ☑ |
| A4 | 提取形状已在真机验证过（不是猜） | `node .temp/ql-term-icon-probe/encoded-batch.cjs <4 个真实 exe> <1 个不存在的路径>` | 四项都打出 `PNG magic=89504e470d0a1a0a`；不存在那项打 `null`；脚本不抛异常（规格 §3-P3） | ☑ |
| A5 | 超时取值有实测依据 | `node .temp/ql-term-icon-probe/latency2.cjs <4 个 exe>` | `noop` 与 `batch-4` 呈双峰（本表生成时实测 1727/131/132 与 1207/224/223 ms）→ 提取本身只加 ~90ms，超时取 8000ms 是冷启动余量（规格 §3-P4 / 索引 K8） | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/ql-terminal-icons.ts` | 新建：`ExtractIcons` 类型 + `powershellExtract` + `cacheFileName` + `withTerminalIcons` + 那段 PowerShell 脚本常量（C1–C4） | 不 import `electron`；不改 `quick-launch-terminals.ts`（只 import 它的 `TerminalInfo` 类型）；不用 `spawnSync`（G4）；不写日志、不 `console.*`（G5） | ☑ |
| B2 | `src-main/ql-terminal-icons.test.ts` | 新建：6 条用例（E1–E6 的名字逐字） | 不 mock `node:child_process` 整模块（用注入的假接缝）；缓存目录夹具 = `mkdtempSync(join(tmpdir(), 'ql-icons-'))` + `afterEach` 删除；不往仓库根写文件 | ☑ |
| B3 | 既有文件 | **一个都不改** | `git diff --name-only` 为空；本任务只新增 B1/B2 两份（G10） | ☑ |

## C. 接口契约（逐字）

| # | 契约 | 出处 | ✓ |
| --- | --- | --- | --- |
| C1 | `export type ExtractIcons = (exePaths: string[]) => Promise<Record<string, string \| null> \| null>;`（整批失败 = 返回 `null`） | 规格 §6.1 | ☑ |
| C2 | `export const powershellExtract: ExtractIcons;` —— 可执行文件 = `join(process.env.SystemRoot \|\| process.env.windir \|\| 'C:\\WINDOWS', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')`（与 `quick-launch-terminals.ts:31-34` 同口径，索引 K2）；参数 = `['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', <base64(utf16le)>]`；选项 = `{ windowsHide: true, timeout: 8000, maxBuffer: 1 << 20, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }` ；`stdio` 不在 @types/node 的 `ExecFileOptionsWithStringEncoding` 里 → 由本地类型 `ExecFileOptionsWithStdio` 承载，五个取值一字未改（索引 K13） | 规格 §6.1 / 索引 K2 K8 K13 | ☑ |
| C3 | PowerShell 脚本 = 规格 §6.1 那段常量，逐字（`$ErrorActionPreference='Stop'` → `Add-Type -AssemblyName System.Drawing` → here-string 灌 JSON 路径表 → `ConvertFrom-Json` → 逐项 `ExtractAssociatedIcon` + `ToBitmap().Save(ms, Png)` + `ToBase64String` → `catch` 置 `null` → `ConvertTo-Json -Compress`） | 规格 §6.1（A4 已实测该形状可用） | ☑ |
| C4 | `export function cacheFileName(exePath: string): string` = `createHash('sha1').update(path.win32.resolve(exePath).toLowerCase()).digest('hex') + '.png'`；纯函数、不碰 fs | 规格 §6.2 / 索引 K6 | ☑ |
| C5 | `export async function withTerminalIcons(cacheDir: string, infos: TerminalInfo[], extract: ExtractIcons = powershellExtract): Promise<TerminalInfo[]>` —— 顺序 / 条数 / `id` / `path` 与入参逐字相同；只有拿到图标的项才加 `icon` 键（浅拷贝，不改入参对象） | 规格 §6.1 / RF2 | ☑ |
| C6 | `icon` 的值 = `'data:image/png;base64,' + b64`（前缀逐字） | 规格 §6.1 | ☑ |
| C7 | 本任务**不**新增 IPC 通道、**不**新增 i18n 键、**不**改 `package.json` | 规格 §5-3/§5-6 / G2 G3 | ☑ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期输出 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先写 6 条失败测试（名字与断言逐字照 E1–E6） | — | 测试文件写完，实现文件还不存在 | ☑ |
| D2 | 跑红 | `npx vitest run src-main/ql-terminal-icons.test.ts` | 6 条全部失败，失败原因 = `Cannot find module './ql-terminal-icons'`（不是断言写错）。**实测措辞**（vitest 2.1）：`Failed to load url ./ql-terminal-icons … Does the file exist?` + `Tests no tests`（0 条被收集）——同一类失败，索引 K15 | ☑ |
| D3 | 实现 C1–C6 | — | 只碰 B1 一个文件 | ☑ |
| D4 | 跑绿 | `npx vitest run src-main/ql-terminal-icons.test.ts` | `Tests 6 passed (6)`（真机冒烟那条若跳过必须写明原因） | ☑ |
| D5 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 无输出，exit 0 | ☑ |
| D6 | 全量 | `npm test` | `Test Files 53 passed (53)` / `Tests 918 passed (918)`（912 + 6），exit 0 | ☑ |
| D7 | 复跑探针取真数 | `node .temp/ql-term-icon-probe/latency2.cjs <4 个 exe>` | 把本轮 `batch-4` 的真实毫秒数贴进 J 段（对照 A5，不许只写「差不多」） | ☑ |

## E. 必须钉住的行为断言

| # | 用例名（逐字） | 钉住什么 | 出处 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | `cache_file_name_is_stable_and_case_insensitive` | 同路径两次同值；`C:\\WINDOWS\\System32\\cmd.exe` 与 `c:\\windows\\system32\\cmd.exe` 同值；不同路径不同值；名字匹配 `/^[0-9a-f]{40}\\.png$/` | 规格 §7.1-1 / §6.2 | ☑ |
| E2 | `cache_hit_skips_the_extraction_process` | 预写缓存文件 → 假接缝**调用次数 0**；返回的 `icon` = `data:image/png;base64,` + 文件字节的 base64 | 规格 §7.1-2 / RF3 | ☑ |
| E3 | `misses_are_extracted_in_a_single_call_and_written_to_cache` | 两项未命中 → 假接缝**恰好 1 次**调用、实参是这两条路径；返回带 `icon`；缓存文件已落盘；再调一次 → 假接缝 0 次 | 规格 §7.1-3 / §6.2 | ☑ |
| E4 | `seam_failure_yields_no_icon_and_throws_nothing` | 假接缝三种失败（返回 `null` / 抛错 / 返回该项为 `null` 的映射）→ 结果里**没有** `icon` 键、其余字段一字不动、不抛异常 | 规格 §7.1-4 / §6.1 降级 / RF1 / 索引 K5 | ☑ |
| E5 | `order_ids_and_paths_are_untouched` | 输入四项（含一项无图标）→ 输出顺序、`id`、`path` 与输入逐字相同；入参对象未被改写 | 规格 §7.1-5 / RF2 | ☑ |
| E6 | `real_powershell_seam_extracts_a_png_for_a_known_exe` | 不 mock：`powershellExtract([join(systemRoot(),'System32','cmd.exe')])` → 该项非空 base64，解码后前 8 字节 = `89504e470d0a1a0a`；该 exe 不存在时 `it.skipIf` 跳过 + 注释指向真机门（同类先例 = `src-main/shell-execute.test.ts:204-222`，索引 K16） | 规格 §7.1-6 / §3-P1 P3 | ☑ |

## F. 本任务相关的硬约束

| # | 约束 | 怎么验 | ✓ |
| --- | --- | --- | --- |
| F1 | G1：探测层一字不动 | `git diff src-main/quick-launch-terminals.ts` 为空 | ☑ |
| F2 | G3：不新增依赖 | `git diff package.json pnpm-lock.yaml package-lock.json` 为空；新文件 import 只允许 `node:child_process` / `node:crypto` / `node:fs` / `node:path` / `./quick-launch-terminals`（类型）；**白名单只约束 B1**：B2 测试文件按 plan 步骤 1 需要 `node:os` / `node:fs` / `node:path` 的临时目录夹具与 `vitest`（索引 K16） | ☑ |
| F3 | G4：不阻塞主线程 | `npx rg -n "spawnSync" src-main/ql-terminal-icons.ts` 无命中（注意：`quick-launch-terminals.ts` 里的 `spawnSync` 是既有探测，不在本文件） | ☑ |
| F4 | G5：失败不抛出、不写日志 | E4 三条 + `npx rg -n "console\." src-main/ql-terminal-icons.ts` 与 `npx rg -n "emitLog" src-main/ql-terminal-icons.ts` 都无命中 | ☑ |
| F5 | 索引 K6：缓存不失效、不清理 | `cacheFileName` 的输入只有路径（不含 size / mtime）；实现里没有 `unlink` / `rm` | ☑ |
| F6 | G9：不 `git add`、不 commit | 收尾时 `git status --porcelain` 里两份新文件仍是 `??`；`git log --oneline -1` 仍是文档 commit（当前 `50c9e77`，索引 K17） | ☑ |
| F7 | G10：只碰 B 段两份文件 | `git status --porcelain` 只出现 B1/B2 两条 | ☑ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/ql-terminal-icons.test.ts` | `Tests 6 passed (6)` | ☑ |
| G2 | 相邻回归（探测层未受影响） | `npx vitest run src-main/quick-launch-terminals.test.ts src-main/ipc-ql.test.ts` | 两个文件全绿，条数不变（本任务没动它们） | ☑ |
| G3 | 类型 | `npx tsc --noEmit -p tsconfig.main.json` | exit 0（仓库根只有这份 tsconfig） | ☑ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | `key-coverage` / `dict` / `no-hardcoded` 全绿；本次未新增键 | ☑ |
| G5 | 全量 | `npm test` | `Tests 918 passed (918)`，exit 0 | ☑ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | 只 `git add src-main/ql-terminal-icons.ts src-main/ql-terminal-icons.test.ts`（`.temp/` 与 `.superpowers/` 不入库）；**本次另加受影响的三份文档**（plan 的 G5/步骤 3、索引 K13–K17、本表受裁决影响的行）——AGENTS.md「偏离先改文档（同一 commit）」优先，索引 K18 | ☑ |
| H2 | commit message（逐字） | `feat(main): 终端图标提取层（PowerShell System.Drawing + 应用目录磁盘缓存）` | ☑ |
| H3 | 勾完整性门 | `node .superpowers/sdd/2026-10-16-quick-launch-terminal-icons/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☑ |

## I. 完成判据

- [x] A1–A5 全部实测过（含两条探针的真实输出进 J 段）
- [x] B1/B2 落地、B3 未越界
- [x] C1–C7 与 spec §6.1/§6.2 逐字一致（不一致就改 spec 或改代码，同一 commit）
- [x] D1→D7 先红后绿，命令与真实输出在 J 段
- [x] E1–E6 六条用例在位且绿
- [x] F1–F7 无越界
- [x] G1–G5 全绿，总数 918
- [x] H1–H3 由主代理执行

## J. 执行记录（实现时填）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | A1/F6/F7 起点：`git log --oneline -1`；`git status --porcelain`；`git branch --show-current` | HEAD = `50c9e77 docs: 快捷启动 [终端] 真实图标的 5 个任务 check 表 + 索引 + 普查脚本（代码一行未改）`（A1 写的 `5c4313d` 是文档生成时的旧值，按索引 PF1 以当前 HEAD 读）；分支 `feat/quick-launch`；porcelain 只有 `?? .superpowers/sdd/2026-10-16-quick-launch-terminal-icons/progress.md` → 无已跟踪改动，起点成立 |
| J-2 | A3 锚点逐行核对：读 `quick-launch-terminals.ts:17-20 / :26-28 / :31-34`、`shell-execute.ts:14-15`、`main.ts:83-86 / :105-109` | 与 check 表引用逐字一致：`TerminalInfo` 只有 `id`/`path`（:17-20）；`systemRoot()` 的 SystemRoot → windir → `C:\\WINDOWS` 三级回退（:26-28）；powershell 固定路径 `join(systemRoot(),'System32','WindowsPowerShell','v1.0','powershell.exe')`（:31-34）；接缝写法 = 真实现是普通导出、单测注入假实现（`shell-execute.ts:14-15`）；`updateZipDir()` 的 `try { mkdirSync(d, { recursive: true }); } catch { }` 吞错写法（:105-109） |
| J-3 | A4 提取形状真机：`node .temp/ql-term-icon-probe/encoded-batch.cjs` + 4 个本机真实 exe（powershell.exe / cmd.exe / wsl.exe / `C:\\Program Files\\PowerShell\\7\\pwsh.exe`）+ 1 个不存在的路径 | exit 0；四项全部 `PNG magic=89504e470d0a1a0a`：powershell.exe = 1203 字节、cmd.exe = 625、wsl.exe = 1608、pwsh 7 = 1619；`C:\\WINDOWS\\System32\\no-such-zzz.exe -> null`；脚本不抛异常；`elapsedMs=1385`（与规格 §3-P3 同形状） |
| J-4 | A5 超时依据：`node .temp/ql-term-icon-probe/latency2.cjs` + 同 4 个 exe | exit 0；`noop run1/2/3 = 1290 / 134 / 138 ms`，`batch-4 run1/2/3 = 911 / 216 / 224 ms`（len=6935）→ 冷启动双峰复现，提取净增 777 / 82 / 86 ms；8000ms 是冷启动余量（K8） |
| J-5 | D1→D2 先写 6 条测试（E1–E6 名字逐字）再跑红：`npx vitest run src-main/ql-terminal-icons.test.ts` | exit 1；`FAIL src-main/ql-terminal-icons.test.ts [ ... ]` + `Error: Failed to load url ./ql-terminal-icons (resolved id: ./ql-terminal-icons) in D:/Dev/Projects/lms_launcher/src-main/ql-terminal-icons.test.ts. Does the file exist?`；`Test Files 1 failed (1)` / `Tests no tests`（0 条被收集）。**措辞与 D2 预期不同**：Vite/vitest 的「找不到被测模块」= `Failed to load url … Does the file exist?`，不是 Node CJS 的 `Cannot find module`；同一类失败（模块解析不到），不是断言写错 → 见报告「偏离」段 |
| J-6 | D3 实现（只新建 `src-main/ql-terminal-icons.ts`）→ D4 跑绿：`npx vitest run src-main/ql-terminal-icons.test.ts` | exit 0；`✓ src-main/ql-terminal-icons.test.ts (6 tests) 1271ms`；`Tests 6 passed (6)`；真机冒烟 `real_powershell_seam_extracts_a_png_for_a_known_exe 1225ms` **未跳过**（本机 `C:\\WINDOWS\\System32\\cmd.exe` 在位，解码后前 8 字节 = `89504e470d0a1a0a`） |
| J-7 | D5/G3 类型门：`npx tsc --noEmit -p tsconfig.main.json` | 第一次 exit 2：`src-main/ql-terminal-icons.ts(86,7): error TS2353: Object literal may only specify known properties, and 'stdio' does not exist in type 'ExecFileOptionsWithStringEncoding'`（@types/node 的 execFile 选项不声明 `stdio`，运行时有效：探针 `encoded-batch.cjs:31` 带着它实测通过）→ 补本地类型 `ExecFileOptionsWithStdio`，C2 的五个取值一字未改；复跑 = 无输出，`TSC_EXIT=0` |
| J-8 | G1/G2/G4 相邻回归 + i18n 三门：`npx vitest run src-main/quick-launch-terminals.test.ts src-main/ipc-ql.test.ts src-main/i18n` | exit 0；`Test Files 6 passed (6)` / `Tests 55 passed (55)`（quick-launch-terminals 9、ipc-ql 28、i18n 四份 18）→ 探测层与既有 `ql_terminals` 形状未受影响；本次未新增键 |
| J-9 | D6/G5 全量：`npm test` | exit 0；`Test Files 53 passed (53)` / `Tests 918 passed (918)` = 基线 912 + 6，与 A2/D6 预期逐字一致；列表里 `✓ src-main/ql-terminal-icons.test.ts (6 tests)` |
| J-10 | D7 复跑探针取真数：`node .temp/ql-term-icon-probe/latency2.cjs` + 同 4 个 exe（本轮第二次跑） | exit 0；`noop run1/2/3 = 1285 / 130 / 131 ms`；**`batch-4 run1/2/3 = 897 / 219 / 221 ms`**（len=6935）→ 提取净增 767 / 89 / 90 ms；与 J-4、规格 §3-P4 同量级（冷 1.3s / 热 ~220ms） |
| J-11 | F1–F5/F7 边界核对：`git diff` 三份 + Select-String 计数 | `git diff src-main/quick-launch-terminals.ts` = 0 字节；`git diff package.json pnpm-lock.yaml package-lock.json` = 0 字节；新文件 import 只有 `node:child_process` / `node:crypto` / `node:fs` / `node:path` / `./quick-launch-terminals`（类型）；`spawnSync` = 0、`console` = 0、`emitLog` = 0、`unlink` = 0、`rmSync` = 0、`mtime`/`statSync`/`size` = 0、`from 'electron'` = 0；汉字只在注释行（i18n `no-hardcoded` 门绿，见 J-8） |
| J-12 | 自审发现并修掉的两处（修完重跑 D4/D5/G1/G2/G4/G5） | ① 首版**注释**里写了 `spawnSync` / `console.*` / `emitLog` 三个字面量 → F3/F4 的 grep 各命中 1（虽在注释里，仍按「无命中」改写）→ 改成中文措辞，复跑计数全 0；② 首版把 C2 的选项写成调用点内联对象 → tsc TS2353（见 J-7）→ 改为具名 `EXEC_OPTIONS` + 本地类型，取值逐字不变 |
| J-13 | F6/G9 收尾核对：`git log --oneline -1`；`git status --porcelain` | HEAD 仍是 `50c9e77`（**未 `git add`、未 commit、未 stash**）；porcelain = `?? src-main/ql-terminal-icons.ts`、`?? src-main/ql-terminal-icons.test.ts`（B1/B2，等主代理按 H1 暂存）、`?? .superpowers/sdd/…/progress.md`、`?? .superpowers/sdd/…/task-01-report.md`（交付 2）、` M docs/superpowers/checks/…/task-01-…md`（= 本 J 段，交付 1 要求的填写，不属于 B 段代码改动） |
| J-14 | **主代理独立复跑（验收，2026-16-16 17:58–18:0x）**：`npx vitest run src-main/ql-terminal-icons.test.ts`；`npx tsc --noEmit -p tsconfig.main.json`；`npm test` | 定向 = `Tests 6 passed (6)`（真机冒烟 1313ms 未跳过）；`TSC_EXIT=0`（无输出）；全量 = `Test Files 53 passed (53)` / `Tests 918 passed (918)` / `Duration 9.83s`，exit 0 → 与 J-6/J-7/J-9 逐字一致，不是转述 |
| J-15 | 主代理复跑 A4 探针与 F3/F4/F5 计数：`node .temp/ql-term-icon-probe/encoded-batch.cjs <4 真实 exe> <1 不存在>`；对 `src-main/ql-terminal-icons.ts` 逐 pattern 计数 | 探针复现同一结果：1203 / 625 / 1608 / 1619 字节全部 `PNG magic=89504e470d0a1a0a`，不存在项 `null`，`elapsedMs=1375`；`spawnSync=0 console.=0 emitLog=0 unlink=0 rmSync=0 mtime=0 statSync=0 from 'electron'=0`；import 五行 = `node:child_process` / `node:crypto` / `node:fs` / `node:path` / `./quick-launch-terminals`（type）；汉字只在注释（7 处行尾注释，无字符串字面量含汉字，i18n `no-hardcoded` 门绿见 J-8） |
| J-16 | 主代理逐行核对 C1–C6 与两份新文件 | C1/C4/C5/C6 与 spec §6.1/§6.2 逐字一致；C2 的五个取值逐字（`stdio` 由本地类型承载 = 索引 K13）；C3 脚本按行 join 与 spec 那段一行不差。两处已裁偏离：内联 Promise 包装（K13）、空输入返回 `{}`（不起进程，spec 未禁止，属降级口径的自然延伸） |
