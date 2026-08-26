<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { library, config } from '@fortawesome/fontawesome-svg-core';
import { faPenToSquare } from '@fortawesome/free-regular-svg-icons';
import { faFileCirclePlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { invoke, errMsg, isMissing, isValidation } from '../ipc';
import { truncateByWidth, visualWidth } from '../util/truncate';
import TemplateModal from './TemplateModal.vue';

// FontAwesome：按需注册 pen-to-square regular 款（列表行「编辑」）+ file-circle-plus solid 款（新建模板按钮），tree-shakeable 用法；与 TemplateModal / Dropdown 同模式。
config.autoGenerateCss = true;
library.add(faPenToSquare, faFileCirclePlus);
const byPrefixAndName = { fat: { 'pen-to-square': faPenToSquare, 'file-circle-plus': faFileCirclePlus } };

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

// 列表名截断（2026-08-26 spec-truncate-by-visual-width）：按视觉宽度预算 30——CJK=2 / 拉丁=1；
// 中文 ≤15 字不截断（与旧 TRUNC_AT=15 契约一致），英文可显示约 29~30 字符再 + …(U+2026)；hover 弹自绘 tooltip 显示完整名字；
// 短名完整显示、无 tooltip。data-tooltip 仅长名携带，与「编辑」按钮 tooltip 同视觉语言。
const BUDGET = 30;
function nameOf(id: string): string {
  const c = configs.value?.[id];
  return (c?.desc ?? '') || id;
}
function rowName(id: string): string {
  return truncateByWidth(nameOf(id), BUDGET);
}
function tipFor(id: string): string | undefined {
  // 与 truncateByWidth grace=2 对齐：仅「手动截断」(width > BUDGET+2) 才有 tooltip；grace 内全量渲染 → 无 …、无 tooltip
  const n = nameOf(id);
  return visualWidth(n) > BUDGET + 2 ? n : undefined;
}
// tooltip：position:fixed 浮于视口 —— .template-list overflow-y:auto 会裁剪行内 absolute 浮层（编辑按钮同款问题）
const tip = ref<{ text: string; x: number; y: number } | null>(null);
function onLabelEnter(e: MouseEvent, id: string): void {
  const el = e.currentTarget as HTMLElement;
  if (el.dataset.tooltip === undefined) return;
  const r = el.getBoundingClientRect();
  tip.value = { text: nameOf(id), x: r.left + r.width / 2, y: r.top };
}
function onLabelLeave(): void {
  tip.value = null;
}

const emit = defineEmits<{ (e: 'changed'): void }>(); // TemplateModule 保存/删除后通知 App bump LaunchBar configs-reload-key

// 删除已挪入弹窗左下角（TemplateModal.onDelete）；成功后由它 emit('deleted') → 关窗 + 刷新
function onDeleted(): void { modalOpen.value = false; void (async () => { await reload(); emit('changed'); })(); }

function onSaved(): void { modalOpen.value = false; void (async () => { await reload(); emit('changed'); })(); }

onMounted(reload);
</script>
<template>
  <section class="module module-template">
    <div style="display: flex; justify-content: flex-start; align-items: center; gap: 2px;">
      <h2 style="margin-bottom: 0;">启动参数模板</h2>
      <button class="icon-btn icon-btn--sm" data-tooltip="新建模板" aria-label="新建模板"
        @click="openNew">
        <FontAwesomeIcon :icon="byPrefixAndName.fat['file-circle-plus']" />
      </button>
    </div>
    <div class="template-list">
      <p v-if="missing && error" class="label">目前没有模板配置</p>
      <p v-else-if="error && !missing" class="error-text">{{ error }}</p>
      <!-- 行卡片化（2026-08-26 spec）：每配置一个 .tpl-row —— 灰边框圆角独立卡片，
           flex 两端对齐（id 左 / 编辑右），行间 gap 留白替代原 tr border-top 分隔线 -->
      <!-- 长名 tooltip（.tpl-tip）：position:fixed 浮于视口，避开 .template-list overflow-y:auto 的行内裁剪；样式同「编辑」按钮 tooltip -->
      <div v-if="tip" class="tpl-tip"
        :style="{ left: tip.x + 'px', top: tip.y + 'px' }">{{ tip.text }}</div>
      <div v-if="configs" class="tpl-rows">
        <div v-for="id in Object.keys(configs)" :key="id" class="tpl-row">
          <!-- 行名：>25 字截断为前 25 字+…（rowName），长名携带 data-tooltip + hover 弹自绘 .tpl-tip 显示完整名字 -->
          <span class="tpl-row__id"
            :data-tooltip="tipFor(id)"
            @mouseenter="(e) => onLabelEnter(e as MouseEvent, id)"
            @mouseleave="onLabelLeave"> {{ rowName(id) }} </span>
          <button class="icon-btn icon-btn--sm" data-tooltip="编辑" aria-label="编辑"
            @click="openEdit(id)">
            <FontAwesomeIcon :icon="byPrefixAndName.fat['pen-to-square']" />
          </button>
        </div>
      </div>
      <p v-if="configs && Object.keys(configs).length === 0" class="label">暂无配置</p>
    </div>

    <TemplateModal
      :open="modalOpen"
      :id="editingId ?? ''"
      :values="configs && editingId ? configs[editingId]?.values ?? {} : {}"
      :desc="configs && editingId ? configs[editingId]?.desc ?? undefined : undefined"
      :params-meta="paramsMeta"
      @saved="onSaved"
      @deleted="onDeleted"
      @close="modalOpen = false"
    />
  </section>
</template>
