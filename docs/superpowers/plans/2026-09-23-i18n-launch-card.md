# LMS 启动器 i18n S3 · 启动控制卡片 实现计划

**日期：** 2026-09-23
**规格：** `specs/2026-09-23-i18n-launch-card-design.md`（决策与文案权威，本计划冲突时以规格为准）
**分支：** feat/i18n
**前置：** S0 基座已落地（`t()` / `dict` / `test-setup.ts` 固定 zh）；S1/S2 已完成。
**涉及文件：** `src-main/i18n/dict.ts`、`src/modules/LaunchBar.vue`、`src/modules/LaunchBar.test.ts`。**不碰 App.vue / TemplateModule.vue / Dropdown.vue。**

> TDD 节奏：任务 1–2 先写测试看红再实现；任务 3 后 `npm test` 必须全绿（既有 8 条 zh + 新 3 条 en + 词典一致性 + 全库其余）。
> commit 风格：`feat(i18n): …（S3）`，每任务独立提交（对齐 S1/S2 历史）。

---

## 任务 1 · 词典入 3 个 launch.* key

**文件：** `src-main/i18n/dict.ts`

1. `zh` 表追加（值 = LaunchBar.vue 现状字符串逐字不变，注意 选择配置… 是**全角** …）：
   - `'launch.title': 'llama-server 启动控制'`
   - `'launch.placeholder.select': '选择配置…'`
   - `'launch.placeholder.empty': '暂无模板配置'`
2. `en` 表追加（Select a config... 是**半角**三点）：
   - `'launch.title': 'Launch llama-server'`
   - `'launch.placeholder.select': 'Select a config...'`
   - `'launch.placeholder.empty': 'No templates'`
3. 验证：`npx vitest run` 中词典一致性测试（zh/en key 集合相等、无空值）自动覆盖。

**提交：** `feat(i18n): 词典新增启动控制卡片 launch.* 3 key（S3）`

## 任务 2 · en 冒烟测试先行（红）

**文件：** `src/modules/LaunchBar.test.ts`（追加，不动既有 8 条）

1. 顶部 import：`import { t, applyLangLocal } from '../i18n';`
2. 新增独立 `describe('LaunchBar en 冒烟', …)`，**取 afterEach 还原 zh**，防污染同文件既有用例（S2 DirModule.test.ts 同款）。
3. 用例（复用既有 `mockLms` / `READY` 辅助；mock invoke 白名单已有 `get_configs` / `tray-tooltip-update`）：
   - 标题 en：`mockLms({ a: { name: '模板A', values: {} } })` → mount + flush → `w.find('h2').text()` = `Launch llama-server`
   - 空态 en：`mockLms({})` → mount + flush → `w.find('.select-label').text()` = `No templates`（options 空时 Dropdown 渲染 placeholder）
   - 选择态 en：**底线断言** `expect(t('launch.placeholder.select')).toBe('Select a config...')`（规格 §5.3：渲染级触发需 pending mock，不阻塞）
4. 此时 `npm test` 预期**红**（组件仍输出中文串：h2 = llama-server 启动控制、空态 = 暂无模板配置）。

**提交：** `test(i18n): LaunchBar en 冒烟 3 条先行（S3）`

## 任务 3 · LaunchBar.vue 接入 t()

**文件：** `src/modules/LaunchBar.vue`

1. `import { t } from '../i18n';`
2. 模板：
   - h2 标题 → `{{ t('launch.title') }}`
   - placeholder 三元两分支 → `t('launch.placeholder.empty')` / `t('launch.placeholder.select')`（三元条件本身不动）
3. 不动：选项 label/tooltip（用户数据）、stopping 态三点字面量、按钮（无 aria，规格 §1 范围收缩）、`pushTrayTooltip`。
4. `npm test` → **绿**（既有 8 条 zh 断言因 zh 下 t() = 原串天然不破 + 新 3 条 en 通过）。
5. build 确认无类型/编译错误（`npm run build` 或项目对应脚本）。

**提交：** `feat(i18n): 启动控制卡片 3 处文案接入 t()（S3）`

## 任务 4 · 全量验证 + 看板更新

1. `npm test` 全库全绿（预期用例数 = S2 完成时 526 + 3 = **529**，以实际为准并在留档中记录）。
2. 人工英文目视验收（用户执行，规格 §6/§7.6）：切 en 检查 launch 卡片标题/两 placeholder 无溢出、无死 key 显示；切回 zh 零回归。
3. 更新分片全表 `2026-09-22-i18n-slices.md`：S3 行「独立 spec」列 → ✅ 已展开（spec 文件名），状态 ◐ → ✅；S3 分片卡追加「范围收缩：不加按钮 aria（grill-me Q4）」与「遗留：R1 同文案 key 对齐复查（launch.placeholder.empty / tray.tooltip.empty，en 对齐 No templates）」；§4 变更记录追加一行。

**提交：** `docs(i18n): S3 分片卡标记完成 + 变更记录`

---

## 执行注意

- **串行纪律**：S3 只碰 LaunchBar.vue（S8/S10 不触及），可与 S4–S7/S9 并行；不要并行分派任何触及 App.vue 的分片。
- **zh 零回归是硬验收**：3 条 zh 词典值逐字来自现状字符串，任务 3 前用 diff 核对。
- 选择态 en 用例按 t() 直断底线落地，留档注明；不阻塞验收。
- 词典一致性测试已存在（S0），不要新建重复测试文件。

