<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { library, config } from '@fortawesome/fontawesome-svg-core';
import { faPenToSquare, faCopy } from '@fortawesome/free-regular-svg-icons';
import { faFileCirclePlus, faRocket, faStop } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { invoke, errMsg } from '../ipc';
import { t } from '../i18n';
import { truncateByWidth, visualWidth } from '../util/truncate';
import { nextCopyName } from '../util/copy-name';
import QuickLaunchModal from './QuickLaunchModal.vue';
// 类型只有一份真源（主进程配置层）；与 src/i18n.ts:3 同一先例——import type 在构建期被擦除，不引入运行时依赖。
import type { QuickLaunchEntry, QuickLaunchList, QuickLaunchMap } from '../src-main/quick-launch-config';

// 模块 · 快捷启动卡片（规格 2026-10-10-quick-launch-card §4 / §5.2 / §9.4 / §11-1）
// 单向数据流（check C1/C4，与 LaunchBar 同构）：列表数据自己拉 ql_list，运行态由 App 经 states 下发；
// 卡片不订阅 ql-data / ql-exit —— 进程状态的所有权在 App（任务 13），这里只渲染与发 start/stop。
config.autoGenerateCss = true;
// 图标复用既有注册：行「复制」regular copy、「编辑」regular pen-to-square（模板卡同款），
// 「新建」solid file-circle-plus（模板卡同款），启动/停止 solid rocket/stop（LaunchBar 同款）。
library.add(faPenToSquare, faCopy, faFileCirclePlus, faRocket, faStop);
const byPrefixAndName = {
  fat: { copy: faCopy, 'pen-to-square': faPenToSquare },
  fas: { 'file-circle-plus': faFileCirclePlus, rocket: faRocket, stop: faStop },
};

const props = defineProps<{ states: Record<string, { running: boolean; stopping: boolean }> }>();

// emits 只有三个（规格 §9.4 / check C2）：新建与编辑不开新事件，弹窗归卡片自己持有（索引 K29）
const emit = defineEmits<{
  (e: 'start', configId: string): void;
  (e: 'stop', configId: string): void;
  (e: 'changed'): void;
}>();

const list = ref<QuickLaunchList | null>(null);
const error = ref<string | null>(null);
const copying = ref(false);

// 弹窗状态归卡片（索引 K29）：QuickLaunchModal 由本文件挂载（任务 12 / B3）。editingId = null → 新建，
// 非 null → 编辑该 id。卡片 emits 仍是 start/stop/changed —— 新建与编辑不开新事件。
const modalOpen = ref(false);
const editingId = ref<string | null>(null);
function openNew(): void { editingId.value = null; modalOpen.value = true; }
function openEdit(id: string): void {
  if (!list.value || !list.value.items[id]) return;
  editingId.value = id;
  modalOpen.value = true;
}
// 弹窗保存 / 删除成功：关窗 + 重拉 ql_list + 冒泡 changed（与 TemplateModule.vue:141-143 同构）。
// 列表数据的所有权在卡片（C1），刷新因此在这里做、不在弹窗里；close 只关窗、不改动。
function onModalSaved(): void { modalOpen.value = false; void (async () => { await reload(); emit('changed'); })(); }
function onModalDeleted(): void { modalOpen.value = false; void (async () => { await reload(); emit('changed'); })(); }
// I-1（修复轮 B）：运行中的条目不能删 —— 把「当前编辑项是否运行/停止中」传进弹窗去禁用 [删除]。
// 运行态的唯一来源 = App 下发的 props.states（C1：卡片不持有进程状态），这里只按 editingId 取一项；
// App 的 stopping 恒带 running = true（App.vue doQlStop / doQlStart），所以 || stopping 只是防御性写法。
function editingRunning(): boolean {
  const id = editingId.value;
  if (id === null) return false;
  const s = stateOf(id);
  return s.running || s.stopping;
}

// 回填给弹窗的条目：新建（id = null，索引 K31(1)）或列表不可用时 = null → 弹窗以空表单打开
function entryFor(id: string | null): QuickLaunchEntry | null {
  if (id === null || !list.value) return null;
  return list.value.items[id] ?? null;
}

// ql_list 永不抛 MISSING（规格 §5.2：首次必然没有这个文件 → 空表）；走到 catch 只剩 YAML: 这类真错误。
async function reload(): Promise<void> {
  error.value = null;
  try {
    list.value = await invoke<QuickLaunchList>('ql_list');
  } catch (e) {
    error.value = errMsg(e);
    list.value = null;
  }
}

// 复制（check C3 / 索引 K28(1)）：名字走 nextCopyName（不自己拼 - copy 后缀），
// 落盘 invoke('ql_save', null, entry) —— id=null 由主进程生成新 id 并**追加**到文件末尾
// （src-main/quick-launch-config.ts:137-139，没有 insert-after 通道）。
// 「插到源行正后方」因此是卡片本地重排：对象键序 = 显示序，按现有键序遍历、源 id 后插入新 id
// （与 TemplateModule.vue:86-93 同一手法）。失败（VALIDATION:/YAML:）→ error 区，列表不变。
async function onCopy(id: string): Promise<void> {
  const cur = list.value;
  if (copying.value || !cur) return;
  const src = cur.items[id];
  if (!src) return;
  copying.value = true;
  error.value = null;
  try {
    const taken = new Set(Object.values(cur.items).map((e) => e.name));
    const copy: QuickLaunchEntry = { ...src, name: nextCopyName(src.name, taken) };
    const newId = await invoke<string>('ql_save', null, copy);
    const items: QuickLaunchMap = {};
    for (const k of Object.keys(cur.items)) {
      items[k] = cur.items[k];
      if (k === id) items[newId] = copy;
    }
    list.value = { items, invalid: cur.invalid };
    emit('changed');
  } catch (e) {
    error.value = errMsg(e);
  } finally {
    copying.value = false;
  }
}

// 运行态（规格 §9.4 三态）：states 由 App 下发，缺项 = 未运行。stopping 只读不写——停止在 App。
function stateOf(id: string): { running: boolean; stopping: boolean } {
  return props.states[id] ?? { running: false, stopping: false };
}
function onToggle(id: string): void {
  const s = stateOf(id);
  if (s.stopping) return;
  if (s.running) emit('stop', id);
  else emit('start', id);
}

// 行名截断（规格 §11-1）：视觉宽度预算 30（列表行；模板卡同为 30，下拉是 16）——CJK=2 / 拉丁=1，
// 只在真超预算 + grace=2 时手动 +…(U+2026) 并挂 data-tooltip 全名，grace 内全量渲染不挂。
const BUDGET = 30;
function nameOf(id: string): string {
  return list.value?.items[id]?.name || id;
}
function rowName(id: string): string {
  return truncateByWidth(nameOf(id), BUDGET);
}
function tipFor(id: string): string | undefined {
  const n = nameOf(id);
  return visualWidth(n) > BUDGET + 2 ? n : undefined;
}
// 长名浮层（check F3）：模板卡同款 .tpl-tip —— position:fixed 浮于视口，避开列表容器的 overflow 裁剪
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

onMounted(() => { void reload(); });
</script>
<template>
  <section class="module module-quick">
    <div style="display: flex; justify-content: flex-start; align-items: center; gap: 2px;">
      <h2 style="margin-bottom: 0;">{{ t('ql.title') }}</h2>
      <button class="icon-btn icon-btn--sm" :data-tooltip="t('ql.btn.new')" :aria-label="t('ql.btn.new')" @click="openNew">
        <FontAwesomeIcon :icon="byPrefixAndName.fas['file-circle-plus']" />
      </button>
    </div>
    <div v-if="tip" class="tpl-tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">{{ tip.text }}</div>
    <!-- 列表容器复用模板卡的 .template-list（2026-10-13 用户反馈 + 截图：条目一多卡片就一路往下长，
         连带把整行 grid 撑开）。与模板卡「方案 B」同架构：固定高度 + 内部滚动，卡片高度恒定、
         与条目数无关；类名沿用不改（与 .tpl-rows 复用同一先例，check F1），两张卡因此恒等高。
         错误 / invalid 提示 / 空态文案一并放进容器（同 TemplateModule.vue:163-197），
         这样出现提示时卡片也不长高。
         长名浮层 .tpl-tip 留在容器外：position:fixed 本就不受 overflow 裁剪，放外面更稳。 -->
    <div class="template-list">
      <!-- YAML 坏了等真错误（ql_list 不抛 MISSING）；无效条目不在此列，它们进 invalid 计数提示 -->
      <p v-if="error" class="error-text">{{ error }}</p>
      <!-- 规格 §5.2：单条非法 → 跳过并把 id 收进 invalid，卡片顶部提示「N 条配置无效，已跳过」 -->
      <p v-if="list && list.invalid.length > 0" class="label">{{ t('ql.invalid', { n: list.invalid.length }) }}</p>
      <!-- 行卡片复用模板卡的 .tpl-rows/.tpl-row/.tpl-row__id/.tpl-row__actions（check F1），不新造行样式 -->
      <div v-if="list" class="tpl-rows">
        <div v-for="id in Object.keys(list.items)" :key="id" class="tpl-row">
          <span class="tpl-row__id" :data-tooltip="tipFor(id)"
            @mouseenter="(e) => onLabelEnter(e as MouseEvent, id)" @mouseleave="onLabelLeave">{{ rowName(id) }}</span>
          <!-- 按钮顺序 = [复制][编辑][启动/停止]（规格 §4 / check E7） -->
          <div class="tpl-row__actions">
            <button class="icon-btn icon-btn--sm" :data-tooltip="t('ql.btn.copy')" :aria-label="t('ql.btn.copy')"
              :disabled="copying" @click="onCopy(id)">
              <FontAwesomeIcon :icon="byPrefixAndName.fat['copy']" />
            </button>
            <button class="icon-btn icon-btn--sm" :data-tooltip="t('ql.btn.edit')" :aria-label="t('ql.btn.edit')" @click="openEdit(id)">
              <FontAwesomeIcon :icon="byPrefixAndName.fat['pen-to-square']" />
            </button>
            <!-- 状态按钮复用 LaunchBar 的 .btn-launch（紫）/.btn-danger（红）与 rocket/stop（check F2）；
                 stopping → 半角三点 ... 并禁用（与 LaunchBar.vue:129 逐字一致，索引 K30） -->
            <button :class="stateOf(id).running ? 'btn btn-danger' : 'btn btn-launch'"
              :data-tooltip="stateOf(id).running ? t('ql.btn.stop') : t('ql.btn.start')"
              :aria-label="stateOf(id).running ? t('ql.btn.stop') : t('ql.btn.start')"
              :disabled="stateOf(id).stopping" @click="onToggle(id)"><template v-if="!stateOf(id).running"><FontAwesomeIcon :icon="byPrefixAndName.fas['rocket']" style="font-size: 16px;" /></template><span v-else-if="stateOf(id).stopping">...</span><FontAwesomeIcon v-else :icon="byPrefixAndName.fas['stop']" style="font-size: 14px;" /></button>
          </div>
        </div>
      </div>
      <p v-if="list && Object.keys(list.items).length === 0" class="label">{{ t('ql.empty.none') }}</p>
    </div>
    <!-- 新建 / 编辑弹窗由卡片持有（索引 K29）：id = null → 新建（K31(1)）；
         saved / deleted → 重拉列表 + changed；close → 只关窗 -->
    <!-- running：见上面 editingRunning()（I-1）——运行中的条目在弹窗里禁用 [删除] -->
    <QuickLaunchModal :open="modalOpen" :id="editingId" :entry="entryFor(editingId)" :running="editingRunning()"
      @saved="onModalSaved" @deleted="onModalDeleted" @close="modalOpen = false" />
  </section>
</template>
