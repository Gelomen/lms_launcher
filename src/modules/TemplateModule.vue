<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { library, config } from '@fortawesome/fontawesome-svg-core';
import { faPenToSquare, faCopy } from '@fortawesome/free-regular-svg-icons';
import { faFileCirclePlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { invoke, errMsg, isMissing, isValidation } from '../ipc';
import { truncateByWidth, visualWidth } from '../util/truncate';
import TemplateModal from './TemplateModal.vue';
import VramDialog from './VramDialog.vue';

// FontAwesome：按需注册 pen-to-square regular 款（列表行「编辑」）+ file-circle-plus solid 款（新建模板按钮），tree-shakeable 用法；与 TemplateModal / Dropdown 同模式。
config.autoGenerateCss = true;
library.add(faPenToSquare, faCopy, faFileCirclePlus);
const byPrefixAndName = { fat: { 'pen-to-square': faPenToSquare, copy: faCopy, 'file-circle-plus': faFileCirclePlus } };

// 模块 2 · 启动参数模板管理（规格 §4.2）
interface ParamMeta { params: Record<string, string>; required: string[]; params_options?: Record<string, string[]>; params_boolean?: string[]; params_file?: string[]; params_default?: Record<string, string> }
// 数据 key：desc → name（2026-09）；legacy desc 由 main configsLoad 归一
type ConfigMap = Record<string, { name?: string; values: Record<string, string> }>;

// 显卡显存总量(GB)：卡片右上角 VRAM 按钮(紫底白字,未配置显 VRAM / 已配置显 24GB)；
// 数据源 = lms_launcher.yaml 的 vram_total_gb(经 get_app_config 读,save_vram_total 写)。
const vramTotal = ref<number | undefined>(undefined);
const vramDialogOpen = ref(false);
async function loadVramTotal(): Promise<void> {
  try {
    const cfg = await invoke<{ llama_dir: string; vram_total_gb?: number }>('get_app_config');
    vramTotal.value = cfg.vram_total_gb;
  } catch {
    vramTotal.value = undefined;
  }
}
function onVramSaved(): void {
  vramDialogOpen.value = false;
  void loadVramTotal();
}

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

// 复制命名（2026-08-30 spec-template-copy-button，方案 A：递增编号 + 占用检测）：
// 候选 base - copy / base - copy 2 / …，取第一个不在现有 name 集合中的；
// base 本身是复制品（- copy / - copy N 结尾）→ 剥后缀还原原始 base，防止滚成 "X - copy - copy"
const COPY_SUFFIX = / - copy( \d+)?$/;
function nextCopyName(base: string, taken: Set<string>): string {
  const root = base.replace(COPY_SUFFIX, '');
  for (let i = 1; ; i++) {
    const cand = i === 1 ? `${root} - copy` : `${root} - copy ${i}`;
    if (!taken.has(cand)) return cand;
  }
}

// 复制：suggest_config_id 生成新 id → values 原样深拷贝 → name 加 - copy 后缀 → save_config 持久化；
// 成功后本地重建 configs（字符串键保持插入序）把新条目插到源条目正后方 + emit('changed') 刷 LaunchBar；
// 失败（VALIDATION/IO）→ error 区展示，列表不变
const copying = ref(false);
async function onCopy(id: string): Promise<void> {
  if (copying.value || !configs.value) return;
  const src = configs.value[id];
  if (!src) return;
  copying.value = true;
  error.value = null;
  try {
    const newId = await invoke<string>('suggest_config_id');
    const taken = new Set(Object.values(configs.value).map((c) => c.name).filter((n): n is string => typeof n === 'string'));
    const newName = nextCopyName(src.name ?? '', taken);
    await invoke('save_config', newId, newName, { ...src.values });
    // 本地重排：按现有序遍历，源 id 后插入新 id（键序 = 显示序）
    const cur = configs.value;
    const next: ConfigMap = {};
    for (const k of Object.keys(cur)) {
      next[k] = cur[k];
      if (k === id) next[newId] = { name: newName, values: { ...src.values } };
    }
    configs.value = next;
    emit('changed');
  } catch (e) {
    error.value = errMsg(e);
  } finally {
    copying.value = false;
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
  return (c?.name ?? '') || id;
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

onMounted(() => { void reload(); void loadVramTotal(); });
</script>
<template>
  <section class="module module-template" style="position: relative;">
    <div style="display: flex; justify-content: flex-start; align-items: center; gap: 2px;">
      <h2 style="margin-bottom: 0;">启动参数模板</h2>
      <button class="icon-btn icon-btn--sm" data-tooltip="新建模板" aria-label="新建模板"
        @click="openNew">
        <FontAwesomeIcon :icon="byPrefixAndName.fat['file-circle-plus']" />
      </button>
    </div>
    <!-- VRAM 按钮:卡片右上角,紫底白字 14px;未配置显 VRAM / 已配置显 24GB(规格 §5) -->
    <button class="vram-badge tip-up" :data-tooltip="'显卡显存: ' + (vramTotal !== undefined ? vramTotal + ' GB' : '未配置')"
      aria-label="显卡显存设置" @click="vramDialogOpen = true">
      {{ vramTotal !== undefined ? vramTotal + ' GB' : 'VRAM' }}
    </button>
    <div class="template-list">
      <p v-if="missing && error" class="label">暂无模板配置</p>
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
          <!-- 操作按钮组：margin-left:auto 贴卡片右缘（复制在编辑左边） -->
          <div class="tpl-row__actions">
            <!-- 复制按钮（2026-08-30 spec）：faCopy regular 款；点击=新 id + name 加 - copy（递增编号）+ 插入本行后 -->
            <button class="icon-btn icon-btn--sm" data-tooltip="复制" aria-label="复制"
              :disabled="copying"
              @click="onCopy(id)">
              <FontAwesomeIcon :icon="byPrefixAndName.fat['copy']" />
            </button>
            <button class="icon-btn icon-btn--sm" data-tooltip="编辑" aria-label="编辑"
              @click="openEdit(id)">
              <FontAwesomeIcon :icon="byPrefixAndName.fat['pen-to-square']" />
            </button>
          </div>
        </div>
      </div>
      <p v-if="configs && Object.keys(configs).length === 0" class="label">暂无配置</p>
    </div>

    <TemplateModal
      :open="modalOpen"
      :id="editingId ?? ''"
      :values="configs && editingId ? configs[editingId]?.values ?? {} : {}"
      :name="configs && editingId ? configs[editingId]?.name ?? undefined : undefined"
      :params-meta="paramsMeta"
      :vram-total-gb="vramTotal"
      @saved="onSaved"
      @deleted="onDeleted"
      @close="modalOpen = false"
    />
    <VramDialog :open="vramDialogOpen" :vram-total-gb="vramTotal"
      @saved="onVramSaved" @close="vramDialogOpen = false" />
  </section>
</template>
<style scoped>
/* VRAM 按钮:紧贴卡片右上圆角;紫底白字 14px;hover 加深一档;
   min-width 70px + 左右 padding 5px,容纳 3 位数 + 空格 + GB(如 999 GB)不换行 */
.vram-badge {
  position: absolute; top: 0; right: 0;
  height: 26px; padding: 0 5px; min-width: 70px; white-space: nowrap;
  border: none; cursor: pointer;
  border-top-right-radius: var(--radius-card);
  font-size: 14px; font-weight: 600;
  background: var(--primary); color: #fff;
}
.vram-badge:hover { background: var(--primary-hover); }
</style>
