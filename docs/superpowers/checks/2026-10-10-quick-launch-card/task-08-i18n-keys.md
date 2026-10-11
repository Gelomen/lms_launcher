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
| B1 | `src-main/i18n/dict.ts` | 修改 | **唯一词典真源**：`ql.*`（C 段）+ `err.ql.*`（D1-D11）+ `app.dialog.filterExe`（D12）都加在这里，zh 与 en 两份。渲染端没有第二份词典——`src/i18n.ts:3` 直接 `import { dict } from ../src-main/i18n/dict`，`:30-36` 的 `t()` 读的就是它（索引 K20，原清单「修改 `src/i18n.ts`」作废） | ☐ |
| B2 | `src/i18n.test.ts` | 追加用例 | E1/E5 的渲染端断言 | ☐ |
| B3 | `src-main/quick-launch-config.ts`（9 处 `invalidError(QL_ERR.*)`）、`src-main/quick-launch.ts`（6 处 `t(QL_ERR.*)`）、`src-main/main.ts`（2 处 `t(QL_IPC_ERR.*)` / `t(QL_IPC_LABEL.*)`） | 修改调用点 | **按 K8 收尾**：词典落地后把这些调用点改成**字面量** `t('err.ql.xxx', {...})`，让它们进入 `key-coverage.test.ts:39-41` 的 `KEY_CALL` 范围（含占位符双向比对），并删掉不再被引用的 `QL_ERR` / `QL_IPC_ERR` / `QL_IPC_LABEL` 映射。除此之外不改这三个文件的任何行为 | ☐ |

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
| C9 | ~~`ql.dialog.filterExe`~~ **已作废**：对话框由主进程渲染（`ql_pick_exe` 无参数），键改为主进程词典的 `app.dialog.filterExe`（见 D12，索引 K14） | — | — | ☐（确认渲染端**不**加此键） |
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
| D11 | `err.ql.nameTooLong` | §5.3-1 的「≤64」分支（任务 3 补登记，见索引 K9） | ☐ |
| D12 | `app.dialog.filterExe` | `ql_pick_exe` 的 `.exe` 过滤器名（`main.ts:1116` 已在用，走常量映射）。zh/en 都要有，照既有 `app.dialog.filterModel`（dict.ts:281/:561）/ `app.dialog.filterJinja`（:282/:562）的措辞风格 | ☐ |

> **占位符必须与调用点逐字一致**（`key-coverage.test.ts:44` 的 `CALL_WITH_PARAMS` 在调用点改回字面量 `t()` 后会做双向比对）。任务 3 已落地的调用点（`src-main/quick-launch-config.ts` 的 `QL_ERR`）使用的占位符：`nameTooLong` → `{max}`；`nameDup` → `{name}`；`typeInvalid` → `{type}`；`terminalMissing` → `{terminal}`；`notFound` → `{id}`；`nameRequired` / `cmdRequired` / `exeRequired` → 无占位符。
> **任务 5 已落地的调用点**（`src-main/quick-launch.ts` 的 `QL_ERR`，索引 K11）：`terminalGone` → `{terminal}`；`ptySpawn` → `{exe}` `{err}`；`typeInvalid` → `{type}`；`notFound` → `{id}`；`alreadyRunning` / `exeRequired` → **无占位符**。另外该文件复用词典既有键 `err.proc.noChild`（无占位符）、`log.launcher.start.cmd`（`{cmd}`）、`log.app.exit`（`{code}`）——**不要**为它们新建 `err.ql.*` / `log.ql.*` 同义键。
> **不新增、直接复用词典已有键**（索引 K9）：YAML 解析失败 → `err.config.yamlLoadFail`（`{name}` `{msg}`）；顶层非对象 → `err.config.yamlEmpty`（`{name}`）；显式 id 非法 → `err.config.idFormat`（无占位符）。这三类**不要**再建 `err.ql.*` 同义键。

## E. 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| E1 | 步骤 1：先写失败测试（`src/i18n.test.ts` 追加 `t('ql.title')` 不等于键名本身，**并对 `ql.term.pwsh` / `ql.term.powershell` / `ql.term.cmd` / `ql.term.wsl` 各写一条字面量断言**） | — | 用例落盘（四条终端标签断言是 F5 的兜底） | ☐ |
| E2 | 步骤 2：验证失败 | `npx vitest run src-main/i18n src/i18n.test.ts` | FAIL（缺键） | ☐ |
| E3 | 步骤 3：中英双语补齐 | — | C/D 全部有值 | ☐ |
| E4 | 步骤 4：验证通过 | `npx vitest run src-main/i18n src/i18n.test.ts` | 全 PASS | ☐ |
| E5 | 补一条**枚举断言**（照仓库既有做法 `src-main/i18n/err-keys.ts` + `dict.test.ts:63-68`）：对 `TerminalId` 的四个值逐个断言 zh/en 词典都有 `ql.term.<id>` 且不是键名本身 | `npx vitest run src/i18n.test.ts` | 全 PASS。`key-coverage` 的 `walk()` 排除 `.test.ts`，所以**测试里用动态 key 是安全的**——它正是补上「调用点扫不到」缺口 | ☐ |
| E6 | **确认「常量映射传 key」已清零**（K8 收尾 / 索引 K20；原「钉住映射取值」的写法作废——调用点改回字面量后，`key-coverage` 本身就覆盖存在性与占位符一致性，比枚举断言更强）：`grep -n "t\\(QL_ERR\\." src-main` 与 `grep -n "t\\(QL_IPC" src-main` 的命中数必须为 **0**；`QL_ERR` / `QL_IPC_ERR` / `QL_IPC_LABEL` 若已无引用必须删除（不留死代码）。把 grep 命令与真实计数贴进 J 段 | `npx vitest run src-main/i18n` | 全 PASS（字面量调用点全部命中词典） | ☐ |
| E7 | **修掉任务 6 留下的「断未翻译 key 文本」用例**（索引 K16(2)）：`src-main/ipc-ql.test.ts:373-374` 三条断言现在依赖「缺键返回 key 本身」，词典落地后必红。改法：测试里 `import { t } from './i18n'`，断 `t('err.ql.notFound', { id: key })` 拼上 `VALIDATION: ` 前缀（`key-coverage.test.ts:24` 的 `walk()` 排除 `.test.ts`，测试里写字面量 key 不触门） | `npx vitest run src-main/ipc-ql.test.ts` | 全 PASS（词典落地前后都绿） | ☐ |

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
| G3 | `git diff --name-only` | 只含 B1-B3 **加上 E7 点名的 `src-main/ipc-ql.test.ts`**（原写「只含 B1-B3」与 E7 矛盾，已更正：E7 要求词典落地后修那三条断言） | ☐ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src/i18n.ts src/i18n.test.ts src-main/i18n/dict.ts` | ☐ |
| H2 | 提交信息逐字 | `feat(i18n): 快捷启动与交互终端中英词条` | ☐ |

## I. 完成判据

- [ ] C1-C10（C9 已作废，只确认渲染端不加该键）、D1-D12 全部有中英两份
- [ ] E2 先红、E4 后绿
- [ ] E6：三处常量映射调用点已改回字面量、映射已删、grep 命中 0（K8 收尾 / K20）
- [ ] E7 修掉 `ipc-ql.test.ts` 断未翻译 key 文本的三条用例（K16(2)）
- [ ] G1-G3 通过
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| E1 | 追加用例到 `src/i18n.test.ts`；取证 `git diff --stat -- src/i18n.test.ts` | `src/i18n.test.ts \| 49 ++++++++++++++++` | E1 / E5 用例落盘 ✓。两个 describe：check E1 的「`t('ql.title')` 不等于键名本身（中英两侧）」+「四条终端标签 en 逐字」，check E5 的「对 `TerminalId` 四个值逐个断 zh/en 存在且非键名 / en 逐字」。`import type { TerminalId } from '../src-main/quick-launch-config'` 是纯类型引用（运行时不 import 主进程模块）；`Record<TerminalId, …>` 让「新增第五种终端」在类型层就要求补断言 |
| E2 | `npx vitest run src-main/i18n src/i18n.test.ts` | exit 1；`Test Files 1 failed \| 4 passed (5)`、`Tests 3 failed \| 22 passed (25)`。三条失败逐字：`expected 'ql.title' not to be 'ql.title'`；`expected 'ql.term.powershell' to be 'Windows PowerShell'`；`ql.term.pwsh(zh): expected 'ql.term.pwsh' not to be 'ql.term.pwsh'`（另有 `[i18n] missing key: ql.term.*` 告警） | 先红 ✓（缺键） |
| E3 | 只改 `src-main/i18n/dict.ts`；取证脚本：比对 `git show HEAD:src-main/i18n/dict.ts` 与工作区版的 key 集合 | HEAD：zh 271 / en 271 → 现：zh 322 / en 322；新增 51 键 × 中英两份、删除 0、两侧 key 集合一致 = `true`。明细：`ql.*` 39（= C1 4 + C2 6 + C3 4 + C4 5 + C5 6 + C6 4 + C7 5 + C8 3 + C10 2，逐条对上）、`err.ql.*` 11（= D1-D11）、`app.dialog.filterExe` 1（= D12）。C9 负面取证：`git grep -n "ql\.dialog" -- src src-main` → 无输出（渲染端未加该键） | C1-C8、C10、D1-D12 中英齐备 ✓ |
| E4 | `npx vitest run src-main/i18n src/i18n.test.ts` | exit 0；`✓ index.test.ts (3)`、`✓ key-coverage.test.ts (2)`、`✓ no-hardcoded.test.ts (2)`、`✓ dict.test.ts (11)`、`✓ src/i18n.test.ts (7)`；`Test Files 5 passed (5)`、`Tests 25 passed (25)` | 后绿 ✓ |
| E5 | `npx vitest run src/i18n.test.ts` | exit 0；`✓ src/i18n.test.ts (7 tests) 5ms`、`Tests 7 passed (7)`。枚举用例用动态 key `'ql.term.' + id`（key-coverage 的 `walk()`:24 排除 `.test.ts`，不触门）——正是 A3 / F5 那条缺口的兜底 | E5 ✓ |
| E6 | `git grep -n "t(QL_ERR\." -- src-main`；`git grep -n "t(QL_IPC" -- src-main`；`git grep -n -E "QL_ERR\|QL_IPC\|invalidError" -- src-main src` | 三条全部无输出（git 退出码 1 = 无命中）。`QL_ERR`（两处）、`QL_IPC_ERR`、`QL_IPC_LABEL` 与 `invalidError()` 辅助函数一并删除，无死代码。改后字面量调用点计数（ripgrep `t\('err\.ql\.[A-Za-z]+'`）= 18 命中，其中 2 行是注释、**16 行是真实调用点**：`quick-launch-config.ts` 8（:87/:88/:91/:94/:99/:102/:135/:146）、`quick-launch.ts` 6（:145/:226/:232/:241/:267/:286）、`main.ts` 2（:1112/:1145） | 映射清零、无死代码 ✓。计数口径：K20 / 简报的「17 处」把 `invalidError` 的定义行也数了进去，真实调用点是 16 处 |
| E6 附 | 第一版注释里举了假 key `t('err.ql.xxx', {...})` → `npx vitest run src-main/i18n` | 当时 `key-coverage` 红：`Tests 1 failed \| 24 passed (25)`，失败项 `{ file: "src-main/quick-launch.ts", key: "err.ql.xxx", line: 13, inZh: false, inEn: false }`。原因：`KEY_CALL` 连注释一起扫。改写为「字面量 key 的 t() 调用」后转绿 | 新踩的坑：注释里不得出现 `t('字面量')` 形态（建议并入索引 G6 的措辞） |
| E7 | 先证旧断言必红：临时把两条断言改回 `toContain('err.ql.notFound')` / `not.toContain('err.ql.typeInvalid')` 后 `npx vitest run src-main/ipc-ql.test.ts`；再还原 | 临时态：`src-main/ipc-ql.test.ts (23 tests \| 3 failed)`，逐字 `expected 'VALIDATION: 快捷启动配置 "constructor" 不存在' to contain 'err.ql.notFound'`（`toString` / `__proto__` 同）。还原为 `import { t } from './i18n'` + `expect(msg).toContain(t('err.ql.notFound', { id: key }))` / `not.toContain(t('err.ql.typeInvalid', { type: key }))` 后 `✓ src-main/ipc-ql.test.ts (23 tests)` 全绿；`git diff --stat` 该文件 = `9 ++++++---`（1 行 import + 断言/注释） | E7 ✓（词典落地前后都绿） |
| G1 | `npx vitest run src-main/i18n src/i18n.test.ts` | `Test Files 5 passed (5)`、`Tests 25 passed (25)`，exit 0。其中 `key-coverage` 两条 = 16 处新字面量调用点全部命中 zh/en 词典 + `CALL_WITH_PARAMS`(:44) 的占位符双向比对通过（`{max}` `{name}` `{type}` `{terminal}` `{id}` `{exe}{err}`） | G1 ✓ |
| G2 | `npx vitest run src-main/i18n/no-hardcoded.test.ts` | `✓ src-main/i18n/no-hardcoded.test.ts (2 tests)`、`Tests 2 passed (2)`，exit 0（`dict.ts` 在 `EXCLUDE`:10 内，源码无汉字） | G2 ✓ |
| G3 | `git status --porcelain` + `git diff --name-only` | 六个文件：`src-main/i18n/dict.ts`(B1)、`src/i18n.test.ts`(B2)、`src-main/quick-launch-config.ts` / `src-main/quick-launch.ts` / `src-main/main.ts`(B3)、`src-main/ipc-ql.test.ts`(E7 点名)。`git diff --stat` 合计 `212 insertions(+), 65 deletions(-)`；未含 `process.ts` / `process.test.ts` / `err-keys.ts` / `package.json` / lock | 范围 = B1-B3 + E7 点名的测试文件。G3 字面写「只含 B1-B3」，与 E7 要求改 `ipc-ql.test.ts` 冲突 → 按 E7 执行，见报告疑虑 1 |
| V2 | `npx vitest run src-main/quick-launch.test.ts src-main/quick-launch-config.test.ts src-main/ipc-ql.test.ts src/App.test.ts` | `Test Files 4 passed (4)`、`Tests 110 passed (110)`，exit 0（B3 改了错误构造路径，这些文件里断前缀的用例仍绿） | 相邻回归 ✓ |
| V3 | `npx tsc -p tsconfig.main.json --noEmit` | 无诊断输出，`TSC_EXIT=0` | 类型门 ✓ |
| 额外（不在本表） | `npm test`（全量） | `Test Files 44 passed (44)`、`Tests 744 passed (744)`，exit 0 | 全量回归 ✓（V5 的正式门在任务 13 / 14，这里只是自证没碰坏别处） |
| H | `git add` / `git commit` 未执行 | 改动全部留在工作区（`git status --porcelain` 六个 `M`） | 按索引 K5 交主代理验收后执行 |
