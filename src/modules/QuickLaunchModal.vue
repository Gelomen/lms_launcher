<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { library, config } from '@fortawesome/fontawesome-svg-core';
import { faXmark, faTerminal, faPlus, faMinus } from '@fortawesome/free-solid-svg-icons';
import { faFloppyDisk, faFolderOpen, faTrashCan, faFileCode } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { invoke, errMsg } from '../ipc';
import { t } from '../i18n';
// truncate：删除确认对话框里的启动项名按视觉宽度截断（truncDeleteName），与 TemplateModal.vue:9-10 同一口径
import { truncateByWidth, visualWidth } from '../util/truncate';
import Dropdown from '../components/Dropdown.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
// 类型只有一份真源（主进程的配置层 / 探测层）；import type 在构建期被擦除，不引入运行时依赖
// ——与 QuickLaunch.vue:11-12 同一先例。
import type { QuickLaunchEntry, QuickLaunchKind, TerminalId } from '../src-main/quick-launch-config';
import type { TerminalInfo } from '../src-main/quick-launch-terminals';
// 票 #15（spec #12 / ADR 0001）：[配色] 那一行的取色来源两份各有真源——
//   id 与缺省 = src-main/term-palettes.ts（TERM_PALETTE_IDS 行序 / TERM_PALETTE_DEFAULT / TermPaletteId），
//   颜色 = src/modules/term-palettes.ts 的 TERM_PALETTES[id]（底色 + 四格 ANSI 微条都从这一行取）。
// 运行时引主进程那份的先例是 TerminalTabView.vue:14-15（票 #14）；组件源码里不得出现任何 hex，
// 这条由 QuickLaunchModal.test.ts 的源码扫描门钉（与 TerminalTabView.test.ts:266-268 同一口径，不开特例）。
import { TERM_PALETTES, termPaletteOf } from './term-palettes';
import { TERM_PALETTE_DEFAULT, TERM_PALETTE_IDS, type TermPaletteId } from '../../src-main/term-palettes';

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
library.add(faFloppyDisk, faTrashCan, faXmark, faFolderOpen, faTerminal, faFileCode, faPlus, faMinus);
const byPrefixAndName = {
  fat: { 'floppy-disk': faFloppyDisk, 'trash-can': faTrashCan, 'folder-open': faFolderOpen, 'file-code': faFileCode },
  fas: { xmark: faXmark, terminal: faTerminal, plus: faPlus, minus: faMinus },
};

// 接口（check C1 / 索引 K31(1)）：id = null → 新建，新 id 由主进程生成（规格 §5.4）；
// entry = null → 空表单。emits（C2）：saved / deleted(id) / close —— 关窗与刷新列表归持有者。
// running（修复轮 B · I-1）：本条目此刻是否处于运行 / 停止中。来源链 = 主进程 ql_states →
// App.vue 的只读镜像 qlStates（:339）→ App.vue:567 以 :states 下发卡片（QuickLaunch.vue:27 接住）→
// 卡片按 editingId 取一项传进来（QuickLaunch.vue 的 editingRunning）。弹窗只读、不写。
// 用途只有一个：运行中的条目禁用 [删除]——删掉后卡片行消失，行上的 [停止] 随之没了，页签 [x] 又因
// closeDisabled 在运行中禁用，剩下的唯一出路是在页签工具条点那颗 [停止]（2026-10-20 由 [x] 改来）。
// tooltip 用**已存在**的键 ql.err.running（src-main/i18n/dict.ts:184 zh / :526 en），不新建键。
const props = withDefaults(defineProps<{
  open: boolean;
  id: string | null;
  entry: QuickLaunchEntry | null;
  running?: boolean;
}>(), { running: false });
// paletteHover(configId, 档 | null)（票 #15）：hover 色块时的预览意图，原样冒给卡片再冒到 App
// （QuickLaunch.vue → App.onQlPaletteHover）。**只有 configId 有对应终端页签时 App 才换 theme**，
// 换法是 TerminalTabView 里「整对象换 theme、不改 prop、不落盘」那一套（票 #14 定下的口径）。
// 本弹窗自己不落盘也不改 formPalette：null = 移开、请上层还原。
const emit = defineEmits<{
  (e: 'saved'): void;
  (e: 'deleted', id: string): void;
  (e: 'close'): void;
  (e: 'paletteHover', configId: string, palette: TermPaletteId | null): void;
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
// 多行命令（2026-10-17 用户改口径，原话：「更改策略, 默认依然是现状的输入框, 不改变输入框高度, 也不需要自动换行,
// 然后在这个输入框的右侧, 添加 [+] 按钮, 点击会自动在当前输入框下方创建新的输入框, 只有默认的输入框有 [+] 按钮,
// 下方被手动创建的输入框右侧只有 [-] 按钮, 点击删除该输入框」）：
// 默认行 = 今天这个输入框，一字不改（32px 高、不换行）；[+] 只加行、[-] 只删自己那一行。
// 落盘口径不变：cmd 仍是一条字符串（配置 schema 与主进程校验一字不改），行间以 \n 连接、空行丢弃。
// 选 \n 的取证：yaml 包实测 round-trip 逐字一致（落盘写成 block scalar cmd: |-），见 .temp/ql-cmd-rows-newline/probe.md。
// 行对象带稳定 id：v-for 的 :key 用它 —— 删中间一行时不会把后面几行的值串位（按 index 做 key 会）。
interface CmdRow { id: number; text: string }
let cmdRowSeq = 0;
const newCmdRow = (text = ''): CmdRow => ({ id: cmdRowSeq++, text });
// 回读：按 \r\n | \r | \n 拆行（与主进程写入端 toPtyInput 认的三种行分隔同一口径）；空 / 缺 → 一行空输入框。
function splitCmdRows(cmd: string | undefined): CmdRow[] {
  const rows = (typeof cmd === 'string' ? cmd.split(/\r\n|\r|\n/) : []).map((line) => newCmdRow(line));
  return rows.length > 0 ? rows : [newCmdRow()];
}
const formCmdRows = ref<CmdRow[]>([newCmdRow()]);
// 命令那一格的容器：[+] 追加行之后把焦点交给最后一个输入框（用户点 [+] 就是准备接着打字）
const cmdCell = ref<HTMLElement | null>(null);
// 多行程序路径（票 #3 / spec #1「弹窗」段）：行模型照抄上面的 CmdRow——{ id, text } + 模块内自增序号，
// v-for 的 :key 用 id 而非 index（删中间一行不把后面几行的值串位）。与 cmd 的两处差别（不是随意分叉）：
//   a) 每一行右侧保留自己的 [选择文件]，且它只填自己那一行（票 #3 AC-4）；
//   b) 落盘形状不同：exe 是**有序数组**（exeLines → 配置层 exe: string[]，见 quick-launch-config.ts:14），
//      cmd 是一条以 \n 连接的字符串——那是各自的既有契约，本票只是把编辑面搬到逐行。
interface ExeRow { id: number; text: string }
let exeRowSeq = 0;
const newExeRow = (text = ''): ExeRow => ({ id: exeRowSeq++, text });
// 回读：按 entry.exe 数组逐条映射；缺字段 / 空数组 → 一行空输入框。
// 非数组按「没有」处理——与主进程 normalizeExeList 同一判据（quick-launch-config.ts:60-72：
// 「**只有数组**才继续」在那段的 :60，函数签名在 :63），
// 不做标量旧写法的兼容（spec #1 Out of Scope 4）。
function splitExeRows(exe: string[] | undefined): ExeRow[] {
  const rows = (Array.isArray(exe) ? exe : []).map((p) => newExeRow(p));
  return rows.length > 0 ? rows : [newExeRow()];
}
const formExeRows = ref<ExeRow[]>([newExeRow()]);
// 路径那一格的容器：[+] 追加行之后把焦点交给最后一个输入框（用户点 [+] 就是准备接着打字）
const exeCell = ref<HTMLElement | null>(null);
// 任务 8（规格 §6.2 / §4-1）：「管理员」= 条目上的 admin 字段（§6.1，可选布尔）。
// 只有字面量 true 算真（与主进程 normalizeEntry 同一口径），所以回填写 === true 而不是 ?? false。
const formAdmin = ref(false);
// 票 #15：条目上的 terminal_palette（**只有 shell 条目有**：exe 没有终端，因而没有配色 —— GLOSSARY / ADR 0001）。
// formPalette 存的永远是**已定的那一档**（真 id，不是 undefined）：fill() 用 termPaletteOf 回落，
// 缺字段 = 表里的默认档（与主进程 termPaletteOr / quick-launch-config.ts:95 的归一同一张嘴）；
// 保存时 shell 分支总是显式带上这一键（与 admin 的「落盘总是显式写」同一口径，见 quick-launch-config.ts:118）。
// 落盘走 ql_save 整条，**不走** ql_set_palette 窄通道——窄通道是页签工具条那颗的通道（票 #14），
// 它会把弹窗里尚未保存的其它表单值一并跳过、只改一键，与「随表单一起保存」的口径相反。
const formPalette = ref<TermPaletteId>(TERM_PALETTE_DEFAULT);
// hover 预览态 = 「正在看哪一档」，不是选中态：只换说明文案 + 冒给上层，不改 formPalette、不落盘。
const hoverPalette = ref<TermPaletteId | null>(null);
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
// 多行 → 逐行 trim、丢掉空行（空行送进终端就是一条空命令，没有意义）。
// 「命令不能为空」的判据 = 一行有效内容都没有 —— 与单行时 trim().length === 0 完全等价，
// 所以 2026-10-13 那条「报错在命令输入框下方」的用例一字不改照样成立。
const cmdLines = computed((): string[] =>
  formCmdRows.value.map((row) => row.text.trim()).filter((s) => s.length > 0));
const cmdError = computed((): string | null =>
  formType.value === 'shell' && cmdLines.value.length === 0 ? t('err.ql.cmdRequired') : null);
// 多行路径（票 #3）：逐行 trim、丢掉空行 —— 与主进程 normalizeExeList 的归一口径逐字一致
// （那里也是「逐元素 trim + 丢空串 + 归一后为空即非法」），所以「保存时丢掉空行」与「报错判据」不会漂移。
// 「路径不能为空」的判据 = 一行有效路径都没有 —— 与单行时 trim().length === 0 完全等价，
// 因此 2026-10-13 那条「报错在路径输入框下方」的用例一字不改照样成立。
const exeLines = computed((): string[] =>
  formExeRows.value.map((row) => row.text.trim()).filter((s) => s.length > 0));
const exeError = computed((): string | null =>
  formType.value === 'exe' && exeLines.value.length === 0 ? t('err.ql.exeRequired') : null);

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
  // 真实图标（2026-10-16-quick-launch-terminal-icons 规格 §6.4 / §8-Q5）：主进程不带 icon 的项 = undefined
  // → Vue 不写 src、不渲染 img，那一项退回纯文字。
  imageUrl: info.icon,
})));

// ---------- 票 #15：[配色] 一行 ----------
// 六档名与一句话说明：六个 key 各写一次字面量 t()（key-coverage.test.ts:39-41 只认字面量调用点，
// 拼接式取键进不了那道门）——与上面 TERM_LABEL 六个键、TerminalTabView.vue:98-105 的 paletteLabels 同一手法。
// 档名复用票 #14 那六条 ql.palette.<id>，这里只新增说明那六条 ql.palette.<id>.hint（词典两侧齐全）。
const paletteLabels: Record<TermPaletteId, () => string> = {
  paper: () => t('ql.palette.paper'),
  console: () => t('ql.palette.console'),
  'warm-paper': () => t('ql.palette.warm-paper'),
  charcoal: () => t('ql.palette.charcoal'),
  campbell: () => t('ql.palette.campbell'),
  'warm-night': () => t('ql.palette.warm-night'),
};
const paletteHints: Record<TermPaletteId, () => string> = {
  paper: () => t('ql.palette.paper.hint'),
  console: () => t('ql.palette.console.hint'),
  'warm-paper': () => t('ql.palette.warm-paper.hint'),
  charcoal: () => t('ql.palette.charcoal.hint'),
  campbell: () => t('ql.palette.campbell.hint'),
  'warm-night': () => t('ql.palette.warm-night.hint'),
};
// 说明这一行显示的那一档：hover 时是被 hover 的档，其余时候是已选的那一档。
// 「无对应终端页签则只显说明」（AC 逐字）在弹窗这一侧就是这一条：说明永远在换，画布换不换归 App 判。
const shownPalette = computed<TermPaletteId>(() => hoverPalette.value ?? formPalette.value);

// 点击 = 选中（改表单），落盘等到保存那一刻随整条 entry 走（ql_save）。
function onPalettePick(id: TermPaletteId): void { formPalette.value = id; }
// hover / 键盘 focus 共用一对处理器（与票 #14 的浮层同一口径：预览不是选中，移开就还原）。
// 新建态（props.id = null）没有 configId，也就没有可能存在的页签 → 不冒预览，只换说明文案。
function onPaletteHover(id: TermPaletteId): void {
  hoverPalette.value = id;
  if (props.id !== null) emit('paletteHover', props.id, id);
}
function onPaletteLeave(): void {
  if (hoverPalette.value === null) return;
  hoverPalette.value = null;
  if (props.id !== null) emit('paletteHover', props.id, null);
}

function fill(): void {
  attemptedSave.value = false;
  saveError.value = null;
  confirmDeleteOpen.value = false;
  const e = props.entry;
  formName.value = e?.name ?? '';
  formType.value = e?.type === 'exe' ? 'exe' : 'shell';
  formShell.value = e?.shell ?? '';
  formCmdRows.value = splitCmdRows(e?.cmd);
  formExeRows.value = splitExeRows(e?.exe);
  formAdmin.value = e?.admin === true;
  // 票 #15：配色回填走 termPaletteOf（缺字段 / 表外值都回落默认档，与主进程同一判据），
  // 所以这一行永远有一档是「当前」，不会出现空选中态。hover 预览不跨弹窗留残留。
  formPalette.value = termPaletteOf(e?.terminal_palette).id;
  hoverPalette.value = null;
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
// 关窗时顺手清掉 hover 预览（不清的话：鼠标停在某个色块上按 ESC / 点保存关掉弹窗，
// 身后那块画布会一直停在预览档，等不到 mouseleave）。fill() 里也清一次，两处都是同一口径。
watch(() => props.open, (open) => {
  if (open) { fill(); void loadTerminals(); }
  else onPaletteLeave();
}, { immediate: true });

function onTypeChange(v: string): void { formType.value = v === 'exe' ? 'exe' : 'shell'; }
function onShellChange(v: string): void { formShell.value = v; }

// [+]：在当前所有行的**末尾**追加一行空输入框，并把焦点交给它。只有默认行渲染这个按钮（用户口径）。
async function addCmdRow(): Promise<void> {
  formCmdRows.value.push(newCmdRow());
  await nextTick();
  const inputs = cmdCell.value ? [...cmdCell.value.querySelectorAll('input')] : [];
  (inputs[inputs.length - 1] as HTMLInputElement | undefined)?.focus();
}
// [-]：删掉自己那一行。按 id 找而不是按 index —— 删的是被点的那一行，且默认行永远删不掉
// （默认行没有 [-] 按钮，这里再守一道，键盘 Enter / 程序化点击都挡得住）。
function removeCmdRow(id: number): void {
  const i = formCmdRows.value.findIndex((row) => row.id === id);
  if (i > 0) formCmdRows.value.splice(i, 1);
}

// [+]（exe 行）：在末尾追加一行空路径并把焦点交给它；只有默认行渲染这个按钮（与 cmd 同一口径）。
async function addExeRow(): Promise<void> {
  formExeRows.value.push(newExeRow());
  await nextTick();
  const inputs = exeCell.value ? [...exeCell.value.querySelectorAll('input')] : [];
  (inputs[inputs.length - 1] as HTMLInputElement | undefined)?.focus();
}
// [-]（exe 行）：按 id 删自己那一行；默认行永远删不掉（它没有 [-]，这里再守一道）。
function removeExeRow(id: number): void {
  const i = formExeRows.value.findIndex((row) => row.id === id);
  if (i > 0) formExeRows.value.splice(i, 1);
}

// 选择 .exe（check C3）：主进程对话框取消 = null → 不改表单。
// 票 #3 AC-4：每一行的 [选择文件] 只写它自己那一行——按行的 id 找，不按 index（点过 [-] 之后 index 会变）。
async function pickExe(rowId: number): Promise<void> {
  const picked = await invoke<string | null>('ql_pick_exe');
  if (picked === null) return;
  const row = formExeRows.value.find((r) => r.id === rowId);
  if (row) row.text = picked;
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
  // 票 #15：terminal_palette 只在 shell 分支带（§5.3-6「只发该类型的字段」的另一半：exe 不带配色，
  // 主进程 validateEntry 的 exe 分支也不会留这一键）。值永远是真 id（formPalette 回落过），
  // 所以不需要条件 spread，也不会把 undefined 送进 IPC。
  const entry: QuickLaunchEntry = formType.value === 'exe'
    ? { name, type: 'exe', exe: exeLines.value, admin: formAdmin.value }
    : { name, type: 'shell', shell: formShell.value as TerminalId, cmd: cmdLines.value.join('\n'), admin: formAdmin.value,
        terminal_palette: formPalette.value };
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

// Minor 9：确认文案用 trim 后的名字，与 save() 里的 formName.value.trim() 同一处理。
// 2026-10-19（用户报告：长名没按模板卡删除确认处理）：名字段与 TemplateModal.vue:231-243 同一口径——
// NAME_BUDGET = 16（视觉宽，CJK=2/拉丁=1）+ grace=2：中文 ≤8 字 / 英文 ≤16 字符原样，超出才手动截到
// 预算内 + …(U+2026)。手动截断时把「截断片段 + 完整名字」交给 ConfirmDialog 的 tipName/tipFull，
// hover 片段弹自绘 .tpl-tip 显示完整名字；未截断（短名）不传 → 片段与 tooltip 都不出现。
const NAME_BUDGET = 16; // 与 TemplateModal 的删除确认 / options 行同一预算
const deleteFullName = computed(() => formName.value.trim());
function truncDeleteName(n: string): string {
  const full = n ?? '';
  if (visualWidth(full) <= NAME_BUDGET + 2) return full; // grace：只超 1~2 不手动 +…（交 CSS ellipsis）
  return truncateByWidth(full, NAME_BUDGET);
}
const deleteMsgName = computed(() => truncDeleteName(deleteFullName.value));
const deleteTruncated = computed(() => visualWidth(deleteFullName.value) > NAME_BUDGET + 2);
const deleteMessage = computed(() => t('ql.modal.delete.message', { name: deleteMsgName.value }));
// 预览只在指针压在色块上那几秒存在（票 #15）。关窗走 [x] / 背板时指针可能还压在色块上、mouseleave 发不到，
// 所以 close() 里把这一条的预览一并撤掉：App.onQlPaletteHover 那条「本来就没有预览要撤」的 return 会吸收多余的一次 null，无副作用。
function close(): void {
  if (props.id !== null) emit('paletteHover', props.id, null);
  emit('close');
}
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
                   当时两态因此都是 3 行控件、218px 的定高推导不变。票 #15 之后命令行态多出行[配色] = 4 格
                   （可执行程序态仍 3 格），定高随命令行态实测重推为 261px —— 见下方 .palette-cell 与定高注释。 -->
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
              <!-- 票 #15（spec #12 / issue #15）：[配色] 一行，位置 = [终端]+[管理员] 那一行之后、「命令」之前。
                   行序 = TERM_PALETTE_IDS（弹窗这一行不做明底/暗底分组：一行装得下六块，页签那颗的浮层才需要两组）。
                   色块盒子复用票 #14 的 .term-palette-swatch / .term-palette-cell（style.css:290-291 = 尺寸的一份真源），
                   颜色全部内联自 TERM_PALETTES[id] 那一行：底色 = theme.background，四格 ANSI 微条 = foreground / red / green / magenta。
                   选中态 = .is-current + aria-current="true"（与浮层那六行同一口径）；点击只改表单，落盘等保存那次随整条 entry 走 ql_save。
                   hover / 键盘 focus 只把预览冒给上层（App 判有没有对应终端页签，有就整对象换 theme）+ 换这一行的说明文案，本弹窗不落盘。
                   说明文案走**第二行**而不是与色块挤在同一行（不是审美，是溢出）：六块色块实测占 6×34.3 + 5×6 = 235.8，
                   控制列实测 452.7（zh）/ 421.6（en，标签列随 'Program path' 变宽），剩下的 216.9 / 185.8 装不下
                   「档名 + 说明」这一对（当时 zh 最长 264.0、en 最长 360.0；票 #12 把档名「浅灰画布」改成「浅灰」之后
                   最长那对的身份变成由说明文案主导，但说明文案没缩短 → 这一对更短、结论「一行装不下」不变）。
                   硬排一行实测
                   .flag-grid 的 scrollWidth 探出 clientWidth：zh +28.0、en 最多 +124.0（同一探针的 pairs.json）
                   → 就是 2026-10-17 登记过的坑（东西探出网格 → .modal-body 顶出横向滚动条 → 定高门与两态同高全被带歪）。 -->
              <label class="label flag-label palette-label">{{ t('ql.modal.palette') }}</label>
              <div class="field-cell palette-cell">
                <div class="row-cell">
                  <button v-for="id in TERM_PALETTE_IDS" :key="id" type="button" class="palette-swatch"
                    :class="{ 'is-current': id === formPalette }" :data-palette="id"
                    :aria-label="paletteLabels[id]()" :aria-current="id === formPalette ? 'true' : undefined"
                    @mouseenter="onPaletteHover(id)" @mouseleave="onPaletteLeave()"
                    @focus="onPaletteHover(id)" @blur="onPaletteLeave()"
                    @click="onPalettePick(id)">
                    <span class="term-palette-swatch" :style="{ background: TERM_PALETTES[id].theme.background }">
                      <span class="term-palette-cell" :style="{ background: TERM_PALETTES[id].theme.foreground }"></span>
                      <span class="term-palette-cell" :style="{ background: TERM_PALETTES[id].theme.red }"></span>
                      <span class="term-palette-cell" :style="{ background: TERM_PALETTES[id].theme.green }"></span>
                      <span class="term-palette-cell" :style="{ background: TERM_PALETTES[id].theme.magenta }"></span>
                    </span>
                  </button>
                </div>
                <!-- 两个 span 之间不留空白：换行会变成 textContent 里的空白，用例钉的是「档名紧跟说明」 -->
                <span class="label palette-hint"><span class="palette-hint__name">{{ paletteLabels[shownPalette]() }}</span><span class="palette-hint__text">{{ paletteHints[shownPalette]() }}</span></span>
              </div>
              <label class="label flag-label cmd-label">{{ t('ql.modal.cmd') }}</label>
              <!-- 命令为空的报错在命令那一格内（.field-cell，与 .name-cell 同一手法），不进弹窗顶部错误区。
                   多行命令（2026-10-17 用户改口径）：所有行都在**同一个 .field-cell** 里纵向排布，
                   不新增 .flag-grid 的网格行 —— 当时测试的 controlCells 计数器数到 3、定高 218px 一字不改
                   （见下方 .cmd-cell 注释与 .temp/ql-cmd-rows-newline/）。本行今天仍是**一个** .field-cell：
                   票 #15 加的配色行是**另一对**网格行，与多行命令无关（两态格数由此变成 4 / 3，见 .palette-cell）。 -->
              <div ref="cmdCell" class="field-cell cmd-cell">
                <div v-for="(row, i) in formCmdRows" :key="row.id" class="row-cell">
                  <input class="input" :class="{ error: attemptedSave && cmdError !== null }" v-model="row.text" />
                  <!-- [+] 只在默认行（第一行）；手动追加的行只有 [-]，删的就是它自己那一行（用户口径逐字） -->
                  <!-- 这两个按钮**不带** .tip-up 气泡（试过，带不起）：气泡居中挂在 36px 按钮上，向右探出 .flag-grid 边界
                       20px（实测 grid clientWidth 487 / scrollWidth 507），把 .modal-body 顶出 10px 的横向滚动条，
                       弹窗就从 218 变 227.3 —— 定高门与「两态同高」全被带歪。aria-label 留着，可访问性与测试都不受影响。 -->
                  <button v-if="i === 0" type="button" class="btn btn-secondary row-btn"
                    :aria-label="t('ql.modal.btn.addCmd')" @click="addCmdRow">
                    <FontAwesomeIcon :icon="byPrefixAndName.fas['plus']" style="font-size: 14px;" />
                  </button>
                  <button v-else type="button" class="btn btn-secondary row-btn"
                    :aria-label="t('ql.modal.btn.removeCmd')" @click="removeCmdRow(row.id)">
                    <FontAwesomeIcon :icon="byPrefixAndName.fas['minus']" style="font-size: 14px;" />
                  </button>
                </div>
                <p v-if="attemptedSave && cmdError" class="error-text">{{ cmdError }}</p>
              </div>
            </template>

            <!-- 可执行程序：路径 + 选择按钮（规格 §2 非目标：不加启动参数 / 工作目录） -->
            <template v-else>
              <!-- 任务 8（规格 §6.2；用户原话「[程序路径] 上方添加 [管理员权限] checkbox」）：
                   新增一行「管理员」，位置在「程序路径」那一行**之前**。当时行数 2 → 3 = 与命令行态同一个行数，
                   218px 的定高在两态同时成立（可执行程序态原本 38px 的留白被这一行填掉）。
                   票 #15 之后命令行态多一行配色 = 4 行，本态仍 3 行，两态同一个定高 261（见 <style> 里的定高注释）。 -->
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
              <!-- 路径为空的报错在路径那一格内（同上），选择按钮仍在输入行右侧。
                   多行程序路径（票 #3 / spec #1「弹窗」段）：行模型与上面的命令行多行同构——
                   所有行都在**同一个 .field-cell**（.exe-cell）里纵向排布，不新增 .flag-grid 的网格行，
                   因此可执行程序态的「3 个控件格」计数门不因多行而变（票 #15 之后命令行态 4 格、定高 261，见 .exe-cell 注释）。
                   差别两处（与 script 里 ExeRow 的注释同一份）：每行保留自己的 [选择文件]（AC-4）、落盘是有序数组。
                   行内顺序仍是输入框 → [选择文件] → [+]（默认行）/ [-]（追加行）：
                   默认行**作为输入格**一字未改（同样的高度、单行不换行、[选择文件] 在输入框右侧），
                   只是它的 [选择文件] 右边多了一个 36px 的 [+] —— 这正是 AC-1 的口径，不是「整格不变」。
                   [+] / [-] 同样**不带**悬浮气泡（上一轮实测：气泡把弹窗体顶出 10px 横向滚动条 → 定高门被带歪），
                   只带 aria-label。 -->
              <div ref="exeCell" class="field-cell exe-cell">
                <div v-for="(row, i) in formExeRows" :key="row.id" class="row-cell">
                  <input class="input" :class="{ error: attemptedSave && exeError !== null }" v-model="row.text" />
                  <button class="btn btn-secondary file-btn tip-up" :data-tooltip="t('ql.modal.btn.pick')"
                    :aria-label="t('ql.modal.btn.pick')" @click="pickExe(row.id)">
                    <FontAwesomeIcon :icon="byPrefixAndName.fat['folder-open']" style="font-size: 14px;" />
                  </button>
                  <!-- [+] 只在默认行（第一行）；手动追加的行只有 [-]，删的就是它自己那一行 -->
                  <button v-if="i === 0" type="button" class="btn btn-secondary row-btn"
                    :aria-label="t('ql.modal.btn.addExe')" @click="addExeRow">
                    <FontAwesomeIcon :icon="byPrefixAndName.fas['plus']" style="font-size: 14px;" />
                  </button>
                  <button v-else type="button" class="btn btn-secondary row-btn"
                    :aria-label="t('ql.modal.btn.removeExe')" @click="removeExeRow(row.id)">
                    <FontAwesomeIcon :icon="byPrefixAndName.fas['minus']" style="font-size: 14px;" />
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
               修复轮 B1：tooltip 的渲染条件是**类选择器**（style.css「.tip-* tooltip」段 `.tip-*::after { content: attr(data-tooltip) }`），
               本组件的 .btn-delete 自身没有 ::after 规则 → 光有 data-tooltip 属性真机上什么都不显示。
               故类与属性**同条件**（running）成对挂载，与 App.vue:565（tip-down + :data-tooltip）同一用法。
               不能无条件挂 .tip-right：attr() 在属性缺失时求值为空串，仍会渲染一个带 padding 的空白气泡。
               2026-10-19（用户报告 + 截图）：本按钮贴弹窗左下角，.tip-up 的气泡向上/左探出被窗口裁掉
               → 改用同段的 .tip-right，气泡挂按钮右侧、垂直居中（弹窗内部空间足够，不再被裁）。 -->
          <button v-if="isEdit" class="btn-delete" :class="{ 'tip-right': running }" :aria-label="t('ql.modal.btn.delete')"
            :disabled="running" :data-tooltip="running ? t('ql.err.running') : undefined" @click="onDelete">
            <FontAwesomeIcon :icon="byPrefixAndName.fat['trash-can']" />
          </button>
          <button class="modal-save" :disabled="saving" :aria-label="t('ql.modal.btn.save')" @click="save">
            <FontAwesomeIcon :icon="byPrefixAndName.fat['floppy-disk']" style="font-size: 18px;" />
          </button>
        </footer>
      </div>
    </div>
    <!-- 删除二次确认（E6）：tone=danger；[确认] 才 invoke('ql_delete')，[取消] / 遮罩只关窗。
         长名（2026-10-19 用户报告）：截断片段走 tip-name / 完整名走 tip-full → ConfirmDialog 把该片段渲染成
         可 hover 的 .confirm-msg__name，hover 弹自绘 .tpl-tip 显示完整名字（与 TemplateModal.vue:469-473 逐字同构）；
         未截断时两个属性都是 undefined → 无片段、无 tooltip。 -->
    <ConfirmDialog :open="confirmDeleteOpen" :title="t('ql.modal.delete.title')" :message="deleteMessage"
      :tip-name="deleteTruncated ? deleteMsgName : undefined" :tip-full="deleteTruncated ? deleteFullName : undefined"
      tone="danger" @confirm="doDelete" @close="() => (confirmDeleteOpen = false)" />
  </Teleport>
</template>

<style scoped>
/* 外壳样式照抄 TemplateModal.vue:477-643 的本弹窗所需子集（.modal-overlay 是全局样式，style.css:47，不改它）。
   本弹窗没有 VRAM 指示 / flag tooltip，故不带那几段；「开关行」是 2026-10-15 任务 8 才加的
   （.bool-switch 三段从 TemplateModal.vue:567-588 逐字复制，见本文件末尾，§8-K15）。 */
/* 弹窗高度固定（2026-10-13 用户反馈 + 截图：[类型] 切到「可执行程序」时弹窗变窄）：
   定高以「命令行」态为准 = **261px**（票 #15 加了 [配色] 一行之前是 218px）。取值来自无头 Chromium 实测——
   探针 .temp/ql-modal-palette-row/（量法照抄 .temp/ql-exe-rows-probe/：真组件挂载导出四态 .modal-box 的
   outerHTML → 真 src/style.css + 本文件 scoped 样式块原文 + FA 自生成 CSS + 真 Chromium 1400×900）：
   ⚠ 审查轮（票 #12）登记：那个探针目录在本机已被清掉——.temp 是 gitignore 的本地取证区、不进仓，
   所以这组数**当下不可复核**（同目录的 ql-exe-rows-probe 等旧探针还在，是留档习惯的旁证）。
   重测口径就是上面那句（四态 markup + 同一份样式 + 1400×900），下次真机门顺手补回；
   预期结论不变：[配色] 这一格的高由「色块行 + 行距 + 说明行」决定，与档名长短无关，
   而票 #12 那次把档名「浅灰画布」改成「浅灰」只动宽度不动行高 → 37.3 / 260.7 不受影响。
     命令行态 .modal-box = 520 × 260.7（zh / en 四现场同高）
     可执行程序态        = 520 × 218.0（自然内容高 209.3，被地板盖住）
   命令行态的构成：
     .card 上下边框 2
   + .modal-head 32
   + .modal-body：padding 16×2 + .flag-grid margin-top 12 + 4 行控件（32 + 32 + **37.3** + 32）+ 3 行距 × 6 = 151.3
   + .modal-actions 32
   = 261.3 → 实测 260.7（差的 0.6px 是网格行高的亚像素，与当年「3 行 = 217.3 → 定高 218」同一口径，取整数向上）
   其中新那一格实测 37.3 = 色块行 15.3 + .palette-cell 的行距 4 + 说明行 18（见下方 .palette-cell 注释）。
   2026-10-15 任务 8 之后两态一度都是 3 行控件；票 #15 之后**两态格数不再相同**：
   命令行 4 格（名字 / 终端+管理员 / 配色 / 命令）、可执行程序 3 格（名字 / 管理员 / 程序路径）。
   定高仍是**同一个值**——地板在可执行程序态那边显形，这正是「切类型不跳尺寸」这条门的原意。
   用 min-height 而不是 height（用户 2026-10-13 决定）：保存失败的主进程文案 / 名字·命令·路径「不能为空」
   的字段级提示出现时，弹窗自然长高（实测报错态 236px，正文区 bodyScroll == bodyClient = 不出滚动条、
   内容不被裁），不把命令输入框顶掉。
   行数变了这个数就要重算——QuickLaunchModal.test.ts 的 modal_height_is_fixed_to_the_shell_form_height_in_both_types
   钉着「命令行 4 格 / 可执行程序 3 格」（两态各数一遍 controlCells）与「两态同一个定高值 = 命令行态实测」。 */
.modal-box {
  width: 90%;
  max-width: 520px;
  min-height: 261px;            /* = 命令行态实测高度（260.7 → 取整向上）；构成见上方推导（探针未留档，重测口径在那段里） */
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
   两态下它都是表单最后一格，所以不影响定高推导（报错出现时按 min-height 自然长高；数值 218 → 261 随票 #15 重推）。 */
.field-cell { min-width: 0; }
/* 多行命令（2026-10-17 用户改口径）：全部命令行在同一个 .field-cell 内纵向排布，不新增 .flag-grid 的网格行
   → controlCells 计数器不因多行而 +1（票 #15 之后命令行态数到 4 / 可执行程序态 3；min-height 是地板不是天花板）。
   实测（.temp/ql-cmd-rows-probe/：真组件导出的 markup + 真 style.css + 真 Chromium 量取）：
     1 行 = 218.0（min-height 地板，与改动前逐像素一致，body 无滚动条）
     3 行 = 293.3（每加一行 = 32 控件 + 6 行距 = 38，与 .flag-grid 的 gap 同口径；0.7px 是网格行高的亚像素，
                    1 行态的内容高本来就是 217.3，被 218 的地板盖住了）
   默认行那个输入框的高度与「不换行」一字未改 —— 用户口径逐字：「不改变输入框高度, 也不需要自动换行」。 */
/* 多行程序路径（票 #3 落地，票 #4 实测）：与 .cmd-cell 共用这一条规则、同一个 6px 间距口径（= .flag-grid 的 gap），
   所有行在同一个 .field-cell 内纵向排布 → 控件格计数门不因多行而变，定高是同一套算术（每行 +32 +6 = 38）。
   可执行程序态也真机量过了（票 #4 的 .temp/ql-exe-rows-probe/：同一套探针，把命令行态两态当对照组重跑，
   一字不差复现了上面「多行命令（2026-10-17 用户改口径）」那段注释里的 218.0 / 293.3 → 这组探针可信。
   （那段的数字属于命令行态；本态的 3 行数不同，原因见下面那条——别把两态的绝对值互相照搬。）
     1 行 = 218.0，且与票 #3 之前那一版组件逐像素对齐：盒子 218.0→218.0、路径格 428.7×32→428.7×32、
          [选择文件] 46.8×32 不变、网格 100→100；唯一变化就是 AC-1 那一个 36×32 的 [+]
          （输入框 373.8 → 329.8，窄的 44.0 = 36 定宽 + 8 的 .row-cell gap）
     3 行 = 285.3：路径格 32→108（3×32 + 2×6），行的 y 步距实测 38.0 —— 与命令行态同一个步距；
          body 519/519、grid 487/487 → 不出横向滚动条；scrollHeight == clientHeight → 也不出竖向滚动条（弹窗自己长高）
   3 行的绝对值两态不同（可执行程序 285.3 vs 命令行 293.3，差 8.0），这不是多行引入的，是两态之间既有的差别：
   「管理员」那一格在可执行程序态只放一个开关（实测 24），命令行态同一网格行还挂着终端下拉（实测 32）。
   1 行时这 8px 被 218 的地板盖住（自然内容高 209.3 / 217.3），越过地板才露出来。
   所以「每行 +38」两态通用，「3 行 = 293.3」那个绝对值只属于命令行态，别照搬。
   默认行的输入框与 [选择文件] 一字未改，只是那一行右边多出一个 36px 的 [+]（票 #3 AC-1）。 */
.cmd-cell, .exe-cell { display: flex; flex-direction: column; gap: 6px; }
/* 票 #15：[配色] 那一行。控件格纵向两行（六块色块 + 当前档说明），.flag-grid 的网格行仍是一对
   「标签 + 控件格」→ test.ts 的 controlCells 计数器按态数到 4（shell）/ 3（exe），定高随 shell 态实测重算。
   盒子尺寸复用 style.css 里 .term-palette-swatch / .term-palette-cell 那两条（四格 7×12 + 1px 间距 +
   1px 内衬 + 1px 描边），本段只管按钮壳与两行的排布，不复抄尺寸、更不带 hex。
   实测（原探针 .temp/ql-modal-palette-row/measure.json，本机已未留档，见上面定高注释那条登记）：
   色块 34.3 × 15.3、色块行 15.3、说明行 18 → 这一格 37.3；
   「配色」标签顶对齐之后标签中线 437.0 / 色块行中线 435.7（差 1.3px），所以这一条**不加** name/cmd/exe 那 8px。 */
.palette-cell { display: flex; flex-direction: column; gap: 4px; }
.palette-cell .row-cell { gap: 6px; }
.palette-swatch { flex: none; padding: 0; border: 0; background: transparent; cursor: pointer; border-radius: 4px; }
/* 选中态 = 一圈主色（与 .bool-switch--on / [保存] 同一主操作色语言）；aria-current 是可测的那一半 */
.palette-swatch.is-current { box-shadow: 0 0 0 2px var(--primary); }
.palette-swatch:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus-ring); }
.palette-hint { display: flex; gap: 6px; color: var(--muted); white-space: nowrap; }
.palette-hint__name { color: var(--text); font-weight: 600; }
/* [+] / [-] 的盒子：与 .file-btn 同一族（.btn 给边框 / 圆角 / --h-control 高），只是定宽成 36px 方块
   （36px = 本文件 .modal-close / .btn-delete 已经在用的点击区口径）。flex: none 让它不被输入框挤窄。 */
.row-cell .row-btn { flex: none; width: 36px; padding: 0; }
/* 名字标签对齐到输入行本身：.flag-grid 是 align-items:center，空名报错出现后 .name-cell 变高，
   默认居中会把标签压到「输入框 + 报错」两行的中间。改为顶对齐 + 8px 内边距
   = (32px 控件高 − 17px 行高) / 2，有无报错都对齐输入框的中线。
   命令 / 路径两格现在也会因报错变高，同一处理（.cmd-label / .exe-label）。 */
.flag-grid .name-label, .flag-grid .cmd-label, .flag-grid .exe-label { align-self: start; padding-top: 8px; }
/* [配色] 标签同样顶对齐，但**不加**那 8px：8px = (32 控件高 − 17 行高)/2 是给 32px 控件准备的，
   而色块行实测只有 15.3 高（四格 12 + 上下 1 内衬 + 上下 1 描边）→ 顶对齐就是中线对齐：
   实测标签 428.0→446.0（中线 437.0）、色块行 428.0→443.3（中线 435.7），差 1.3px（探针 measure.json）。 */
.flag-grid .palette-label { align-self: start; }
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
   tooltip 类 .tip-right 复用 style.css「.tip-* tooltip」段（2026-10-19 起从 .tip-up 换为 .tip-right，
   原因见底栏 [删除] 按钮处注释），本文件不复制、不再改 style.css。 */
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
