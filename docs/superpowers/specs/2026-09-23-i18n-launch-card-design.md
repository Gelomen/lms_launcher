# LMS 启动器 i18n S3 · 启动控制卡片 规格

**日期：** 2026-09-23
**分支：** feat/i18n
**状态：** 已定稿（grill-me 2026-09-23 逐问定稿）
**性质：** 有界分片的轻量规格（单文件、零 IPC、零新依赖、零新 scope——launch 已在 §3.2 白名单）；设计权威 `2026-09-22-i18n-design.md` 与分片全表 `2026-09-22-i18n-slices.md` 不变量（§3.1 词典契约 / §3.2 key 命名 / §3.5 不回改 / §3.6 英文规则 / §3.7 测试）继续适用。

---

## 1. 目标与边界

- **只改一个组件**：`src/modules/LaunchBar.vue`（+ `src-main/i18n/dict.ts` 入词典、`src/modules/LaunchBar.test.ts` 补 en 冒烟）。
- **不碰 `src/App.vue`**（文件冲突规则：App.vue 由 S1/S8/S10 串行）；不碰 `TemplateModule.vue`（空态同款中文「暂无模板配置」归 S4）；不动 `src/components/Dropdown.vue`（placeholder 由父级传入，本分片仅在 LaunchBar 侧改绑 key）。
- 覆盖 3 处文案：卡片标题、配置下拉两个 placeholder（选择配置 / 暂无模板配置）。
- **范围收缩（grill-me Q4 定稿）**：分片卡原目标含「启动/停止按钮 aria」；S3 **不加** aria-label，纯图标按钮保持现状（用户定稿，见 §9 决策台账第 4 条）。

## 2. key 契约（3 key，scope = launch，已登记于 §3.2 白名单）

| key | zh | en | 使用处 |
|---|---|---|---|
| `launch.title` | `llama-server 启动控制` | `Launch llama-server` | h2 标题 |
| `launch.placeholder.select` | `选择配置…`（全角 …） | `Select a config...`（半角三点） | 下拉 trigger 占位（有配置表、无选中项） |
| `launch.placeholder.empty` | `暂无模板配置` | `No templates` | 下拉 trigger 占位（MISSING 或配置表为空） |

- zh 值 = 现状字符串**逐字不变**（中文布局冻结 + 零回归），含全角省略号 …。
- 英文定稿（grill-me 2026-09-23）：
  1. 标题 `Launch llama-server`（用户指定动词开头，Q1；zh 语义「启动控制」含停止，en 取卡片操作区定位，不逐词硬译）。
  2. `Select a config...` 不定冠词 + 短名词；省略号**半角三点**（Q6，对齐 S2 `Saving...` 与 §3.6 `Checking...` 先例，术语表「英文标点半角」）。
  3. `No templates` 对齐 S0 `tray.tooltip.empty` 的 en 值（两处同文案、同 en 措辞，但 key 各归各 scope——Q3）。
- **同文案双 key 说明**：`launch.placeholder.empty`（zh 暂无模板配置）与 S0 `tray.tooltip.empty` 中文同串、en 同值，属「卡片 scope 自治 vs 跨 scope 引用」的有意取舍（Q3 定稿）：launch 卡片不引用 tray scope，托盘不引用 launch scope；两 key 均有实际使用处，不违反「词典不留死 key」（S0 先例）。TemplateModule 空态（S4）届时**新增** tpl scope 自有 key，不复用 launch。

## 3. 行为变更：模板 t() 即时重译

- h2 标题改 `{{ t('launch.title') }}`。
- placeholder 三元表达式两分支改绑 key：条件 `missing || (configs !== null && Object.keys(configs).length === 0)` 不变，两值改 `t('launch.placeholder.empty')` / `t('launch.placeholder.select')`。
- 两 placeholder 均为**渲染时即时** t()（无存 key 的 ref 状态，比 S2 更简单——切换语言时若处于对应窗口期即显示新语言）。
- 下拉选项 label / tooltip 为**用户数据**（模板名），不译（§1.2 数据边界）；`pushTrayTooltip` 推送完整名给主进程，主进程空占位仍走 S0 `tray.tooltip.empty`，S3 不改 IPC。
- stopping 态按钮内的字面量三点（半角，禁用占位）语言中性，**不译不动**（非词典条目）。
- `launch.title` 含 `llama-server` 专名（§1.2 不译），en 值内原文保留。

## 4. 不译边界（本分片）

- `llama-server` 专名；模板名（用户数据，选项 label / tooltip / 托盘推送）；选项值；stopping 态三点字面量。
- 词典不留死 key：3 个 key 全部有实际使用处。

## 5. 测试策略（§3.7）

- `src/test-setup.ts` 已固定 zh；`LaunchBar.test.ts` 现有 8 条用例（截断 4 + 托盘同步 3 + 短名 1）**不动**（zh 下 t() 返回值 = 原字符串，断言天然不破）。
- 新增 en 冒烟 3 条（独立 describe，`applyLangLocal('en')`，afterEach 还原 zh，模式对齐 `DirModule.test.ts` S2 同款）：
  1. 标题 en：mount → h2 文本 = `Launch llama-server`。
  2. 空态 en：`mockLms({})`（get_configs resolve 空表）→ load 后 options 空 → trigger 占位 = `No templates`（此路径 mock 已 resolve，组件可达，渲染级断言）。
  3. 选择态 en：**底线断言 = `expect(t('launch.placeholder.select')).toBe('Select a config...')`**。
     说明：选择态 placeholder 仅存在于初始 load 完成前（configs === null），load 后必然自动选中第一项或落入空态；渲染级触发需 pending-promise mock，价值低，取 t() 直断（S2 保存中同款底线）；zh 侧 选择配置… 由 S0 词典一致性测试兜底。
- 词典一致性单测（S0 已有）自动覆盖 3 新 key 的 zh/en 集合相等与无空值。
- 结束跑 `npm test` 全绿。

## 6. 英文布局（§3.6，人工验收项）

- launch 卡片位于 350px 中列（style.css 三列 280/350/300px 冻结）：
  - 标题 `Launch llama-server` ≈ 19 半角字符，h2 字号内安全；
  - placeholder `Select a config...` ≈ 18 半角字符，13px 级控件内安全，与下拉右侧按钮同行不溢出。
- 预期无需 html[lang="en"] 作用域覆盖；**人工英文目视验收**为验收项（与 S1/S2 同款留待用户执行）。

## 7. 验收点

1. 设置切 en：标题 / 两 placeholder 全部变英文；切回 zh 恢复原中文（含全角 …）。
2. 下拉选项长名截断 + tooltip 行为在 en 下与 zh 完全一致（截断按视觉宽度，语言无关）。
3. 托盘 hover 空占位仍是 S0 `tray.tooltip.empty` 值（en 下 `No templates`），S3 不改变其来源。
4. `LaunchBar.test.ts` 现有 8 条用例 + 新增 3 条 en 冒烟全绿；`npm test` 全绿。
5. zh 界面零回归（3 处 zh 文案逐字不变）。
6. en 下 launch 卡片不溢出（人工）。

## 8. 风险

| # | 风险 | 处置 |
|---|---|---|
| R1 | 空态双 key（launch.placeholder.empty / tray.tooltip.empty）文案漂移 | en 值刻意对齐 No templates；词典一致性测试管 key 集合不管值——分片卡「遗留」记录 S4/S10 复查同文案 key 对齐 |
| R2 | 选择态 placeholder 无渲染级 en 断言 | 底线 t() 直断（§5.3）；该窗口期在真实 UI 中仅 load 前瞬态，风险可接受 |
| R3 | 未来 S4 TemplateModule 空态误引 launch key | 分片卡已注明 S4 新增 tpl 自有 key，不复用 launch |

## 9. 决策台账（grill-me 2026-09-23）

1. 标题英文 = Launch llama-server（Q1，用户指定动词开头）。
2. 选择态 placeholder 英文 = Select a config...（Q2 + Q6，半角三点）。
3. 空态新 key launch.placeholder.empty，不复用 tray scope；en 对齐 No templates（Q3）。
4. **不加启动/停止按钮 aria-label**，纯图标按钮保持现状（Q4 范围收缩，偏离分片卡原目标）。
5. en 冒烟 3 条：标题 + 空态渲染级 + 选择态 t() 直断底线（Q5）。
6. zh 3 值逐字不变；stopping 态三点字面量不译不动。

