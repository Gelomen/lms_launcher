# LMS 启动器 i18n S4 · 模板管理卡片 实现计划

**日期：** 2026-09-24
**规格：** `specs/2026-09-24-i18n-template-card-design.md`（决策与文案权威，本计划冲突时以规格为准）
**分支：** feat/i18n
**前置：** S0 基座已落地（`t()` / `dict` / `test-setup.ts` 固定 zh）；S1/S2/S3 已完成。
**涉及文件：** `src-main/i18n/dict.ts`、`src/modules/TemplateModule.vue`、`src/modules/TemplateModule.test.ts`。**不碰 App.vue / TemplateModal.vue / VramDialog.vue / style.css / Dropdown.vue。**

> TDD 节奏：任务 1–2 先写测试看红再实现；任务 3 后 `npm test` 必须全绿（既有 12 条 zh + 新 6 条 en + 词典一致性 + 全库其余）。
> commit 风格：`feat(i18n): …（S4）`，每任务独立提交（对齐 S1–S3 历史）。

---

## 任务 1 · 词典入 9 个 tpl.* key

**文件：** `src-main/i18n/dict.ts`

1. `zh` 表追加（值 = TemplateModule.vue 现状字符串**逐字不变**；注意 tooltip 是**半角**冒号+空格 `显卡显存: `）：
   - `'tpl.title': '启动参数模板'`
   - `'tpl.btn.new': '新建模板'`
   - `'tpl.btn.copy': '复制'`
   - `'tpl.btn.edit': '编辑'`
   - `'tpl.vram.aria': '显卡显存设置'`
   - `'tpl.vram.tip.value': '显卡显存: {v}'`
   - `'tpl.vram.tip.unset': '显卡显存: 未配置'`
   - `'tpl.empty.missing': '暂无模板配置'`
   - `'tpl.empty.none': '暂无配置'`
2. `en` 表追加：
   - `'tpl.title': 'Flag templates'`
   - `'tpl.btn.new': 'New template'`
   - `'tpl.btn.copy': 'Copy'`
   - `'tpl.btn.edit': 'Edit'`
   - `'tpl.vram.aria': 'Set VRAM'`
   - `'tpl.vram.tip.value': 'VRAM: {v}'`
   - `'tpl.vram.tip.unset': 'VRAM not set'`
   - `'tpl.empty.missing': 'No templates'`
   - `'tpl.empty.none': 'No templates'`
3. 验证：`npx vitest run` 中词典一致性测试（zh/en key 集合相等、无空值）自动覆盖。

**提交：** `feat(i18n): 词典新增模板管理卡片 tpl.* 9 key（S4）`

## 任务 2 · en 冒烟测试先行（红）

**文件：** `src/modules/TemplateModule.test.ts`（追加，不动既有 12 条 zh 用例）

1. 顶部 import：`import { t, applyLangLocal } from '../i18n';`
2. 新增独立 `describe('TemplateModule en 冒烟', …)`，**afterEach 还原 zh**（`applyLangLocal('zh')` + unmount 清理），防污染同文件既有用例（S2/S3 同款）。
3. mock 辅助：本地 `stubLmsEn(over)`——`get_configs` / `get_params` / `get_app_config` 按用例覆盖（`get_app_config` resolve `{ llama_dir: 'x' }` 或带 `vram_total_gb: 24`；MISSING 用例 `get_configs` 改为 `Promise.reject(new Error('MISSING: llama_launch_configs.yaml'))`）。
4. 用例（规格 §5，6 条，全部渲染级）：
   - 标题：mount + flush → `w.find('h2').text()` = `Flag templates`
   - 新建按钮：`[data-tooltip='New template']` 存在且 aria-label = `New template`
   - 行按钮：行内 `data-tooltip` 分别 = `Copy` / `Edit`（aria 同值）
   - VRAM 已配置：get_app_config 带 `vram_total_gb: 24` → `w.find('.vram-badge')` 的 data-tooltip = `VRAM: 24 GB`、aria-label = `Set VRAM`、text = `24 GB`
   - VRAM 未配置：get_app_config 无 vram_total_gb → data-tooltip = `VRAM not set`、text = `VRAM`
   - 空态两形态：resolve `{}` → 卡片内 label 文本含 `No templates`；reject MISSING → 同断言（`tpl.empty.missing` 路径）
5. 此时 `npm test` 预期**红**（组件仍输出中文串）。

**提交：** `test(i18n): TemplateModule en 冒烟 6 条先行（S4）`

## 任务 3 · TemplateModule.vue 接入 t()

**文件：** `src/modules/TemplateModule.vue`

1. `import { t } from '../i18n';`
2. 模板 8 处：
   - h2 → `{{ t('tpl.title') }}`
   - 新建按钮 `data-tooltip` / `aria-label` → `t('tpl.btn.new')`
   - 复制按钮 → `t('tpl.btn.copy')`；编辑按钮 → `t('tpl.btn.edit')`
   - VRAM 按钮：`data-tooltip` → `vramTotal !== undefined ? t('tpl.vram.tip.value', { v: vramTotal + ' GB' }) : t('tpl.vram.tip.unset')`；`aria-label` → `t('tpl.vram.aria')`；**正文三元不动**（`24 GB` / `VRAM` 语言中性）
   - 两态空态 `<p class="label">` → `{{ t('tpl.empty.missing') }}` / `{{ t('tpl.empty.none') }}`（分支条件不动）
3. 不动：行名截断 / `.tpl-tip` 浮层 / 复制命名 `- copy` / IPC / 子组件 props / 样式。
4. `npm test` → **绿**（既有 12 条 zh 断言因 zh 下 t() = 原串天然不破 + 新 6 条 en 通过）。
5. `npm run build` 确认无类型/编译错误。

**提交：** `feat(i18n): 模板管理卡片 8 处文案接入 t()（S4）`

## 任务 4 · 全量验证 + 看板更新

1. `npm test` 全库全绿（预期用例数 = S3 完成时 529 + 6 = **535**，以实际为准并在留档中记录）。
2. 人工英文目视验收（用户执行，规格 §6/§7.7）：切 en 检查 tpl 卡片标题/tooltip/空态无溢出、无死 key 显示；核对空态三 key 显示一致（验收点 4）；切回 zh 零回归。
3. 更新分片全表 `2026-09-22-i18n-slices.md`：S4 行「独立 spec」列 → ✅ 已展开（spec 文件名）；S4 分片卡追加「遗留：空态三 key（tray.tooltip.empty / launch.placeholder.empty / tpl.empty.missing）en 值对齐 No templates，S10 复查时一并核对」（S3 R1 遗留在本分片闭合为 S4 落实 + S10 复查）；§4 变更记录追加一行（状态 ☐→◐ 计划就绪 / 实现完成后 ◐→✅）。

**提交：** `docs(i18n): S4 分片卡标记完成 + 变更记录`

---

## 执行注意

- **串行纪律**：S4 只碰 TemplateModule.vue（S5 碰 TemplateModal.vue、S9 碰 VramDialog.vue），可与 S5–S7/S9 并行；不要并行分派任何触及 App.vue 的分片。
- **zh 零回归是硬验收**：9 条 zh 词典值逐字来自现状字符串（含 tooltip 半角冒号+空格），任务 3 前用 diff 核对。
- tooltip 插值：`{v}` 传 `24 GB`（含单位），不是裸数字——en 句 `VRAM: 24 GB` 与 zh 句 `显卡显存: 24 GB` 同构。
- 词典一致性测试已存在（S0），不要新建重复测试文件。
