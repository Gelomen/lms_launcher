# LMS 启动器 i18n · S6 GPU 卡片设计

**日期：** 2026-10-02
**分支：** feat/i18n
**分片：** S6（GPU 卡片）
**设计权威：** `2026-09-22-i18n-design.md`（跨切片不变量）+ `2026-09-22-i18n-slices.md`（分片卡）
**性质：** S6 轻量独立规格（分片卡未标「建议展开」：仅 1 个渲染端文件、6 处文案、无跨进程变更；按 S2–S5 先例仍展开 spec + plan）

> 本文件与设计总纲冲突时，以设计总纲为准；本文件只细化 S6 的实现契约。

---

## 1. 背景与目标

`src/modules/GpuModule.vue`（模块 5 · 系统 GPU 显存卡片，spec `2026-09-09-gpu-card-design` §5）是 S6 的唯一业务文件。

**目标：** 卡片内 6 处硬编码中文（四格标签 4 + 轮播 aria 2）接入 `t()`，中英即时切换；英文术语与 Windows 11 英文任务管理器逐字一致；中文界面零回归。

### 1.1 现状盘点（探索结论）

| # | 位置 | 现状（zh） |
|---|---|---|
| 1 | 模板 L297 `.gpu-cell` label | `专用 GPU 内存` |
| 2 | 模板 L298 | `共享 GPU 内存` |
| 3 | 模板 L300 | `GPU 内存` |
| 4 | 模板 L301 | `GPU 利用率` |
| 5 | 模板 L275 `aria-label` | `上一张卡` |
| 6 | 模板 L309 `aria-label` | `下一张卡` |

**全组件其余文本均为语言中性**（不译，见 §2.2）：占位 `–`（U+2013）、单位 `GB` / `%`、`' / '` 分隔、标题前缀 `#GPU {dxgiIndex}` + 卡名（硬件数据）、数值 1 位小数（`toFixed(1)`）。

关键事实：

- **布局硬约束**：`.grid` 三列 `280px 350px 300px`（`src/style.css:79`），GPU 卡为第三列 300px；`.card` padding 16px、`.gpu-body` padding `0 8px`、`.gpu-grid` 两列 + `gap: 6px 24px` → 每列可用宽约 122px，label 字号 `--fs-label: 12px`。
- **垂直余量**：GPU 卡与左侧 `.stack`（DirModule + LaunchBar 两张卡）同行，grid 默认拉伸 → `.module-gpu{height:100%}`、`.gpu-stage{flex:1}`、`.gpu-grid{margin:auto}` 垂直居中，label 折行只增约一行高，不会撑破卡片。
- **折行必然**：`.gpu-cell{display:flex;flex-direction:column;min-width:0}`，label 无 `white-space:nowrap` → `Dedicated GPU memory`（约 122–130px @12px）折成两行。
- **测试现状**：`GpuModule.test.ts`（408 行）**没有任何四格 label 断言**；仅在 L131–132 断言两条 zh aria。
- **回退卡名**：`src-main/gpu-stats.ts:102` 的 `'GPU ' + (i+1)` 是纯函数 `mergeGpuStats` 产出，`gpu-stats.test.ts:111` 断言 `GPU 1` / `GPU 2`；双语同形，属「GPU 专名不译」。
- **双份 formatGb**：`GpuModule.vue:17` 与 `src-main/gpu-stats.ts:123` 是两份同实现（防漂移，各自 fixture 锁定），输出 `–` / `1.0 GB`，无中文。
- **测试基线**：`npm test` = 34 文件 / 549 用例（2026-10-02 实测；`slices.md` 中 S5 的 546 未计入其后 `7e2c54f` 新增用例）。

---

## 2. 范围与非目标

### 2.1 范围内（6 处，全部在 `GpuModule.vue`）

见 §1.1 表 1–6。

### 2.2 非目标（本轮零改动）

1. **单位与占位**：`–`（U+2013）、`GB`、`%`、`' / '`、`28 %` 的空格、`toFixed(1)` 一位小数 → 全部保持现状（双语同形）。
2. **标题行**：`#GPU {dxgiIndex}` 前缀 + 卡名（DXGI 硬件数据）→ 不译；`#GPU N` 格式保留。
3. **回退卡名** `GPU N`（`src-main/gpu-stats.ts`）→ 双语同形，**零改动**；切片卡「涉及文件」中该文件降级为「已核对、无需改动」，`gpu-stats.test.ts` 零改动。
4. **CSS**：不新增、不修改任何既有规则；不预置 `html[lang="en"]` 作用域覆盖（§5）。
5. 不引入新依赖；不改 `src-main/*`；不改 `src/App.vue`；不动既有 zh 断言。

---

## 3. key 契约（新增 6 个）

scope `gpu` 已在设计总纲 §3.2 白名单内，无需登记新 scope。

| key | zh（与现状逐字一致） | en（Win11 任务管理器术语） |
|---|---|---|
| `gpu.cell.dedicated` | 专用 GPU 内存 | Dedicated GPU memory |
| `gpu.cell.shared` | 共享 GPU 内存 | Shared GPU memory |
| `gpu.cell.total` | GPU 内存 | GPU memory |
| `gpu.cell.util` | GPU 利用率 | GPU utilization |
| `gpu.nav.prev` | 上一张卡 | Previous GPU |
| `gpu.nav.next` | 下一张卡 | Next GPU |

说明：

- zh 值照抄 `GpuModule.vue` 现状串（`GPU` 前为半角空格），保证既有 zh 断言与「中文零回归」。
- en 四格与 Windows 11 英文任务管理器「性能 → GPU」页逐字一致（前两条由 [DirectX 开发博客](https://devblogs.microsoft.com/directx/gpus-in-the-task-manager/) 的 Dedicated/Shared memory 定义与英文教程/微软问答的列名佐证；后两条与中文 UI 逐项对应）；这也是本项目「任务管理器风格」图表的设计来源。
- `gpu.nav.prev` / `gpu.nav.next` 为纯 aria 文案（不影响布局）。
- 本分片 0 个带占位符的 key，无插值。

---

## 4. 组件改造设计

### 4.1 导入

`GpuModule.vue` 顶部新增一行（与 `DirModule.vue:7` / `TemplateModule.vue:8` 同惯例）：

```ts
import { t } from '../i18n';
```

### 4.2 四格 label

模板 L297/298/300/301 的 label 文本替换为：

```html
<div class="gpu-cell"><span class="label">{{ t('gpu.cell.dedicated') }}</span><span class="gpu-val">{{ memOf(l.cardIndex, 'dedicated') }}</span></div>
<div class="gpu-cell"><span class="label">{{ t('gpu.cell.shared') }}</span><span class="gpu-val">{{ memOf(l.cardIndex, 'shared') }}</span></div>
<!-- 合计 = 专用 + 共享（组件层计算，spec §3） -->
<div class="gpu-cell"><span class="label">{{ t('gpu.cell.total') }}</span><span class="gpu-val">{{ memOf(l.cardIndex, 'sum') }}</span></div>
<div class="gpu-cell"><span class="label">{{ t('gpu.cell.util') }}</span><span class="gpu-val">{{ util(l.cardIndex) }}</span></div>
```

顺序与语义映射不变：专用 / 共享 / 合计（`sum`）/ 利用率。

### 4.3 轮播 aria

模板 L275 / L309：

```html
<button type="button" class="gpu-nav-btn gpu-nav-btn--left" :disabled="!multi" :aria-label="t('gpu.nav.prev')" @click="go(-1)">…</button>
<button type="button" class="gpu-nav-btn gpu-nav-btn--right" :disabled="!multi" :aria-label="t('gpu.nav.next')" @click="go(1)">…</button>
```

（`aria-label` 由静态字符串改为绑定；其余属性与结构不动。）

### 4.4 响应式

`t()` 读渲染端 `lang` ref（`src/i18n.ts:30`），在模板中调用 → 切换语言即时重译，无需重挂载。本分片**不涉及** S0 的「存 key 快照」机制（该机制只用于非响应式快照，如 `saveError`）。

---

## 5. 英文文案规则与布局

- 术语对齐 Windows 11 英文任务管理器（§3）。
- **不预置 `html[lang="en"]` 作用域 CSS**（已定）：接受 `Dedicated GPU memory` / `Shared GPU memory` 折行；卡片被左列 stack 撑高、`.gpu-grid` 垂直居中，垂直方向有余量；水平方向 `min-width:0` 不挤压相邻列。
- **中文布局冻结**：不新增 / 不修改任何既有 CSS 规则。
- 人工目视验收（留待用户）：en 下四格折行不破版、`–` 占位与数值对齐不变。

---

## 6. 测试设计

### 6.1 既有断言零改动

`GpuModule.test.ts` 现有 408 行全部在 zh 下运行（`test-setup.ts` 固定 zh）；两条 aria 断言（L131–132）在 zh 词典值逐字一致下继续通过。

### 6.2 新增 4 条

追加到文件末尾，结构同 S3/S4：

```ts
describe('GpuModule i18n', () => {
  it('zh：四格标签与现状中文逐字一致（中文零回归）', /* … */);
  describe('en 冒烟', () => {
    beforeEach(() => { applyLangLocal('en'); });
    afterEach(() => { applyLangLocal('zh'); });
    it('四格标签 = Windows 11 英文任务管理器术语', /* … */);
    it('轮播 aria = Previous GPU / Next GPU', /* … */);
    it('不译项锁定：占位 / 数值 / 单位 / 标题', /* … */);
  });
});
```

| # | 断言点 |
|---|---|
| 1（zh） | 数据态可见层 `.gpu-cell .label` 文本 = `['专用 GPU 内存','共享 GPU 内存','GPU 内存','GPU 利用率']` |
| 2（en） | 同上 = `['Dedicated GPU memory','Shared GPU memory','GPU memory','GPU utilization']` |
| 3（en） | 多卡态左右按钮 `aria-label` = `Previous GPU` / `Next GPU` |
| 4（en） | 不译项锁定：首帧 `.gpu-title` = `–`、`.gpu-val` = `['– / –','– / –','– / –','–']`；`fire([GPU_A, GPU_B])` 后 `.gpu-val` = `['22.0 / 24.0 GB','1.0 / 48.0 GB','23.0 / 72.0 GB','28 %']`、`.gpu-title` = `#GPU 0 NVIDIA GeForce RTX 4090` |

实现约定：en 冒烟沿用 S3/S4 惯例，`import { applyLangLocal } from '../i18n';` + `beforeEach/afterEach` 切回 zh；label 断言**必须过滤隐藏层**——`w.findAll('.gpu-layer:not(.gpu-layer--off) .gpu-cell .label')`（`.gpu-layer` 两层恒渲染，不过滤会得到 8 个 label；与既有 `cellTexts` 同口径）。**2026-10-02 规划期一次性实测**：裸 `.gpu-cell .label` = 8 条（zh × 2 层），加 `.gpu-layer:not(.gpu-layer--off)` = 4 条且为现状中文，即第 1 条断言在实现前应已 PASS。

### 6.3 收尾验证

- `npm test` 全绿（基线 34 文件 / **549** 用例 → 预期 **553** 用例）。
- 已知环境噪声：首次 `npm test` 可能在 vitest 临时目录上抛 `EBUSY: resource busy or locked` 导致若干文件报错——**非本分片引入**，重跑一次即通过；重跑仍红才视为真实失败。
- `npm run build` 通过。
- 人工英文目视验收（留待用户）。

---

## 7. 验收点

1. 四格标签与两个 aria 随语言即时切换。
2. en 四格 = `Dedicated GPU memory` / `Shared GPU memory` / `GPU memory` / `GPU utilization`；aria = `Previous GPU` / `Next GPU`。
3. zh 四格与现状逐字一致。
4. 不译项不变：`–`、`GB`、`%`、`28 %`、`22.0 / 24.0 GB`、`#GPU N 卡名`、回退名 `GPU N`。
5. 既有 408 行 zh 断言零改动全绿；词典 zh/en key 集合相等（S0 一致性单测自动覆盖 6 个新 key）。
6. 零 CSS 改动；`GpuModule.vue` 之外无业务文件改动（词典与测试除外）；`src-main/*` 零改动。

---

## 8. 风险与已定决策

| # | 风险 | 处置 |
|---|---|---|
| R1 | zh 词典值改写 → 既有断言/界面语义漂移 | §3 要求逐字照抄现状串 |
| R2 | en label 折行破版 | §5：卡片垂直余量 + `min-width:0`；不预置 CSS，人工目视；真溢出再以 `html[lang="en"]` 兜底 |
| R3 | aria 在超长模板行（L275/L309）被漏改 | §4.3 明确两行；en 冒烟第 3 条覆盖 |
| R4 | en 冒烟污染其它用例（test-setup 固定 zh） | `beforeEach applyLangLocal('en')` + `afterEach applyLangLocal('zh')` |
| R5 | `npm test` 偶发 EBUSY 被误判为回归 | §6.3 记为环境噪声，重跑确认 |
| R6 | 误把 `GPU N` 回退名 / 单位当需翻译项 | §2.2 明确零改动；en 冒烟第 4 条锁定 |

**已定决策台账（2026-10-02 grill 逐问定稿）：**

1. 文档形态：沿用既有命名两份文件（spec + plan），规划步单独 commit。
2. 英文四格文案：与 Windows 11 英文任务管理器逐字一致（`Dedicated GPU memory` / `Shared GPU memory` / `GPU memory` / `GPU utilization`）。
3. 折行处置：不预置 `html[lang="en"]` CSS，接受折行，人工目视验收。
4. aria 英文：`Previous GPU` / `Next GPU`。
5. 单位与数值格式：全部保持现状零改动。
6. 回退卡名 `GPU N`：`src-main/gpu-stats.ts` 零改动，spec 记为已核对的不译项。
7. 测试：3 条 en 冒烟（label / aria / 不译项）+ 1 条 zh 四格 label 回归。
8. key 命名：`gpu.cell.dedicated|shared|total|util` + `gpu.nav.prev|next`（共 6）。
9. 交付边界：本轮 = spec + plan + 看板 ☐→◐ + `docs(i18n):` commit；实现另起。
