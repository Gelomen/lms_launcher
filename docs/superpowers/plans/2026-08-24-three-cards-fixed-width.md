# 三卡片固定宽度实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框语法跟踪进度。

**目标：** 将三个卡片宽度改为绝对固定（默认列宽 × 2/3 = 左列 280px / 右列 350px），窗口放大时不跟随变宽。

**架构：** 只改 src/style.css 的 .grid：把 grid-template-columns 从 minmax(0,1fr) minmax(0,1.25fr) 换成固定像素 280px 350px；靠左排布、右侧留白。

**技术栈：** Electron + Vue3 + Vite，纯 CSS 改动，无 JS/组件改动，无新增测试（项目 CSS 无单测基建）。

---

### 文件结构

- 修改：`src/style.css:62-67` —— `.grid` 规则中的 `grid-template-columns` 一行。
- 其余（App.vue 的 .stack/.card、.template-list 高度、日志区）零改动。

### 任务 1：固定 .grid 两列为 280px / 350px

**文件：**
- 修改：`src/style.css:62-67`（.grid 规则）

- [ ] **步骤 1：改动**

```
.grid {
  display: grid;
  /* 三卡片绝对固定宽度 = 默认列宽 × 2/3；靠左排布，右侧留白 */
  grid-template-columns: 280px 350px;
  gap: var(--card-gap);
}
```

说明：保留 `display: grid` 与 `gap: var(--card-gap)` 两行不变，只替换 grid-template-columns 一行及其上方注释（原注释「两列：左列 = ...」改为新注释）。

- [ ] **步骤 2：验证（浏览器）**

刷新本 GUI（http://127.0.0.1:3080）后检查：
1. 「llama.cpp 安装目录」+「启动控制」（左列 stack）宽度 ≈ 280px；
2. 「启动参数模板」（右列）宽度 ≈ 350px；
3. 三卡片靠左，右侧出现留白；日志区仍横跨整个 .layout 宽度不变。
4. 拉宽窗口：三卡片宽度不变（DevTools 量 width = 280/350）。
5. 最小窗口 760：内容宽 736 ≥ 642（两卡+gap），无溢出/挤压。

- [ ] **步骤 3：Commit**

```
bash
git add src/style.css
git commit -m "feat: 三卡片固定宽度 = 默认列宽 ×2/3（左 280px / 右 350px，靠左排布）"
```