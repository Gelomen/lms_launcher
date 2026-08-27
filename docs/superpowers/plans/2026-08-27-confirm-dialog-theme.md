# 二次确认窗口主题化（方案 B）实现计划

> **面向 AI 代理的工作者：** 必需子技能：executing-plans（本会话内联执行，小步 TDD）。步骤用复选框跟踪。

**目标：** 新增共享 ConfirmDialog.vue（LM Studio 式紧凑对话框），替换 App.vue 托盘退出与 TemplateModal.vue 删除两处系统 confirm。

**架构：** 自给 scoped 样式的 Teleport 组件；tone(danger/primary) 决定确认按钮颜色 + 语义图标；调用方持本地 visible 状态，@confirm 执行原 IPC、@close 仅关窗（取消/ESC/遮罩）。

**技术栈：** Vue 3 + @vue/test-utils(happy-dom)、FontAwesome solid（triangle-exclamation / info-circle）、style.css 主题变量。

---

## 文件结构

- 创建 src/components/ConfirmDialog.vue — 共享二次确认对话框（overlay z-30，盖过 TemplateModal z-10）。职责：展示 + 两按钮 + close/confirm emits。
- 创建 src/components/ConfirmDialog.test.ts — 组件单元测试（渲染/取消/确认/tone）。
- 修改 src/App.vue — 托盘退出由 window.confirm → ConfirmDialog；新增 exitConfirm 状态。
- 修改 src/App.test.ts — ipc mock 捕获 onTrayExitRequest 处理器；新增 2 用例。
- 修改 src/modules/TemplateModal.vue — 删除由 confirm → ConfirmDialog(danger)。
- 修改 src/modules/TemplateModal.test.ts — 移除 stubGlobal('confirm')，改为组件级断言。

---

### 任务 1：ConfirmDialog 组件（TDD）

文件：创建 src/components/ConfirmDialog.vue、src/components/ConfirmDialog.test.ts

- [ ] **步骤 1：写失败测试**（完整内容见实现时写入，含 open=false 不渲染 / 点 confirm-ok emit confirm / 点 confirm-cancel emit close / danger tone ok 按钮带 btn-danger 类四断言）
- [ ] **步骤 2：npx vitest run src/components/ConfirmDialog.test.ts → FAIL**（模块未定义）
- [ ] **步骤 3：实现组件**：props = open/title/message/tone?('danger'|'primary', 默认 'primary')；emits = confirm/close；Teleport to body，v-if=open；结构 .confirm-overlay(点自身=close) > .confirm-box.card（图标行 + 按钮组）；.confirm-icon 圆底 42px（danger 红 12% alpha / primary 蓝）；.confirm-title 15px/600、.confirm-sub 13px muted；.confirm-actions flex-end gap 8px，.confirm-cancel=.btn、.confirm-ok=.btn + tone 色类；overlay z-index:30。
- [ ] **步骤 4：vitest → PASS**
- [ ] **步骤 5：commit** `feat: 新增主题化二次确认对话框 ConfirmDialog`

### 任务 2：App.vue 托盘退出接入

文件：修改 src/App.vue、src/App.test.ts

- [ ] **步骤 1：测试** — App.test.ts 的 ipc mock 加 `const trayHandlers: Array<() => void> = []`，onTrayExitRequest 改为 `(fn) => { trayHandlers.push(fn); return () => {}; }`；新增 describe('App tray exit') 两用例：① fire 最新 handler → flush → document.querySelector('.confirm-box .confirm-ok').click() → invoke 'exit_app' 被调；② mockClear 后 fire handler → 点 .confirm-cancel → exit_app 未调。
- [ ] **步骤 2：vitest run src/App.test.ts → 新用例 FAIL**
- [ ] **步骤 3：改 App.vue** — import ConfirmDialog；`const exitConfirm = ref(false)`；onTrayExitRequest 回调改为 `exitConfirm.value = true`；新增 `function onExitConfirmed(): void { invoke('exit_app').finally(() => { exitConfirm.value = false; }); }`；模板 root 挂 `<ConfirmDialog :open="exitConfirm" title="退出程序" message="将停止 llama-server 并退出，是否确认？" tone="primary" @confirm="onExitConfirmed" @close="() => (exitConfirm = false)" />`；删除原 `if (window.confirm(...))`。
- [ ] **步骤 4：vitest → PASS（含既有用例）**
- [ ] **步骤 5：commit** `feat: 托盘退出改用主题化二次确认对话框`

### 任务 3：TemplateModal.vue 删除接入 + 全量验收

文件：修改 src/modules/TemplateModal.vue、src/modules/TemplateModal.test.ts

- [ ] **步骤 1：改测试** — `deletes_when_confirmed`：移除 stubGlobal confirm，点 .btn-delete → flush → document.querySelector('.confirm-box .confirm-ok').click() → 断言 delete_config + emit('deleted')；新增 `delete_cancel_no_delete`：点 .confirm-cancel → 无 delete_config、无 emit；`delete_error_shown...` 保留语义（确认后 invoke reject → saveError 区显示、不 emit），仅把 stubGlobal 改为点 .confirm-ok。
- [ ] **步骤 2：vitest run TemplateModal.test.ts → 新断言 FAIL**
- [ ] **步骤 3：改 TemplateModal.vue** — import ConfirmDialog；`const confirmDeleteOpen = ref(false)`；onDelete 改为 `confirmDeleteOpen.value = true`（移除裸 confirm）；新增 `async function doDelete(): Promise<void> { const id = props.id; try { await invoke('delete_config', id); emit('deleted', id); confirmDeleteOpen.value = false; } catch (e) { saveError.value = errMsg(e); } }`；模板 .modal-box 后挂 `<ConfirmDialog :open="confirmDeleteOpen" title="删除模板" :message="'删除配置「' + props.id + '」？将从 llama_launch_configs.yaml 移除。'" tone="danger" @confirm="doDelete" @close="() => (confirmDeleteOpen = false)" />`。
- [ ] **步骤 4：vitest → PASS**
- [ ] **步骤 5：验收** — `npx vitest run` 全绿；grep 全仓（排除 node_modules/.temp）无 `window.confirm`、无裸 `confirm(` 调用；commit `feat: 模板删除改用主题化二次确认对话框`。

## 自检

- 规格覆盖：新增组件(任务1)、App 接入(任务2)、TemplateModal 接入(任务3)、测试改造(各任务)、验收 grep+全量(任务3-5) ✓。
- 类型/命名一致：props(open/title/message/tone)、emits(confirm/close)、按钮类 .confirm-ok/.confirm-cancel 在组件与三处引用一致。