# 任务 8 简报 · i18n 词条（中英）

计划：docs/superpowers/plans/2026-10-10-quick-launch-card.md §任务 8（:295-311，**文件行已按 K20 更正**）
规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §10（词条清单）
check 表：docs/superpowers/checks/2026-10-10-quick-launch-card/task-08-i18n-keys.md（C1-C10（C9 已作废）、D1-D12、E1-E7、F1-F5、G1-G3、H/I 全部照表执行，J 段填真实输出）
索引：docs/superpowers/checks/2026-10-10-quick-launch-card/00-index.md 的 K 组，尤其 **K20**（词典只有一份 + K8 收尾）、**K14**（`app.dialog.filterExe` 归主进程词典）、**K9**（复用既有键，不建同义键）、**K15**（探测口径，不涉及本任务）、**K16(2)**（E7 的由来）

## 两条必须先知道的事实（都已实测，别再自己找）

1. **词典只有一份**：`src-main/i18n/dict.ts`。渲染端 `src/i18n.ts:3` 直接 `import { dict, translate } from ../src-main/i18n/dict`，`:30-36` 的 `t()` 读的就是它。所以 **C 段的 `ql.*` 与 D 段的 `err.ql.*` / `app.dialog.filterExe` 全部落在 dict.ts 的 zh 与 en 两份里**；`src/i18n.ts` 里没有词典，不要往它加键。
2. **K8 的收尾在本任务执行**（K20(2)）：任务 3/5/6 为了绕开 `key-coverage.test.ts:39-41` 的 `KEY_CALL`（只认字面量 `t('…')`）用「常量映射传 key」。词典一落地就必须把这 **17 处**调用点改回字面量，让它们进入硬门（存在性 + `:44` 的占位符双向比对），并删掉不再被引用的映射表：
   - `src-main/quick-launch-config.ts`：`QL_ERR`（:31-39）+ 9 处 `invalidError(QL_ERR.*)`（:102/:103/:106/:109/:114/:117/:150/:161 等，以 grep 为准）
   - `src-main/quick-launch.ts`：`QL_ERR` + 6 处 `t(QL_ERR.*)`（:152/:233/:239/:248/:274/:293）
   - `src-main/main.ts`：`QL_IPC_ERR`（:1012 附近）1 处（:1119）+ `QL_IPC_LABEL` 1 处（:1152）
   改完必须 `grep -n "t\\(QL_ERR\\." src-main` 与 `grep -n "t\\(QL_IPC" src-main` 命中 0（check 表 E6），并把 grep 输出贴进 J 段。

## 占位符必须与调用点逐字一致（这是最容易红的地方）

改回字面量后 `key-coverage.test.ts:44` 的 `CALL_WITH_PARAMS` 会**双向**比对「调用点传的参数名」与「词典值里的 {占位符}」。已落地的调用点用的参数名（照抄，别改名）：
- `err.ql.nameTooLong` → `{max}`；`err.ql.nameDup` → `{name}`；`err.ql.typeInvalid` → `{type}`；`err.ql.terminalMissing` → `{terminal}`；`err.ql.notFound` → `{id}`（`main.ts` 与 `quick-launch-config.ts` 两处都要）
- `err.ql.terminalGone` → `{terminal}`；`err.ql.ptySpawn` → `{exe}` `{err}`
- `err.ql.nameRequired` / `err.ql.cmdRequired` / `err.ql.exeRequired` / `err.ql.alreadyRunning` / `app.dialog.filterExe` → **无占位符**（值里不得出现 {…}）
- 复用既有键（**不新建同义键**，K9）：`err.config.yamlLoadFail` / `err.config.yamlEmpty` / `err.config.idFormat` / `err.proc.noChild` / `log.launcher.start.cmd` / `log.app.exit` —— 这些已在词典里，别改它们的值。
- `src-main/i18n/err-keys.ts` 的 `IPC_ERROR_KEYS` **不需要**登记 `err.ql.*`：那份清单只用于「经 IPC 传 key、渲染时翻译」的结构化错误（`err-keys.ts:2-6`），快捷启动的错误是 `throw new Error(前缀 + t(...))` 的已译串。

## 措辞要求

- 终端标签（C3）en 逐字：`Windows PowerShell` / `PowerShell 7 (pwsh)` / `Command Prompt (cmd)` / `WSL`；zh 按规格 §10 的中文标签。
- `app.dialog.filterExe` 的措辞照既有 `app.dialog.filterModel`（`dict.ts:281` zh / `:561` en）与 `app.dialog.filterJinja`（:282 / :562）的风格（zh 例：`模型文件`；en 例：`Model files`）。
- 中英必须同时补齐：`src-main/i18n/dict.test.ts` 比对 zh/en 的 key 集合一致，只补一边会红。
- `no-hardcoded.test.ts` 的汉字硬门**排除 dict 文件**，所以词典里写中文是允许的；但**源码**（`quick-launch*.ts`、`main.ts`）里不得出现汉字字面量。

## E7（必须做，否则任务 6 的用例会红）

`src-main/ipc-ql.test.ts:373-374` 三条断言现在断的是**未翻译的 key 文本**（依赖「缺 key 返回 key 本身」）。词典落地后它们必红。改法：测试里 `import { t } from './i18n'`，期望值写成 `'VALIDATION: ' + t('err.ql.notFound', { id: key })`（`key-coverage` 的 `walk()` 排除 `.test.ts`，测试里写字面量 key 不触门）。

## 流程与门

- TDD：E1 先在 `src/i18n.test.ts` 写失败用例（含四条终端标签的字面量断言）→ E2 验证红（`npx vitest run src-main/i18n src/i18n.test.ts`）→ E3 补齐 → E4 绿。E5 的枚举断言、E6 的 grep 清零、E7 的修用例都要做。
- 回归门 G1/G2：`npx vitest run src-main/i18n src/i18n.test.ts` 与 `npx vitest run src-main/i18n/no-hardcoded.test.ts`；**另必须跑**：`npx vitest run src-main/quick-launch.test.ts src-main/quick-launch-config.test.ts src-main/ipc-ql.test.ts src/App.test.ts`（B3 改了三个源文件的错误构造路径，这些文件里有断前缀与断消息的用例）与 `npx tsc -p tsconfig.main.json --noEmit`。
- 范围：只碰 `src-main/i18n/dict.ts`、`src/i18n.test.ts`、`src-main/ipc-ql.test.ts`（仅 E7 那三条）、以及 B3 点名的三处调用点（**只改 key 的写法，不改任何行为/前缀/顺序**）。
- 把命令与真实输出填进 check 表 J 段；H 段不要执行——按 K5 你不 `git add`、不 commit。
- 报告写到 .superpowers/sdd/2026-10-10-quick-launch-card/task-08-report.md：加了哪些键（zh/en 计数）、17 处调用点的前后对照与 grep 结果、E7 的修法、每条 C/D 行的落点、自审与疑虑。
- 不派子代理。