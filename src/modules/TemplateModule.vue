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

// flag-form 摘要：已填、且在 params 映射里的，取前 3 个（summarize 风格）
function preview(cfg: { values: Record<string, string> }): string {
  return Object.entries(cfg.values)
    .filter(([k, v]) => v.trim().length > 0 && paramsMeta.value.params[k] !== undefined) // Ref 在 script 函数体内不自动解包（模板内才解包）
    .slice(0, 3)
    .map(([k, v]) => paramsMeta.value.params[k] + ' ' + v.trim())
    .join('  ');
}

function openNew(): void { editingId.value = null; modalOpen.value = true; }
function openEdit(id: string): void {
  const c = configs.value ? configs.value[id] : undefined;
  if (!c) return;
  editingId.value = id;
  modalOpen.value = true;
}

const emit = defineEmits<{ (e: 'changed'): void }>(); // TemplateModule 保存/删除后通知 App bump LaunchBar configs-reload-key

async function onDelete(id: string): Promise<void> {
  if (!confirm('删除配置「' + id + '」？将从 llama_launch_configs.yaml 移除。')) return;
  try {
    await invoke('delete_config', id);
  } catch (e) {
    error.value = errMsg(e); // VALIDATION / IO / MISSING 前缀原样展示
    return;
  }
  await reload();
  emit('changed');
}

function onSaved(): void { modalOpen.value = false; void (async () => { await reload(); emit('changed'); })(); }

onMounted(reload);
</script>
<template>
  <section class="module module-template">
    <h2>启动参数模板</h2>
    <div style="display: flex; justify-content: flex-end;">
      <button class="btn btn-secondary" @click="openNew">新建模板</button>
    </div>
    <p v-if="missing && error" class="label">目前没有模板配置</p>
    <p v-else-if="error && !missing" class="error-text">{{ error }}</p>
    <table v-if="configs" style="width: 100%; border-collapse: collapse; margin-top: 8px;">
      <thead>
        <tr class="label">
          <th style="text-align: left; padding-right: 8px;">id</th>
          <th style="text-align: left; padding-right: 8px;">desc</th>
          <th style="text-align: left; padding-right: 8px;">参数预览</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="id in Object.keys(configs)" :key="id">
          <tr style="border-top: 1px solid var(--border);">
            <td style="padding: 4px 8px 4px 0; font-weight: 600;">{{ id }}</td>
            <td class="label" style="padding: 4px 8px;">{{ configs[id].desc ?? '' }}</td>
            <td style="font-family: var(--font-mono); font-size: 12px; padding: 4px 8px; word-break: break-all;">
              {{ preview(configs[id]) || '（无）' }}
            </td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="btn btn-secondary" style="height: 24px; margin-right: 4px;" @click="openEdit(id)">编辑</button>
              <button class="btn btn-secondary" style="height: 24px;" @click="onDelete(id)">删除</button>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
    <p v-if="configs && Object.keys(configs).length === 0" class="label">暂无配置</p>

    <TemplateModal
      :open="modalOpen"
      :id="editingId ?? ''"
      :values="configs && editingId ? configs[editingId]?.values ?? {} : {}"
      :desc="configs && editingId ? configs[editingId]?.desc ?? undefined : undefined"
      :params-meta="paramsMeta"
      :existing-ids="configs ? Object.keys(configs) : []"
      @saved="onSaved"
      @close="modalOpen = false"
    />
  </section>
</template>
