### 任务 6：style.css + App.vue 布局骨架（设计语言 §4.5）

**文件：**
- 重写：`src/style.css`（整体）、`src/App.vue`（四模块网格骨架）

实现 `docs/lms_launch-analysis.md` §4.5 设计语言——浅色干净主题。关键参数（从规格原文取）：背景 #F6F7F8、卡片白底 #FFFFFF、卡片圆角 12px、按钮圆角 8px、主色用于启动/选中态、正文 #222 系列深灰。

- [ ] **步骤 1：style.css 整体重写**

定义 CSS 变量 + 基础 reset + 网格布局：

~~~ css
:root {
  --bg: #F6F7F8;
  --card: #FFFFFF;
  --text: #222;
  --muted: #6B7280;
  --border: #E5E7EB;
  --accent: #2563EB;
  --danger: #DC2626;
  --ok: #16A34A;
  --radius-card: 12px;
  --radius-btn: 8px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  color: var(--text);
  background: var(--bg);
}
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  padding: 14px 16px;
}
.btn {
  border-radius: var(--radius-btn);
  border: 1px solid var(--border);
  background: #fff;
  padding: 6px 14px;
  cursor: pointer;
}
.btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-danger { background: var(--danger); color: #fff; border-color: var(--danger); }
~~~

（完整色板/字号/间距按 §4.5 原文展开；上块是骨架变量，执行者把规格里的全部设计参数落进来。）

- [ ] **步骤 2：App.vue 四模块网格骨架**

~~~ vue
<script setup lang="ts">
import { ref } from 'vue';
// 模块组件任务 7/8 实现——先用占位组件占位：
import DirModule from './modules/DirModule.vue';
import TemplateModule from './modules/TemplateModule.vue';
import LaunchBar from './modules/LaunchBar.vue';
import LogPanel from './modules/LogPanel.vue';
</script>
<template>
  <main class="layout">
    <h1 class="app-title">lms_launch</h1>
    <section class="grid">
      <div class="card"><DirModule /></div>
      <div class="card"><TemplateModule /></div>
      <div class="card"><LaunchBar /></div>
    </section>
    <section class="log-area">
      <LogPanel />
    </section>
  </main>
</template>
~~~

（`src/modules/*.vue` 四个文件先建占位组件——各自返回一段 `<section>` 标题，任务 7/8 填实现。本步保证 App.vue 编译通过。）

- [ ] **步骤 3：构建验证**

~~~ powershell
npm run build
~~~

预期：vite build 成功（四个占位模块 + 骨架布局编译通过）。

- [ ] **步骤 4：Commit**

~~~ bash
git add src/style.css src/App.vue src/modules/
git commit -m "feat: 设计语言样式层 + 四模块网格骨架（§4.5）"
~~~

---
