# LMS 启动器 i18n · S7 日志面板设计

**日期：** 2026-10-03
**分支：** feat/i18n
**分片：** S7（日志面板）
**设计权威：** `2026-09-22-i18n-design.md`（跨切片不变量）+ `2026-09-22-i18n-slices.md`（分片卡）
**性质：** S7 轻量独立规格（分片卡未标「建议展开」：2 个渲染端文件、11 处文案、无跨进程变更；按 S2–S6 先例展开 spec + plan）

> 本文件与设计总纲冲突时，以设计总纲为准；本文件只细化 S7 的实现契约。

---

## 1. 背景与目标

S7 覆盖日志面板两个组件：`src/modules/LogPanel.vue`（tab 条 + 按 tab 挂载 LogTabView）与 `src/modules/LogTabView.vue`（工具行 + 查找 + 日志视图）。

**目标：** `LogTabView.vue` 内 11 处硬编码中文接入 `t()`，中英即时切换；`LogPanel.vue` 与 `log-tabs.ts` 经核对零改动；中文界面除用户明确要求的一处文案（空态去全角括号）外零回归。

### 1.1 现状盘点（探索结论）

| # | 位置 | 现状（zh） |
|---|---|---|
| 1 | 模板 L137 `<span>` | `自动滚动` |
| 2 | 模板 L141 `aria-label` + `data-tooltip` | `清空日志`（同串） |
| 3 | 模板 L148 `placeholder` | `查找…` |
| 4 | 模板 L148 `aria-label` | `日志查找` |
| 5 | 模板 L151 `aria-label` + `data-tooltip` | `清空查找`（同串） |
| 6 | 模板 L156 `aria-label` | `上一个匹配` |
| 7 | 模板 L156 `data-tooltip` | `上一个` |
| 8 | 模板 L160 `aria-label` | `下一个匹配` |
| 9 | 模板 L160 `data-tooltip` | `下一个` |
| 10 | 模板 L166 空态 | `（暂无日志）` |
| 11 | 模板 L169 `data-tooltip` | `Ctrl + Click 打开链接` |

关键事实：

- **`LogPanel.vue` 零中文 UI 串**：模板只有 `LOG_TABS[].label`（L20）与 LogTabView 挂载；tab 名来自 `src/modules/log-tabs.ts`（`LMS Launcher` / `llama-server`，双语同形）。
- **`log-tabs.ts` 零改动**：`LogTab` 是渲染层注册表，label 已是英文专名（分片卡「英文例外」已定）；本分片不向该文件引入 `t()`。
- **既有断言**：`LogPanel.test.ts:160/168/171` 用 `button[aria-label="清空日志"]` 选择器、`LogTabView.test.ts:28` 断言 `data-tooltip = 'Ctrl + Click 打开链接'` —— zh 词典值逐字一致即**零改动继续通过**。
- **`App.test.ts` 连带（3 处）**：L191 / L375 / L391 按字面量 `'（暂无日志）'` 过滤空桶占位行；zh 文案改 `暂无日志` 后必须同步改为词典取值，否则空桶被计为 1 行（详见 §5）。
- **布局余量充足**：工具行 = label（checkbox 13px + gap 4px + 文案）+ 清空按钮 32px + `.log-search`（`margin-left:8px` + 定宽输入框 170px + 24px 图标按钮 ×4 + 定宽计数 32px + gap 2px）。zh 约 391px、en 约 411px；窗口 `minWidth: 760`（`src-main/main.ts:207`），可用宽 > 700px → en 不换行、不溢出。
- **不译项**：查找计数（`${Math.max(currentIdx+1,0)} / ${matches.length}`，L40–41）为纯数字 + 半角斜杠；日志正文为运行时数据。
- **测试基线（2026-10-03 实测）**：`npm test` = **34 文件 / 553 用例** 全绿（与 S6 收尾记录一致）。

---

## 2. 范围与非目标

### 2.1 范围内（11 处，全部在 `LogTabView.vue`）

见 §1.1 表 1–11；其中 #2、#5、#7、#9 为「同一控件的 aria + tooltip」双属性写入。

### 2.2 非目标（本轮零改动）

1. **`LogPanel.vue`**：零改动（无中文 UI 串）。
2. **`log-tabs.ts`**：tab 名 `LMS Launcher` / `llama-server` 双语同形，零改动、不接词典。
3. **查找计数**：`0 / 0`、`1 / 2` 等纯数字串，不入词典（`.log-search-count` 定宽 32px 正是按 `0 / 0` 校准）。
4. **日志正文 / 类名 / 滚动与查找逻辑**：零改动。
5. **CSS**：不新增、不修改任何既有规则；不预置 `html[lang="en"]` 作用域覆盖（§6）。
6. **主进程**：`src-main/*` 零改动（主进程日志站点属 S10）。
7. **S10 边界**：`src-main/main.ts`、`config.ts`、`build.ts`、`vram.ts`、`update-verify.ts`、`llama-update-download.ts`、`llama-check.ts` 与 `App.vue:107` 两行 sys 日志均不在本分片。
8. 不引入新依赖；不动既有 zh 断言（`App.test.ts` 的 3 处占位过滤口径属 §5 连带，业务断言不变）。

---

## 3. key 契约（新增 11 个）

scope `log` 已在设计总纲 §3.2 白名单内；本分片新增 `toolbar` / `search` / `empty` / `link` 四个二级命名空间，与 S10 的 `log.<subject>.*`（如 `log.launcher.check.found`）不重叠。

| key | zh | en |
|---|---|---|
| `log.toolbar.autoScroll` | 自动滚动 | Auto-scroll |
| `log.toolbar.clear` | 清空日志 | Clear |
| `log.search.placeholder` | 查找… | Find... |
| `log.search.aria` | 日志查找 | Search logs |
| `log.search.clear` | 清空查找 | Clear search |
| `log.search.prev` | 上一个 | Previous |
| `log.search.prevMatch` | 上一个匹配 | Previous match |
| `log.search.next` | 下一个 | Next |
| `log.search.nextMatch` | 下一个匹配 | Next match |
| `log.empty.missing` | 暂无日志 | no logs |
| `log.link.tip` | Ctrl + Click 打开链接 | Ctrl + Click to open link |

说明：

- **aria 与 tooltip 分 key**：#2 / #5 两属性同串 → 共用 1 个 key；#6/#7 与 #8/#9 串不同 → 各 2 个 key（aria 带 `match` 保语义完整）。
- **zh 只改 #10**：`（暂无日志）` → `暂无日志`（用户 2026-10-03 明确要求去全角括号；英文同步无括号 `no logs`）。这是「中文布局冻结」在本分片唯一获批的例外，属纯文本变化，不涉及 CSS。
- **en 半角三点**：`Find...` 用半角 `...`，与 `launch.placeholder.select`（`Select a config...`）、`dir.status.saving`（`Saving...`）先例及总纲 §2「英文标点用半角」一致；zh 保留全角省略号 `…`。
- **术语表对齐**：`自动滚动 → Auto-scroll`、`清空日志 → Clear`、`查找 → Find`（总纲 §2）。
- 本分片 0 个带占位符的 key，无插值。

---

## 4. 组件改造设计

### 4.1 导入

`LogTabView.vue` 顶部（L7 `import { findMatches, ... } from '../util/log-search';` 之后）新增：

```ts
import { t } from '../i18n';
```

### 4.2 工具行（L137、L141）

```html
        <span>{{ t('log.toolbar.autoScroll') }}</span>
```

```html
      <button type="button" class="icon-btn icon-btn--noborder" :aria-label="t('log.toolbar.clear')" :data-tooltip="t('log.toolbar.clear')" @click="onClear">
```

### 4.3 查找组（L147–148、L150–151、L155–156、L159–160）

```html
        <input type="text" class="input log-search-input" v-model="query"
          :placeholder="t('log.search.placeholder')" :aria-label="t('log.search.aria')" />
```

```html
        <button type="button" class="icon-btn icon-btn--noborder btn-search-clear"
          :aria-label="t('log.search.clear')" :data-tooltip="t('log.search.clear')" :disabled="clearDisabled" @click="onQueryClear">
```

```html
        <button type="button" class="icon-btn icon-btn--noborder btn-search-prev"
          :aria-label="t('log.search.prevMatch')" :data-tooltip="t('log.search.prev')" :disabled="navDisabled" @click="goPrev">
```

```html
        <button type="button" class="icon-btn icon-btn--noborder btn-search-next"
          :aria-label="t('log.search.nextMatch')" :data-tooltip="t('log.search.next')" :disabled="navDisabled" @click="goNext">
```

### 4.4 空态与链接 tooltip（L166、L169）

```html
      <template v-if="lines.length === 0"><p class="ln-dim">{{ t('log.empty.missing') }}</p></template>
```

```html
          <span v-if="g.inLink && g.parts" class="ln-link tip-up" :data-tooltip="t('log.link.tip')" @click.ctrl="onLink(g.url)">
```

### 4.5 响应式

`t()` 读渲染端 `lang` ref（`src/i18n.ts:30`），模板内调用 → 切换语言即时重译，无需重挂载。`data-tooltip` 由 CSS `attr()` 消费（`.icon-btn::after` / `.tip-up::after`），绑定值变化即重绘 tooltip 文本。本分片不涉及 S0 的「存 key 快照」机制，也不新增 computed。

---

## 5. 连带改动：`App.test.ts` 空态过滤（3 处）

**依据：** grill Q5 定稿 —— 过滤器改用词典取值，杜绝下次文案变更再连带改测试。

该文件受 S0 记录的约束（`App.test.ts:830` 注释、`src/test-setup.ts:3–4` 注释：静态 import `./i18n` 会在 `vi.mock('./ipc')` 注册前绑定真实 ipc），故采用**顶层延迟 import 取常量** —— 与 `VramDialog.test.ts:11–12`（`vi.mock` 后顶层 `await import`）同型：

```ts
// S7（2026-10-03）：空桶占位行文案取自词典（zh 下 = 暂无日志）。
// 延迟 import 原因同 src/test-setup.ts：静态 import 会在 vi.mock('./ipc') 注册前绑定真实 ipc。
const { t: i18nText } = await import('./i18n');
const EMPTY_LOG = i18nText('log.empty.missing');
```

- 常量紧跟 `vi.mock('./ipc', ...)` 闭合（L47）之后定义；`src/test-setup.ts` 的 `beforeEach` 每次把语言固定为 zh，故取值为 `暂无日志`，与组件渲染值始终一致。
- **L191 / L375 / L391** 三处过滤条件由字面量 `'（暂无日志）'` 改为 `!== EMPTY_LOG`（参数名由 `t` 改为 `s`，避免与 i18n 命名混淆）；**helper 签名与全部调用点保持不变**（`launcherTexts(w)` / `tabTexts(w, tabId)` 原样）。
- **L373** 注释「（暂无日志）」→「暂无日志」。
- **L202** `expect(lines.some((l) => l.includes('（'))).toBe(false);` 不变（断言的是 sys 日志行不含括号文字）。
- 只改过滤口径，不改任何业务断言与期望行数。

> 实现顺序约束：本项必须与 §4 同批提交 —— `LogTabView.vue` 改文案后空桶即渲染 `暂无日志`，未同步的过滤会把这些用例弄红。

---

## 6. 英文文案规则与布局

- 术语与规则遵循总纲 §2 / §3.6：英文半角标点、按钮最短动词、专名保留。
- **零 CSS 改动、零 `html[lang="en"]` 覆盖**（grill Q9）：工具行 en 约 411px，窗口最小宽 760px 下可用 > 700px，余量 > 250px；查找框（170px）与计数（32px）定宽不随语言变化。
- 人工目视验收（留待用户）：en 下工具行不换行、不挤压查找组；空态与日志正文对齐不变。

---

## 7. 测试设计

### 7.1 既有断言零改动

- `LogPanel.test.ts`（177 行）全部在 zh 下运行（`test-setup.ts` 固定 zh）；`aria-label="清空日志"` 三处选择器在 zh 词典值逐字一致下继续通过。
- `LogTabView.test.ts` 既有 19 条零改动（含 L28 的 `Ctrl + Click 打开链接` tooltip 断言）。
- `App.test.ts` 仅 §5 的过滤口径调整，业务断言全不动。

### 7.2 新增 7 条（全部追加到 `LogTabView.test.ts` 末尾）

1. **zh 全串回归**（1 条，非 en 块）：锁 11 处现状 —— 工具行 `自动滚动`；清空按钮 aria+tooltip `清空日志`；输入框 `placeholder=查找…` + aria `日志查找`；清空查找 aria+tooltip `清空查找`；上一个 aria `上一个匹配` / tooltip `上一个`；下一个 aria `下一个匹配` / tooltip `下一个`；空态 `暂无日志`（`lines: []` 挂载）；链接 tooltip `Ctrl + Click 打开链接`（含 URL 行挂载）。
2. **en 工具行**：`.label span` = `Auto-scroll`；清空按钮 aria + `data-tooltip` = `Clear`。
3. **en 查找组**：`placeholder` = `Find...`；aria = `Search logs`；清空查找 aria + tooltip = `Clear search`。
4. **en 导航**：prev aria `Previous match` / tooltip `Previous`；next aria `Next match` / tooltip `Next`。
5. **en 空态**：`lines: []` → `.ln-dim` = `no logs`。
6. **en 链接 tooltip**：含 URL 行 → `.ln-link` 的 `data-tooltip` = `Ctrl + Click to open link`。
7. **en 不译项锁定**：计数 `0 / 0` 不变；输入 `error` 点「下一个」后 `1 / 2`；日志正文 `Error: disk full` 原样。

实现约定：en 沿用 S3–S6 惯例 —— 文件顶部新增 `import { applyLangLocal } from '../i18n';`（静态 import，与 `GpuModule.test.ts:11` 同型；本文件已 `vi.mock('../ipc')`，而 `i18n.ts` 仅在 `setLang` 内调用 `invoke`，不受影响），en 块 `beforeEach(() => applyLangLocal('en'))` + `afterEach(() => applyLangLocal('zh'))`。

### 7.3 收尾验证

- `npm test` 全绿（基线 **34 文件 / 553 用例** → 预期 **34 文件 / 560 用例**）。
- 已知环境噪声：Windows 下 vitest 临时目录偶发 `EBUSY: resource busy or locked`（**非本分片引入**，S6 已记录）。本次规划实测：把 `TEMP` 指向工作区 `.temp/vitest` 后确定性全绿；仍红才视为真实失败。
- `npm run build` 通过。
- 人工英文目视验收（留待用户）。

---

## 8. 验收点

1. 工具行、清空、查找组、导航的可见文本 / placeholder / aria / tooltip 共 11 处随语言即时切换。
2. en：`Auto-scroll` / `Clear` / `Find...` / `Search logs` / `Clear search` / `Previous` / `Previous match` / `Next` / `Next match` / `no logs` / `Ctrl + Click to open link`。
3. zh：除空态去括号（`暂无日志`）外与现状逐字一致。
4. 不译项不变：tab 名、查找计数、日志正文、类名与 DOM 结构。
5. 既有 zh 断言零改动全绿；词典 zh/en key 集合相等（S0 一致性单测自动覆盖 11 个新 key）。
6. 零 CSS 改动；业务文件改动仅 `LogTabView.vue` 与词典；`LogPanel.vue` / `log-tabs.ts` / `src-main/*` 零改动。

---

## 9. 风险与已定决策

| # | 风险 | 处置 |
|---|---|---|
| R1 | zh 词典值改写（尤其空态去括号）→ 既有断言/界面漂移 | §3 要求除 #10 外逐字照抄现状串；#10 为获批变更 |
| R2 | `App.test.ts` 3 处字面量过滤未同步 → 空桶计数翻红 | §5 与 §4 同批提交；收尾 `npm test` 全绿 |
| R3 | 漏改 aria 或 tooltip 单侧（L141/L151/L156/L160 双属性） | §4 逐行列出；en 冒烟第 2/3/4 条同时断言两个属性 |
| R4 | en 文案变长破坏工具行布局 | §6 实测余量 > 250px；零 CSS；人工目视 |
| R5 | `npm test` 偶发 EBUSY 被误判为回归 | §7.3 记为环境噪声；`TEMP` 指向 `.temp/vitest` 后确定性通过 |
| R6 | 误把 tab 名 / 计数当需翻译项 | §2.2 明确零改动；en 冒烟第 7 条锁定计数 |
| R7 | 分片表 S7 行「独立 spec」指针误指向 S6 GPU 文档 | 规划步同时修正看板指针（实现计划任务 4） |

**已定决策台账（2026-10-03 grill-me 逐问定稿，10 问）：**

1. key 命名空间：`log.toolbar.*` + `log.search.*` + `log.empty.missing` + `log.link.tip`（按 UI 部件分组；aria 与 tooltip 分 key，同串共用）。
2. `清空查找` en = `Clear search`（与 `清空日志 → Clear` 区分，避免两个 icon 按钮同 aria）。
3. 导航 en：tooltip `Previous` / `Next`，aria `Previous match` / `Next match`。
4. 空态：zh `暂无日志`（去全角括号）、en `no logs`（无括号）—— 用户指定。
5. `App.test.ts` 3 处占位过滤改用 `t('log.empty.missing')`（顶层延迟 import 取常量 `EMPTY_LOG`，与 `VramDialog.test.ts:11–12` 同型）。
6. 查找计数：零改动、不入词典。
7. 查找框 aria en = `Search logs`；链接 tooltip en = `Ctrl + Click to open link`。
8. 测试：1 条 zh 全串回归 + 6 条 en 冒烟，全部落 `LogTabView.test.ts`。
9. 布局：零 CSS 改动 + 零 `html[lang="en"]` 作用域覆盖。
10. 交付：spec + plan 两份文件 + 看板修正（S7 指针/状态/变更记录），规划步单独 commit；实现另起。
