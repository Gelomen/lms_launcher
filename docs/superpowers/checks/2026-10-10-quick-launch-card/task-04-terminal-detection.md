# 任务 4 · 终端探测 `quick-launch-terminals.ts` — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 4 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §6.1 / §6.2 / §6.3 / §12.3
> 本机基线（规格 §6.3 实测）：pwsh 7.6.6 ✅ / Windows PowerShell 5.1 ✅ / cmd ✅ / `wsl -l -q` 退出码 1（无发行版）⛔

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☐ |
| A2 | 本机基线复核 | 手跑 `wsl.exe -l -q` | 退出码非 0（无发行版）→ 与规格 §6.3 一致；若已装发行版，在 J 里记录并调整预期 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src-main/quick-launch-terminals.ts` | 新建 | 只做探测与解析，不 spawn PTY | ☐ |
| B2 | `src-main/quick-launch-terminals.test.ts` | 新建 | 计划给出的 3 个用例 | ☐ |

## C. 接口契约（逐字一致）

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | `export interface TerminalInfo { id: TerminalId; path: string }`（计划写作 `TerminalId = {...}`，实现按此形状） | 计划 §任务 4 接口 | ☐ |
| C2 | `export function parseWslDistroOutput(buf: Buffer): string[]`（纯函数，不 spawn） | 同上 | ☐ |
| C3 | `export function detectTerminals(): TerminalInfo[]` | 同上 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试 | — | UTF-16LE 解析 / 空输出 / 本机 cmd 可用 三个用例 | ☐ |
| D2 | 步骤 2：验证失败 | `npx vitest run src-main/quick-launch-terminals.test.ts` | FAIL（模块不存在） | ☐ |
| D3 | 步骤 3：实现（按 §6.1 四行探测表） | — | `spawnSync` + `windowsHide: true` + 单项 3s 超时；异常 → 该项不可用；**不缓存** | ☐ |
| D4 | 步骤 4：验证通过 | `npx vitest run src-main/quick-launch-terminals.test.ts` | 全 PASS；本机结果为 `powershell / cmd / pwsh`，**不含 wsl** | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 期望 | 出处 | ✓ |
|---|---|---|---|---|
| E1 | `parseWslDistroOutput(Buffer.from('Ubuntu\nDebian\n','utf16le'))` → `['Ubuntu','Debian']` | 剥 NUL、按行切 | 规格 §12.3 | ☐ |
| E2 | 空 Buffer → `[]`；仅换行（`\r\n\r\n` utf16le）→ `[]` |  | 规格 §12.3 | ☐ |
| E3 | `detectTerminals()` 里 `cmd` 存在且 `existsSync(path)` 为 true | 真机用例 | 计划 步骤 1 | ☐ |
| E4 | 只返回可用项：不可用终端**不出现在数组里**（不是返回 `path: ''`） |  | 规格 §6.1 | ☐ |
| E5 | `wsl` 需 `wsl.exe` 存在 **且** `wsl -l -q` 退出码 0 **且** 解析出的发行版名非空 | 本机 → 不出现 | 规格 §6.1 | ☐ |
| E6 | `pwsh` 判定用 `where.exe pwsh` 退出码 0 且首行是存在的文件 |  | 规格 §6.1 | ☐ |
| E7 | `powershell` / `cmd` 用固定路径存在性判定（`%SystemRoot%\System32\...` / `%ComSpec%` 回退） |  | 规格 §6.1 | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 违反的后果 | ✓ |
|---|---|---|---|
| F1 | 每个 `spawnSync` 带 `windowsHide: true` + 3s 超时（G5） | 探测时闪窗 / 卡死弹窗 | ☐ |
| F2 | 任何异常（超时、ENOENT、非 0）→ 该项不可用，**不得抛出** | 打开弹窗直接报错 | ☐ |
| F3 | 不跨调用缓存（每次 `ql_terminals` 实时探测） | 用户装好 WSL 发行版后仍看不到 | ☐ |
| F4 | 只下发 `{ id, path }`，标签文案留给渲染端 `t()` | 主进程硬编码文案，违反 G6 | ☐ |
| F5 | WSL 只列默认发行版一项；多发行版走「PowerShell + `wsl -d <名>`」 | 扩范围，违反规格 §6.2 / §2 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src-main/quick-launch-terminals.test.ts` | 全 PASS | ☐ |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无错 | ☐ |
| G3 | `git diff --name-only` | 只含 B1-B2 | ☐ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src-main/quick-launch-terminals.ts src-main/quick-launch-terminals.test.ts` | ☐ |
| H2 | 提交信息逐字 | `feat(main): 终端探测（只返回可用项，wsl 需有发行版）` | ☐ |

## I. 完成判据

- [ ] E1-E7 有测试或代码证据
- [ ] D4 本机结果 = `powershell / cmd / pwsh`（无 wsl），输出记入 J
- [ ] G1-G3 通过
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| D4 |  |  |  |
| A2 | `wsl.exe -l -q` |  |  |
