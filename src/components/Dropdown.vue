<!-- #13 自定义下拉（共享）：TemplateModal options/boolean 行 + LaunchBar 配置下拉。
     白底卡片风格弹层，max-height 116px 可滚动，点击外部关闭；选中项 accent 色加粗。
     长名 tooltip（.dd-tip 悬浮层,与「编辑」按钮 tooltip 同风格）：选项 li.tip / trigger.tip 存在时 hover 显示完整名；
     label 截断（LaunchBar >10 字 + …）由父级负责。 -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
const props = withDefaults(defineProps<{
  value: string;
  options: Array<{ value: string; label: string; tip?: string }>;
  /** 触发按钮完整名（长名才有）——hover trigger 弹 tooltip。LaunchBar 传入选中项的 tip。 */
  tip?: string;
  /** 为 true 时禁用（不响应点击）；默认 false。用于 LaunchBar running 锁定。 */
  disabled?: boolean;
  /** 占位 label：value 未匹配任何 option（或选项表为空）时，触发按钮显示该文本。 */
  placeholder?: string;
}>(), { disabled: false, placeholder: '' });
const emit = defineEmits<{ (e: 'update:value', v: string): void }>();
const open = ref(false);
function pick(v: string): void { if (props.disabled) return; emit('update:value', v); open.value = false; tip.value = null; }

// 长名 tooltip（2026-08-26 spec）：trigger / li 的 tip 存在时 hover 弹 .dd-tip（position:fixed 浮于视口——
// .dropdown-panel max-height+overflow:auto 会裁剪行内 absolute 浮层，fixed 不受裁剪且跟随视口）。
// 触发按钮与面板选项共用同一悬浮层；移出 / 关面板即清。
const tip = ref<{ text: string; x: number; y: number } | null>(null);
function showTip(e: MouseEvent, text: string): void {
  if (!text) return;
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  tip.value = { text, x: r.left + r.width / 2, y: r.top };
}
function hideTip(): void { tip.value = null; }
onMounted(() => {
  const close = (ev: MouseEvent) => {
    if (!(ev.target as HTMLElement).closest('.dropdown')) { open.value = false; tip.value = null; }
  };
  document.addEventListener('click', close);
  return () => document.removeEventListener('click', close);
});
</script>
<template>
  <div class="dropdown">
    <!-- trigger：长名携带 data-tooltip=完整名 + hover 弹 .dd-tip（样式同「编辑」按钮 tooltip） -->
    <button class="btn select-trigger" :disabled="props.disabled"
            :data-tooltip="props.tip"
            @mouseenter="(e) => showTip(e, props.tip)"
            @mouseleave="hideTip"
            @click.stop="open = !open">
      <span class="select-label">{{ props.options.find((o) => o.value === props.value)?.label ?? (props.options.length > 0 ? props.options[0].label : props.placeholder) }}</span>
      <span class="select-caret">▼</span>
    </button>
    <ul v-if="open" class="dropdown-panel">
      <!-- 选项：长名截断（父级 label），li 携带完整名 tooltip + hover 弹 .dd-tip -->
      <li v-for="o in props.options" :key="o.value"
          :data-tooltip="o.tip"
          :class="{ option: true, selected: o.value === props.value }"
          @mouseenter="(e) => showTip(e, o.tip)"
          @mouseleave="hideTip"
          @click="pick(o.value)">{{ o.label }}</li>
    </ul>
    <!-- 长名 tooltip：position:fixed 悬浮层（样式同「编辑」按钮 tooltip / .tpl-tip），显示完整名 -->
    <div v-if="tip" class="dd-tip"
      :style="{ left: tip.x + 'px', top: tip.y + 'px' }">{{ tip.text }}</div>
  </div>
</template>