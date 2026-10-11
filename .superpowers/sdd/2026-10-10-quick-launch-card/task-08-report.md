# 任务 8 报告 · i18n 词条（中英）

> HEAD 起点 `02fca10`，工作区起点干净。本任务**不 `git add`、不 commit**（索引 K5），改动全部留在工作区。
> check 表：`docs/superpowers/checks/2026-10-10-quick-launch-card/task-08-i18n-keys.md`（J 段已填真实命令与输出）

## 1. 状态

**DONE_WITH_CONCERNS** —— C/D 全部落地、E1→E7 全部执行、G1/G2/G3 + V2/V3 全绿、全量 `npm test` 744 全绿。
疑虑见 §7（4 条，都不影响本任务的完成判据，但其中 2 条需要主代理在派任务 9 / 12 前处理）。

## 2. 改动清单（`git diff --stat`）

```
src-main/i18n/dict.ts           | 124 ++++++++++++++++++++++++++++++++++++++++
src-main/ipc-ql.test.ts         |   9 ++-
src-main/main.ts                |  21 +++----
src-main/quick-launch-config.ts |  43 +++++---------
src-main/quick-launch.ts        |  31 ++++------
src/i18n.test.ts                |  49 ++++++++++++++++
6 files changed, 212 insertions(+), 65 deletions(-)
```

对应 B1（dict.ts）、B2（src/i18n.test.ts）、B3（三个源文件的调用点）、E7（ipc-ql.test.ts）。
**未碰**：`src/i18n.ts`（K20：渲染端没有第二份词典）、`src-main/i18n/err-keys.ts`（`IPC_ERROR_KEYS` 不需要登记 `err.ql.*`）、`process.ts` / `process.test.ts`、`package.json` / lock。

## 3. 新增键（zh 51 + en 51，共 102 条取值）

取证脚本：比对 `git show HEAD:src-main/i18n/dict.ts` 与工作区版的 key 集合。

| 指标 | HEAD | 现在 |
|---|---|---|
| `dict.zh` key 数 | 271 | 322 |
| `dict.en` key 数 | 271 | 322 |
| 新增 | — | zh 51 / en 51（两侧新增集合完全相同） |
| 删除 / 改名 | — | 0 |
| zh/en key 集合一致 | true | true（`dict.test.ts` 第 1 条亦绿） |

落点（`src-main/i18n/dict.ts`，按现有分组插入）：

| 位置 | 内容 |
|---|---|
| zh `dict.ts:143-186` / en `485-528` | 39 条 `ql.*`，紧跟日志面板组之后（终端页签属日志区） |
| zh `dict.ts:302-318` / en `644-660` | 11 条 `err.ql.*`，紧跟 `err.proc.*` 组之后（S10 主进程段内） |
| zh `dict.ts:344` / en `686` | `app.dialog.filterExe`，紧跟既有 `app.dialog.filterModel` / `filterJinja` |

**逐条对上 check 表**（39 = C1 4 + C2 6 + C3 4 + C4 5 + C5 6 + C6 4 + C7 5 + C8 3 + C10 2；11 = D1-D11；1 = D12）：

- C1 `ql.title` / `ql.empty.none` / `ql.invalid`（`{n}`）/ `ql.tab.closeBlocked`
- C2 `ql.btn.new|copy|edit|start|stop|closeTab`
- C3 `ql.term.pwsh|powershell|cmd|wsl` —— en 逐字按 C3/计划步骤 3：`PowerShell 7 (pwsh)` / `Windows PowerShell` / `Command Prompt (cmd)` / `WSL`；zh 除 cmd 为「命令提示符 (cmd)」外同形（规格 §10 未给中文标签，按产品名保留）
- C4 `ql.terminal.clear|searchPlaceholder|searchPrev|searchNext|count`（`count` = `{cur} / {total}`）
- C5-C7 `ql.modal.*`（`delete.message` = `{name}`，措辞照既有 `tplModal.delete.message`）
- C8 `ql.err.nameRequired|nameTaken|running`
- C10 `ql.log.exit`（`{name}`）/ `ql.log.fail`（`{name}` `{msg}`）
- D1-D11 `err.ql.*`；D12 `app.dialog.filterExe`（zh「可执行程序文件」/ en「Executable files」，照 `filterModel`/`filterJinja` 措辞）
- **C9 负面确认**：渲染端**没有** `ql.dialog.filterExe`；`git grep -n "ql\.dialog" -- src src-main` → 无输出

**复用既有键、一行未改**（索引 K9）：`err.config.yamlLoadFail` / `err.config.yamlEmpty` / `err.config.idFormat` / `err.proc.noChild` / `log.launcher.start.cmd` / `log.app.exit`。

## 4. K8 收尾：调用点改回字面量（16 处，不是 17）

**计数口径更正**：K20 / 简报写「17 处」，实际 `grep -n "invalidError\(|t\(QL_ERR\.|t\(QL_IPC"` 的 17 个命中里**有一个是 `invalidError` 的定义行**（`quick-launch-config.ts:43`）。真实调用点 = **16**：config 8 + quick-launch 6 + main 2。

前后对照（前缀、参数、顺序一字未动）：

| 文件 | 前 | 后 |
|---|---|---|
| `quick-launch-config.ts` :87/:88/:91/:94/:99/:102/:135/:146 | `throw invalidError(QL_ERR.nameRequired)` 等 8 处 | `throw new Error('VALIDATION: ' + t('err.ql.nameRequired'))` 等 8 处 |
| `quick-launch.ts` :145/:226/:232/:241/:267/:286 | `t(QL_ERR.terminalGone, { terminal: … })` 等 6 处 | `t('err.ql.terminalGone', { terminal: … })` 等 6 处 |
| `main.ts` :1112/:1145 | `t(QL_IPC_ERR.notFound, { id })`、`t(QL_IPC_LABEL.filterExe)` | `t('err.ql.notFound', { id })`、`t('app.dialog.filterExe')` |

删除的死代码：`QL_ERR`（config 与 quick-launch 各一份）、`QL_IPC_ERR`、`QL_IPC_LABEL`、`invalidError()` 辅助函数。
附带：`quick-launch.ts` 的旧 `QL_ERR` 里 `notFound` 那一条**本来就没有调用点**（该文件从不抛 notFound），随映射一并删除。
三处映射上方的 K8 注释已改写为事实（原注释说「词典键在任务 8 才落地」，落地后就成了假话）。

grep 清零（真实执行）：

```
$ git grep -n "t(QL_ERR\." -- src-main          # 无输出（git 退出码 1）
$ git grep -n "t(QL_IPC" -- src-main             # 无输出
$ git grep -n -E "QL_ERR|QL_IPC|invalidError" -- src-main src   # 无输出
```

改后字面量调用点计数（ripgrep `t\('err\.ql\.[A-Za-z]+'|t\('app\.dialog\.filterExe'\)`）= 18 命中，其中 2 行是注释、16 行是真实调用点。

**新踩的坑（建议并入索引 G6）**：`KEY_CALL` 连**注释**一起扫。我第一版注释里举了假 key `t('err.ql.xxx', {...})`，`key-coverage` 立刻红：`{ file: "src-main/quick-launch.ts", key: "err.ql.xxx", line: 13, inZh: false, inEn: false }`。改写为「字面量 key 的 t() 调用」后转绿。→ 源码注释里不得出现 `t('字面量')` 形态。

## 5. E7 的修法

`src-main/ipc-ql.test.ts`：新增 `import { t } from './i18n';`（主进程 t，本文件默认 zh），三条参数化用例的断言改为按译文：

```ts
expect(msg).toMatch(/^VALIDATION:/);
expect(msg).toContain(t('err.ql.notFound', { id: key }));
expect(msg).not.toContain(t('err.ql.typeInvalid', { type: key }));
```

「是 notFound 而不是 typeInvalid」这条判据保持不变，只是期望值改由 `t()` 现算。`key-coverage` 的 `walk()`(:24) 排除 `.test.ts`，测试里写字面量 key 不触门。

先红取证（临时把断言改回旧写法）：`23 tests | 3 failed` —— `expected 'VALIDATION: 快捷启动配置 "constructor" 不存在' to contain 'err.ql.notFound'`（`toString` / `__proto__` 同）。还原后 `✓ src-main/ipc-ql.test.ts (23 tests)`。

## 6. TDD 与回归（真实计数）

| 步骤 | 结果 |
|---|---|
| E2 先红 | `Test Files 1 failed \| 4 passed (5)`、`Tests 3 failed \| 22 passed (25)`，exit 1 |
| E4 后绿 | `Test Files 5 passed (5)`、`Tests 25 passed (25)`，exit 0 |
| E5 | `npx vitest run src/i18n.test.ts` → `Tests 7 passed (7)` |
| E6 | 三条 grep 全 0；映射与辅助函数已删 |
| E7 | 旧断言 3 红 → 新断言 23 全绿 |
| G1 | `Test Files 5 passed (5)` / `Tests 25 passed (25)`（含 `key-coverage` 两条：16 处字面量调用点命中词典 + 占位符双向比对） |
| G2 | `no-hardcoded.test.ts` → `Tests 2 passed (2)` |
| V2 | `quick-launch / quick-launch-config / ipc-ql / App` → `Test Files 4 passed (4)` / `Tests 110 passed (110)` |
| V3 | `npx tsc -p tsconfig.main.json --noEmit` → 无诊断，`TSC_EXIT=0` |
| 额外 | `npm test` 全量 → `Test Files 44 passed (44)` / `Tests 744 passed (744)`，exit 0 |

E1/E5 的测试写法：`import type { TerminalId } from '../src-main/quick-launch-config'`（纯类型引用，运行时不 import 主进程模块）+ `Record<TerminalId, …>` 枚举表 —— 新增第五种终端时类型层就要求补断言；枚举用例用动态 key `'ql.term.' + id`，正是 check A3/F5「拼接 key 扫不到」的兜底。

## 7. 疑虑（4 条）

1. **G3 与 E7 在表里互相矛盾**：G3 要求 `git diff --name-only`「只含 B1-B3」，E7 又要求改 `src-main/ipc-ql.test.ts:373-374`。我按 E7 执行，故 diff 里有第 6 个文件。建议把 G3 措辞改成「只含 B1-B3 + E7 点名的测试文件」。
2. **`ql.terminal.searchClear` 没加**：计划 :299 的键清单里有 `ql.terminal.searchPrev|Next|Clear`，但 check 表 C4 只列了 `searchPlaceholder / searchPrev / searchNext / count`。按「完成判据以 check 表为准 + F4 不加规格外的键」我没加。**任务 9 的清空查找按钮**要么复用既有 `log.search.clear`（zh「清空查找」/ en「Clear search」，符合 K9 的复用口径），要么届时补键——请在任务 9 简报里定一句。
3. **占位符名是我定的，下游必须照抄**（这些键还没有调用点，`key-coverage` 暂时比不到）：`ql.invalid`→`{n}`、`ql.terminal.count`→`{cur}` `{total}`、`ql.modal.delete.message`→`{name}`、`ql.log.exit`→`{name}`、`ql.log.fail`→`{name}` `{msg}`。已写进 dict.ts 的注释（zh/en 两份都有）。任务 9/11/12/13 若用别的名字，`key-coverage:44` 会在他们那一轮红。
4. **措辞属我判断，非规格钉死**：规格 §10 只给词条清单，只有终端标签的 en 被 C3/计划钉死。其余中文措辞（如「暂无启动项」「终端运行中，请先停止再关闭」「命令提示符 (cmd)」）按仓库既有分组风格写；主代理若要改文案，改 dict 即可，测试只钉 `ql.title` 非键名 + 四条终端标签 en 逐字，不会连带红。

## 8. 自审对照 check 表

- A1 起点：`git status --porcelain` 无输出、HEAD `02fca10` ✓；A2 词典只有一份、按现有分组插入 ✓；A3 已按「拼接 key 扫不到」用 E1/E5 兜底 ✓
- B1/B2/B3 ✓（B3 只改 key 写法：`git diff -U1` 逐行核对，前缀 / 参数 / 顺序未变，见 §4）
- C1-C8、C10、D1-D12 ✓；C9 确认渲染端未加 ✓
- E1-E7 ✓（E6 的 grep 计数见 §4）
- F1 中英同时 ✓（新增两侧集合完全相同）；F2 占位符两侧同名 ✓；F3 终端标签只在渲染端词典、主进程不下发标签 ✓；F4 未加规格外键 ✓（疑虑 2 就是没加）；F5 本任务不写查表函数，但 E1/E5 已把「写错动态 key」这条路堵上 ✓
- G1/G2 ✓；G3 见疑虑 1
- H1/H2 **未执行**（K5，交主代理）
