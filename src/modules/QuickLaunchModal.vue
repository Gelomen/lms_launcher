<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { library, config } from '@fortawesome/fontawesome-svg-core';
import { faXmark, faTerminal } from '@fortawesome/free-solid-svg-icons';
import { faFloppyDisk, faFolderOpen, faTrashCan, faFileCode } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { invoke, errMsg } from '../ipc';
import { t } from '../i18n';
import Dropdown from '../components/Dropdown.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
// 类型只有一份真源（主进程的配置层 / 探测层）；import type 在构建期被擦除，不引入运行时依赖
// ——与 QuickLaunch.vue:11-12 同一先例。
import type { QuickLaunchEntry, QuickLaunchKind, TerminalId } from '../src-main/quick-launch-config';
import type { TerminalInfo } from '../src-main/quick-launch-terminals';

// 新建 / 编辑共用的启动项弹窗（规格 2026-10-10-quick-launch-card §9.4 / §5.3 / §6.1 / §8）。
// 外壳照抄 TemplateModal 的类名（modal-overlay / modal-box / modal-head / modal-body / modal-actions /
// modal-save / btn-delete），不新造样式；弹窗由卡片持有（索引 K29），本组件不持有列表数据。
config.autoGenerateCss = true;
// 图标按需注册：regular 款 floppy-disk（保存）/ folder-open（选择文件）/ trash-can（删除）；
// xmark（关闭 ×）无 regular 款，保留 free-solid（与 TemplateModal.vue:15-20 同一口径）。
// 2026-10-16（用户要求 [类型] 前加图标，口径由用户选定「按真实款式分前缀」）：
//   terminal 只在 free-solid 里（free-regular 无该图标，实测 node_modules/@fortawesome/free-regular-svg-icons
//   的 index.d.ts 不含 faTerminal）→ 挂 fas 键；file-code 两款都有，取 free-regular（细线款）→ 挂 fat 键。
//   代价（用户知情选定）：两个图标一实心一细线，粗细不一致。
library.add(faFloppyDisk, faTrashCan, faXmark, faFolderOpen, faTerminal, faFileCode);
const byPrefixAndName = {
  fat: { 'floppy-disk': faFloppyDisk, 'trash-can': faTrashCan, 'folder-open': faFolderOpen, 'file-code': faFileCode },
  fas: { xmark: faXmark, terminal: faTerminal },
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
// 任务 8（规格 §6.2 / §4-1）：「管理员」= 条目上的 admin 字段（§6.1，可选布尔）。
// 只有字面量 true 算真（与主进程 normalizeEntry 同一口径），所以回填写 === true 而不是 ?? false。
const formAdmin = ref(false);
const terminals = ref<TerminalInfo[]>([]);
const terminalsLoading = ref(false);
const saveError = ref<string | null>(null);
// 单飞标志（索引 K14(2)）：ql_save(id = null) 重复点击会生成两条新配置 → 与 TemplateModal.vue:442 同构
const saving = ref(false);
const attemptedSave = ref(false);   // 空名提示只在点过「保存」之后出现（TemplateModal.vue:53-55 同口径）
const confirmDeleteOpen = ref(false);

// 空名即时提示（F4）。其余校验规则（长度 / 重名 / type / 终端可用）仍一律交主进程
// （quick-launch-config.ts:87-102 与 :129-135），这里不复制。
const nameError = computed((): string | null =>
  formName.value.trim().length === 0 ? t('ql.err.nameRequired') : null);

// 空命令 / 空 exe 路径（2026-10-13 用户直接改）：报错位置从弹窗顶部错误区挪到**对应输入框下方**，
// 与空名同一手法（attemptedSave 之后即时显示、填上内容即消失、输入框标红）。
// 文案复用主进程校验的既有键，不新建键：err.ql.cmdRequired（dict.ts:313 zh / :655 en）、
// err.ql.exeRequired（dict.ts:314 zh / :656 en）——渲染端与主进程共用同一份词典（src/i18n.ts:3）。
// 主进程那两条规则原样保留（quick-launch-config.ts:94 / :99），这里只是把同一句话换个位置说，
// 并在 save() 里先拦下不发无谓的 IPC。按类型取用：shell 只判 cmd、exe 只判 exe（§5.3-6 的字段口径）。
const cmdError = computed((): string | null =>
  formType.value === 'shell' && formCmd.value.trim().length === 0 ? t('err.ql.cmdRequired') : null);
const exeError = computed((): string | null =>
  formType.value === 'exe' && formExe.value.trim().length === 0 ? t('err.ql.exeRequired') : null);

// 类型与终端都走共享 Dropdown（F1，不手写 select）。类型两项固定；终端来自探测结果，
// 顺序照主进程返回序不重排（索引 K31(3)：规格与计划都没要求 pwsh 优先）。
// 2026-10-16（用户要求）：两项各带一个图标 —— 「命令行」前 terminal、「可执行程序」前 file-code。
// icon 是 Dropdown 的可选字段（Dropdown.vue:19-25），面板选项与收起态 trigger 共用这一份来源（随选中项变）。
const typeOptions = computed(() => [
  { value: 'shell', label: t('ql.modal.type.shell'), icon: byPrefixAndName.fas['terminal'] },
  { value: 'exe', label: t('ql.modal.type.exe'), icon: byPrefixAndName.fat['file-code'] },
]);
// 终端标签一律传全名，不做宽度预算截断（2026-10-13 用户直接改：这一格足够宽，选中项却被截断了）。
// 原 M19 口径（预算 16 = 规格 §11-1 的下拉/页签预算，完整名走 option.tip）在这里属于「宽度够却截断」：
// 本弹窗的终端下拉占满 .flag-grid 的控件列（520px 弹窗里 ≈418px，见本文件 style 块里的 .type-field 注释），
// 最长的标签 'Command Prompt (cmd)' 只有 20 视觉宽（12px 字号下 ≈130px），远小于可用宽度。
// 兜底仍在 CSS：style.css:297 / :317 的 text-overflow:ellipsis 只在文本真的超出盒子时才省略，
// nowrap 防换行撑高的口径不变（任务 19 根因不回退）。option.tip 不再挂——没有截断就不需要补全悬浮层。
const terminalOptions = computed(() => terminals.value.map((info) => ({
  value: info.id,
  label: TERM_LABEL[info.id](),
})));

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
  formAdmin.value = e?.admin === true;
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
  // 三条渲染端即时校验（名字 / 命令 / 路径）先拦下：报错已在各自输入框下方显示，不必再走 IPC
  if (nameError.value !== null || cmdError.value !== null || exeError.value !== null) return;
  const name = formName.value.trim();
  // admin 交**真布尔**（不是 'true' / 1）：主进程按 e.admin === true 分流（任务 7），
  // 配置层把非布尔规整成 false（任务 1 / §8-K4「落盘总是显式写」）——两态都带这个字段。
  const entry: QuickLaunchEntry = formType.value === 'exe'
    ? { name, type: 'exe', exe: formExe.value.trim(), admin: formAdmin.value }
    : { name, type: 'shell', shell: formShell.value as TerminalId, cmd: formCmd.value.trim(), admin: formAdmin.value };
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
          <!-- 主进程校验文案（VALIDATION: / YAML:）原样显示（索引 K31(2)）。
               例外：名字 / 命令 / 路径「不能为空」三条不在这里——名字在名字那一格下方，
               命令与路径在各自输入框下方（2026-10-13 用户直接改），顶部区只留重名 / 过长 / 终端不可用 / YAML 等。 -->
          <p v-if="saveError" class="error-text">{{ saveError }}</p>

          <div class="flag-grid">
            <!-- 名字 + 类型同一行（2026-10-13 直接改）：名字输入框占控件列的余下宽度，
                 类型下拉定宽（.type-field，见下方样式）贴在最右。
                 空名报错放在 .name-cell 内部（名字那一格下方），不占网格列——
                 否则 grid 的自动排布会把下一行的「终端」标签挤到报错同一行。 -->
            <label class="label flag-label name-label">{{ t('ql.modal.name') }}</label>
            <div class="name-cell">
              <div class="row-cell">
                <input class="input" :class="{ error: attemptedSave && nameError !== null }" v-model="formName" />
                <label class="label type-label">{{ t('ql.modal.type') }}</label>
                <div class="dropdown type-field">
                  <Dropdown :value="formType" :options="typeOptions" @update:value="onTypeChange" />
                </div>
              </div>
              <p v-if="attemptedSave && nameError" class="error-text">{{ nameError }}</p>
            </div>

            <!-- 命令行：终端下拉（加载中禁用 + 占位文案，E3）+ 命令输入框 -->
            <template v-if="formType === 'shell'">
              <label class="label flag-label">{{ t('ql.modal.terminal') }}</label>
              <!-- 任务 8（规格 §6.2 / §8-K8；用户澄清原话「[终端] 那一行分为两列，左列是 [终端] 和它的下拉，
                   右边是 [管理员] 开关」）：这一行**不新增网格行** —— 控件格仍用被测试计数器认识的 .field-cell，
                   内部 .row-cell 两段：终端下拉（.term-field 吃掉行内余下宽度）在前、「管理员」+ 开关在后。
                   两态因此都是 3 行控件，218px 的定高推导不变（见上方注释与 test.ts 的 controlCells 门）。 -->
              <div class="field-cell">
                <div class="row-cell">
                  <div class="dropdown term-field">
                    <Dropdown :value="formShell" :options="terminalOptions"
                      :disabled="terminalsLoading"
                      :placeholder="terminalsLoading ? t('ql.modal.terminal.loading') : ''"
                      @update:value="onShellChange" />
                  </div>
                  <label class="label admin-label">{{ t('ql.modal.admin') }}</label>
                  <div class="switch-cell">
                    <button type="button" role="switch" class="bool-switch"
                            :class="{ 'bool-switch--on': formAdmin }"
                            :aria-checked="formAdmin ? 'true' : 'false'"
                            :aria-label="t('ql.modal.admin')"
                            @click="formAdmin = !formAdmin">
                      <span class="bool-switch__knob"></span>
                    </button>
                  </div>
                </div>
              </div>
              <label class="label flag-label cmd-label">{{ t('ql.modal.cmd') }}</label>
              <!-- 命令为空的报错在命令那一格内（.field-cell，与 .name-cell 同一手法），不进弹窗顶部错误区 -->
              <div class="field-cell">
                <div class="row-cell">
                  <input class="input" :class="{ error: attemptedSave && cmdError !== null }" v-model="formCmd" />
                </div>
                <p v-if="attemptedSave && cmdError" class="error-text">{{ cmdError }}</p>
              </div>
            </template>

            <!-- 可执行程序：路径 + 选择按钮（规格 §2 非目标：不加启动参数 / 工作目录） -->
            <template v-else>
              <!-- 任务 8（规格 §6.2；用户原话「[程序路径] 上方添加 [管理员权限] checkbox」）：
                   新增一行「管理员」，位置在「程序路径」那一行**之前**。行数 2 → 3 = 与命令行态同一个行数，
                   218px 的定高在两态同时成立（可执行程序态原本 38px 的留白被这一行填掉）。 -->
              <label class="label flag-label admin-label">{{ t('ql.modal.admin') }}</label>
              <div class="field-cell">
                <div class="row-cell">
                  <div class="switch-cell">
                    <button type="button" role="switch" class="bool-switch"
                            :class="{ 'bool-switch--on': formAdmin }"
                            :aria-checked="formAdmin ? 'true' : 'false'"
                            :aria-label="t('ql.modal.admin')"
                            @click="formAdmin = !formAdmin">
                      <span class="bool-switch__knob"></span>
                    </button>
                  </div>
                </div>
              </div>
              <label class="label flag-label exe-label">{{ t('ql.modal.exe') }}</label>
              <!-- 路径为空的报错在路径那一格内（同上），选择按钮仍在输入行右侧 -->
              <div class="field-cell">
                <div class="row-cell">
                  <input class="input" :class="{ error: attemptedSave && exeError !== null }" v-model="formExe" />
                  <button class="btn btn-secondary file-btn tip-up" :data-tooltip="t('ql.modal.btn.pick')"
                    :aria-label="t('ql.modal.btn.pick')" @click="pickExe">
                    <FontAwesomeIcon :icon="byPrefixAndName.fat['folder-open']" style="font-size: 14px;" />
                  </button>
                </div>
                <p v-if="attemptedSave && exeError" class="error-text">{{ exeError }}</p>
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
   本弹窗没有 VRAM 指示 / flag tooltip，故不带那几段；「开关行」是 2026-10-15 任务 8 才加的
   （.bool-switch 三段从 TemplateModal.vue:567-588 逐字复制，见本文件末尾，§8-K15）。 */
/* 弹窗高度固定（2026-10-13 用户反馈 + 截图：[类型] 切到「可执行程序」时弹窗变窄）：
   定高以「命令行」态为准 = 218px。取值来自无头 Chromium 实测（真实 style.css + 本组件 scoped 样式 +
   两态静态复刻）：命令行态 .modal-box = 218 / 可执行程序态 = 180，差 38 = 一行控件 32 + 一个行距 6。构成：
     .card 上下边框 2
   + .modal-head 32
   + .modal-body：padding 16×2 + .flag-grid margin-top 12 + 3 行 × var(--h-control)32 + 2 行距 × 6 = 152
   + .modal-actions 32
   = 218。2026-10-15 任务 8（规格 §6.2 / §8-K8）在可执行程序态的「程序路径」上方加了一行「管理员」，
   两态都是 3 行控件：原本那 38px 留白被这一行填掉，218 这个数与 min-height 一字未改。
   用 min-height 而不是 height（用户 2026-10-13 决定）：保存失败的主进程文案 / 名字·命令·路径「不能为空」
   的字段级提示出现时，弹窗自然长高（实测报错态 236px，正文区 bodyScroll == bodyClient = 不出滚动条、
   内容不被裁），不把命令输入框顶掉。
   行数变了这个数就要重算——QuickLaunchModal.test.ts 的 modal_height_is_fixed_to_the_shell_form_height_in_both_types
   钉着「两态各 3 行控件」（两态各数一遍 controlCells）与「两态同一个定高值」。 */
.modal-box {
  width: 90%;
  max-width: 520px;
  min-height: 218px;            /* = 命令行态实测高度，见上方推导 */
  max-height: 85vh;             /* 窗口很矮时的收缩兜底（定高之后它是唯一收缩门），.modal-body 内部滚动 */
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
.row-cell { display: flex; gap: 8px; min-width: 0; align-items: center; }
.row-cell .input { flex: 1; }
/* 名字 + 类型同行（2026-10-13 直接改）：
   .name-cell = 网格第二列里的纵向容器（输入行 + 空名报错），min-width:0 让里面的 flex 行能收缩；
   .type-field = 类型下拉定宽。原来它跟着 style.css:289 的 .dropdown { width: 100% } 占满控件列
   （520px 弹窗里 ≈ 418px），2026-10-13 按「可执行程序」/「Command line」两个标签都能放下定到 140px。
   2026-10-16（用户直接改：缩短 [名字] 输入框、增大 [类型] 下拉 + 两项前加图标）→ 140px 增到 180px。
   取值取证台 .temp/ql-type-icon-probe/（无头 Chromium；灌真实 style.css + 本段 scoped 原文 + fontawesome
   自己生成的 CSS；trigger / 面板 markup 不是手写复刻，是 dump.test.ts 从真实组件导出的 outerHTML）：
     trigger 可用内容区 = clientWidth − style.css:118 .btn 的 padding 0 14px（28px）；
     最大需求（en「Command line」）= 图标 17.5（= 1.25em @14px，见 style.css:343-359）+ gap 8 + 文本 90.1
                + gap 8 + ▼ 15.8（.select-caret 11px 字号 + padding-right 2）= 139.3px
     140px → 可用只有 111px：实测 trigger 标签被截（61.4 / 90.1），面板选项「Command line」也被截（131 / 132）；
     180px → 可用 151px：两处都不截（标签实测 90.3），trigger 余量 11.7px、选项余量 32px。
   同一次实测的另一侧：名字输入框 248.7px → 208.7px（缩短 40px），.row-cell 总宽不变（428.7px）。
   选择器写成 .row-cell .type-field（特异性 0,2,0 + scoped 属性）以压过 style.css:289 的 width:100%；
   定宽值由 QuickLaunchModal.test.ts 的 type_field_is_widened_to_180px 钉住。 */
.name-cell { min-width: 0; }
/* 命令 / 可执行程序路径的报错格（2026-10-13 用户直接改）：与 .name-cell 同一手法——
   纵向容器包住「输入行 + 报错」，报错不占 .flag-grid 的网格列（否则会把下一行的标签挤到报错同一行）。
   两态下它都是表单最后一格，所以不影响 218px 的定高推导（报错出现时按 min-height 自然长高）。 */
.field-cell { min-width: 0; }
/* 名字标签对齐到输入行本身：.flag-grid 是 align-items:center，空名报错出现后 .name-cell 变高，
   默认居中会把标签压到「输入框 + 报错」两行的中间。改为顶对齐 + 8px 内边距
   = (32px 控件高 − 17px 行高) / 2，有无报错都对齐输入框的中线。
   命令 / 路径两格现在也会因报错变高，同一处理（.cmd-label / .exe-label）。 */
.flag-grid .name-label, .flag-grid .cmd-label, .flag-grid .exe-label { align-self: start; padding-top: 8px; }
.row-cell .type-label { flex: none; white-space: nowrap; }
.row-cell .type-field { flex: none; width: 180px; }
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
/* 「管理员」切换开关（任务 8 / 规格 §6.2 / §8-K5）：markup 照抄 TemplateModal.vue:398-406，
   下面三段样式从 TemplateModal.vue:567-588 **逐字复制**（§8-K15：不提到 src/style.css，免得把改动半径
   扩到 TemplateModal 与它的样式断言；这份重复登记为已接受的技术债）。配色 / 尺寸 / 焦点环一字未改：
   与 [保存] / [启动] / VRAM 同一主操作色语言（开 = --primary，关 = --switch-off 浅灰轨道）。 */
.switch-cell { display: flex; align-items: center; }
.bool-switch {
  --sw-w: 44px; --sw-h: 24px; --sw-knob: 20px; --sw-inset: 2px;
  position: relative; flex: none;
  width: var(--sw-w); height: var(--sw-h);
  padding: 0; border: 1px solid var(--border); border-radius: 999px;
  background: var(--switch-off); cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}
.bool-switch__knob {
  position: absolute; top: 50%; left: var(--sw-inset);
  width: var(--sw-knob); height: var(--sw-knob);
  transform: translateY(-50%);
  border-radius: 50%; background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .28);
  transition: left .15s ease;
}
.bool-switch--on { background: var(--primary); border-color: var(--primary); }
.bool-switch--on:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
/* 100% = 按钮内边距盒宽（不含 1px 边框）→ 与关闭态左右内缩对称 */
.bool-switch--on .bool-switch__knob { left: calc(100% - var(--sw-knob) - var(--sw-inset)); }
.bool-switch:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus-ring); }
/* 终端行分两列（§8-K8）：.term-field = 吃掉行内余下宽度的终端下拉（min-width:0 让它能让位）。
   取证 .temp/ql-admin-probe/ql-t8-measure.html（无头 Chromium，2026-10-15，520px 弹窗）：
   终端下拉 452.7px → 356.7px（仍 ≥300），最长标签 Command Prompt (cmd) 不截断，
   「管理员」标签 36px / 开关格 44px 都不被挤窄 —— 不需要 style.css:316 .dropdown--stretch 那条
   width:auto：flex-basis:auto 虽然取到 style.css:311 的 width:100% 作基准，但收缩只分摊给能收缩的项，
   开关格与标签的自动最小尺寸（min-content 44px / nowrap 36px）把它们钉住，全部收缩由下拉吸收
   （复刻对照：加 width:auto 与不加，实测数字一字不差）。 */
.row-cell .term-field { flex: 1 1 auto; min-width: 0; }
/* 「管理员」标签不参与收缩（3 个字必须整行显示）。exe 态那一行的同名标签是网格项，
   flex 属性对网格项无效 → 同一类名在两态共用不产生副作用（white-space:nowrap 与 .flag-label 一致）。 */
.admin-label { flex: none; white-space: nowrap; }
</style>
