# LMS 启动器 i18n · S9 其余弹窗实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把 `src/modules/VramDialog.vue` 的 5 处与 `src/components/ConfirmDialog.vue` 的 2 个按钮（各含文本与 aria-label）硬编码中文接入 `t()`，英文按 2026-10-03 grill-me 十问定稿落地，中文逐字零回归。

**架构：** 词典单一真源 `src-main/i18n/dict.ts` 新增 5 个 key（`vram.dialog.*` 3 个 + `common.save` / `common.confirm`）；`VramDialog.vue` 把单一 `error` ref 拆成 `validateError`（存 key，渲染时 `t()`）+ `ioError`（`errMsg` 原文透传），标题 / placeholder / 两按钮改 `t()`；`ConfirmDialog.vue` 两按钮文本与 aria-label 改 `t()`。不改主进程、不改 CSS、不改组件 props 契约。

**技术栈：** Vue 3 + TypeScript + Vitest（happy-dom）+ 自建轻量 `t()`（零新依赖）。

**规格：** `docs/superpowers/specs/2026-10-03-i18n-misc-dialogs-design.md`

---

## 文件结构

| 文件 | 职责 | 改动 |
|---|---|---|
| `src-main/i18n/dict.ts` | 双语词典单一真源 | 新增 5 key × 2 语言（zh 逐字照抄现状） |
| `src/modules/VramDialog.vue` | 显存小窗全部文案 | import `t`；错误双 ref；5 处接入 |
| `src/components/ConfirmDialog.vue` | 共用确认框按钮 | import `t`；2 按钮 ×（文本 + aria）接入 |
| `src/modules/VramDialog.test.ts` | 小窗契约测试 | 末尾 3 条 en（既有 7 条不动） |
| `src/components/ConfirmDialog.test.ts` | 确认框契约测试 | 末尾 1 条 zh 回归 + 1 条 en（既有 7 条不动） |
| `src/App.test.ts` | App 级测试 | 既有退出确认用例内追加按钮断言（不新增用例） |
| `docs/superpowers/specs/2026-09-22-i18n-slices.md` | 分片看板 | S9 独立 spec ✅ + 状态 ☐→◐/✅ + 变更记录 |

**不动：** `src/style.css`、`src/components/Dropdown.vue`、`src/App.vue`、`src/modules/TemplateModal.vue`、`src-main/*`（词典除外）、`src/main.ts`、`src/test-setup.ts`。

**测试基线（2026-10-03 实测）：** 34 文件 / 565 用例全绿；完成后预期 34 文件 / **570** 用例。

> **环境提示（Windows）：** vitest 偶发 `EBUSY: resource busy or locked`（S6/S7/S8 已记录、非本分片引入）。实测把 TEMP 指到工作区即可确定性全绿：
> ```powershell
> New-Item -ItemType Directory -Force -Path .temp\vitest | Out-Null
> $env:TEMP=(Resolve-Path .temp\vitest).Path; $env:TMP=$env:TEMP
> npm test
> ```

---

## 任务 1：词典新增 5 个 key

**文件：**
- 修改：`src-main/i18n/dict.ts`（zh 段 L8 后 / L161 后；en 段 L165 后 / L316 后）

- [ ] **步骤 1：zh 段 `common.*` 补 2 个 key**

在 `'common.listSep': '、',`（L8）之后插入：

```ts
    'common.save': '保存',
    'common.confirm': '确认',
```

- [ ] **步骤 2：en 段 `common.*` 补 2 个 key**

在 `'common.listSep': ', ',`（L165）之后插入：

```ts
    'common.save': 'Save',
    'common.confirm': 'Confirm',
```

- [ ] **步骤 3：zh 段尾部补 `vram.dialog.*`**

在 `'update.err.app.downloadUnknown': '更新下载时发生未知错误，请稍后重试。'`（L161）之后、`  },`（L162）之前插入（**zh 值逐字照抄现状，一个字符都不改**）：

```ts
    // 其余弹窗（S9 2026-10-03-i18n-misc-dialogs）：值与 VramDialog.vue 现状中文串逐字一致
    'vram.dialog.title': '显卡显存（GB）',
    'vram.dialog.placeholder': '如 24',
    'vram.dialog.err.positive': '须为正数（GB）',
```

- [ ] **步骤 4：en 段尾部补 `vram.dialog.*`**

在 `'update.err.app.downloadUnknown': 'Update download failed. Try again.'`（L316）之后、`  },`（L317）之前插入：

```ts
    'vram.dialog.title': 'VRAM (GB)',
    'vram.dialog.placeholder': 'e.g. 24',
    'vram.dialog.err.positive': 'Must be a positive number (GB)',
```

- [ ] **步骤 5：运行词典一致性测试**

运行：`npx vitest run src-main/i18n/dict.test.ts`

预期：PASS（zh/en key 集合一致、无空值；既有 S1 值断言不受影响）。

- [ ] **步骤 6：Commit**

```bash
git add src-main/i18n/dict.ts
git commit -m "feat(i18n): 词典新增其余弹窗 vram.dialog.* + common.save/confirm（S9）"
```

---
## 任务 2：测试先行（en 冒烟 + zh 回归守护）

**文件：**
- 修改：`src/modules/VramDialog.test.ts`、`src/components/ConfirmDialog.test.ts`、`src/App.test.ts`

- [ ] **步骤 1：VramDialog.test.ts 补 import**

把 L7-9 的三行 import 改为（新增 `afterEach` 与 `applyLangLocal`）：

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import VramDialog from './VramDialog.vue';
import { applyLangLocal } from '../i18n';
```

- [ ] **步骤 2：VramDialog.test.ts 末尾追加 3 条 en 冒烟**

在文件最外层 `describe('VramDialog', () => { ... });` 的收尾 `});` 之前插入：

```ts
  // ===== S9（2026-10-03-i18n-misc-dialogs）：en 冒烟 =====
  describe('en smoke', () => {
    beforeEach(() => { applyLangLocal('en'); });
    afterEach(() => { applyLangLocal('zh'); });

    it('标题 = VRAM (GB)、placeholder = e.g. 24', async () => {
      const w = mountDlg({ open: true });
      await tick();
      expect(document.querySelector('.vram-dialog-title')!.textContent).toBe('VRAM (GB)');
      expect(dlgInput().placeholder).toBe('e.g. 24');
      w.unmount();
    });

    it('校验报错行 = Must be a positive number (GB)', async () => {
      const w = mountDlg({ open: true });
      await tick();
      (document.querySelector('.vram-dialog-box .btn-primary') as HTMLButtonElement).click();
      await tick();
      expect((document.querySelector('.vram-dialog-box .error-text') as HTMLElement).textContent)
        .toBe('Must be a positive number (GB)');
      expect(invoke).not.toHaveBeenCalled();
      w.unmount();
    });

    it('两按钮 = Cancel / Save', async () => {
      const w = mountDlg({ open: true });
      await tick();
      const btns = [...document.querySelectorAll('.vram-dialog-actions .btn')] as HTMLButtonElement[];
      expect(btns.map((x) => x.textContent)).toEqual(['Cancel', 'Save']);
      w.unmount();
    });
  });
```

- [ ] **步骤 3：ConfirmDialog.test.ts 补 import**

把 L7-9 的三行 import 改为（新增 `beforeEach` / `afterEach` 与 `applyLangLocal`）：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ConfirmDialog from './ConfirmDialog.vue';
import { applyLangLocal } from '../i18n';
```

- [ ] **步骤 4：ConfirmDialog.test.ts 末尾追加 1 条 zh 回归 + 1 条 en**

在文件最外层 `describe('ConfirmDialog', () => { ... });` 的收尾 `});` 之前插入：

```ts
  // ===== S9（2026-10-03-i18n-misc-dialogs）：按钮文本 + aria-label 走词典 =====
  it('zh 回归：按钮文本与 aria-label 均为 取消 / 确认', async () => {
    const w = mountDlg({ open: true, title: 'T', message: 'M' });
    await tick();
    const cancel = document.querySelector('.confirm-cancel') as HTMLButtonElement;
    const ok = document.querySelector('.confirm-ok') as HTMLButtonElement;
    expect(cancel.textContent).toBe('取消');
    expect(cancel.getAttribute('aria-label')).toBe('取消');
    expect(ok.textContent).toBe('确认');
    expect(ok.getAttribute('aria-label')).toBe('确认');
    w.unmount();
  });

  describe('en smoke', () => {
    beforeEach(() => { applyLangLocal('en'); });
    afterEach(() => { applyLangLocal('zh'); });

    it('按钮文本与 aria-label = Cancel / Confirm', async () => {
      const w = mountDlg({ open: true, title: 'T', message: 'M' });
      await tick();
      const cancel = document.querySelector('.confirm-cancel') as HTMLButtonElement;
      const ok = document.querySelector('.confirm-ok') as HTMLButtonElement;
      expect(cancel.textContent).toBe('Cancel');
      expect(cancel.getAttribute('aria-label')).toBe('Cancel');
      expect(ok.textContent).toBe('Confirm');
      expect(ok.getAttribute('aria-label')).toBe('Confirm');
      w.unmount();
    });
  });
```

- [ ] **步骤 5：App.test.ts 在既有退出确认用例内追加按钮断言**

在 `it('退出确认框 title/message 随语言即时重译', ...)`（L907）内：

zh 阶段（`expect(document.querySelector('.confirm-box')!.textContent).toContain('退出程序');` 之后）插入：

```ts
    // S9：按钮文本与 aria 走 common.cancel / common.confirm
    expect((document.querySelector('.confirm-cancel') as HTMLButtonElement).textContent).toBe('取消');
    expect((document.querySelector('.confirm-ok') as HTMLButtonElement).textContent).toBe('确认');
```

en 阶段（`expect(box.textContent).toContain('llama-server will be stopped. Continue?');` 之后）插入：

```ts
    expect((document.querySelector('.confirm-cancel') as HTMLButtonElement).textContent).toBe('Cancel');
    expect((document.querySelector('.confirm-cancel') as HTMLButtonElement).getAttribute('aria-label')).toBe('Cancel');
    expect((document.querySelector('.confirm-ok') as HTMLButtonElement).textContent).toBe('Confirm');
    expect((document.querySelector('.confirm-ok') as HTMLButtonElement).getAttribute('aria-label')).toBe('Confirm');
```

- [ ] **步骤 6：运行三个测试文件，确认按预期失败（组件尚未接线）**

运行：

```powershell
npx vitest run src/modules/VramDialog.test.ts src/components/ConfirmDialog.test.ts src/App.test.ts
```

预期：**FAIL** —— VramDialog 3 条 en 得到中文（`显卡显存（GB）` / `如 24` / `须为正数（GB）` / `取消` / `保存`）；ConfirmDialog en 1 条得到 `取消` / `确认`；App en 按钮断言得到 `取消` / `确认`。ConfirmDialog zh 回归 1 条应立即 PASS（守护现状）。

- [ ] **步骤 7：Commit（测试先行）**

```bash
git add src/modules/VramDialog.test.ts src/components/ConfirmDialog.test.ts src/App.test.ts
git commit -m "test(i18n): 其余弹窗 zh 回归 + en 冒烟先行（S9）"
```

---
## 任务 3：组件接入 `t()`

**文件：**
- 修改：`src/modules/VramDialog.vue`、`src/components/ConfirmDialog.vue`

- [ ] **步骤 1：VramDialog.vue 拆错误双 ref**

`<script setup>` 顶部（L5 `import { invoke, errMsg } from '../ipc';` 之后）加：

```ts
import { t } from '../i18n';
```

把 `const error = ref<string | null>(null);`（L29）与 `save()`（L31-42）整体替换为：

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

- [ ] **步骤 2：VramDialog.vue 模板 5 处接入 `t()`**

L48 / L51 / L54-57 改为：

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

- [ ] **步骤 3：运行 VramDialog 测试**

运行：`npx vitest run src/modules/VramDialog.test.ts`

预期：PASS（既有 7 条 + 新增 3 条 en 全绿；既有 zh 报错断言因词典 zh 值逐字一致而继续通过）。

- [ ] **步骤 4：ConfirmDialog.vue 两按钮接入 `t()`**

`<script setup>` 顶部（L7-11 的 import 之后）加：

```ts
import { t } from '../i18n';
```

L72-75 两个按钮改为：

```html
<button type="button" class="btn confirm-cancel" :aria-label="t('common.cancel')" @click="onClose">{{ t('common.cancel') }}</button>
<button type="button" class="btn confirm-ok"
  :class="{ 'btn-danger': props.tone === 'danger', 'btn-primary': props.tone === 'primary' }"
  :aria-label="t('common.confirm')" @click="onConfirm">{{ t('common.confirm') }}</button>
```

- [ ] **步骤 5：运行 ConfirmDialog + App 测试**

运行：`npx vitest run src/components/ConfirmDialog.test.ts src/App.test.ts`

预期：PASS（ConfirmDialog 既有 7 条 + 新增 2 条；App 既有 43 条含追加断言全绿）。

- [ ] **步骤 6：硬编码中文扫描**

运行：

```powershell
Select-String -Path src/modules/VramDialog.vue,src/components/ConfirmDialog.vue -Pattern '[\u4e00-\u9fff]'
```

预期：仅剩注释行（文件头注释、行尾说明），无任何 UI 文案中文串。

- [ ] **步骤 7：Commit**

```bash
git add src/modules/VramDialog.vue src/components/ConfirmDialog.vue
git commit -m "feat(i18n): 其余弹窗 7 处文案接入 t()（S9）"
```

---

## 任务 4：收尾验证与看板

- [ ] **步骤 1：全量测试 + 构建**

```powershell
New-Item -ItemType Directory -Force -Path .temp\vitest | Out-Null
$env:TEMP=(Resolve-Path .temp\vitest).Path; $env:TMP=$env:TEMP
npm test
npm run build
```

预期：34 文件 / 570 用例全绿 + build 通过（无新增 TS / 构建告警）。

- [ ] **步骤 2：看板收尾**

`docs/superpowers/specs/2026-09-22-i18n-slices.md`：

1. S9 行「独立 spec」列：`—` → `✅ 已展开`；状态 `☐` → `✅`（规划阶段先置 `◐`）。
2. S9 分片卡追加「独立 spec」行（指向本 spec + plan）、「已定契约」段（5 key + 双 ref + 零 CSS + 测试增量）、状态 `☐`→`◐`→`✅`。
3. §4 变更记录追加两行：规划（grill-me 十问定稿 + spec/plan 展开）、实现完成（commits + 用例数）。

- [ ] **步骤 3：Commit**

```bash
git add docs/superpowers/specs/2026-09-22-i18n-slices.md
git commit -m "docs(i18n): S9 分片卡标记完成（S9）"
```

- [ ] **步骤 4：人工英文目视验收（留待用户）**

运行应用切到 English：

1. 模板管理卡片 → 点 VRAM 按钮：标题 `VRAM (GB)`、placeholder `e.g. 24`、按钮 `Cancel` / `Save`；输入 `0` 或清空点保存 → 红字 `Must be a positive number (GB)` 单行不换行；此时切回中文，同一行红字即时变 `须为正数（GB）`。
2. 托盘「退出」→ 确认框按钮 `Cancel` / `Confirm`；模板删除确认框同。
3. 两个弹窗均不溢出，中文界面逐像素无回归。

---

## 完成判据

1. `npm test` 全绿：**34 文件 / 570 用例**（基线 565 + 5）。
2. `npm run build` 通过。
3. `VramDialog.vue` + `ConfirmDialog.vue` 中除注释外无硬编码中文 UI 串。
4. 词典新增 5 个 key（`vram.dialog.title` / `vram.dialog.placeholder` / `vram.dialog.err.positive` / `common.save` / `common.confirm`），zh/en key 集合一致（`dict.test.ts` 通过）。
5. zh 文案与现状逐字一致；既有 `VramDialog.test.ts` / `ConfirmDialog.test.ts` / `App.test.ts` 断言零删除、零弱化。
6. `Dropdown.vue` / `App.vue` / `TemplateModal.vue` / `src-main/*`（词典除外）零改动；零 CSS 改动。
7. 看板：S9 状态 ✅ + 独立 spec ✅ + 变更记录两行。
