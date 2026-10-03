# LMS 启动器 i18n · S9 其余弹窗设计

**日期：** 2026-10-03
**分支：** feat/i18n
**分片：** S9（其余弹窗）
**设计权威：** `2026-09-22-i18n-design.md`（跨切片不变量）+ `2026-09-22-i18n-slices.md`（分片卡）
**性质：** S9 轻量独立规格（分片卡未标「建议展开」：2 个渲染端文件、7 处文案、零跨进程契约变更、零新 scope；按 S2–S8 先例展开 spec + plan）

> 本文件与设计总纲冲突时，以设计总纲为准；本文件只细化 S9 的实现契约。

---

## 1. 背景与目标

S9 是分片清单「其余弹窗」的收口：`src/modules/VramDialog.vue`（显存设置小窗）与 `src/components/ConfirmDialog.vue`（共用二次确认框）。ConfirmDialog 被两处调用——`App.vue:353` 的退出确认与 `TemplateModal.vue:450` 的删除确认——S1/S5 只译了标题与正文，按钮 `取消`/`确认` 按约定留给 S9。

**目标：** 表 1–7 的硬编码中文接入 `t()`，中英即时切换；中文逐字零回归；英文按 2026-10-03 grill-me 十问定稿；零 CSS 改动、零组件契约变更、零新 scope。

### 1.1 现状盘点（探索结论）

| # | 位置 | 现状（zh） | 目标 key |
|---|---|---|---|
| 1 | `VramDialog.vue:48` 标题 | 显卡显存（GB） | `vram.dialog.title` |
| 2 | `VramDialog.vue:51` placeholder | 如 24 | `vram.dialog.placeholder` |
| 3 | `VramDialog.vue:36` 校验错误 | 须为正数（GB） | `vram.dialog.err.positive`（存 key，渲染时 `t()`） |
| 4 | `VramDialog.vue:56` [取消] | 取消 | `common.cancel`（S0 已有，复用） |
| 5 | `VramDialog.vue:57` [保存] | 保存 | `common.save`（新增） |
| 6 | `ConfirmDialog.vue:72` [取消] 文本 + aria-label | 取消 ×2 | `common.cancel`（复用，文本与 aria 共用） |
| 7 | `ConfirmDialog.vue:75` [确认] 文本 + aria-label | 确认 ×2 | `common.confirm`（新增） |

关键事实：

- **`Dropdown.vue` 零 UI 中文串**（仅注释含中文；placeholder 由父级传入，S3/S4 已各自 `t()` 化）→ 本分片**零改动**（grill Q1）。
- **`VramDialog.vue` 的 `error` ref 同时承载校验错误与 `errMsg(e)` 的 IO 报错透传** → 按总纲 §3.5 与 S0 SettingsModal（`validateError` + `ioError`）先例拆双 ref（grill Q2）。
- 词典现有 `settings.save`（保存 / Save，S0 设置弹窗用）；`common` scope 下只有 `common.cancel` / `common.listSep`。
- **既有断言**：`VramDialog.test.ts:85` 断言 `.error-text` 含 `须为正数`（zh，零改动继续通过）；`ConfirmDialog.test.ts` 对按钮文本 / aria **无断言**；`App.test.ts:907`「退出确认框 title/message 随语言即时重译」已存在（S1）。
- **测试基线（2026-10-03 实测）**：`npm test` = **34 文件 / 565 用例**全绿。
- **宽度实测**：`.vram-dialog-box` 320px − padding 32px = **288px** 内容宽；`.error-text` = `--fs-label` 12px，en `Must be a positive number (GB)` 30 字符 ≈ 190px → 单行不换行。`.confirm-box` 360px − padding 48px = **312px**；`.btn` padding `0 14px`、字号 `--fs-body`，`Cancel` + `Confirm` 合计 ≈ 160px ≪ 312px → 零 CSS 有据。

---

## 2. 范围与非目标

### 2.1 范围内

`VramDialog.vue` 5 处 + `ConfirmDialog.vue` 2 按钮（各含文本与 aria，共 4 处引用）接入 `t()`；词典新增 5 个 key。

### 2.2 非目标（本轮零改动）

1. **`src/components/Dropdown.vue`**：无硬编码 UI 中文串，零改动（grill Q1）。
2. **ConfirmDialog 的 props 契约**：不新增 `cancelText` / `okText`；调用方（`App.vue` / `TemplateModal.vue`）零改动（grill Q4）。
3. **`src-main/*`**：`vram.dialog.err.positive` 只覆盖渲染端校验；主进程 GGUF / 显存错误消息归 S10。
4. **`errMsg(e)` 的 IO 报错**：保持原文透传不译（总纲 §1.2 技术标识不译 + S0 先例）。
5. **`settings.save`**：保持不动，不合并去重（grill Q3）。
6. **CSS**：零新增、零修改；**零 `html[lang="en"]` 覆盖**。
7. 不引入新依赖；不改既有 zh 断言（新增测试除外）。

---

## 3. key 契约（新增 5 个）

scope `vram` / `common` 均在设计总纲 §3.2 白名单内，**无新 scope**；`vram.dialog.*` 与 S5 已有的 `tplModal.vram.*` 不同 scope，天然不冲突（grill Q10）。

| key | zh | en |
|---|---|---|
| `vram.dialog.title` | 显卡显存（GB） | VRAM (GB) |
| `vram.dialog.placeholder` | 如 24 | e.g. 24 |
| `vram.dialog.err.positive` | 须为正数（GB） | Must be a positive number (GB) |
| `common.save` | 保存 | Save |
| `common.confirm` | 确认 | Confirm |

说明：

- **zh 全部逐字照抄现状**（含 `显卡显存（GB）` 的全角括号、`如 24` 的半角空格、`须为正数（GB）` 的全角括号）→ 中文零回归、既有断言零改动。
- `vram.dialog.title` 的 en 用 `VRAM (GB)` 而非 `GPU memory (GB)`：与 S4 已定稿的 `Set VRAM` / `VRAM: {v}` / `VRAM not set` 术语一致；本弹窗填的是「用户配置的显存总量」，非 S6 的硬件读数（grill Q5）。
- `vram.dialog.err.positive` 的 en 用陈述式 `Must be …`，与 zh「须为」同句式，且 ≈190px 单行（grill Q7）。
- `common.save` 与既有 `settings.save` 同值同义但**不合并**：`common` 是通用动作 scope，语义正确；不动 S0 已验收文件与测试（grill Q3）。
- `common.confirm` 与 `common.cancel` 同时用作**可见文本与 aria-label**（同串共用 2 个 key，零冗余，grill Q4）。

---
## 4. 组件改造设计

### 4.1 `VramDialog.vue`

顶部新增：

```ts
import { t } from '../i18n';
```

**错误双 ref（grill Q2）**——校验错误存 key，IO 错误透传原文：

```ts
// 校验失败：存词典 key，渲染时 t() → 切换语言后同一条报错即时重译（总纲 §3.5，S0 SettingsModal 同型）
const validateError = ref<string | null>(null);
// IPC/IO 失败：errMsg(e) 原文透传，不译（总纲 §1.2）
const ioError = ref<string | null>(null);

function save(): void {
  validateError.value = null;
  ioError.value = null;
  const v = value.value.trim();
  const n = v === '' ? 0 : Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    validateError.value = 'vram.dialog.err.positive';
    return;
  }
  invoke('save_vram_total', n)
    .then(() => emit('saved'))
    .catch((e) => { ioError.value = errMsg(e); });
}
```

原 `const error = ref<string | null>(null);` 删除；原 `error.value = '须为正数（GB）'` 与 `error.value = errMsg(e)` 两处按上表替换。

模板三处（L48 / L51 / L54-57）：

```html
<h3 class="vram-dialog-title">{{ t('vram.dialog.title') }}</h3>
<input class="input" type="number" min="1" step="1"
  :value="value"
  :placeholder="t('vram.dialog.placeholder')"
  @input="(ev: Event) => { value = (ev.target as HTMLInputElement).value; }"
  @keydown.enter="save" />
<p v-if="validateError || ioError" class="error-text">{{ validateError ? t(validateError) : ioError }}</p>
<div class="vram-dialog-actions">
  <button class="btn btn-secondary" @click="emit('close')">{{ t('common.cancel') }}</button>
  <button class="btn btn-primary" @click="save">{{ t('common.save') }}</button>
</div>
```

- `.error-text` 的位置、类名与「有错误才出现」的条件与现状一致；只是「是否有错误」由两个 ref 共同决定。
- 不改 `save_vram_total` 的调用时机、参数，以及 `saved` / `close` 事件契约。

### 4.2 `ConfirmDialog.vue`

顶部新增：

```ts
import { t } from '../i18n';
```

模板两个按钮（L72 / L73-75）：

```html
<button type="button" class="btn confirm-cancel" :aria-label="t('common.cancel')" @click="onClose">{{ t('common.cancel') }}</button>
<button type="button" class="btn confirm-ok"
  :class="{ 'btn-danger': props.tone === 'danger', 'btn-primary': props.tone === 'primary' }"
  :aria-label="t('common.confirm')" @click="onConfirm">{{ t('common.confirm') }}</button>
```

- 文本与 aria-label 共用同一 key（grill Q4）；不新增 props，`App.vue` / `TemplateModal.vue` 零改动。
- `title` / `message` 仍由调用方传入（S1/S5 已 `t()` 化），组件不翻译这两个 prop。
- 组件常驻挂载（TemplateModal）时 `t()` 在 render 中求值 → 切换语言即时重译。

### 4.3 响应式

两处都是模板内 `t()` 调用：`t()` 读渲染端 `lang` ref（`src/i18n.ts:30`），组件 render 依赖该 ref → `applyLangLocal` 后自动重渲染，无需 watch、无需事件广播。`VramDialog` 的校验错误行存的是 key（`validateError`），切换语言后同样即时重译。

---

## 5. 英文文案与布局

| 位置 | zh | en | 宽度实测 |
|---|---|---|---|
| 标题 | 显卡显存（GB） | VRAM (GB) | ≈62px |
| placeholder | 如 24 | e.g. 24 | ≈40px |
| 校验错误 | 须为正数（GB） | Must be a positive number (GB) | ≈190px ≤ 288px，单行 |
| [取消] | 取消 | Cancel | ≈72px（含 padding） |
| [保存] | 保存 | Save | ≈58px |
| [确认] | 确认 | Confirm | ≈79px |

- **零 CSS**：所有 en 串均短于所在容器（`.vram-dialog-box` 内容宽 288px / `.confirm-box` 内容宽 312px），无需 `html[lang="en"]` 覆盖，符合总纲 §3.6「中文布局冻结」。
- 标点一律半角；`GB` 作单位保留不译（总纲 §2 术语表 / §1.2-4）。

---

## 6. 测试设计

### 6.1 既有断言零改动

- `VramDialog.test.ts:85`（断言含 `须为正数`）→ zh 词典值逐字一致，继续通过。
- `ConfirmDialog.test.ts` 全部 7 条 → 不涉及按钮文本 / aria，继续通过。
- `App.test.ts:907` 与 `TemplateModal.test.ts` 的确认框用例 → 仅断言 title / message 或类名，继续通过。

### 6.2 新增（grill Q9）

| 文件 | 条数 | 内容 |
|---|---|---|
| `src/modules/VramDialog.test.ts` | 3 | ① en 标题 + placeholder；② en 校验报错文案；③ en 两按钮文本 |
| `src/components/ConfirmDialog.test.ts` | 2 | ① zh 回归：默认 `.confirm-cancel` / `.confirm-ok` 文本与 aria 均为 `取消` / `确认`；② en：两者文本与 aria 均为 `Cancel` / `Confirm` |
| `src/App.test.ts` | 0 条新用例 | 在既有「退出确认框 title/message 随语言即时重译」用例内追加 zh + en 两组按钮断言（共用同一 mount 生命周期，不重复开窗） |

实现约定（沿用 S1/S6/S7 先例）：

- 两个组件测试文件在 `describe` 内用 `beforeEach` 调 `applyLangLocal('en')`、`afterEach` 复位 `applyLangLocal('zh')`（`applyLangLocal` 从 `../i18n` 动态 `import`，与 S6/S7 同型）。
- `App.test.ts` 的 `applyEn()` helper 已存在（`App.test.ts:834`），直接复用。

### 6.3 收尾验证

```powershell
New-Item -ItemType Directory -Force -Path .temp\vitest | Out-Null
$env:TEMP=(Resolve-Path .temp\vitest).Path; $env:TMP=$env:TEMP
npm test
npm run build
```

预期：**34 文件 / 570 用例**全绿（基线 565 + 5）+ build 通过。

---
## 7. 验收点

1. 打开显存小窗：标题、placeholder、两按钮随语言即时切换；校验失败后切换语言，同一行报错即时译为新语言。
2. 确认框（App 退出确认 / TemplateModal 删除确认两处）：`取消` / `确认` 文本与 aria-label 随语言即时切换为 `Cancel` / `Confirm`。
3. 词典 zh/en key 集合一致、无空值（`dict.test.ts` 通过）。
4. `npm test` 全绿（34 文件 / 570 用例）+ `npm run build` 通过。
5. 中文界面零回归（本轮唯一变化是取值方式，可见文案逐字不变）。
6. en 下两个弹窗不溢出、错误行单行（人工英文目视验收留待用户执行）。

---

## 8. 风险与已定决策

### 8.1 grill-me 十问定稿（2026-10-03）

| # | 决策 |
|---|---|
| Q1 | 范围锁定 `VramDialog.vue` + `ConfirmDialog.vue`；`Dropdown.vue` 零改动 |
| Q2 | 校验错误双 ref（`validateError` 存 key + `ioError` 透传），切语言即时重译 |
| Q3 | 新增 `common.save`；`settings.save` 保持不动 |
| Q4 | ConfirmDialog 文本与 aria-label 共用 key（复用 `common.cancel` + 新增 `common.confirm`），不加 props |
| Q5 | 标题 en = `VRAM (GB)` |
| Q6 | placeholder en = `e.g. 24` |
| Q7 | 校验错误 en = `Must be a positive number (GB)` |
| Q8 | [确认] en = `Confirm` |
| Q9 | 测试：VramDialog 3 条 en + ConfirmDialog 2 条（1 zh 回归 + 1 en）+ App 级退出确认按钮断言（复用既有用例，不新增用例） |
| Q10 | key = `vram.dialog.title` / `.placeholder` / `.err.positive`（3 段，不新增 scope） |

### 8.2 风险

| # | 风险 | 处置 |
|---|---|---|
| R1 | 拆双 ref 时漏改某处 `error` 引用 → TS 报错或错误行不显示 | 类型检查 + 既有「空输入报错」用例守护；以 `npm test` 全绿为准 |
| R2 | 校验错误改存 key 后忘记 `t()` 包装 → 界面显示 `vram.dialog.err.positive` 字样 | 新增 en 报错冒烟 + 既有 zh 报错断言双向守护 |
| R3 | ConfirmDialog 被两处共用，改动影响面大于「其余弹窗」字面范围 | 两处调用方已在 S1/S5 完成 title/message 的 `t()`，本轮为纯增量；App 级断言覆盖集成路径 |
| R4 | en 文案撑破 320px / 360px 定宽容器 | §5 宽度实测均有余量；零 CSS，人工目视验收兜底 |

---

## 9. 变更记录

- 2026-10-03：创建；grill-me 十问定稿（范围 / 双 ref / key 命名 / en 文案 / 测试增量），展开 S9 轻量独立 spec + plan。
