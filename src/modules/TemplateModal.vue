<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { invoke, errMsg } from '../ipc';

// 模板弹窗（新建 / 编辑共用，规格 §4.2）：
// flag-form 参数表单 + id 唯一性红框 + 必填(-m)红框不保存；其余空值不写入 yaml。
const props = withDefaults(defineProps<{
  open: boolean;
  id: string;              // 编辑中的 id（新建为空串）
  values: Record<string, string>;
  desc?: string;           // 编辑中原配置的 desc
  paramsMeta: { params: Record<string, string>; required: string[] };
  existingIds: string[];   // 已存在的配置 id（唯一性校验基准）
}>(), { desc: '' });

const emit = defineEmits<{ (e: 'saved'): void; (e: 'close'): void }>();

const isEdit = computed(() => props.id.length > 0);

// ---------- 表单状态 ----------
const formId = ref('');
const formDesc = ref('');
const formValues = ref<Record<string, string>>({});
const saveError = ref<string | null>(null);
const saving = ref(false);

function fill(): void {
  formId.value = props.id;
  formDesc.value = props.desc ?? '';
  const init: Record<string, string> = {};
  for (const k of Object.keys(props.paramsMeta.params)) init[k] = '';
  // 编辑时：有填的展示、没填的留空
  if (isEdit.value) {
    for (const [k, v] of Object.entries(props.values)) {
      if (init[k] !== undefined && (v ?? '').trim().length > 0) init[k] = v;
    }
  }
  formValues.value = init;
  saveError.value = null;
}

// 打开（含从新建切到另一个编辑目标）时重置表单
watch(() => props.open, (open) => { if (open) fill(); }, { immediate: true });

// ---------- 校验（对齐 config.ts validateConfigId）----------
const idError = computed((): string | null => {
  const v = formId.value.trim();
  if (v.length === 0) return 'id 必填';
  // 与主进程 validateConfigId（config.ts:87-91）完全一致：小写字母开头、仅 [a-z0-9]、≤32
  if (!/^[a-z][a-z0-9]*$/.test(v)) return '须为小写字母开头的字母数字串（不含下划线 / 空格 / 大写）';
  if (v.length > 32) return '最长 32 位';
  if (props.existingIds.includes(formId.value) && !isEdit.value) return 'id 已被使用';
  return null;
});

type Row = { key: string; flag: string; required: boolean };
const rows = computed((): Row[] => {
  const out: Row[] = [];
  for (const [k, flag] of Object.entries(props.paramsMeta.params)) {
    out.push({ key: k, flag, required: props.paramsMeta.required.includes(k) });
  }
  return out;
});

// 必填项（required 列表）留空 → 红框 + 不保存
const emptyRequired = computed((): string[] => {
  const bad: string[] = [];
  for (const k of props.paramsMeta.required) {
    if ((formValues.value[k] ?? '').trim().length === 0) bad.push(k);
  }
  return bad;
});

// ---------- 保存 ----------
async function save(): Promise<void> {
  saveError.value = null;
  // 空值（含编辑时清掉的字段）→ 不写入，保持 yaml 干净
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(formValues.value)) {
    if ((v ?? '').trim().length > 0) values[k] = v.trim();
  }
  saving.value = true;
  try {
    await invoke('save_config', formId.value, formDesc.value.trim() === '' ? null : formDesc.value.trim(), values);
    emit('saved');
  } catch (e) {
    saveError.value = errMsg(e); // VALIDATION（id 规则 / 必填）与 IO 错误原样展示
  } finally {
    saving.value = false;
  }
}

function close(): void { emit('close'); }
</script>
<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" @click.self="close()">
      <div class="card modal-box">
        <h3>{{ isEdit ? '编辑模板' : '新建模板' }}</h3>
        <p v-if="saveError" class="error-text">{{ saveError }}</p>

        <label class="label" style="display: block;">id</label>
        <input
          class="input"
          :class="{ error: idError !== null }"
          v-model="formId"
          :disabled="isEdit"
          placeholder="小写字母与数字，如 qwendaily"
        />
        <p v-if="idError" class="error-text">{{ idError }}</p>

        <label class="label" style="display: block; margin-top: 8px;">desc（说明）</label>
        <input class="input" v-model="formDesc" placeholder="如：qwen27b 日常推理" />

        <div class="flag-grid">
          <template v-for="row in rows" :key="row.key">
            <label class="label flag-label">
              {{ row.flag }}<span v-if="row.required" title="必填">*</span>
            </label>
            <input
              class="input"
              :class="{ error: props.paramsMeta.required.includes(row.key) && (formValues[row.key] ?? '').trim().length === 0 }"
              :value="formValues[row.key]"
              @input="(ev: Event) => { formValues[row.key] = (ev.target as HTMLInputElement).value; }"
            />
          </template>
        </div>

        <p v-if="emptyRequired.length > 0" class="error-text">必填项未填写：{{ emptyRequired.map((k) => props.paramsMeta.params[k]).join('、') }}</p>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="close">取消</button>
          <button class="btn btn-primary" :disabled="saving || idError !== null || emptyRequired.length > 0" @click="save">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* §4.2 模板弹窗遮罩——style.css 无此语义类，故组件内自给（不污染全局） */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(16, 24, 40, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.modal-box {
  width: 90%;
  max-width: 520px;
  max-height: 85vh;
  overflow-y: auto;
}
.flag-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 6px 10px;
  align-items: center;
}
.flag-label {
  text-align: right;
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
