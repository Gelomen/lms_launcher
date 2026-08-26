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

// 选项截断（2026-08-26 spec + 当日再收紧，与启动控制下拉同机制、阈值 8——窄容器 10 字仍换行撑高）：>8 字 → 前 8 字 + …(U+2026)；
// tooltip（.dd-tip 悬浮层）显示完整值；value 仍是原始长串，保存契约不变。短选项无省略号/tooltip。
const TRUNC_AT = 8;
function truncOpt(o: string): { label: string; tip?: string } {
  const full = o ?? '';
  if (full.length <= TRUNC_AT) return { label: full };
  return { label: full.slice(0, TRUNC_AT) + '…', tip: full };
}
// options 行的 Dropdown 选项表：截断 label + 完整值 tooltip；trigger tooltip = 当前选中项的 tip。
const optionRows = computed<Record<string, Array<{ value: string; label: string; tip?: string }>>>(() => {
  const opts = props.paramsMeta.params_options ?? {};
  const out: Record<string, Array<{ value: string; label: string; tip?: string }>> = {};
  for (const [k, v] of Object.entries(opts)) out[k] = (v ?? []).map((o) => ({ ...truncOpt(o), value: o }));
  return out;
});
function triggerTip(k: string): string | undefined {
  const rows = optionRows.value[k];
  if (!rows) return undefined;
  const cur = formValues.value[k];
  return (rows.find((r) => r.value === cur) ?? null)?.tip;
}

// 必填项（required 列表）留空 → 红框 + 不保存
const emptyRequired = computed((): string[] => {
  const bad: string[] = [];
  for (const k of props.paramsMeta.required) {
    if ((formValues.value[k] ?? '').trim().length === 0) bad.push(k);
  }
  return bad;
});

// desc（描述）必填——新建 / 编辑均要求非空
const descError = computed((): string | null => {
  return (formDesc.value ?? '').trim().length === 0 ? '必填' : null;
});
// ---------- 保存 ----------
async function save(): Promise<void> {
  attemptedSave.value = true; // 保存失败不重置；关闭经 fill() 重置（步骤 1）
  saveError.value = null;
  // id / 必填项 校验失败 → 保存被拒（计划 task-4 步骤 4「保存被拒」）；红框与「必填项未填写」文案由模板 attemptedSave 门控展示
  if (idError.value !== null || descError.value !== null || emptyRequired.value.length > 0) return;
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

// 删除（规格 2026-08-24 挪入弹窗）：仅编辑模式渲染；confirm 文案沿用列表行原句；失败进 saveError 区展示，不关窗
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
        <!-- 标题栏：固定不滚动（sticky），文字居中，[x] 关闭按钮贴最右 -->
        <header class="modal-head">
          <span class="modal-title">{{ isEdit ? '编辑模板' : '新建模板' }}</span>
          <button type="button" class="modal-close" aria-label="关闭弹窗" @click="close">×</button>
        </header>
        <!-- 表单区：独立滚动容器，标题栏外 -->
        <div class="modal-body">
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

          <label class="label" style="display: block; margin-top: 8px;">描述</label>
          <input class="input" :class="{ error: attemptedSave && descError !== null }" v-model="formDesc" placeholder="如：qwen27b 日常推理" />
          <p v-if="attemptedSave && descError" class="error-text">{{ descError }}</p>

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
                <!-- options 选项 >8 字截断为前 8 字+…（truncOpt），hover tooltip=完整值；value 仍为原始串 -->
                <Dropdown :value="formValues[row.key]"
                          :options="optionRows[row.key] ?? []"
                          :tip="triggerTip(row.key)"
                          @update:value="(v: string) => { formValues[row.key] = v; }" />
              </div>
            </template>
          </div>

          <p v-if="attemptedSave && emptyRequired.length > 0" class="error-text">必填项未填写：{{ emptyRequired.map((k) => props.paramsMeta.params[k]).join('、') }}</p>
        </div>

        <!-- 底部按钮区固定不滚动：取消功能已挪到标题栏 [x]，仅保留 删除 + 保存 -->
        <footer class="modal-actions">
          <button v-if="isEdit" class="btn btn-secondary btn-delete" @click="onDelete">删除</button>
          <button class="btn btn-primary" :disabled="saving" @click="save">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </footer>
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
/* 弹窗卡片 = flex 纵向三段：标题栏 / 表单区（滚动）/ 按钮栏，各自固定不随滚动 */
.modal-box {
  width: 90%;
  max-width: 520px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;               /* #11 兜底：内容不得横向撑破卡片 */
  overflow-y: hidden;               /* 滚动交给 .modal-body，外层不再滚动 */
}
/* 标题栏：sticky 顶部固定；文字水平居中，[x] 绝对定位贴最右 */
.modal-head {
  position: sticky;
  top: 0;
  flex: none;
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 16px;
  background: var(--card);          /* 白底盖住滚动内容（.card 圆角下顶部留白不穿帮） */
  border-bottom: 1px solid var(--border);
}
.modal-title {
  flex: 1;
  text-align: center;                /* 标题文字在标题栏居中 */
  font-size: var(--fs-title);
  font-weight: 600;
}
/* [x] 关闭按钮：标题栏最右侧 */
.modal-close {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: var(--muted);
  border: 1px solid var(--control-border);
  border-radius: var(--radius-btn);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.modal-close:hover { background: #F6F7F8; color: var(--text); }
/* 表单区：唯一的滚动容器 */
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
/* .card 自带 16px padding，三段布局下交给各段自管 */
.modal-box.card { padding: 0; }
/* 表单区顶部留白由 .modal-body padding 承担；首个字段不再需要额外上距 */
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
/* 按钮栏固定底部：删除（编辑模式）+ 保存 */
.modal-actions {
  flex: none;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}
/* 删除按钮贴弹窗左下角（保存仍右对齐） */
.modal-actions .btn-delete { margin-right: auto; }
/* 保存按钮与 删除 同高（全局 .btn-primary 为 36px，此处收敛到 32px） */
.modal-actions .btn-primary { height: var(--h-control); }
</style>
