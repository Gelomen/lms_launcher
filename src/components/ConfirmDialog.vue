// ConfirmDialog —— 方案 B：LM Studio 式紧凑二次确认对话框（规格 docs/superpowers/spec/2026-08-27-confirm-dialog-theme.md）。
// 圆形语义图标 + 标题 + 灰字说明，[取消]/[确认] 贴右下；tone=danger(红,删除等危险) / primary(蓝,退出等中性)。
// 契约：@confirm = 用户点确认（调用方执行 IPC）；@close = 取消（[取消] / 点遮罩），仅关窗不产生副作用。
// 长 message（如超长配置名）：变量部分由调用方按视觉宽度预算截断（与下拉 truncOpt 同口径），
// 本组件只负责 title=tip hover 显示完整值 + CSS word-break 兜底防溢出。
<script setup lang="ts">
import { library, config } from '@fortawesome/fontawesome-svg-core';
import { faTriangleExclamation, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';

config.autoGenerateCss = true;
library.add(faTriangleExclamation, faInfoCircle);

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  message: string;
  tone?: 'danger' | 'primary';
  /** 完整文案（截断时 hover title 显示）；缺省 = 若 message 被截断则补全 message */
  tip?: string;
}>(), { tone: 'primary' });

const emit = defineEmits<{ (e: 'confirm'): void; (e: 'close'): void }>();
const iconByTone = { danger: faTriangleExclamation, primary: faInfoCircle };

// tip：调用方传入的完整文案（配置名截断场景）——挂 title，hover 显示。未传则无 tooltip。
const msgTip = props.tip;
function onConfirm(): void { emit('confirm'); }
function onClose(): void { emit('close'); }
</script>
<template>
  <Teleport to="body">
    <div v-if="open" class="confirm-overlay" @click.self="onClose" role="dialog" aria-modal="true" :aria-label="title">
      <div class="card confirm-box">
        <div class="confirm-row">
          <!-- 圆形语义图标：tone 色 12% alpha 底 + 24px 图标（danger=⚠红 / primary=ⓘ蓝） -->
          <span class="confirm-icon" :class="{ danger: props.tone === 'danger' }">
            <FontAwesomeIcon :icon="iconByTone[props.tone]" />
          </span>
          <div class="confirm-texts">
            <p class="confirm-title">{{ title }}</p>
            <p class="confirm-sub confirm-msg" :title="msgTip">{{ message }}</p>
          </div>
        </div>
        <div class="confirm-actions">
          <button type="button" class="btn confirm-cancel" aria-label="取消" @click="onClose">取消</button>
          <button type="button" class="btn confirm-ok"
            :class="{ 'btn-danger': props.tone === 'danger', 'btn-primary': props.tone === 'primary' }"
            aria-label="确认" @click="onConfirm">确认</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* overlay：与 .modal-overlay 同色但层级更高（盖在 TemplateModal z-10 之上） */
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(16, 24, 40, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
}
/* 卡片：白底 12px 圆角（.card 基类）+ 略深浮起阴影；宽 360px */
.confirm-box.card { width: 360px; padding: 20px 24px 16px; box-shadow: 0 8px 24px rgba(16, 24, 40, 0.12); }
.confirm-row { display: flex; gap: 14px; align-items: center; margin-bottom: 16px; }
.confirm-icon {
  flex: none; width: 42px; height: 42px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 18px;
  color: var(--accent); background: rgba(59, 130, 246, 0.12);
}
.confirm-icon.danger { color: var(--danger); background: rgba(239, 68, 68, 0.12); }
.confirm-title { font-size: 15px; font-weight: 600; margin: 0 0 2px; }
.confirm-sub { font-size: 13px; color: var(--muted); margin: 0; word-break: break-all; } /* 兜底：变量长词不撑破卡片（调用方已按视觉宽度截断） */
.confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
