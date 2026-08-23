# 模板删除按钮挪入编辑弹窗（左下角）— 设计规格

**Date:** 2026-08-24
**范围：** 纯前端 UI 重构，两个文件；不涉及 IPC / 主进程 / 参数映射。

## 背景与动机

现状：模板列表每行右侧并排「编辑」「删除」两个按钮（TemplateModule.vue:78-79）。
用户要求：把「删除」从列表挪到「编辑」弹出的窗口左下角，降低误删路径、收紧破坏性操作入口。

## 范围决策（已与用户确认）

- **仅编辑模式显示删除**：新建模板模式下不渲染该按钮；点列表「编辑」打开的弹窗才出现。
- 删除成功后**自动关窗并刷新列表**。
- 交互确认文案、IPC 调用保持原样（`confirm('删除配置「id」？将从 llama_launch_configs.yaml 移除。')` → `delete_config`）。

## 数据流与改动

1. **TemplateModule.vue**
   - 表格行删除按钮移除，只留「编辑」。
   - 把 `onDelete(id)` 从本组件搬走（连同其 confirm/invoke/reload/emit 实现），改为监听弹窗新事件 `(e: 'deleted', id)`：关窗 + reload + emit('changed')。

2. **TemplateModal.vue**
   - script：新增本地删除逻辑 `onDelete()`——`confirm(...)`（文案原样搬入）→ invoke('delete_config', props.id)；成功 → emit('deleted', props.id)；失败 → saveError 显示 errMsg(e)，不关窗。confirm 取消 → 直接 return，不发起 IPC。
   - template：`modal-actions` 行内最左插入删除按钮（`v-if="isEdit"`），CSS 加 `margin-right: auto` 使其贴左、保留「取消/保存」在右。
   - emits：新增 `(e: 'deleted', id)`。
   - style：`.modal-actions .btn-delete { margin-right: auto; }`（删除按钮左侧贴边）。

3. **测试**
   - TemplateModal.test.ts 追加用例：编辑模式下删除按钮存在，新建模式下不存在；点击删除（confirm 桩 → true）→ emit('deleted') + invoke('delete_config')；invoke reject → saveError 显示且不 emit。
   - （vitest 在受限时由控制端跑，本任务红→绿由执行者记录。）

## 错误处理

- delete_config VALIDATION/IO/MISSING 前缀原样进 `saveError`（与保存失败同区展示）。
- confirm 取消 → 不发起 IPC。

## 不做的事（YAGNI）

- 不改 ipc.ts / main.ts（delete_config 已存在，preload 白名单泛化透传）。
- 不改删除文案、不加撤销/软删。
- 不动列表行按钮样式（编辑按钮保留原位置原风格）。
