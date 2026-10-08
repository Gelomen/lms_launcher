# 日志 i18n key 漂移修复 · 设计文档

> 日期：2026-10-08 ｜ 状态：待评审（访谈已定稿） ｜ 实现计划：[../plans/2026-10-08-i18n-key-drift.md](../plans/2026-10-08-i18n-key-drift.md)

## 1. 背景（以下均为代码事实）

用户报告：日志区出现 `[lms_launcher] log.app.update.found`，且中英文界面同样显示原始 key。

| # | 事实 | 证据 |
|---|---|---|
| F1 | 缺 key 的行为是「返回 key 本身」，与语言无关 → 中英文都露出原始 key；dev 下另有一条 `console.warn`，生产构建不打印 | `src/i18n.ts:30-36`、`src-main/i18n/index.ts:16-24`、`dict.ts` 的 `translate()` |
| F2 | 词典 zh/en 各 271 个 key，两侧集合完全一致（无漏翻译）。所以这不是「缺翻译」，是「调用点用了词典里不存在的名字」 | 对 `dict.ts` 的 key 集合做程序化比对 |
| F3 | 词典里定义的是 `log.app.update.{available,latest,dlStart,dlDone,dlFail,runFail}` 与 `log.app.llama.{done,fail}`；`src/App.vue` 用的是另一套名字（`found / downloading / downloadComplete / downloadFailed / complete / startFailed`） | `src-main/i18n/dict.ts:263-270`、`src/App.vue:183,203,205,227,249,259,272,307,311` |
| F4 | 漂移成因：App.vue 的 `log.app.update.found` 由 `c6d5232`（2026-10-04，S10 渲染端接入 t()）引入；词典的 `log.app.update.available` 由同日的 `8a19f8d`（S10 Task 2）加入。两个提交各写各的名字，没有接线 | `git log -S` 对两处符号的追溯 |
| F5 | 现有 i18n 守护拦不住：`dict.test.ts` 只断言 zh 与 en 的 key 集合一致——两侧**同时缺**该 key 时照样通过；`no-hardcoded.test.ts` 只断言字面量不含汉字 | `src-main/i18n/dict.test.ts:6-8`、`src-main/i18n/no-hardcoded.test.ts:138-148` |
| F6 | 上一轮 SDD 已把这条缺口记为遗留项：「无『词典占位符 ↔ 调用点参数』耦合守护 → 接线错误对测试套件完全不可见」 | `.superpowers/sdd/progress.md:69` |
| F7 | 反向证据：`log.app.update.available / dlStart / dlDone / dlFail / runFail`、`log.app.llama.done / fail`、`log.launcher.upd.scriptStarted` 在词典里定义齐全却全仓零调用——正是被漏掉的那批 | 对 `t()` 调用点的程序化扫描 |
| F8 | `App.vue:201-207` 的 `onLlamaComplete` 由 `UpdateModal` 的 `@llama-complete` 触发，属 **llama.cpp** 更新完成，不是应用自更新 → 它对应的词典条目是 `log.app.llama.{done,fail}`，不是 `log.app.update.*` | `src/App.vue:382`、`src/modules/UpdateModal.vue:56,277,284,290,313,322,327,333` |
| F9 | `log.app.llama.fail` 的占位符是 `{err}`，而 `App.vue:205` 传的是 `{ reason: … }` → 即使 key 改对，占位符也不会被替换（`translate()` 对缺失参数保留 `{err}` 原文） | `src-main/i18n/dict.ts:270`、`src/App.vue:205`、`dict.test.ts:24-26` |
| F10 | `main.ts:586` 用 `log.launcher.upd.started`，词典里是 `log.launcher.upd.scriptStarted`（同族其余条目 `wroteBootstrap / wscriptFallback / taskCreated …` 均存在且已接线） | `src-main/main.ts:586`、`src-main/i18n/dict.ts:187-193` |
| F11 | `main.ts:709,723,750` 用 `log.llama.ver.unknown` 作「`llama-server --version` 输出为空」的兜底文案；词典无此 key，但已有语义相同的 `common.unknown`（zh `未知` / en `unknown`） | `src-main/main.ts:709,723,750`、`dict.ts` 的 `common.unknown` |
| F12 | 动态 key 通道不是缺陷：`t(status.msg)`、`t(validateError)`、`t(fallbackKey)`、`t('tplModal.tip.' + k)` 都是传 key 或拼接，词典侧对应条目齐备；`err-keys.ts` 的具名常量由 `dict.test.ts:63-68` 的 `IPC_ERROR_KEYS` 守护 | `src/modules/DirModule.vue:112-113`、`src/modules/SettingsModal.vue:124`、`src/modules/TemplateModal.vue:136`、`src-main/i18n/err-keys.ts` |

## 2. 目标与非目标

**目标**
- G1 用户报告的日志行恢复为可读文案，中英文各自正确。
- G2 全部 9 处漂移调用点接到词典里**已存在**的 key，不新增任何文案。
- G3 补上 F5/F6 指出的守护缺口：静态 `t()` 调用点的 key 必须存在于词典，且调用点传的占位符名必须与词典值里的 `{name}` 一致。

**非目标**
- 不改词典的任何取值（zh 文案逐字保持，避免界面回归）。
- 不处理「词典里未被调用的 key」（72 条里多数经 `err-keys.ts` 常量或动态 key 使用，清理会误伤）。
- 不改 `translate()` 的缺 key 回退行为（返回 key 本身是刻意的调试友好设计，见 `src/i18n.ts:29`）。

## 3. 决策记录

| # | 议题 | 结论 | 理由 / 代价 |
|---|---|---|---|
| H1 | 改调用点还是补词典 | **改调用点**，接到词典既有 key | 词典侧 `available/dlStart/dlDone/dlFail/runFail/llama.done/llama.fail` 的取值与占位符已按语义写好（F3/F7），补词典等于同一句话存两份 |
| H2 | `App.vue:203/205` 归哪族 | 归 **llama.cpp** 族：`log.app.llama.done` / `log.app.llama.fail` | F8：调用点是 `@llama-complete` 回调，日志前缀应是 `llama.cpp`，不是 `LMS 启动器` |
| H3 | `log.app.llama.fail` 的占位符 | 调用点参数名由 `reason` 改为 **`err`**，词典不动 | F9；词典侧 `{err}` 与同族 `dlFail`/`runFail` 的写法一致 |
| H4 | `log.llama.ver.unknown` | 改用既有 `common.unknown`，不新增 key | F11：语义就是「未知」；新增 key 会让「未知」在词典里有两份 |
| H5 | 守护放哪 | 新建 `src-main/i18n/key-coverage.test.ts`，沿用 `no-hardcoded.test.ts` 的 walk + `failures` 汇总风格 | 与 `dict.test.ts`（词典自身一致性）、`no-hardcoded.test.ts`（零硬编码）职责不重叠：本文件只管「调用点 ↔ 词典」接线 |
| H6 | 守护的扫描范围 | 只扫**静态字面量 key**：`t('…')`、`hasKey('…')`、`errTextOf(x, '…')`、`errFromIpc(x, '…')`；动态 key 与 `err-keys.ts` 常量不在本文件范围 | F12：动态通道由 `hasKey()` 回退与 `IPC_ERROR_KEYS` 测试各自守住；扩到常量引用需要类型信息，收益不抵复杂度 |
| H7 | 占位符守护的强度 | 只比对「字面量 key + 简单对象字面量参数」这一形态；参数是变量、spread 或计算键时**跳过**（不误报） | 覆盖本次全部真实缺陷（F9）；代价：`t(key, someObj)` 这类间接传参仍无保护，已知局限记此 |

## 4. 行为规格

| 场景 | 期望 |
|---|---|
| 启动时静默检查发现新版本（`App.vue:183`） | 日志 `LMS 启动器 · 发现新版本 v{version}` / `LMS Launcher · New version v{version} available` |
| 手动「检查更新」发现新版本（`App.vue:227`） | 同上 |
| 开始下载自更新包（`App.vue:249`） | `LMS 启动器 · 开始下载新版本…` |
| 自更新包下载完成（`App.vue:259`） | `LMS 启动器 · 下载完成` |
| 自更新包下载失败（`App.vue:272`） | `LMS 启动器 · 更新下载失败 · {reason}`，`{reason}` 被三通道解析出的原因替换 |
| 启动更新脚本失败（`App.vue:307/311`） | `LMS 启动器 · 启动更新失败 · {err}` |
| llama.cpp 更新完成（`App.vue:203`） | `llama.cpp 更新完成` |
| llama.cpp 更新失败（`App.vue:205`） | `llama.cpp 更新失败 · {err}，稍后再试`，`{err}` 被替换（H3） |
| `run_update` 已启动更新脚本（`main.ts:586`） | `LMS 启动器 · 更新 · 已启动更新脚本，应用即将退出` |
| `llama-server --version` 输出为空（`main.ts:709/723/750`） | 版本位显示 `未知` / `unknown` |
| 新增一处 `t('未登记的 key')` | `key-coverage.test.ts` 当场失败，报出 key 与 `file:line` |
| 调用点占位符名与词典不符（如 `{reason}` vs `{err}`） | 同一测试失败，报出两侧的差异 |

## 5. 契约：调用点 → 词典 key 的逐字映射

| 调用点 | 现用 key（词典无） | 改为 | 词典 zh 取值（不改） |
|---|---|---|---|
| `src/App.vue:183`、`:227` | `log.app.update.found` | `log.app.update.available` | `LMS 启动器 · 发现新版本 v{version}` |
| `src/App.vue:249` | `log.app.update.downloading` | `log.app.update.dlStart` | `LMS 启动器 · 开始下载新版本…` |
| `src/App.vue:259` | `log.app.update.complete` | `log.app.update.dlDone` | `LMS 启动器 · 下载完成` |
| `src/App.vue:272` | `log.app.update.downloadFailed` | `log.app.update.dlFail` | `LMS 启动器 · 更新下载失败 · {reason}` |
| `src/App.vue:307`、`:311` | `log.app.update.startFailed` | `log.app.update.runFail` | `LMS 启动器 · 启动更新失败 · {err}` |
| `src/App.vue:203` | `log.app.update.downloadComplete` | `log.app.llama.done` | `llama.cpp 更新完成` |
| `src/App.vue:205` | `log.app.update.downloadFailed` | `log.app.llama.fail`（参数 `reason` → `err`） | `llama.cpp 更新失败 · {err}，稍后再试` |
| `src-main/main.ts:586` | `log.launcher.upd.started` | `log.launcher.upd.scriptStarted` | `LMS 启动器 · 更新 · 已启动更新脚本，应用即将退出` |
| `src-main/main.ts:709`、`:723`、`:750` | `log.llama.ver.unknown` | `common.unknown` | `未知` |

参数名与词典占位符的对应（守护据此断言）：`available`→`{version}`、`dlFail`→`{reason}`、`runFail`→`{err}`、`llama.fail`→`{err}`、`scriptStarted`→无参、`common.unknown`→无参。

## 6. 验收

- V1 新守护在改动**之前**即失败，清单恰为 §5 的 13 处调用点（9 个 key）——证明它有牙。实测：用例 1 报出 `main.ts:586,709,723,750` 与 `App.vue:183,203,205,227,249,259,272,307,311`，无其他误报（`t('tplModal.tip.' + k)` 这类拼接由「闭合引号后必须是 , 或 )」的约束排除）。
- V1b 占位符用例以「词典命中」为前提，因此在 key 接通之后才红：实测它当场报出 `App.vue:205` 的 `passed=[reason]` vs `zh/en=[err]`；参数名改为 `err` 后转绿。两条用例各自见过一次真实的红。
- V2 改动之后守护通过，`npx vitest run` 全绿（`%TEMP%` EBUSY 属已知环境噪声，见 `​.superpowers/sdd/progress.md:77`，遇到重跑）。
- V3 `npx tsc -p tsconfig.main.json` 无错（渲染端由 vite 构建覆盖）。
- V4 词典 `dict.ts` 与 `dict.test.ts` 的既有取值一字未改（`git diff` 中不出现）。
