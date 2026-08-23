<!-- #13 自定义下拉（共享）：TemplateModal options/boolean 行 + LaunchBar 配置下拉。
     白底卡片风格弹层，max-height 116px 可滚动，点击外部关闭；选中项 accent 色加粗。 -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
const props = withDefaults(defineProps<{
  value: string;
  options: Array<{ value: string; label: string }>;
  /** 为 true 时禁用（不响应点击）；默认 false。用于 LaunchBar running 锁定。 */
  disabled?: boolean;
  /** 占位 label：value 未匹配任何 option（或选项表为空）时，触发按钮显示该文本。 */
  placeholder?: string;
}>(), { disabled: false, placeholder: '' });
const emit = defineEmits<{ (e: 'update:value', v: string): void }>();
const open = ref(false);
function pick(v: string): void { if (props.disabled) return; emit('update:value', v); open.value = false; }
onMounted(() => {
  const close = (ev: MouseEvent) => { if (!(ev.target as HTMLElement).closest('.dropdown')) open.value = false; };
  document.addEventListener('click', close);
  return () => document.removeEventListener('click', close);
});
</script>
<template>
  <div class="dropdown">
    <button class="btn select-trigger" :disabled="props.disabled" @click.stop="open = !open">
      {{ props.options.find((o) => o.value === props.value)?.label ?? (props.options.length > 0 ? props.options[0].label : props.placeholder) }} ▾
    </button>
    <ul v-if="open" class="dropdown-panel">
      <li v-for="o in props.options" :key="o.value"
          :class="{ option: true, selected: o.value === props.value }" @click="pick(o.value)">{{ o.label }}</li>
    </ul>
  </div>
</template>
