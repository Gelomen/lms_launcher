// ConfirmDialog —— 方案 B：LM Studio 式紧凑二次确认对话框（规格 docs/superpowers/spec/2026-08-27-confirm-dialog-theme.md）。
// 圆形语义图标 + 标题 + 灰字说明，[取消]/[确认] 贴右下；tone=danger(红,删除等危险) / primary(蓝,退出等中性)。
// 契约：@confirm = 用户点确认（调用方执行 IPC）；@close = 取消（[取消] / 点遮罩），仅关窗不产生副作用。
// 长 message（如超长配置名）：变量部分由调用方按视觉宽度预算截断（与下拉 truncOpt 同口径），
// 截断的名字片段由调用方以 tipName/tipFull 传入——本组件渲染为可 hover 片段，hover 弹自绘 .tpl-tip
// （视觉/机制同模板列表行 .tpl-tip）仅显示完整名字；CSS word-break 兜底防溢出。
<script setup lang="ts">
import { computed, ref } from 'vue';
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
  /** 文案里被截断的名字片段（message 的子串）：提供时该片段单独渲染为可 hover 的 span */
  tipName?: string;
  /** 截断名字的完整值：hover tipName 片段 → 自绘 .tpl-tip 浮层只显示它（未截断不传） */
  tipFull?: string;
}>(), { tone: 'primary' });

const emit = defineEmits<{ (e: 'confirm'): void; (e: 'close'): void }>();
const iconByTone = { danger: faTriangleExclamation, primary: faInfoCircle };

// 名字片段：仅截断场景（tipName + tipFull 都传、且 tipName 确是 message 子串）才拆句；
// 短名走普通文本 → 无片段、无 tooltip。必须 computed：调用方 TemplateModal 常驻挂载本组件，
// name 在 open 之后才绑定，一次性快照会让片段永远不出现（2026-10-02 修复）。
const msgParts = computed(() => {
  const name = props.tipName;
  if (!name || !props.tipFull) return null;
  const i = props.message.indexOf(name);
  if (i < 0) return null;
  return { before: props.message.slice(0, i), name, after: props.message.slice(i + name.length) };
});

// 截断名 tooltip（方案 B）：hover 名字片段 → 自绘 .tpl-tip 浮层（position:fixed 浮于视口，
// 定位约定同 .dd-tip/.tpl-tip：x = 片段水平中心、y = 片段顶边，靠 CSS transform 归位）。
const nameTip = ref<{ text: string; x: number; y: number } | null>(null);
function onNameEnter(e: MouseEvent): void {
  if (!props.tipFull || msgParts.value === null) return;
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  nameTip.value = { text: props.tipFull, x: r.left + r.width / 2, y: r.top };
}
function onNameLeave(): void { nameTip.value = null; }
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
            <p class="confirm-sub confirm-msg">
              <template v-if="msgParts">{{ msgParts.before }}<span class="confirm-msg__name"
                :data-tooltip="tipFull" @mouseenter="onNameEnter" @mouseleave="onNameLeave">{{ msgParts.name }}</span>{{ msgParts.after }}</template>
              <template v-else>{{ message }}</template>
            </p>
          </div>
        </div>
        <div class="confirm-actions">
          <button type="button" class="btn confirm-cancel" aria-label="取消" @click="onClose">取消</button>
          <button type="button" class="btn confirm-ok"
            :class="{ 'btn-danger': props.tone === 'danger', 'btn-primary': props.tone === 'primary' }"
            aria-label="确认" @click="onConfirm">确认</button>
        </div>
      </div>
      <!-- 截断名 tooltip：自绘浮层（.tpl-tip 为全局样式，与模板列表行/下拉长名同视觉语言），
           position:fixed 浮于视口、片段上方居中；pointer-events:none 不挡点击 -->
      <div v-if="nameTip" class="tpl-tip"
        :style="{ left: nameTip.x + 'px', top: nameTip.y + 'px' }">{{ nameTip.text }}</div>
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
  color: var(--primary); background: rgba(139, 92, 246, 0.12);   /* 中性 tone 紫（2026-08-29 蓝→紫统一） */
}
.confirm-icon.danger { color: var(--danger); background: rgba(239, 68, 68, 0.12); }
.confirm-title { font-size: 15px; font-weight: 600; margin: 0 0 2px; }
.confirm-sub { font-size: 13px; color: var(--muted); margin: 0; word-break: break-all; } /* 兜底：变量长词不撑破卡片（调用方已按视觉宽度截断） */
.confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
/* [确认]/[取消] 同尺寸：.btn-primary 自带 --h-primary(36px) 会比 .btn 的 --h-control(32px) 大一档，
   此处两者统一压到 --h-control，只保留颜色语义差异（蓝/红） */
.confirm-cancel, .confirm-ok { height: var(--h-control); }
</style>
