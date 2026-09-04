# 顶栏「有新版本!」按钮 tooltip 统一为项目公共样式 — 设计规格

日期：2026-09-05
状态：已实现
关联模块：`src/App.vue`（顶栏 .update-pill 按钮）、`src/style.css`（tooltip 公共类）

## 1. 目的

顶栏「有新版本!」（及 downloading 态「下载中 NN%」）按钮目前用**原生** `:title` 提供 hover 提示。
项目已有统一的自绘 tooltip 视觉语言（深灰底白字 / 12px / 圆角 6px / z-30 / pointer-events:none）：
.icon-btn::after、.tip-up::after（data-tooltip 驱动，供非 .icon-btn 的按钮复用，如「选择目录」「选择文件」、VRAM 徽章、日志链接）。
本规格把更新按钮的 `:title` 换成同一套公共 tooltip 样式，消除原生提示与自绘提示的视觉割裂。

## 2. 范围

- 只改顶栏两个更新按钮：`available` 态「有新版本!」与 `downloading` 态「下载中 NN%」（同一 .update-pill 类）。
- 三键（最小化/最大化/关闭 .winbtn）的原生 title 不动（用户未要求；另议）。

## 3. 设计

### 3.1 新增 `.tip-down`（`src/style.css`，紧随 .tip-up 规则之后）

.tip-up 把浮层挂在元素**上方**——按钮位于窗口最顶部（winbar 贴窗口上缘），上方无空间，
浮层会被窗口边界裁掉。故新增向下定位的孪生类，**视觉语言与 .tip-up 完全一致**（同一条 ::after 声明，仅定位轴相反）：

```css
.tip-down { position: relative; }
.tip-down::after {
  content: attr(data-tooltip);
  position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%);
  background: #374151; color: #fff;
  font-size: var(--fs-label); line-height: 1.4; white-space: nowrap;
  padding: 2px 8px; border-radius: 6px;
  z-index: 30;
  pointer-events: none;
  opacity: 0;
}
.tip-down:hover::after { opacity: 1; }
```

浮层向下展开进内容区（winbar 无 overflow 裁剪），hover 立即显示/消失，不挡点击。

### 3.2 按钮（`src/App.vue` 顶栏）

两个 .update-pill 按钮：删 `:title`，加 `class="… tip-down"` + `data-tooltip`（文案不变）：

- available：`data-tooltip="'发现新版本 v' + updateState.version + '，点击查看并安装'"`
- downloading：`data-tooltip="'下载中 ' + updateState.pct + '%，点击查看进度'"`

原生 title 不保留（与 log-link tip-up 迭代同策，避免原生/自绘双浮层叠加）。

## 4. 测试与验证

- `App.test.ts`：两个既有更新用例补断言——.update-pill 携带 data-tooltip（含版本号/百分比）且无 title 属性。
- 回归：`pnpm test` 全绿。
- 手动（dev）：有新版时顶栏按钮 hover 出深灰自绘 tooltip（按钮下方、垂直居中）；下载中态 hover 显示「下载中 NN%」。

## 5. 不做的事

- 不改三键 .winbtn 的 title。
- 不改 .tip-up 既有行为与所有现有使用方。