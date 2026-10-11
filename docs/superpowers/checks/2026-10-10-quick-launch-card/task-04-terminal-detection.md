# 任务 4 · 终端探测 `quick-launch-terminals.ts` — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 4 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §6.1 / §6.2 / §6.3 / §12.3
> 本机基线（规格 §6.3 实测）：pwsh 7.6.6 ✅ / Windows PowerShell 5.1 ✅ / cmd ✅ / `wsl -l -q` 退出码 1（无发行版）⛔

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☑ |
| A2 | 本机基线复核 | 手跑 `wsl.exe -l -q` | 退出码非 0（无发行版）→ 与规格 §6.3 一致；若已装发行版，在 J 里记录并调整预期 | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src-main/quick-launch-terminals.ts` | 新建 | 只做探测与解析，不 spawn PTY | ☑ |
| B2 | `src-main/quick-launch-terminals.test.ts` | 新建 | 计划给出的 3 个用例 **+ 索引 K10 补的 E8/E9 两条回归用例**（任务 4 审查 Important #1 裁定补，见该轮审查与 K10） | ☐ |

## C. 接口契约（逐字一致）

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | `export interface TerminalInfo { id: TerminalId; path: string }`（计划写作 `TerminalId = {...}`，实现按此形状） | 计划 §任务 4 接口 | ☑ |
| C2 | `export function parseWslDistroOutput(buf: Buffer): string[]`（纯函数，不 spawn） | 同上 | ☑ |
| C3 | `export function detectTerminals(): TerminalInfo[]` | 同上 | ☑ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试 | — | UTF-16LE 解析 / 空输出 / 本机 cmd 可用 三个用例 | ☑ |
| D2 | 步骤 2：验证失败 | `npx vitest run src-main/quick-launch-terminals.test.ts` | FAIL（模块不存在） | ☑ |
| D3 | 步骤 3：实现（按 §6.1 四行探测表） | — | `spawnSync` + `windowsHide: true` + 单项 3s 超时；异常 → 该项不可用；**不缓存** | ☑ |
| D4 | 步骤 4：验证通过 | `npx vitest run src-main/quick-launch-terminals.test.ts` | 全 PASS；本机结果为 `powershell / cmd / pwsh`，**不含 wsl** | ☑ |

## E. 必须钉住的行为断言

| # | 断言 | 期望 | 出处 | ✓ |
|---|---|---|---|---|
| E1 | `parseWslDistroOutput(Buffer.from('Ubuntu\nDebian\n','utf16le'))` → `['Ubuntu','Debian']` | 剥 NUL、按行切 | 规格 §12.3 | ☑ |
| E2 | 空 Buffer → `[]`；仅换行（`\r\n\r\n` utf16le）→ `[]` |  | 规格 §12.3 | ☑ |
| E3 | `detectTerminals()` 里 `cmd` 存在且 `existsSync(path)` 为 true | 真机用例 | 计划 步骤 1 | ☑ |
| E4 | 只返回可用项：不可用终端**不出现在数组里**（不是返回 `path: ''`） |  | 规格 §6.1 | ☑ |
| E5 | `wsl` 需 `wsl.exe` 存在 **且** `wsl -l -q` 退出码 0 **且** 解析出的发行版名非空 | 本机 → 不出现 | 规格 §6.1 | ☑ |
| E6 | `pwsh` 判定用 `where.exe pwsh` 退出码 0 且首行是存在的文件 |  | 规格 §6.1 | ☑ |
| E7 | `powershell` / `cmd` 用固定路径存在性判定（`%SystemRoot%\System32\...` / `%ComSpec%` 回退） |  | 规格 §6.1 | ☑ |
| E8 | wsl 三条件链回归（注入假 `spawnSync`，不改 C1-C3 签名）：① `wsl.exe` 存在但 `wsl -l -q` 退出码非 0 → 数组里无 `wsl`；② 退出码 0 但解析结果为空 → 无 `wsl`；③ 退出码 0 且有发行版 → 有 `wsl` 且 `path` = 该 `wsl.exe` | 本机永远观察不到「wsl 可用」（规格 §6.3 / §12.10），故只能靠注入 | 任务 4 审查 Important #1 + 索引 K10；行为本身出处仍是规格 §6.1 wsl 行 | ☐ |
| E9 | `where.exe` 判定回归（同上注入）：① 退出码非 0 → 该项不可用；② 退出码 0 但首行指向不存在的文件 → 该项不可用（不回退第二行）；③ 首行存在 → 用该路径 |  | 任务 4 审查 Important #1 + 索引 K10；出处规格 §6.1 pwsh 行 | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 违反的后果 | ✓ |
|---|---|---|---|
| F1 | 每个 `spawnSync` 带 `windowsHide: true` + 3s 超时（G5） | 探测时闪窗 / 卡死弹窗 | ☑ |
| F2 | 任何异常（超时、ENOENT、非 0）→ 该项不可用，**不得抛出** | 打开弹窗直接报错 | ☑ |
| F3 | 不跨调用缓存（每次 `ql_terminals` 实时探测） | 用户装好 WSL 发行版后仍看不到 | ☑ |
| F4 | 只下发 `{ id, path }`，标签文案留给渲染端 `t()` | 主进程硬编码文案，违反 G6 | ☑ |
| F5 | WSL 只列默认发行版一项；多发行版走「PowerShell + `wsl -d <名>`」 | 扩范围，违反规格 §6.2 / §2 | ☑ |
| F6 | `wsl.exe` 的定位手段：`where.exe wsl.exe` 命中，**或** `%SystemRoot%\System32\wsl.exe` 固定路径回退（与 cmd 行同口径）。规格只写「`wsl.exe` 存在」未指定手段 → 已定为口径（索引 K10），后续审查不再重复讨论 | 无 | ☑ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src-main/quick-launch-terminals.test.ts` | 全 PASS | ☑ |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无错 | ☑ |
| G3 | `git diff --name-only` | 只含 B1-B2 | ☑ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src-main/quick-launch-terminals.ts src-main/quick-launch-terminals.test.ts` | ☐（主代理验收后执行，K5） |
| H2 | 提交信息逐字 | `feat(main): 终端探测（只返回可用项，wsl 需有发行版）` | ☐（主代理验收后执行，K5） |

## I. 完成判据

- [x] E1-E7 有测试或代码证据（E1-E3 = 用例；E4-E7 = 代码结构，行号见报告）
- [x] D4 本机结果 = `powershell / cmd / pwsh`（无 wsl），输出记入 J
- [x] G1-G3 通过
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| A1 | `git status --porcelain`（另跑 `git rev-parse --short HEAD`） | 无输出；HEAD = `5db815f` | 起点工作区干净 |
| A2 | `wsl.exe -l -q`（手跑） | `EXITCODE=1`；stdout 为 UTF-16LE 提示「未安装适用于 Windows 的 Linux 子系统…可用 `wsl.exe --install` 安装」，无任何发行版行 | 与规格 §6.3 基线一致 → D4 预期不变：`wsl` 不出现 |
| D1 | 新建 `src-main/quick-launch-terminals.test.ts`（计划步骤 1 的三个用例逐字，见 :14 / :19 / :25） | — | 先落失败测试 |
| D2 | `npx vitest run src-main/quick-launch-terminals.test.ts` | `FAIL src-main/quick-launch-terminals.test.ts (0 test)` / `Error: Failed to load url ./quick-launch-terminals (resolved id: ./quick-launch-terminals) ... Does the file exist?` / `Test Files 1 failed (1)` / `Tests no tests`（exit 1） | 模块不存在 → 红，符合预期 |
| D3 | 新建 `src-main/quick-launch-terminals.ts`（:31-:34 powershell、:37-:42 cmd、:45-:65 where.exe + pwsh、:68-:91 wsl 三条件、:94-:103 解析、:107-:119 汇总） | — | 按 §6.1 四行探测表实现 |
| D4 | `npx vitest run src-main/quick-launch-terminals.test.ts` | `✓ src-main/quick-launch-terminals.test.ts (3 tests) 148ms` / `Test Files 1 passed (1)` / `Tests 3 passed (3)`（exit 0） | 全 PASS |
| D4 补充 · 本机探测结果 | `npx tsc src-main/quick-launch-terminals.ts --target ES2022 --module commonjs --strict --outDir %TEMP%\ql-t4-probe` 后 `node -e "require(...).detectTerminals()"` | `[{"id":"powershell","path":"C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe"},{"id":"cmd","path":"C:\WINDOWS\system32\cmd.exe"},{"id":"pwsh","path":"C:\Program Files\PowerShell\7\pwsh.exe"}]` → `IDS=powershell,cmd,pwsh` | 本机 = powershell / cmd / pwsh，**不含 wsl**（E3 / E5 / F4） |
| F3 取证（不缓存） | 同一脚本续跑：调 `detectTerminals()` → 置 `process.env.SystemRoot` 为不存在的目录 → 再调 → **恢复 `SystemRoot`** → 再把 `process.env.PATH` 收窄到 `C:\WINDOWS\system32` → 四调（审查者独立复现指出：不恢复 SystemRoot 时 `:26-28` 只会拼出不存在的路径，powershell 不可能回来，原记录漏写这一步） | `CALL1=powershell,cmd,pwsh` → `CALL2_after_bad_SystemRoot=cmd,pwsh` → `CALL3_after_PATH_without_pwsh=powershell,cmd` | 结果随环境即时变化 → 无跨调用缓存；pwsh 由 `where.exe` 决定而非硬编码（F3 / E6） |
| F4 取证 | `Object.keys(detectTerminals()[0])` | `["id","path"]` | 只下发 `{ id, path }`，无标签文案 |
| E1 / E2 复核（手跑） | `parseWslDistroOutput(Buffer.from('Ubuntu\nDebian\n','utf16le'))`；`(Buffer.from('\r\n\r\n','utf16le'))`；真机 `wsl -l -q` 的 stdout | `["Ubuntu","Debian"]` / `[]` / `[]` | UTF-16LE 剥 NUL 按行解析、空输出 → `[]` 均成立 |
| G1 | `npx vitest run src-main/quick-launch-terminals.test.ts` | 同 D4：`Tests 3 passed (3)`（exit 0） | 定向测试绿 |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无任何输出；`TSC_EXIT=0` | 类型门无错 |
| G3 | `git diff --name-only`；`git status --porcelain` | 前者只含本表 `docs/…/task-04-terminal-detection.md`（填 J 段所致）；后者 = `?? src-main/quick-launch-terminals.test.ts` 与 `?? src-main/quick-launch-terminals.ts`（报告写在 `.superpowers/`，被 gitignore，不进 status） | **代码**改动范围 = B1 + B2，无越界；未 `git add`、未 commit |
