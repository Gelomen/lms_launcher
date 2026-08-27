# Spec — 二次确认窗口主题化（方案 B：LM Studio 式紧凑对话框）

Date: 2026-08-27 · Status: 用户已批准（Demo http://127.0.0.1:8090/confirm-dialog-demo.html，选 B）

## 背景

lms_launcher 现有两处二次确认走系统 `window.confirm` / `confirm`，与整体浅色主题（§4.5 设计语言，参考 LM Studio）割裂：
- `src/App.vue:79` —— 托盘「退出」→ `'将停止 llama-server 并退出，确认？'`
- `src/modules/TemplateModal.vue:176` —— 编辑模式删除 → `'删除配置「…？」将从 llama_launch_configs.yaml 移除。'`

用户确认采用**方案 B（LM Studio 式紧凑对话框）**：圆形语义图标 + 标题 + 灰字说明，按钮组贴右下；危险操作红底、中性操作蓝底。不引入标题栏/[×]，保持轻量。

## 目标

1. 新增共享组件 `src/components/ConfirmDialog.vue`，以应用主题变量渲染二次确认窗口，替换两处系统 confirm。
2. 组件支持：标题、说明、危险（红）/中性（蓝）两种语义、取消/确认两按钮、ESC/遮罩点击 = 取消。
3. 行为契约不变：取消不执行；确认后走原 IPC（exit_app / delete_config）。

## 非目标

- 不改主进程 IPC 与 yaml 逻辑。
- 不改现有其他弹窗/下拉视觉。

## 组件契约（ConfirmDialog.vue）

Props：
- `open: boolean` —— 是否显示（Teleport 到 body，v-if）。
- `title: string` —— 标题（如「退出程序」「删除模板」）。
- `message: string` —— 说明（灰字）。
- `tone: 'danger' | 'primary'` —— 语义色：danger=红（--danger），primary=蓝（--accent）。决定确认按钮与图标颜色。
- `icon?: IconDefinition` —— FontAwesome 图标定义；缺省 danger=triangle-exclamation、primary=info-circle。

Emits：
- `confirm` —— 用户点确认。
- `close` —— 用户取消（按钮 / ESC / 遮罩点击）。

用法：调用方持有本地 `visible` 状态；触发危险动作时置 true；@confirm → 执行 IPC + 关窗；@close → 仅关窗。

### 视觉（取自 §4.5 / style.css 变量，Demo 已验证）

- 遮罩：`position:fixed; inset:0; background:rgba(16,24,40,.35); z-index:20`（与 .modal-overlay 同色，但层级更高，盖在 TemplateModal 之上）。
- 卡片：白底 `var(--card)`、`border-radius:var(--radius-card)`(12px)、box-shadow 略深于普通卡片、宽 360px。
- 结构：图标行 = 圆形背景（tone 色 12% alpha，24px 图标）+ 右列（标题 15px/600 + 说明 13px muted）。
- 底部按钮组 `display:flex; justify-content:flex-end; gap:8px`：取消 = 次级按钮（.btn）；确认 = danger→btn-danger / primary→btn-primary。

## 接入点

### App.vue（托盘退出）
- 新增状态 `exitConfirm = ref(false)`，模板挂 ConfirmDialog（title「退出程序」/ message 原退出文案 / tone=primary / icon=power-off）。
- `onTrayExitRequest` 改为 `exitConfirm.value = true`；@confirm → `invoke('exit_app')` 后关窗。移除 `window.confirm`。

### TemplateModal.vue（删除）
- onDelete 改为置本地 confirm 状态（ConfirmDialog tone=danger、icon=trash-can、title「删除模板」、message 原删除文案）。
- @confirm → `invoke('delete_config')` + emit('deleted')；失败进 saveError 区（行为不变，对话框保持或关闭均可——选择关闭后在表单区看 saveError）。

## 测试

- `App.test.ts`：托盘退出触发 → 弹 ConfirmDialog；点确认才 invoke('exit_app')；取消不 invoke。
- `TemplateModal.test.ts`：把 `vi.stubGlobal('confirm')` 替换为组件级断言——删除按钮弹对话框，确认 → delete_config；取消 → 不删。保留既有删除成功/失败语义用例。

## 验收

- 全仓无系统 confirm（grep `window.confirm` / 裸 `confirm(`）。
- vitest 全绿。
- 最终视觉与 Demo 方案 B 一致（图标+标题+灰字说明+右下按钮组）。