<script setup lang="ts">
// 显卡显存修改小窗（规格 2026-08-29-vram-estimate-design §5）：纯数字输入（GB），保存后调 save_vram_total。
// 复用 modal-overlay 遮罩语言（TemplateModal 同款 Teleport + 居中卡片）。
import { ref, watch } from 'vue';
import { invoke, errMsg } from '../ipc';

const props = withDefaults(defineProps<{
  open: boolean;
  vramTotalGb?: number;
}>(), { vramTotalGb: undefined });
const emit = defineEmits<{ (e: 'saved'): void; (e: 'close'): void }>();

// 初始填充:挂载前已有配置值(数字)→ 直接回填字符串;未配置(undefined)→ 空输入。
const value = ref<string>(props.vramTotalGb !== undefined ? String(props.vramTotalGb) : '');
// 每次打开(open=false→true)都重填 prop——覆盖「配置后重启,打开时回填」的重复开合场景。
watch(
  () => props.open,
  (open) => {
    if (open && props.vramTotalGb !== undefined) value.value = String(props.vramTotalGb);
  },
);
// 异步到达:挂载后 get_app_config 才返回 vramTotalGb,弹窗已打开时仍须回填(重启后加载路径)。
watch(
  () => props.vramTotalGb,
  (gb) => {
    if (props.open && gb !== undefined) value.value = String(gb);
  },
);
const error = ref<string | null>(null);

function save(): void {
  error.value = null;
  const v = value.value.trim();
  const n = v === '' ? 0 : Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    error.value = '须为正数（GB）';
    return;
  }
  invoke('save_vram_total', n)
    .then(() => emit('saved'))
    .catch((e) => { error.value = errMsg(e); });
}
</script>
<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay">
      <div class="card vram-dialog-box">
        <h3 class="vram-dialog-title">显卡显存（GB）</h3>
        <input class="input" type="number" min="1" step="1"
          :value="value"
          placeholder="如 24"
          @input="(ev: Event) => { value = (ev.target as HTMLInputElement).value; }"
          @keydown.enter="save" />
        <p v-if="error" class="error-text">{{ error }}</p>
        <div class="vram-dialog-actions">
          <button class="btn btn-secondary" @click="emit('close')">取消</button>
          <button class="btn btn-primary" @click="save">保存</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
<style scoped>
/* 小窗卡片：比 TemplateModal 窄（单字段 + 两按钮）；.card 自带白底圆角 */
.vram-dialog-box { width: 320px; padding: 16px; }
.vram-dialog-title { font-size: var(--fs-title); margin: 0 0 12px; }
.vram-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
</style>
