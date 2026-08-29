# VRAM Breakdown Tooltip 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在模板弹窗底栏 VRAM 指示右侧加 circle-info 图标，hover 出明细小弹窗，逐行列出当前配置各参数与预计显存占用（0 项隐藏，末行「GPU 固定开销约 2GB」）；`vram_estimate` IPC 追加分项 GiB。

**架构：** 渲染端 TemplateModal 内嵌（不新增组件）：`vramParts` ref 存最近一次 `vram_estimate` 返回的分项；`breakdown` computed 按 vram.ts 公式顺序生成 6 行（5 数据项过滤 0 + fixed 说明行），降级档单行原因文案（与底栏 vramTooltip 同源）。浮层 `.vram-tip` position:fixed 挂 Teleport 顶层（同 ConfirmDialog 兄弟），上方居中/翻转到下方。主进程 `vram_estimate` 成功返回值追加 `parts: { model, mmproj, kv, batch, draft, fixed }`（GiB = EstimateResult 各字段 ÷ 2³⁰），ok:false 形状不变。

**技术栈：** Vue 3 (script setup) + FontAwesome free-solid（circle-info）+ vitest（happy-dom）。

**规格：** `docs/superpowers/specs/2026-08-30-vram-breakdown-tooltip-design.md`（已批准）。

**测试运行命令：** `npx vitest run -- <file>`（单文件）；全量 `npm test`。

**文件结构：**

- 修改 `src/modules/TemplateModal.test.ts` —— 明细弹窗契约测试（图标 / 悬停行 / 0 项隐藏 / 降级文案 / mouseleave）。
- 修改 `src/modules/TemplateModal.vue` —— circle-info 图标 + `.vram-tip` 浮层 + `vramParts` / `breakdown` / `breakdownFallback` + 底栏 tooltip 文案改动。
- 修改 `src-main/main.ts` —— `vram_estimate` IPC 返回值追加 `parts`（GiB 分项）。

---

### 任务 1：明细弹窗组件测试（先失败）

**文件：**
- 修改：`src/modules/TemplateModal.test.ts`（文件末尾追加新 describe）

- [x] **步骤 1：追加失败的测试**

在 `TemplateModal.test.ts` 末尾（`TemplateModal vram indicator` describe 之后）追加：

```ts
// ---- VRAM 明细悬停弹窗（规格 2026-08-30-vram-breakdown-tooltip-design）----
// circle-info 图标在底栏 VRAM 指示右侧；hover 出 .vram-tip 浮层：
// 估算成功 = 5 数据项（0 项隐藏）+ 末行「GPU 固定开销约 2GB」；降级档 = 单行原因文案。
describe('TemplateModal vram breakdown tooltip', () => {
  const P = paramsMeta;

  function mockParts(parts: Record<string, number>): void {
    calls = [];
    (window as any).lms = {
      invoke: (cmd: string, ...args: unknown[]) => {
        calls.push({ cmd, args });
        if (cmd === 'vram_estimate') return Promise.resolve({ ok: true, usedGb: 22.0, parts });
        if (cmd === 'suggest_config_id') return Promise.resolve(SUGGEST_ID);
        return Promise.resolve(null);
      },
      onLogLine: () => () => {}, onProcessExit: () => () => {}, onTrayExitRequest: () => () => {},
    };
  }

  async function fillModel(): Promise<void> {
    const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    setter.call(mIn, 'D:/models/qwen.gguf');
    mIn.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    await new Promise((r) => setTimeout(r, 250)); // 超过 150ms 防抖
    await flush();
  }

  it('circle_info_icon_rendered_in_vram_indicator', async () => {
    calls = []; mockLms();
    const w = mount(TemplateModal, { attachTo: document.body, props: { open: true, id: '', values: {}, paramsMeta: P, vramTotalGb: 24 } });
    await flush();
    const info = document.querySelector('.vram-indicator .vram-info') as HTMLElement;
    expect(info).not.toBeNull();                    // circle-info 图标（span，非按钮）
    expect(info.querySelector('svg')).not.toBeNull(); // FontAwesome circle-info（svg）
    expect(info.tagName.toLowerCase()).not.toBe('button');
    w.unmount();
  });

  it('hover_shows_breakdown_rows_and_hides_zero_items', async () => {
    // mmproj / batch / draft 未填 → 0 项隐藏；模型 + KV + GPU 固定 = 3 行
    mockParts({ model: 16, mmproj: 0, kv: 4, batch: 0, draft: 0, fixed: 2 });
    const w = mount(TemplateModal, { attachTo: document.body, props: { open: true, id: '', values: {}, paramsMeta: P, vramTotalGb: 24 } });
    await fillModel();
    const info = document.querySelector('.vram-indicator .vram-info') as HTMLElement;
    expect(document.querySelector('.vram-tip')).toBeNull(); // 未悬停：浮层不存在
    info.dispatchEvent(new Event('mouseenter'));
    await flush();
    const tip = document.querySelector('.vram-tip') as HTMLElement;
    expect(tip).not.toBeNull();
    const rows = [...tip.querySelectorAll('.vram-tip__row')].map((r) => (r.textContent ?? '').trim());
    expect(rows).toHaveLength(3);                        // 0 项隐藏
    expect(rows[0]).toBe('模型文件（-m） 16.0 GB');
    expect(rows[1]).toBe('KV 缓存（-c/-ctk/-ctv/-ngl） 4.0 GB');
    expect(rows[2]).toBe('GPU 固定开销约 2GB');          // 末行 = 说明性文案（用户定稿）
    w.unmount();
  });

  it('fallback_row_when_model_empty', async () => {
    mockParts({ model: 0, mmproj: 0, kv: 0, batch: 0, draft: 0, fixed: 2 });
    const w = mount(TemplateModal, { attachTo: document.body, props: { open: true, id: '', values: {}, paramsMeta: P, vramTotalGb: 24 } });
    await flush();
    (document.querySelector('.vram-indicator .vram-info') as HTMLElement).dispatchEvent(new Event('mouseenter'));
    await flush();
    expect(document.querySelector('.vram-tip')?.textContent).toContain('填写模型文件（-m）后自动估算');
    w.unmount();
  });

  it('fallback_row_when_total_unconfigured', async () => {
    mockParts({ model: 16, mmproj: 0, kv: 4, batch: 0, draft: 0, fixed: 2 });
    const w = mount(TemplateModal, { attachTo: document.body, props: { open: true, id: '', values: {}, paramsMeta: P, vramTotalGb: undefined } });
    await fillModel();
    (document.querySelector('.vram-indicator .vram-info') as HTMLElement).dispatchEvent(new Event('mouseenter'));
    await flush();
    expect(document.querySelector('.vram-tip')?.textContent).toContain('未配置显卡显存，点击 VRAM 按钮设置'); // 用户定稿文案
    w.unmount();
  });

  it('fallback_row_when_estimate_fails', async () => {
    calls = [];
    (window as any).lms = {
      invoke: (cmd: string, ...args: unknown[]) => {
        calls.push({ cmd, args });
        if (cmd === 'vram_estimate') return Promise.resolve({ ok: false, reason: 'GGUF: 非 GGUF 文件（magic 不符）' });
        return Promise.resolve(null);
      },
      onLogLine: () => () => {}, onProcessExit: () => () => {}, onTrayExitRequest: () => () => {},
    };
    const w = mount(TemplateModal, { attachTo: document.body, props: { open: true, id: '', values: {}, paramsMeta: P, vramTotalGb: 24 } });
    await fillModel();
    (document.querySelector('.vram-indicator .vram-info') as HTMLElement).dispatchEvent(new Event('mouseenter'));
    await flush();
    expect(document.querySelector('.vram-tip')?.textContent).toContain('GGUF: 非 GGUF 文件');
    w.unmount();
  });

  it('mouseleave_hides_tooltip', async () => {
    mockParts({ model: 16, mmproj: 0, kv: 4, batch: 0, draft: 0, fixed: 2 });
    const w = mount(TemplateModal, { attachTo: document.body, props: { open: true, id: '', values: {}, paramsMeta: P, vramTotalGb: 24 } });
    await fillModel();
    const info = document.querySelector('.vram-indicator .vram-info') as HTMLElement;
    info.dispatchEvent(new Event('mouseenter'));
    await flush();
    expect(document.querySelector('.vram-tip')).not.toBeNull();
    info.dispatchEvent(new Event('mouseleave'));
    await flush();
    expect(document.querySelector('.vram-tip')).toBeNull(); // 移开即消失
    w.unmount();
  });
});
```

- [x] **步骤 2：运行测试验证失败**

运行：`npx vitest run -- src/modules/TemplateModal.test.ts`
预期：新 describe 的 6 个用例全部 FAIL（`.vram-indicator .vram-info` 不存在 → `info` 为 null / 浮层不出现）；既有 `TemplateModal vram indicator` 用例仍 PASS。

**Commit（仅测试）：**

```bash
git add src/modules/TemplateModal.test.ts
git commit -m "test: vram breakdown tooltip contract (failing)"
```

---

### 任务 2：TemplateModal.vue 实现（图标 + 浮层 + 文案）

**文件：**
- 修改：`src/modules/TemplateModal.vue`

- [x] **步骤 1：图标注册（script 区，FA 模式同 xmark）**

import 行追加 `faCircleInfo`：

```ts
import { faXmark, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
```

`library.add` 与 `byPrefixAndName` 加入：

```ts
library.add(faFloppyDisk, faTrashCan, faXmark, faFolderOpen, faCircleInfo);
const byPrefixAndName = { fat: { 'floppy-disk': faFloppyDisk, xmark: faXmark, 'trash-can': faTrashCan, 'folder-open': faFolderOpen, 'circle-info': faCircleInfo } };
```

- [x] **步骤 2：状态与 computed（紧跟 VRAM 指示区，vramTooltip 之后）**

```ts
// ---------- VRAM 明细悬停弹窗（规格 2026-08-30-vram-breakdown-tooltip-design §3）----------
// .vram-info（circle-info span，纯 hover）→ .vram-tip 浮层：估算成功 = 5 数据项（0 项隐藏）
// + 末行「GPU 固定开销约 2GB」；降级档 = 单行原因文案（与底栏 vramTooltip 同源）。
const vramParts = ref<Record<string, number> | null>(null);
// 浮层定位：图标 rect 坐标 + 顶部放不下（top < 150px，≈6 行高度）翻转到下方
const vramTip = ref<{ x: number; y: number; flip: boolean } | null>(null);
function onInfoEnter(e: MouseEvent): void {
  const el = e.currentTarget as HTMLElement;
  const r = el.getBoundingClientRect();
  vramTip.value = { x: r.left + r.width / 2, y: r.top, flip: r.top < 150 };
}
// 明细行：breakdown 非 null = 列出（fixed 恒显）；null = 降级单行（breakdownFallback）
const breakdown = computed((): Array<{ label: string; gb: number }> | null => {
  const p = vramParts.value;
  if (!vramHasModel.value || vramUsedGb.value === null || p === null) return null;
  const rows: Array<{ label: string; gb: number }> = [
    { label: '模型文件（-m）', gb: p.model ?? 0 },
    { label: '视觉投影（--mmproj）', gb: p.mmproj ?? 0 },
    { label: 'KV 缓存（-c/-ctk/-ctv/-ngl）', gb: p.kv ?? 0 },
    { label: 'batch 缓冲（-b/-ub）', gb: p.batch ?? 0 },
    { label: 'draft 缓存（--spec-draft-n-max）', gb: p.draft ?? 0 },
  ].filter((r) => r.gb > 0); // 0 项隐藏（fixed 除外，恒显）
  rows.push({ label: 'GPU 固定开销约 2GB', gb: p.fixed ?? 0 }); // 末行说明性文案（用户定稿）
  return rows;
});
const breakdownFallback = computed((): string => {
  if (!vramHasModel.value) return '填写模型文件（-m）后自动估算';
  if (props.vramTotalGb === undefined) return '未配置显卡显存，点击 VRAM 按钮设置';
  if (vramUsedGb.value === null) return (vramOk.value ? '填写模型文件后自动估算' : (vramReason ?? '估算失败'));
  return '估算中…'; // usedGb 在手但 parts 缺失（不应发生：主进程恒返回 parts）
});
```

`scheduleVramEstimate` 的 `.then()` 里同步存 parts（IPC 返回 shape 兼容：无 parts 时置 null）：

```ts
.then((res) => {
  if (res.ok) { vramUsedGb.value = res.usedGb; vramOk.value = true; vramReason.value = null; vramParts.value = (res as { parts?: Record<string, number> }).parts ?? null; }
  else { vramUsedGb.value = null; vramOk.value = false; vramReason.value = res.reason; vramParts.value = null; }
})
.catch(() => { vramUsedGb.value = null; vramOk.value = false; vramReason.value = 'IPC 调用失败'; vramParts.value = null; });
```

`vramTooltip` 文案改动（用户定稿）：

```ts
if (props.vramTotalGb === undefined) return '未配置显卡显存，点击 VRAM 按钮设置';
```

（原「未配置显卡显存——点模板卡片右上角 VRAM 按钮设置」整句替换；其余档文案不动。）

- [x] **步骤 3：模板（底栏 + Teleport 顶层浮层）**

.vram-indicator 内 `&nbsp;GB` span 之后加图标：

```html
<span class="vram-unit">&nbsp;GB</span>
<span class="vram-info" aria-label="显存估算明细" @mouseenter="onInfoEnter" @mouseleave="vramTip = null">
  <FontAwesomeIcon :icon="byPrefixAndName.fat['circle-info']" />
</span>
```

Teleport 内顶层（ConfirmDialog 旁，`.modal-overlay` 之外）加浮层：

```html
<!-- VRAM 明细浮层：position:fixed 浮于视口（同 .tpl-tip 方案，避开底栏裁剪）；
     上方居中，顶部放不下时 --down 翻转到图标下方 -->
<div v-if="vramTip" class="vram-tip" :class="{ 'vram-tip--down': vramTip.flip }"
  :style="{ left: vramTip.x + 'px', top: (vramTip.flip ? vramTip.y + 24 : vramTip.y) + 'px' }">
  <template v-if="breakdown">
    <div v-for="row in breakdown" :key="row.label" class="vram-tip__row">{{ row.label }} {{ row.gb.toFixed(1) }} GB</div>
  </template>
  <div v-else class="vram-tip__row">{{ breakdownFallback }}</div>
</div>
```

（`vramTip.y + 24` = 翻转时贴图标下方留 6px 间距；24 = 图标行高 + 间距的经验值。）

- [x] **步骤 4：CSS（scoped 区末尾追加）**

```css
/* VRAM 明细悬停弹窗（规格 2026-08-30-vram-breakdown-tooltip-design §3.1/§3.2）：
   与「编辑」按钮 tooltip 同视觉语言（深灰底白字/12px/圆角/z-30），多行列表自绘浮层；
   position:fixed 浮于视口，避开 .modal-box overflow 裁剪（同 .tpl-tip / .dd-tip 方案）。 */
.vram-info {
  margin-left: 4px;
  display: inline-flex; align-items: center;
  color: var(--muted);
  font-size: 13px; line-height: 1;
  cursor: default;          /* 纯 hover 提示，非可点击 */
}
.vram-tip {
  position: fixed;
  transform: translateX(-50%) translateY(-100%); /* 默认：图标上方居中 */
  background: #374151; color: #fff;
  font-size: var(--fs-label); line-height: 1.6;
  white-space: nowrap;
  padding: 6px 10px; border-radius: 6px;
  z-index: 30;
  pointer-events: none;
}
/* 顶部放不下：翻转到图标下方（不带 translateY(-100%)） */
.vram-tip--down { transform: translateX(-50%); }
.vram-tip__row + .vram-tip__row { margin-top: 2px; }
```

- [x] **步骤 5：运行测试验证通过**

运行：`npx vitest run -- src/modules/TemplateModal.test.ts`
预期：新 describe 6 个用例全 PASS，既有 vram indicator 用例（含 `tooltip_mentions_gpu_fixed_overhead_when_estimated`，断言 `.title` 含「固定开销」）仍 PASS。

- [x] **步骤 6：Commit**

```bash
git add src/modules/TemplateModal.test.ts src/modules/TemplateModal.vue
git commit -m "feat: vram breakdown tooltip on hover of circle-info icon"
```

---

### 任务 3：vram_estimate IPC 追加分项（main.ts）

**文件：**
- 修改：`src-main/main.ts`（`vram_estimate` handler 的 `return`）

- [x] **步骤 1：返回值追加 parts**

```ts
return {
  ok: true,
  usedGb: res.total / 1024 ** 3,
  parts: { // 分项 GiB（= EstimateResult 各字段 ÷ 2³⁰）：渲染端明细弹窗逐行列出
    model: res.modelBytes / 1024 ** 3,
    mmproj: res.mmprojBytes / 1024 ** 3,
    kv: res.kvBytes / 1024 ** 3,
    batch: res.batchBytes / 1024 ** 3,
    draft: res.draftBytes / 1024 ** 3,
    fixed: res.fixedBytes / 1024 ** 3,
  },
};
```

（`ok: false` 分支不动——`{ ok: false, reason }` 形状不变。）

- [x] **步骤 2：主进程构建验证**

运行：`npx tsc -p tsconfig.main.json`
预期：exit 0（无类型错误；vram.ts 的 EstimateResult 字段名与 handler 一一对应——modelBytes/mmprojBytes/kvBytes/batchBytes/draftBytes/fixedBytes）。

- [x] **步骤 3：Commit**

```bash
git add src-main/main.ts
git commit -m "feat: vram_estimate returns per-term breakdown (GiB) for tooltip"
```

---

### 任务 4：全量验证

- [x] **步骤 1：全量测试**

运行：`npm test`
预期：全部 PASS（vram.test.ts / config.test.ts / TemplateModal.test.ts / LaunchBar / App / Dropdown / ConfirmDialog / build / ico / process 等）。

- [x] **步骤 2：前端构建**

运行：`npm run build`（vite build + tsc）
预期：exit 0，dist/ 产物更新。

---

### 自检记录

- 规格 §2（图标 span + circle-info）→ 任务 2 步骤 1/3 ✓
- 规格 §3.1 样式（#374151 / 12px / 6px 圆角 / z-30 / pointer-events:none）→ 任务 2 步骤 4 ✓
- 规格 §3.2 定位（上方居中 + 翻转）→ 任务 2 步骤 3（.vram-tip--down）✓
- 规格 §3.3 行排布（5 数据项 0 隐藏 + GPU 固定末行）→ 任务 1 测试 + 任务 2 breakdown computed ✓
- 规格 §3.3 降级四档（未填 -m / 未配置 / 失败 reason / IPC 失败）→ breakdownFallback ✓
- 规格 §4 IPC parts（ok:false 不变）→ 任务 3 ✓
- 规格 §6 测试 6 用例 → 任务 1 ✓（main.ts IPC 无组件级测试——electron 依赖不可单测，渲染端 mock parts 覆盖契约）
- 占位符扫描：无待定/TODO ✓
- 类型一致性：parts 键 model/mmproj/kv/batch/draft/fixed，任务 1 mock、任务 2 computed、任务 3 handler 三处一致 ✓

**dev 目视验证（build 后人工）：** `npm run dev` 打开模板弹窗填 -m，hover ⓘ——确认 6 行（或 0 项隐藏后的行数）+ 末行「GPU 固定开销约 2GB」；底栏 22.0 / 24.0 GB 右侧出 ⓘ。