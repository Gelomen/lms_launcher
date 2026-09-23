# LMS 启动器 i18n S4 · 模板管理卡片 规格

**日期：** 2026-09-24
**分支：** feat/i18n
**状态：** 已定稿（grill-me 2026-09-24 逐问定稿）
**性质：** 有界分片的轻量规格（单文件、零 IPC、零新依赖、零新 scope——tpl 已在 §3.2 白名单）；设计权威 `2026-09-22-i18n-design.md` 与分片全表 `2026-09-22-i18n-slices.md` 不变量（§3.1 词典契约 / §3.2 key 命名 / §3.5 不回改 / §3.6 英文规则 / §3.7 测试）继续适用。

---

## 1. 目标与边界

- **只改一个组件**：`src/modules/TemplateModule.vue`（+ `src-main/i18n/dict.ts` 入词典、`src/modules/TemplateModule.test.ts` 补 en 冒烟）。
- **不碰**：`src/App.vue`（文件冲突规则：App.vue 由 S1/S8/S10 串行）、`src/modules/TemplateModal.vue`（弹窗内文案含弹窗标题「新建模板」归 S5 `tplModal` scope）、`src/modules/VramDialog.vue`（归 S9）、`src/style.css`、`src/components/Dropdown.vue`。
- 覆盖 8 处文案：卡片标题、新建/复制/编辑 3 个图标按钮（tooltip 与 aria 同值）、VRAM 按钮 tooltip（已配置/未配置两形态）与 aria、两态空态（MISSING / 空表）。

## 2. key 契约（9 key，scope = tpl，已登记于 §3.2 白名单）

| key | zh | en | 使用处 |
|---|---|---|---|
| `tpl.title` | `启动参数模板` | `Flag templates` | h2 标题 |
| `tpl.btn.new` | `新建模板` | `New template` | 新建按钮 data-tooltip + aria-label（同值） |
| `tpl.btn.copy` | `复制` | `Copy` | 行复制按钮 data-tooltip + aria-label（同值） |
| `tpl.btn.edit` | `编辑` | `Edit` | 行编辑按钮 data-tooltip + aria-label（同值） |
| `tpl.vram.aria` | `显卡显存设置` | `Set VRAM` | VRAM 按钮 aria-label |
| `tpl.vram.tip.value` | `显卡显存: {v}` | `VRAM: {v}` | VRAM 按钮 tooltip（已配置；{v} = `24 GB` 形态，半角冒号+空格） |
| `tpl.vram.tip.unset` | `显卡显存: 未配置` | `VRAM not set` | VRAM 按钮 tooltip（未配置；半角冒号+空格） |
| `tpl.empty.missing` | `暂无模板配置` | `No templates` | 列表空态（`llama_launch_configs.yaml` MISSING） |
| `tpl.empty.none` | `暂无配置` | `No templates` | 列表空态（表存在但为空） |

- zh 值 = 现状字符串**逐字不变**（中文布局冻结 + 零回归）。注意现状 tooltip 拼接为 `'显卡显存: ' + …`——**半角冒号 + 空格**，en 同构 `VRAM: {v}`。
- 英文定稿（grill-me 2026-09-24）：
  1. 标题 `Flag templates`（Q1，用户指定：配置即 llama-server 启动 flag 参数；llama.cpp 英文社区称 CLI 参数为 flags，领域精确；与 en 侧 templates 词系——`No templates` / `New template`——一致）。
  2. 按钮 `New template` / `Copy` / `Edit`（Q3；非定宽 UI，不受「最短动词」弹窗按钮约束）。
  3. VRAM tooltip 整句两 key + {v} 插值（Q2）；aria 独立 key `Set VRAM`（Q5，动作语义与状态句解耦）。
  4. 空态两分支 en 均 `No templates`（Q4；UI 状态等价，zh 保持现状两串）。
- **同文案多 key 对齐**（S3 规格 R1/R3 的复查点，本分片落实）：en 下 `tray.tooltip.empty` / `launch.placeholder.empty` / `tpl.empty.missing` 三 key 同值 `No templates`；zh 前两者与 `tpl.empty.missing` 同串 `暂无模板配置`。三 key 均有实际使用处，不违反「词典不留死 key」；词典一致性测试管 key 集合不管值——值对齐由本规格 §7 验收点 4 与人工验收兜底。

## 3. 行为变更：模板 t() 即时重译

- h2 标题 → `{{ t('tpl.title') }}`。
- 三个按钮 `data-tooltip` / `aria-label` 各绑对应 btn key（两属性同表达式）。
- VRAM 按钮：
  - `data-tooltip` → `vramTotal !== undefined ? t('tpl.vram.tip.value', { v: vramTotal + ' GB' }) : t('tpl.vram.tip.unset')`；
  - `aria-label` → `t('tpl.vram.aria')`；
  - 按钮**正文**（`24 GB` / `VRAM`）语言中性，**不译不动**（数字 + 单位，§1.2 边界）。
- 两态空态 `<p class="label">` 分别绑 `tpl.empty.missing` / `tpl.empty.none`；分支条件（`missing && error` / `configs && length === 0`）不动。
- 全部 8 处均为**渲染时即时** t()（无存 key 的 ref 状态——比 S2 状态行更简单，切换语言即重译）。
- 不改 IPC：本分片不新增/修改任何 invoke 调用。

## 4. 不译边界（本分片）

- 模板名（用户数据：行名截断、`.tpl-tip` 长名浮层、复制命名 `- copy` 后缀）——截断按视觉宽度，语言无关。
- `VRAM` / `GB` 专名与单位；badge 正文 `24 GB`。
- 复制命名逻辑中的英文字面量 `- copy`（用户数据生成规则，2026-08-30 spec 定稿，非 UI 文案，不译）。
- 词典不留死 key：9 个 key 全部有实际使用处。

## 5. 测试策略（§3.7）

- `src/test-setup.ts` 已固定 zh；`TemplateModule.test.ts` 现有 12 条 zh 用例**不动**（zh 下 t() 返回值 = 原字符串，断言天然不破；其中「新建模板」相关的弹窗标题断言落在 TemplateModal 侧，S5 才动，本分片不受影响）。
- 新增 en 冒烟 6 条（Q6 + Q8，独立 describe `TemplateModule en 冒烟`，`applyLangLocal('en')`，afterEach 还原 zh，模式对齐 DirModule/LaunchBar 同款；mock 复用既有 `window.lms` 注入模式，get_configs/get_params/get_app_config 按用例控制）：
  1. **标题**：mount → `h2` 文本 = `Flag templates`。
  2. **新建按钮**：data-tooltip = aria-label = `New template`。
  3. **行按钮**：复制按钮 data-tooltip = aria-label = `Copy`，编辑按钮 = `Edit`。
  4. **VRAM 已配置**：get_app_config resolve `{ vram_total_gb: 24 }` → tooltip = `VRAM: 24 GB`，aria = `Set VRAM`，badge 正文 = `24 GB`。
  5. **VRAM 未配置**：get_app_config resolve 无 `vram_total_gb` → tooltip = `VRAM not set`，badge 正文 = `VRAM`。
  6. **空态（两形态渲染级，Q8）**：空表 mock（resolve `{}`）→ `No templates`（tpl.empty.none 路径）；`get_configs` reject `new Error('MISSING: llama_launch_configs.yaml')`（errMsg 剥壳 + isMissing 包含匹配，与组件 catch 分支同路径）→ `No templates`（tpl.empty.missing 路径）。
- 词典一致性单测（S0 已有）自动覆盖 9 新 key 的 zh/en 集合相等与无空值。
- 结束跑 `npm test` 全绿。

## 6. 英文布局（§3.6，人工验收项）

- tpl 卡片位于 style.css 冻结列（280/350/300px 三列）：
  - 标题 `Flag templates` ≈ 14 半角字符，短于已验收的 S3 标题（19 字符），h2 安全；
  - `New template` / `Copy` / `Edit` / `VRAM: 24 GB` 均为悬浮 tooltip（`.icon-btn::after` / `.tip-up::after`，非定宽容器），无溢出风险；
  - `No templates` 空态为 `<p class="label">`，与现状 `暂无模板配置`（6 CJK 字）宽度同级，安全。
- 预期无需 html[lang="en"] 作用域覆盖；**人工英文目视验收**为验收项（与 S1/S2/S3 同款留待用户执行）。

## 7. 验收点

1. 设置切 en：标题 / 3 按钮 tooltip+aria / VRAM tooltip+aria / 两态空态全部变英文；切回 zh 恢复原中文逐字。
2. 行名截断 + `.tpl-tip` 长名浮层在 en 下与 zh 行为完全一致（语言无关逻辑，零改动）。
3. badge 正文（`24 GB` / `VRAM`）与复制命名 `- copy` 后缀两语言下不变。
4. 空态三 key 值对齐：en 下 `tray.tooltip.empty` / `launch.placeholder.empty` / `tpl.empty.missing` 显示一致（`No templates`）；zh 下三处均 `暂无模板配置`（人工 + S10 复查时核对，S3 R1 遗留闭合）。
5. `TemplateModule.test.ts` 现有 12 条 zh + 新增 6 条 en 冒烟全绿；`npm test` 全绿；`npm run build` 通过。
6. zh 界面零回归（8 处 zh 文案逐字不变）。
7. en 下 tpl 卡片不溢出（人工）。

## 8. 风险

| # | 风险 | 处置 |
|---|---|---|
| R1 | 同文案多 key（空态三 key）值漂移 | en 刻意对齐 `No templates`；验收点 4 人工核对；S10 复查同文案 key 时一并覆盖 |
| R2 | `- copy` 复制命名后缀与 UI 文案边界误判 | 该后缀是用户数据生成规则（2026-08-30 spec 定稿），非 UI 硬编码文案，本分片不动、不译，规格 §4 明示 |
| R3 | VramDialog / TemplateModal 内「显卡显存」「新建模板」同款文案误入 S4 | 分片边界 §1 明示：弹窗内文案归 S5（tplModal）/ S9（vram）；S4 只绑卡片本体 8 处 |

## 9. 决策台账（grill-me 2026-09-24）

1. 标题 en = `Flag templates`（Q1，用户指定 flag 语义；备选 `Launch flag templates` / `Parameter templates` 否决）。
2. VRAM tooltip 整句两 key + `{v}` 插值，半角冒号+空格（Q2）。
3. 按钮 `New template` / `Copy` / `Edit`，tooltip 与 aria 同值（Q3）。
4. 空态两分支 en 均 `No templates`，zh 保持现状两串（Q4）。
5. VRAM aria 独立 key `Set VRAM`（Q5，动作语义与状态句解耦）。
6. en 冒烟 6 条，全部渲染级（Q6 + Q8：MISSING 态经 reject mock 渲染级触达，不留 t() 直断底线）。
7. 9 key 契约按 Q7 表定稿，scope = tpl 自治（不挪 common）。
8. zh 8 值逐字不变；badge 正文与 `- copy` 后缀不译不动。
