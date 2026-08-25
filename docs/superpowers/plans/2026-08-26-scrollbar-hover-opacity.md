# 滚动条两态透明度实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 三个可滚动容器（.dropdown-panel / .template-list / .log-view）的滚动条平时完全隐形，hover 到容器任意位置时浮现 ≈5% 淡灰（纯 CSS）。

**架构：** 只改 src/style.css §#12 滚动条段：全局 thumb 基线改透明 + 三个容器 :hover 伪元素规则给 5%；Firefox scrollbar-color 按容器写双态。无 JS、无组件改动。

**技术栈：** Vue 3 SFC + Vite + Electron（Chromium webkit 伪元素）+ Firefox scrollbar-color 兜底。

---

## 文件结构

- 修改：`src/style.css:240-252` —— §#12 滚动条段（本次唯一改动面）
- 读取参照（不改）：`components/Dropdown.vue`（.dropdown-panel ul）、`modules/TemplateModule.vue`（.template-list）、`modules/LogPanel.vue`（.log-view）
- 规格：`docs/superpowers/specs/2026-08-26-scrollbar-hover-opacity.md`

## 行为矩阵（验收基准）

| 状态 | WebKit thumb | Firefox scrollbar-color |
|---|---|---|
| 默认 idle | rgba(0,0,0,0) | transparent transparent |
| 容器 :hover | rgba(0,0,0,0.05) | rgba(0,0,0,.05) transparent |

thumb 几何（width/height 10px、radius 5px、border 2px var(--card)）与 track 透明不变。

---

### 任务 1：CSS 两态落地

**文件：**
- 修改：`src/style.css:240-252`（§#12 段整体替换）

说明：CSS 不在 vitest 覆盖内，本仓无 CSS 单测基建（YAGNI：不为此新搭）。测试基线 = 现有 `npm test` 全绿防回归 + 任务 2 的目视验证。

- [ ] **步骤 1：确认测试基线绿**

运行：`npx vitest run`
预期：全 PASS（记录用例数）

- [ ] **步骤 2：替换 §#12 段**

将 `src/style.css:240-252` 整段替换为：

```css
/* ---- #12 滚动条美化（两态透明度：idle 隐形 / 容器 hover 浮现 ≈5%；
     覆盖 .dropdown-panel(下拉) / .template-list(模板列表) / .log-view(日志)）---- */
*::-webkit-scrollbar { width: 10px; height: 10px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0);    /* idle：完全隐形（高透明=0%） */
  border-radius: 5px;
  border: 2px solid var(--card);    /* 与容器留白，视觉悬浮 */
}
.log-view:hover, .template-list:hover, .dropdown-panel:hover {
  --sb-thumb: rgba(0, 0, 0, 0.05);
  scrollbar-color: rgba(0, 0, 0, .05) transparent; /* Firefox hover：≈5% */
}
.log-view, .template-list, .dropdown-panel {
  --sb-thumb: transparent;
  scrollbar-color: transparent transparent;         /* Firefox idle：隐形 */
}
/* Chromium：hover 容器时 thumb 用变量上色 */
.log-view::-webkit-scrollbar-thumb,
.template-list::-webkit-scrollbar-thumb,
.dropdown-panel::-webkit-scrollbar-thumb { background: var(--sb-thumb); }
```

要点：
- `*::-webkit-scrollbar-thumb:hover { background: #AEB5BD }`（原 248 行）**删除**——hover 语义统一由容器 :hover 驱动，避免第三态歧义。
- `.modal-box` 移出 Firefox scrollbar-color 组（它自身无滚动条，属悬空条目）；若有内部滚动元素会落回全局基线（隐形），符合预期。
- webkit 侧用 `--sb-thumb` 变量：base 规则写元素 thumb，:hover 提升自定义属性 → 同一伪元素两种取值，无需复制几何。
- Firefox 下 scrollbar-color 双态：:hover 选择器优先级高于 base（等特异性下后者覆盖前者的声明序 + :hover 更具体），与 webkit 行为一致。

- [ ] **步骤 3：目视验证（三处）**

运行：`npm run dev`
预期（逐项核对）：
1. 下拉：点开 LaunchBar/模板表单里的 Dropdown，滚动条平时不可见；鼠标在 .dropdown-panel 任意位置 → 浮现淡灰；移出容器 → 回落隐形。
2. 模板列表：多模板场景（或临时塞满），滚动条 idle 隐形；hover .template-list 任意处浮现 ≈5% 淡灰。
3. 日志区：有内容时同规则。
4. 拖动 thumb 仍可正常滚动（几何/宽度未变）。

- [ ] **步骤 4：全量测试防回归**

运行：`npx vitest run`
预期：与任务 1 步骤 1 基线相同的用例数，全 PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/style.css
git commit -m "style(ui): 滚动条两态透明度——idle 隐形 / 三容器 hover 浮现 5% 淡灰（纯 CSS，spec 2026-08-26）"
```

---

## 自检记录

- 规格覆盖：范围（3 容器）→ 任务 1 步骤 2；行为矩阵 → 步骤 2 代码 + 步骤 3 目视；改动清单 5 条 → 全部落在 §#12 替换中（含 .modal-box 移除）；验证节 → 步骤 1/3/4。无遗漏。
- 占位符扫描：无 TODO/待定/"类似任务 N"。
- 一致性：选择器名与 Dropdown.vue/TemplateModule.vue/LogPanel.vue 实际 class 一致（已核对）。
