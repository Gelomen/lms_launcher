# LMS 启动器 i18n S2 · 目录卡片 规格

**日期：** 2026-09-23
**分支：** feat/i18n
**状态：** 已定稿（grill-me 2026-09-23 逐问定稿）
**性质：** 有界分片的轻量规格（单文件、零 IPC、零新依赖、零新 scope）；设计权威 `2026-09-22-i18n-design.md` 与分片全表 `2026-09-22-i18n-slices.md` 不变量（§3.1 词典契约 / §3.2 key 命名 / §3.5 不回改 / §3.6 英文规则 / §3.7 测试）继续适用。

---

## 1. 目标与边界

- **只改一个组件**：`src/modules/DirModule.vue`（+ `src-main/i18n/dict.ts` 入词典、`src/modules/DirModule.test.ts` 补 en 冒烟）。
- **不碰 `src/App.vue`**（文件冲突规则：App.vue 由 S1/S8/S10 串行）。App.vue:107 的「目录校验 · …」sys 日志行同款中文**延后 S10** 一并 t() 化；S2 完成时该行保持原中文（日志行按 §3.5 本就不回改，zh 下零回归）。
- 覆盖 6 处文案：卡片标题、选择目录按钮 tooltip+aria、4 态状态行（ok / exe_missing / dir_missing / unset 无文案）、保存中。

## 2. key 契约（6 key，scope = dir，已登记于 §3.2 白名单）

| key | zh | en | 使用处 |
|---|---|---|---|
| `dir.title` | `llama.cpp 安装目录` | `llama.cpp directory` | `<h2>` 标题 |
| `dir.btn.select` | `选择 llama.cpp 安装目录` | `Select directory` | 选择按钮 `data-tooltip` + `aria-label`（同一 key 两处绑定） |
| `dir.status.ok` | `llama-server.exe 已找到` | `llama-server.exe is available` | 校验通过 / 启动检测 ok |
| `dir.status.exe_missing` | `未找到 llama-server.exe` | `llama-server.exe not found` | 校验失败 / 启动检测 exe_missing |
| `dir.status.dir_missing` | `llama.cpp 安装目录不存在` | `llama.cpp directory doesn't exist` | 启动检测 dir_missing |
| `dir.status.saving` | `保存中…` | `Saving...` | 保存进行中的恒定槽位行 |

- zh 值 = 现状字符串**逐字不变**（中文布局冻结 + 零回归）。
- 英文定稿（grill-me 2026-09-23）：
  1. 标题按术语表 §2「llama.cpp 安装目录 → llama.cpp directory」。
  2. 按钮 tooltip/aria 缩短为 `Select directory`（按钮紧邻卡片标题，语境足够；tooltip 与 aria 同源同 key）。
  3. ok 态用 `is available`（用户指定，弱化与 not found 的机械对称）。
  4. exe_missing 与 ok 同主语 `llama-server.exe`，用 `not found`（术语表「未找到 → Not found」小写适配句内）。
  5. dir_missing 用 `doesn't exist`（贴合「不存在」语义，不并入 not found 句式；单引号在 TS 字符串中正常转义）。
  6. 保存中用半角三点 `Saving...`（与 §3.6 `Checking...` 半角风格一致，不用 … 字符）。

## 3. 行为变更：状态行存 key、模板 t() 即时重译

- `status` ref 的 msg 语义由「渲染后中文串」改为**词典 key**（类型签名 `{ ok: boolean; msg: string }` 不变，仅语义约定 + 注释）：
  - `validate()`：ok → `{ ok: true, msg: 'dir.status.ok' }`；失败 → `{ ok: false, msg: 'dir.status.exe_missing' }`。
  - `onStartupLlamaCheck` 4 态映射：ok → `dir.status.ok`、exe_missing → `dir.status.exe_missing`、dir_missing → `dir.status.dir_missing`、unset → `null`（修饰段与事件枚举同名，映射处 `chk → dir.status.<chk>` 可读）。
- 模板恒定槽位：`✓ {{ t(status.msg) }}` / `✗ {{ t(status.msg) }}`；保存中行 `{{ t('dir.status.saving') }}`。
- 切语言后**已显示**的状态行自动重译（与 S0 校验报错「存 key、渲染时即时重译」模式、§3.5 弹窗例外同款）。
- ✗/✓ 符号、`llama-server.exe` / `llama.cpp` 专名在词典值内原文保留（§1.2 不译边界）。
- `error` 行（`errMsg(e)` 透传）**不译**，与 S0 `ioError` 同惯例（IO 错误非译透传）。

## 4. 不译边界（本分片）

- `llama-server.exe`、`llama.cpp` 专名；`✓` / `✗` 符号；用户输入的目录路径（`<input v-model="dir">`）不译。
- 词典**不留死 key**（S0 先例）：6 个 key 全部有实际使用处。

## 5. 测试策略（§3.7）

- `src/test-setup.ts` 已固定 zh；`DirModule.test.ts` 现有 5 条中文断言**不动**（zh 下 t() 返回值 = 原字符串，断言天然不破）。
- 新增 en 冒烟 6 条（独立 describe，`applyLangLocal('en')` 后断言，describe 内 afterEach/末尾还原 zh）：
  1. ok 态 en：`✓ llama-server.exe is available`
  2. exe_missing 态 en：`✗ llama-server.exe not found`
  3. dir_missing 态 en：`✗ llama.cpp directory doesn't exist`
  4. unset 态 en：无任何状态行（与 zh 行为一致，防 en 下误显）
  5. 标题 + 按钮 en：`h2` 文本含 `llama.cpp directory`，按钮 `data-tooltip` = `aria-label` = `Select directory`
  6. 保存中 en：mock `save_llama_dir` 挂起（pending promise），断言槽位行 = `Saving...`（zh 的 `保存中…` 由词典一致性测试兜底）
- 词典一致性单测（S0 已有）自动覆盖 6 新 key 的 zh/en 集合相等与无空值。
- 结束跑 `npm test` 全绿。

## 6. 英文布局（§3.6，人工验收项）

- dir 卡片列宽 280px（`style.css` 三列冻结）。英文最长文本预算：
  - 标题 `llama.cpp directory` ≈ 19 半角字符，h2 字号内安全；
  - dir_missing 行 `✗ llama.cpp directory doesn't exist` ≈ 35 半角字符，13px 级行内 ≈ 230px < 280px 卡片内宽，安全。
- 预期无需 `html[lang="en"]` 作用域覆盖；**人工英文目视验收**为验收项（与 S1 同款留待用户执行）。

## 7. 验收点

1. 设置切 en：标题 / 按钮 tooltip+aria / 4 态状态行 / 保存中 全部变英文；切回 zh 恢复原中文（含 … 全角省略号）。
2. 校验成功保存瞬间槽位行显示 `Saving...`（en）/ `保存中…`（zh）。
3. 启动检测 4 态与选目录校验 4 态文案同槽位同重译行为（存 key 后二者自动一致）。
4. `DirModule.test.ts` 现有 5 条 zh 断言 + 新增 6 条 en 冒烟全绿；`npm test` 全绿。
5. zh 界面零回归（6 处 zh 文案逐字不变）。
6. en 下 dir 卡片不溢出（人工）。

## 8. 风险

| # | 风险 | 处置 |
|---|---|---|
| R1 | status.msg 语义从字符串变 key，未来误存渲染串 | 类型签名不变但加注释；en 冒烟第 1–3 条直接断言渲染值，回归即破 |
| R2 | App.vue 日志行与卡片状态行短期不同语言（en 环境日志行暂为中文） | 设计可接受：日志按 §3.5 不回改；S10 完成后彻底收敛，S10 分片卡需回记此遗留 |
| R3 | en 标题/状态行超 280px 卡片 | §6 预算估算安全；人工验收兜底 |

## 9. 决策台账（grill-me 2026-09-23）

1. 状态行存 key、模板 t() 即时重译（与 S0 模式一致）。
2. App.vue:107 目录校验日志行延后 S10，S2 严格单文件。
3. 英文 6 条照 §2 表定稿（ok = is available；dir_missing = doesn't exist；saving = Saving... 半角）。
4. key 6 条照 §2 表定稿（status 修饰段对齐事件枚举 ok/exe_missing/dir_missing）。
5. 测试：既有 5 条 zh 不动 + 新增 6 条 en 冒烟。
