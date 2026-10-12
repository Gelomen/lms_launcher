<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { library, config } from '@fortawesome/fontawesome-svg-core';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { faFloppyDisk, faFolderOpen, faTrashCan } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { invoke, errMsg } from '../ipc';
import { t } from '../i18n';
import Dropdown from '../components/Dropdown.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import { truncateByWidth, visualWidth } from '../util/truncate'; // M19：下拉 label 截断由父级负责（Dropdown.vue:4）
// 类型只有一份真源（主进程的配置层 / 探测层）；import type 在构建期被擦除，不引入运行时依赖
// ——与 QuickLaunch.vue:11-12 同一先例。
import type { QuickLaunchEntry, QuickLaunchKind, TerminalId } from '../src-main/quick-launch-config';
import type { TerminalInfo } from '../src-main/quick-launch-terminals';

// 新建 / 编辑共用的启动项弹窗（规格 2026-10-10-quick-launch-card §9.4 / §5.3 / §6.1 / §8）。
// 外壳照抄 TemplateModal 的类名（modal-overlay / modal-box / modal-head / modal-body / modal-actions /
// modal-save / btn-delete），不新造样式；弹窗由卡片持有（索引 K29），本组件不持有列表数据。
config.autoGenerateCss = true;
// 图标按需注册：regular 款 floppy-disk（保存）/ folder-open（选择文件）/ trash-can（删除）；
// xmark（关闭 ×）无 regular 款，保留 free-solid（与 TemplateModal.vue:15-20 同一口径）
library.add(faFloppyDisk, faTrashCan, faXmark, faFolderOpen);
const byPrefixAndName = {
  fat: { 'floppy-disk': faFloppyDisk, 'trash-can': faTrashCan, 'folder-open': faFolderOpen },
  fas: { xmark: faXmark },
};

// 接口（check C1 / 索引 K31(1)）：id = null → 新建，新 id 由主进程生成（规格 §5.4）；
// entry = null → 空表单。emits（C2）：saved / deleted(id) / close —— 关窗与刷新列表归持有者。
// running（修复轮 B · I-1）：本条目此刻是否处于运行 / 停止中。来源链 = 主进程 ql_states →
// App.vue 的只读镜像 qlStates（:339）→ App.vue:567 以 :states 下发卡片（QuickLaunch.vue:27 接住）→
// 卡片按 editingId 取一项传进来（QuickLaunch.vue 的 editingRunning）。弹窗只读、不写。
// 用途只有一个：运行中的条目禁用 [删除]（删掉后卡片行消失、页签 [x] 又因 closeDisabled 永久禁用 →
// 既停不掉也关不掉）。tooltip 用**已存在**的键 ql.err.running（src-main/i18n/dict.ts:184 zh / :526 en），不新建键。
const props = withDefaults(defineProps<{
  open: boolean;
  id: string | null;
  entry: QuickLaunchEntry | null;
  running?: boolean;
}>(), { running: false });
const emit = defineEmits<{
  (e: 'saved'): void;
  (e: 'deleted', id: string): void;
  (e: 'close'): void;
}>();

const isEdit = computed(() => props.id !== null);

// 终端标签 = 字面量查表（F3 / 任务 8 F5）：主进程只下发 id 与 path（quick-launch-terminals.ts:17-20），
// 文案在渲染端定（规格 §6.1 末行）。写成四个 t() 字面量调用，key-coverage.test.ts:39-41 才扫得到；
// 拼接式取键扫不到，其兜底在 src/i18n.test.ts:79-91。
const TERM_LABEL: Record<TerminalId, () => string> = {
  pwsh: () => t('ql.term.pwsh'),
  powershell: () => t('ql.term.powershell'),
  cmd: () => t('ql.term.cmd'),
  wsl: () => t('ql.term.wsl'),
};

// ---------- 表单状态 ----------
const formName = ref('');
const formType = ref<QuickLaunchKind>('shell');   // 默认「命令行」（E1）
const formShell = ref('');
const formCmd = ref('');
const formExe = ref('');
const terminals = ref<TerminalInfo[]>([]);
const terminalsLoading = ref(false);
const saveError = ref<string | null>(null);
// 单飞标志（索引 K14(2)）：ql_save(id = null) 重复点击会生成两条新配置 → 与 TemplateModal.vue:442 同构
const saving = ref(false);
const attemptedSave = ref(false);   // 空名提示只在点过「保存」之后出现（TemplateModal.vue:53-55 同口径）
const confirmDeleteOpen = ref(false);

// 空名即时提示（F4）：其余六条校验规则（长度 / 重名 / type / 终端可用 / cmd / exe）
// 一律交主进程（quick-launch-config.ts:87-102 与 :129-135），这里不复制。
const nameError = computed((): string | null =>
  formName.value.trim().length === 0 ? t('ql.err.nameRequired') : null);

// 类型与终端都走共享 Dropdown（F1，不手写 select）。类型两项固定；终端来自探测结果，
// 顺序照主进程返回序不重排（索引 K31(3)：规格与计划都没要求 pwsh 优先）。
const typeOptions = computed(() => [
  { value: 'shell', label: t('ql.modal.type.shell') },
  { value: 'exe', label: t('ql.modal.type.exe') },
]);
// M19（修复轮 B）：Dropdown.vue:4 明写「label 截断由父级负责」，此前传的是未截断全名。
// 预算 16 = 规格 §11-1 的下拉/页签预算（与 App.vue 的 TAB_LABEL_BUDGET 同值；列表行 30 在卡片侧）。
// 完整名走 option.tip（Dropdown.vue:18 / :72 已支持）；「只有真截断才挂 tip」沿用 LaunchBar.vue:93-94 的 grace 口径。
const TERMINAL_LABEL_BUDGET = 16;
const terminalOptions = computed(() => terminals.value.map((info) => {
  const full = TERM_LABEL[info.id]();
  return {
    value: info.id,
    label: truncateByWidth(full, TERMINAL_LABEL_BUDGET),
    tip: visualWidth(full) > TERMINAL_LABEL_BUDGET + 2 ? full : undefined,
  };
}));

function fill(): void {
  attemptedSave.value = false;
  saveError.value = null;
  confirmDeleteOpen.value = false;
  const e = props.entry;
  formName.value = e?.name ?? '';
  formType.value = e?.type === 'exe' ? 'exe' : 'shell';
  formShell.value = e?.shell ?? '';
  formCmd.value = e?.cmd ?? '';
  formExe.value = e?.exe ?? '';
  terminals.value = [];
}

// 每次打开都重新探测（规格 §6.1：不跨调用缓存 → 用户之后装好 WSL 发行版，下次打开自动出现）。
// 加载中禁用下拉并显示占位文案（E3）；预选第一项可用，编辑态仍可用的终端不被覆盖（索引 K31(3)）。
async function loadTerminals(): Promise<void> {
  terminalsLoading.value = true;
  try {
    const found = await invoke<TerminalInfo[]>('ql_terminals');
    terminals.value = found;
    if (!found.some((info) => info.id === formShell.value)) formShell.value = found.length > 0 ? found[0].id : '';
  } catch (e) {
    terminals.value = [];
    saveError.value = errMsg(e);
  } finally {
    terminalsLoading.value = false;
  }
}

// open 变 true：回填表单 + 拉终端（check C3 / D3）。immediate 兜住「挂载时就是打开的」。
watch(() => props.open, (open) => { if (open) { fill(); void loadTerminals(); } }, { immediate: true });

function onTypeChange(v: string): void { formType.value = v === 'exe' ? 'exe' : 'shell'; }
function onShellChange(v: string): void { formShell.value = v; }

// 选择 .exe（check C3）：主进程对话框取消 = null → 不改表单
async function pickExe(): Promise<void> {
  const picked = await invoke<string | null>('ql_pick_exe');
  if (picked !== null) formExe.value = picked;
}

// 保存（规格 §5.3 / §8）：只发该类型的字段（§5.3-6：shell 不带 exe，exe 不带 shell/cmd）。
// 成功 = emit saved（关窗与刷新归持有者）；失败 = 主进程文案原样进错误区，不关窗（索引 K31(2)）。
async function save(): Promise<void> {
  if (saving.value) return;
  attemptedSave.value = true;
  saveError.value = null;
  if (nameError.value !== null) return;
  const name = formName.value.trim();
  const entry: QuickLaunchEntry = formType.value === 'exe'
    ? { name, type: 'exe', exe: formExe.value.trim() }
    : { name, type: 'shell', shell: formShell.value as TerminalId, cmd: formCmd.value.trim() };
  saving.value = true;
  try {
    await invoke('ql_save', props.id, entry);
    emit('saved');
  } catch (e) {
    saveError.value = errMsg(e);
  } finally {
    saving.value = false;
  }
}

// 删除（E6 / F2）：仅编辑态渲染；[删除] 只开 ConfirmDialog(tone=danger)，点[确认]才 invoke('ql_delete')。
// 失败（不存在 → VALIDATION:）进错误区，与 TemplateModal.vue:244-252 同口径。
// I-1：运行中 / 停止中不给删。模板已 :disabled，这里再守一道（禁用样式挡不住键盘 Enter 与程序化点击）。
function onDelete(): void {
  if (props.running) return;
  confirmDeleteOpen.value = true;
}
async function doDelete(): Promise<void> {
  const id = props.id;
  if (id === null) return;
  try {
    await invoke('ql_delete', id);
    emit('deleted', id);
    confirmDeleteOpen.value = false;
  } catch (e) {
    saveError.value = errMsg(e);
  }
}

// Minor 9：确认文案用 trim 后的名字，与 save() 里的 formName.value.trim() 同一处理
const deleteMessage = computed(() => t('ql.modal.delete.message', { name: formName.value.trim() }));
function close(): void { emit('close'); }
</script>
<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay">
      <div class="card modal-box">
        <!-- 标题栏：文字居中，[x] 贴最右（照抄 TemplateModal.vue:361-367 的结构与类名） -->
        <header class="modal-head">
          <span class="modal-title">{{ isEdit ? t('ql.modal.editTitle') : t('ql.modal.newTitle') }}</span>
          <button type="button" class="modal-close" :aria-label="t('tplModal.close')" @click="close">
            <FontAwesomeIcon :icon="byPrefixAndName.fas['xmark']" />
          </button>
        </header>
        <!-- 表单区：唯一的滚动容器 -->
        <div class="modal-body">
          <!-- 主进程校验文案（VALIDATION: / YAML:）原样显示（索引 K31(2)） -->
          <p v-if="saveError" class="error-text">{{ saveError }}</p>

          <label class="label" style="display: block; margin-top: 8px;">{{ t('ql.modal.name') }}</label>
          <input class="input" :class="{ error: attemptedSave && nameError !== null }" v-model="formName" />
          <p v-if="attemptedSave && nameError" class="error-text">{{ nameError }}</p>

          <div class="flag-grid">
            <label class="label flag-label">{{ t('ql.modal.type') }}</label>
            <div class="dropdown">
              <Dropdown :value="formType" :options="typeOptions" @update:value="onTypeChange" />
            </div>

            <!-- 命令行：终端下拉（加载中禁用 + 占位文案，E3）+ 命令输入框 -->
            <template v-if="formType === 'shell'">
              <label class="label flag-label">{{ t('ql.modal.terminal') }}</label>
              <div class="dropdown">
                <Dropdown :value="formShell" :options="terminalOptions"
                  :disabled="terminalsLoading"
                  :placeholder="terminalsLoading ? t('ql.modal.terminal.loading') : ''"
                  @update:value="onShellChange" />
              </div>
              <label class="label flag-label">{{ t('ql.modal.cmd') }}</label>
              <div class="row-cell"><input class="input" v-model="formCmd" /></div>
            </template>

            <!-- 可执行程序：路径 + 选择按钮（规格 §2 非目标：不加启动参数 / 工作目录） -->
            <template v-else>
              <label class="label flag-label">{{ t('ql.modal.exe') }}</label>
              <div class="row-cell">
                <input class="input" v-model="formExe" />
                <button class="btn btn-secondary file-btn tip-up" :data-tooltip="t('ql.modal.btn.pick')"
                  :aria-label="t('ql.modal.btn.pick')" @click="pickExe">
                  <FontAwesomeIcon :icon="byPrefixAndName.fat['folder-open']" style="font-size: 14px;" />
                </button>
              </div>
            </template>
          </div>
        </div>

        <!-- 底栏：左下删除（仅编辑态，F2）+ 右下紫色保存（单飞：:disabled=saving，与 TemplateModal.vue:442 同构） -->
        <footer class="modal-actions">
          <!-- I-1：运行中的条目禁用 [删除]，原因挂 tooltip（ql.err.running 是既有键，本轮不新建）。
               修复轮 B1：tooltip 的渲染条件是**类选择器**（style.css:414-425 `.tip-up::after { content: attr(data-tooltip) }`），
               本组件的 .btn-delete 自身没有 ::after 规则 → 光有 data-tooltip 属性真机上什么都不显示。
               故类与属性**同条件**（running）成对挂载，与 App.vue:565（tip-down + :data-tooltip）同一用法。
               不能无条件挂 .tip-up：attr() 在属性缺失时求值为空串，仍会渲染一个带 padding 的空白气泡。 -->
          <button v-if="isEdit" class="btn-delete" :class="{ 'tip-up': running }" :aria-label="t('ql.modal.btn.delete')"
            :disabled="running" :data-tooltip="running ? t('ql.err.running') : undefined" @click="onDelete">
            <FontAwesomeIcon :icon="byPrefixAndName.fat['trash-can']" />
          </button>
          <button class="modal-save" :disabled="saving" :aria-label="t('ql.modal.btn.save')" @click="save">
            <FontAwesomeIcon :icon="byPrefixAndName.fat['floppy-disk']" style="font-size: 18px;" />
          </button>
        </footer>
      </div>
    </div>
    <!-- 删除二次确认（E6）：tone=danger；[确认] 才 invoke('ql_delete')，[取消] / 遮罩只关窗 -->
    <ConfirmDialog :open="confirmDeleteOpen" :title="t('ql.modal.delete.title')" :message="deleteMessage"
      tone="danger" @confirm="doDelete" @close="() => (confirmDeleteOpen = false)" />
  </Teleport>
</template>

<style scoped>
/* 外壳样式照抄 TemplateModal.vue:477-643 的本弹窗所需子集（.modal-overlay 是全局样式，style.css:47，不改它）。
   本弹窗没有 VRAM 指示 / 开关行 / flag tooltip，故不带那几段。 */
.modal-box {
  width: 90%;
  max-width: 520px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: hidden;
}
.modal-head {
  position: sticky;
  top: 0;
  flex: none;
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 16px;
  background: var(--card);
  border-bottom: 1px solid var(--border);
}
.modal-title {
  flex: 1;
  text-align: center;
  font-size: var(--fs-title);
  font-weight: 600;
}
.modal-close {
  position: absolute;
  top: 0;
  right: 0;
  width: 36px;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--card);
  color: var(--muted);
  border: none;
  border-top-right-radius: var(--radius-card);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.modal-close:hover { background: var(--danger); color: #fff; }
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.modal-box.card { padding: 0; }
/* 两列表单：label 右对齐、控件占满余下宽度（与 TemplateModal 的 flag-grid 同一布局） */
.flag-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 10px;
  align-items: center;
}
.flag-label {
  text-align: right;
  white-space: nowrap;
}
.row-cell { display: flex; gap: 8px; min-width: 0; }
.row-cell .input { flex: 1; }
.file-btn {
  flex-shrink: 0; height: var(--h-control); display: inline-flex; align-items: center; justify-content: center;
  padding: 0 14px; font-size: var(--fs-label);
}
.modal-actions {
  flex: none;
  position: relative;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 16px;
  border-top: 1px solid var(--border);
}
.btn-delete {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 36px;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--card);
  color: var(--muted);
  border: none;
  border-bottom-left-radius: var(--radius-card);
  cursor: pointer;
}
.btn-delete:hover { background: var(--danger); color: #fff; }
/* 修复轮 B1：只 :disabled 不改外观 = 用户看不出为什么点不动。禁用口径照 style.css:232
   （.icon-btn:disabled 同色同 cursor）与本文件 .modal-save:disabled（下方）同一语言。
   tooltip 类 .tip-up 复用 style.css:414-425，本文件不复制、不改 style.css。 */
.btn-delete:disabled { color: #C7CCD4; cursor: not-allowed; }
.modal-save {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 36px;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--primary);
  color: #fff;
  border: none;
  border-bottom-right-radius: var(--radius-card);
  cursor: pointer;
}
.modal-save:hover { background: var(--primary-hover); }
.modal-save:disabled, .modal-save[disabled='true'] {
  background: var(--disabled-bg);
  color: var(--muted);
  cursor: not-allowed;
}
</style>
