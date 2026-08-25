<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { invoke, errMsg, isMissing, isValidation } from '../ipc';
import TemplateModal from './TemplateModal.vue';

// 模块 2 · 启动参数模板管理（规格 §4.2）
interface ParamMeta { params: Record<string, string>; required: string[]; params_options?: Record<string, string[]>; params_boolean?: string[]; params_file?: string[] }
type ConfigMap = Record<string, { desc?: string; values: Record<string, string> }>;

const configs = ref<ConfigMap | null>(null);
const paramsMeta = ref<ParamMeta>({ params: {}, required: [] });
const error = ref<string | null>(null);
const missing = ref(false);

// 弹窗：editingId === null → 新建；否则编辑（值原样进表单，空值不回填）
const modalOpen = ref(false);
const editingId = ref<string | null>(null);

async function reload(): Promise<void> {
  error.value = null;
  try {
    configs.value = await invoke<ConfigMap>('get_configs');
    missing.value = false;
  } catch (e) {
    const msg = errMsg(e);
    error.value = msg;
    missing.value = isMissing(msg); // llama_launch_configs.yaml 首次缺失 → MISSING（configsLoad）
    configs.value = null;
  }
  try {
    paramsMeta.value = await invoke<ParamMeta>('get_params');
  } catch (e) {
    const msg = errMsg(e);
    if (!isMissing(msg) && !isValidation(msg)) error.value = msg; // 映射表本身坏了才报错，MISSING 沿用空表
  }
}

function openNew(): void { editingId.value = null; modalOpen.value = true; }
function openEdit(id: string): void {
  const c = configs.value ? configs.value[id] : undefined;
  if (!c) return;
  editingId.value = id;
  modalOpen.value = true;
}

const emit = defineEmits<{ (e: 'changed'): void }>(); // TemplateModule 保存/删除后通知 App bump LaunchBar configs-reload-key

// 删除已挪入弹窗左下角（TemplateModal.onDelete）；成功后由它 emit('deleted') → 关窗 + 刷新
function onDeleted(): void { modalOpen.value = false; void (async () => { await reload(); emit('changed'); })(); }

function onSaved(): void { modalOpen.value = false; void (async () => { await reload(); emit('changed'); })(); }

onMounted(reload);
</script>
<template>
  <section class="module module-template">
    <h2>启动参数模板</h2>
    <div style="display: flex; justify-content: flex-end;">
      <button class="btn btn-secondary" @click="openNew">新建模板</button>
    </div>
    <div class="template-list">
      <p v-if="missing && error" class="label">目前没有模板配置</p>
      <p v-else-if="error && !missing" class="error-text">{{ error }}</p>
      <table v-if="configs" style="width: 100%; border-collapse: collapse; margin-top: 8px;">
      <tbody>
        <template v-for="id in Object.keys(configs)" :key="id">
          <tr style="border-top: 1px solid var(--border);">
            <td style="padding: 4px 8px 4px 0; font-weight: 600;">{{ id }}</td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="btn btn-secondary" style="height: 24px;" @click="openEdit(id)">编辑</button>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
      <p v-if="configs && Object.keys(configs).length === 0" class="label">暂无配置</p>
    </div>

    <TemplateModal
      :open="modalOpen"
      :id="editingId ?? ''"
      :values="configs && editingId ? configs[editingId]?.values ?? {} : {}"
      :desc="configs && editingId ? configs[editingId]?.desc ?? undefined : undefined"
      :params-meta="paramsMeta"
      :existing-ids="configs ? Object.keys(configs) : []"
      @saved="onSaved"
      @deleted="onDeleted"
      @close="modalOpen = false"
    />
  </section>
</template>
