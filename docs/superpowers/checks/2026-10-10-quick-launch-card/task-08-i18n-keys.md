# 任务 8 · i18n 词条（中英） — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 8 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §10
> 硬门：`src-main/i18n/key-coverage.test.ts` + `src-main/i18n/no-hardcoded.test.ts`（两侧词典同时缺 key 时 dict.test.ts 仍会绿，所以必须跑这两个）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☐ |
| A2 | 词典结构 | 读 `src-main/i18n/dict.ts` 与 `src/i18n.ts` | zh / en 两份结构一致，新增键按现有分组插入 | ☐ |
| A3 | 硬门范围：**拼接 key 扫不到** | 读 `key-coverage.test.ts:39-45` 的 `KEY_CALL` 正则与第 6-8 行注释 | 正则要求闭合引号后紧跟 `,` 或 `)`，所以 `t('ql.term.' + id)` 这类拼接**被跳过**：动态 key 写错（如 `ql.term.pwshh`）不会让任何测试变红，界面上直接显示原始 key。仓库对这类调用点的兜底是 `hasKey()` 运行时回退（`src/i18n.ts:51`、`:57`），**不是**测试。处置见 F5 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src/i18n.ts` | 修改 | 只加 `ql.*` | ☐ |
| B2 | `src-main/i18n/dict.ts` | 修改 | 只加 `err.ql.*` | ☐ |
| B3 | `src/i18n.test.ts` | 追加 1 条 |  | ☐ |

## C. 渲染端键（zh + en 都要有，逐条核对）

| # | 键 | zh | en | ✓ |
|---|---|---|---|---|
| C1 | `ql.title` / `ql.empty.none` / `ql.invalid` / `ql.tab.closeBlocked` | ☐ | ☐ | ☐ |
| C2 | `ql.btn.new` / `ql.btn.copy` / `ql.btn.edit` / `ql.btn.start` / `ql.btn.stop` / `ql.btn.closeTab` | ☐ | ☐ | ☐ |
| C3 | `ql.term.pwsh` / `ql.term.powershell` / `ql.term.cmd` / `ql.term.wsl` | ☐ | en 逐字：`ql.term.powershell` = `Windows PowerShell`；`ql.term.pwsh` = `PowerShell 7 (pwsh)`；`ql.term.cmd` = `Command Prompt (cmd)`；`ql.term.wsl` = `WSL` | ☐ |
| C4 | `ql.terminal.clear` / `ql.terminal.searchPlaceholder` / `ql.terminal.searchPrev` / `ql.terminal.searchNext` / `ql.terminal.count` | ☐ | ☐ | ☐ |
| C5 | `ql.modal.newTitle` / `ql.modal.editTitle` / `ql.modal.name` / `ql.modal.type` / `ql.modal.type.shell` / `ql.modal.type.exe` | ☐ | ☐ | ☐ |
| C6 | `ql.modal.terminal` / `ql.modal.terminal.loading` / `ql.modal.cmd` / `ql.modal.exe` | ☐ | ☐ | ☐ |
| C7 | `ql.modal.btn.pick` / `ql.modal.btn.save` / `ql.modal.btn.delete` / `ql.modal.delete.title` / `ql.modal.delete.message` | ☐ | ☐ | ☐ |
| C8 | `ql.err.nameRequired` / `ql.err.nameTaken` / `ql.err.running` | ☐ | ☐ | ☐ |
| C9 | `ql.dialog.filterExe` | ☐ | ☐ | ☐ |
| C10 | `ql.log.exit` / `ql.log.fail` | ☐ | ☐ | ☐ |

## D. 主进程键（`err.ql.*`，zh + en 都要有）

| # | 键 | 用在哪 | ✓ |
|---|---|---|---|
| D1 | `err.ql.nameRequired` | §5.3-1 | ☐ |
| D2 | `err.ql.nameDup` | §5.3-2 | ☐ |
| D3 | `err.ql.typeInvalid` | §5.3-3 | ☐ |
| D4 | `err.ql.terminalMissing` | §5.3-4（终端不可用） | ☐ |
| D5 | `err.ql.cmdRequired` | §5.3-4 | ☐ |
| D6 | `err.ql.exeRequired` | §5.3-5 | ☐ |
| D7 | `err.ql.notFound` | `ql_delete` / `ql_start` 找不到配置 | ☐ |
| D8 | `err.ql.alreadyRunning` | `STATE:`（重复启动） | ☐ |
| D9 | `err.ql.terminalGone` | 启动前终端已不可用 | ☐ |
| D10 | `err.ql.ptySpawn` | PTY spawn 失败 | ☐ |

## E. 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| E1 | 步骤 1：先写失败测试（`src/i18n.test.ts` 追加 `t('ql.title')` 不等于键名本身，**并对 `ql.term.pwsh` / `ql.term.powershell` / `ql.term.cmd` / `ql.term.wsl` 各写一条字面量断言**） | — | 用例落盘（四条终端标签断言是 F5 的兜底） | ☐ |
| E2 | 步骤 2：验证失败 | `npx vitest run src-main/i18n src/i18n.test.ts` | FAIL（缺键） | ☐ |
| E3 | 步骤 3：中英双语补齐 | — | C/D 全部有值 | ☐ |
| E4 | 步骤 4：验证通过 | `npx vitest run src-main/i18n src/i18n.test.ts` | 全 PASS | ☐ |
| E5 | 补一条**枚举断言**（照仓库既有做法 `src-main/i18n/err-keys.ts` + `dict.test.ts:63-68`）：对 `TerminalId` 的四个值逐个断言 zh/en 词典都有 `ql.term.<id>` 且不是键名本身 | `npx vitest run src/i18n.test.ts` | 全 PASS。`key-coverage` 的 `walk()` 排除 `.test.ts`，所以**测试里用动态 key 是安全的**——它正是补上「调用点扫不到」缺口的地方 | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 违反的后果 | ✓ |
|---|---|---|---|
| F1 | 中英**同时**补齐，不允许只补中文 | `dict.test.ts` / `key-coverage` 红 | ☐ |
| F2 | 带占位符的词条（如 `ql.invalid` 的 N、`ql.terminal.count` 的计数）两侧占位符名必须一致 | `key-coverage` 的占位符一致性检查红 | ☐ |
| F3 | 终端标签只在渲染端 `t()`，主进程不下发标签 | 违反规格 §6.1 | ☐ |
| F4 | 不加规格外的键（如「确认删除」复用既有通用键） | 词典膨胀 | ☐ |
| F5 | 终端标签的 key 必须以**字面量 `t()` 调用**出现在源码里，`key-coverage` 才扫得到。可用查表函数：`const TERM_LABEL: Record<TerminalId, () => string> = { pwsh: () => t('ql.term.pwsh'), powershell: () => t('ql.term.powershell'), cmd: () => t('ql.term.cmd'), wsl: () => t('ql.term.wsl') }`（四个调用点都是字面量）。注意：`{ pwsh: 'ql.term.pwsh' }` 这种**纯字符串映射不算**——正则只匹配 `t(` / `hasKey(` 后面的字面量。若坚持 `t('ql.term.' + id)`，必须同时用 `hasKey()` 回退 + E1/E5 的断言兜底。判据：**封闭集合（如 `TerminalId` 只有四个）就用字面量查表；只有开放集合（如参数 key 来自 `configs/llama_params.yaml`）才被迫用拼接**——仓库里唯一的拼接调用点 `TemplateModal.vue:136` 属于后者 | 动态 key 写错 → 界面显示原始 key，且没有任何测试变红 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src-main/i18n src/i18n.test.ts` | 全 PASS | ☐ |
| G2 | `npx vitest run src-main/i18n/no-hardcoded.test.ts` | 全 PASS | ☐ |
| G3 | `git diff --name-only` | 只含 B1-B3 | ☐ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src/i18n.ts src/i18n.test.ts src-main/i18n/dict.ts` | ☐ |
| H2 | 提交信息逐字 | `feat(i18n): 快捷启动与交互终端中英词条` | ☐ |

## I. 完成判据

- [ ] C1-C10、D1-D10 全部有中英两份
- [ ] E2 先红、E4 后绿
- [ ] G1-G3 通过
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| E2 |  |  |  |
| E4 |  |  |  |
