<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { invoke, errMsg } from '../ipc';
import Dropdown from '../components/Dropdown.vue';

// 模板弹窗（新建 / 编辑共用，规格 §4.2）：
// flag-form 参数表单 + id 唯一性红框 + 必填(-m)红框不保存；其余空值不写入 yaml。
const props = withDefaults(defineProps<{
  open: boolean;
  id: string;
  values: Record<string, string>;
  desc?: string;
  paramsMeta: {
    params: Record<string, string>;
    required: string[];
    params_options?: Record<string, string[]>;
    params_boolean?: string[];
    params_file?: string[];
  };
  existingIds: string[];
}>(), { desc: '' });

const emit = defineEmits<{ (e: 'saved'): void; (e: 'close'): void; (e: 'deleted', id: string): void }>();

const isEdit = computed(() => props.id.length > 0);

// ---------- 表单状态 ----------
const formId = ref('');
const formDesc = ref('');
const formValues = ref<Record<string, string>>({});
const saveError = ref<string | null>(null);
const saving = ref(false);
// #3：保存前不显示任何校验提示；只有「保存」点击过才 revealed。
// 打开（fill）重置为 false，点保存后置 true——保存失败不重置（下次点保存仍保留上次状态）。
const attemptedSave = ref(false);

function fill(): void {
  attemptedSave.value = false; // 打开弹窗重置（步骤 1）
  formId.value = props.id;
  formDesc.value = props.desc ?? '';
  const opts = props.paramsMeta.params_options ?? {};
  const bools: string[] = props.paramsMeta.params_boolean ?? [];
  const init: Record<string, string> = {};
  for (const row of rows.value) {
    if (row.type === 'boolean') init[row.key] = 'false';            // §#9D：boolean 恒默认 false（'false' 不写入 yaml）
    else if (row.type === 'options') init[row.key] = row.opts[0];   // options 恒默认首个选项（无未设置占位）
    else init[row.key] = '';
  }
  if (isEdit.value) {
    for (const [k, v] of Object.entries(props.values)) {
      const t = (v ?? '').trim();
      if (t.length === 0) continue;
      const row = rows.value.find((r) => r.key === k);
      if (!row) continue; // 存值 key 不在 params 表（开发阶段无兼容）
      if (row.type === 'options' && !row.opts.includes(t)) init[k] = row.opts[0]; // 回落首个
      else init[k] = t;
    }
  }
  formValues.value = init;
  saveError.value = null;
}

// ---------- 校验（对齐 config.ts validateConfigId）----------
const idError = computed((): string | null => {
  const v = formId.value.trim();
  if (v.length === 0) return '必填';
  // 与主进程 validateConfigId（config.ts:87-91）完全一致：小写字母开头、仅 [a-z0-9]、≤32
  if (!/^[a-z][a-z0-9]*$/.test(v)) return '须为小写字母开头的字母数字串（不含下划线 / 空格 / 大写）';
  if (v.length > 32) return '最长 32 位';
  if (props.existingIds.includes(formId.value) && !isEdit.value) return 'id 已被使用';
  return null;
});

type RowType = 'text' | 'options' | 'boolean';
type Row = { key: string; flag: string; required: boolean; type: RowType; opts: string[] };
const rows = computed((): Row[] => {
  const opts = props.paramsMeta.params_options ?? {};
  const bools: string[] = props.paramsMeta.params_boolean ?? [];
  const files: string[] = props.paramsMeta.params_file ?? [];
  const out: Row[] = [];
  for (const [k, flag] of Object.entries(props.paramsMeta.params)) {
    let type: RowType = 'text';
    if (bools.includes(k)) type = 'boolean';
    else if (opts[k] !== undefined) type = 'options';
    out.push({ key: k, flag, required: props.paramsMeta.required.includes(k), type, opts: opts[k] ?? [] });
  }
  return out;
});
const fileKeys = computed((): string[] => props.paramsMeta.params_file ?? []);

// 打开（含从新建切到另一个编辑目标）时重置表单——须在 rows/fileKeys 声明之后注册，immediate 首跑才能读到行定义
watch(() => props.open, (open) => { if (open) fill(); }, { immediate: true });

function requiredError(row: Row): boolean {
  return props.paramsMeta.required.includes(row.key) && (formValues.value[row.key] ?? '').trim().length === 0;
}
async function pickFile(key: string): Promise<void> {
  const picked = await invoke<string | null>('open_file_dialog', key);
  if (picked !== null) formValues.value[key] = picked; // null（取消）不动
}

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
  attemptedSave.value = true; // 保存失败不重置；关闭经 fill() 重置（步骤 1）
  saveError.value = null;
  // id / 必填项 校验失败 → 保存被拒（计划 task-4 步骤 4「保存被拒」）；红框与「必填项未填写」文案由模板 attemptedSave 门控展示
  if (idError.value !== null || emptyRequired.value.length > 0) return;
  // 空值（含编辑时清掉的字段）→ 不写入，保持 yaml 干净；#9D：boolean false 也不写入，yaml 只保留 true flags
  const boolKeys: string[] = props.paramsMeta.params_boolean ?? [];
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(formValues.value)) {
    if ((v ?? '').trim().length === 0) continue;
    if (boolKeys.includes(k) && v.trim() === 'false') continue; // #9D：boolean false 不写入 yaml
    values[k] = v.trim();
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

// 删除（规格 2026-08-24）：仅编辑模式渲染；confirm 文案沿用列表行原句；失败进 saveError 区展示，不关窗
async function onDelete(): Promise<void> {
  if (!confirm('删除配置「' + props.id + '」？将从 llama_launch_configs.yaml 移除。')) return;
  try {
    await invoke('delete_config', props.id);
    emit('deleted', props.id);
  } catch (e) {
    saveError.value = errMsg(e); // VALIDATION / IO / MISSING 前缀原样展示
  }
}

function close(): void { emit('close'); }
</script>
<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay">
      <div class="card modal-box">
        <h3>{{ isEdit ? '编辑模板' : '新建模板' }}</h3>
        <p v-if="saveError" class="error-text">{{ saveError }}</p>

        <label class="label" style="display: block;">id</label>
        <input
          class="input"
          :class="{ error: attemptedSave && idError !== null }"
          v-model="formId"
          :disabled="isEdit"
          placeholder="小写字母与数字，如 qwendaily"
        />
        <p v-if="attemptedSave && idError" class="error-text">{{ idError }}</p>

        <label class="label" style="display: block; margin-top: 8px;">desc（说明）</label>
        <input class="input" v-model="formDesc" placeholder="如：qwen27b 日常推理" />

        <div class="flag-grid">
          <template v-for="row in rows" :key="row.key">
            <label class="label flag-label">{{ row.flag }}</label>
            <!-- boolean / options → #13 共享 Dropdown 组件；text → input（params_file 行右侧加「选择文件」按钮） -->
            <div class="row-cell" v-if="row.type === 'text'">
              <input
                class="input"
                :class="{ error: attemptedSave && requiredError(row) }"
                :value="formValues[row.key]"
                @input="(ev: Event) => { formValues[row.key] = (ev.target as HTMLInputElement).value; }"
              />
              <button v-if="fileKeys.includes(row.key)" class="btn btn-secondary file-btn" @click="pickFile(row.key)">选择文件</button>
            </div>
            <div v-else-if="row.type === 'boolean'" class="dropdown">
              <Dropdown :value="formValues[row.key]"
                        :options="[{ value: 'false', label: 'false' }, { value: 'true', label: 'true' }]"
                        @update:value="(v: string) => { formValues[row.key] = v; }" />
            </div>
            <div v-else class="dropdown">
              <Dropdown :value="formValues[row.key]"
                        :options="row.opts.map((o) => ({ value: o, label: o }))"
                        @update:value="(v: string) => { formValues[row.key] = v; }" />
            </div>
          </template>
        </div>

        <p v-if="attemptedSave && emptyRequired.length > 0" class="error-text">必填项未填写：{{ emptyRequired.map((k) => props.paramsMeta.params[k]).join('、') }}</p>

        <div class="modal-actions">
          <button v-if="isEdit" class="btn btn-secondary btn-delete" @click="onDelete">删除</button>
          <button class="btn btn-secondary" @click="close">取消</button>
          <button class="btn btn-primary" :disabled="saving" @click="save">
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
  overflow-x: hidden;                /* #11 兜底：内容不得横向撑破卡片 */
}
.flag-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: auto 1fr;   /* #8：130px → auto，长 label（--chat-template-file）完整可见 */
  gap: 6px 10px;
  align-items: center;
}
.flag-label {
  text-align: right;
  font-family: var(--font-mono);
  white-space: nowrap;               /* #8：去掉 overflow/ellipsis，保留 nowrap */
}
.row-cell { display: flex; gap: 8px; min-width: 0; }
.row-cell .input { flex: 1; }
.file-btn { width: 72px; flex-shrink: 0; height: var(--h-control); padding: 0 6px; font-size: var(--fs-label); }
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
/* 删除按钮贴弹窗左下角（取消/保存仍右对齐） */
.modal-actions .btn-delete { margin-right: auto; }
</style>
