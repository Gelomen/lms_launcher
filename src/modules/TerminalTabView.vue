<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCircleDown, faCircleUp, faCircleXmark, faTrashCan } from '@fortawesome/free-regular-svg-icons';
import { faArrowRotateRight, faPalette, faStop } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import { invoke } from '../ipc';
import { t } from '../i18n';
import { TERM_PALETTES, termPaletteOf } from './term-palettes';
import { TERM_PALETTE_IDS, type TermPaletteId } from '../../src-main/term-palettes';

// 终端页签（规格 2026-10-10-quick-launch-card-design §9.3）：一个 xterm 实例 = 一个 PTY。
// 单向数据流：输出由上层按 tabId 派发进来（挂载时 register 交出的 sink），
// 输入与尺寸经 props 的回调出去（对应 §8 的 ql_write / ql_resize）；本组件不订阅任何事件。
// 外壳复用静态页签的尺寸链（style.css 的 .log-pane → .log-view，见 :262 那条高度链注释）。不自建尺寸类，根上只多挂一条
// 例外修饰类 .log-pane--term（2026-10-24 两轮：第一轮去掉 pane 的 8px 下内边距，第二轮让画布横向也出血到边框内缘、
// 下圆角改由画布自己画）——两条规则与逐段取证读数都在 style.css 里，本组件只负责挂类 + 挂那三样同源的着色。
library.add(faTrashCan, faCircleUp, faCircleDown, faCircleXmark, faStop, faArrowRotateRight, faPalette);

// props 以计划 §任务 9 为准（索引 K2 / 本任务 A4）：含 label/fullLabel，不含 configId。
// 2026-10-20 用户要求：工具条那颗（当时它在最右）由 [x]（关闭页签）换成 [停止]——它与页签条上的 [x] 重复，
// 而列表行的 [停止] 才是这里真正需要的动作（关页签前先停进程，两处 [x] 的 R3 守卫由此变得多余）。
// 于是 closable / closeDisabled 不再进本组件（关闭只归页签条那颗 [x]，所有权在 LogPanel），
// 改收 running / stopping：进程态的唯一来源仍是 App 的 qlStates（QuickLaunch 列表行同一份，C1 不变）。
// 同日第二轮用户要求：停完之后那颗不能是「禁用的停止」，要变成 [重新启动]（= 列表行那颗 [启动]），
// 于是这里再收 restartDisabled = 该条配置已从 ql_list 消失（App 的只读镜像 qlConfigs 查不到）：
// 没有配置就没有可启动的东西，点下去只会让主进程回一条失败，那颗按钮因此禁用。
const props = defineProps<{
  id: string;
  label: string;
  fullLabel: string;
  running: boolean;
  stopping: boolean;
  restartDisabled: boolean;
  // 终端配色（票 #13 / ADR 0001 + 0002）：建页签那一刻 App 从 ql_list 只读镜像取一次，此后由它在每次刷新
  // 镜像后对齐条目**落盘**的那一档（票 #18：弹窗 [保存] → 已开着的页签当场换档）；条目已从配置里消失时
  // 不再对齐 = 冻结在最后一档、不跳回默认档。缺省 = 表里的默认档（termPaletteOf 的回落）。
  // 换档一律由上层改这个 prop（票 #14 浮层 / 票 #15 色块走窄通道，或票 #18 的对齐），本组件不碰落盘。
  palette?: TermPaletteId;
  // 票 #15：弹窗 [配色] 一行 hover 上来的**临时预览**（一路从 App 的页签条目搬过来，LogPanel 只做搬运）。
  // 它不是快照的一部分：只在指针停在色块上那几秒存在，撤掉（undefined / null）就回到快照那一份。
  // 本组件对它只做一件事——把 theme（连同描边 / 查找高亮那三样同源的）换成那一档；不改 palette、不落盘、不重建终端。
  palettePreview?: TermPaletteId | null;
  register: (id: string, sink: (d: string) => void) => void;
  unregister: (id: string) => void;
  onInput: (id: string, data: string) => void;
  onResize: (id: string, cols: number, rows: number) => void;
}>();
// stop(id) / restart(id)：与 QuickLaunch 列表行的 [停止] / [启动] 一一对应，一路冒泡到
// App.doQlStop / doQlStart（invoke('ql_stop') / invoke('ql_start')）；
// 本组件不碰 IPC（进程所有权在 App，规格 §9.2），只报「这条页签要停 / 要重启」。
// palette(id, 档)（票 #13 留的接缝）：票 #14 的工具条浮层、票 #15 的弹窗色块选定一档时经这里冒给 App；
// 落盘（窄通道 ql_set_palette）与改页签快照都在 App.onTerminalPalette，本组件不判缺省也不落盘。
const emit = defineEmits<{ stop: [id: string]; restart: [id: string]; palette: [id: string, paletteId: TermPaletteId] }>();

// 当前档（id → 颜色表那一行）：theme / 查找 decorations / 画布描边**三样都从这里取**，
// 于是换一次档三处一起换（spec 的结构性同源门在 TerminalTabView.test.ts：源码里不得再出现硬编码 hex）。
const paletteOf = computed(() => termPaletteOf(props.palette));

// 换配色不重建终端（ADR:15 的真机取证）：把 theme **整对象**换掉，xterm 即时重绘，PTY 与滚动缓冲都不动；
// 改 term.options.theme.background 这类内部属性不生效，所以必须赋一个新对象。终端还没建时（v-show 隐藏 / 未挂载）不做事。
watch(() => props.palette, () => {
  if (!term) return;
  // 这一份变了（票 #14 选定一档 / 票 #18 对齐条目落盘档，改的都是它）：本地预览一并清掉，别让 hover 残留盖过落盘结果。
  previewId.value = null;
  // 生效的那一档仍走 shownPalette：外部预览（票 #15）若还挂着就仍是那一档，没挂着就是新快照。
  // theme 赋值与查找高亮重铺都收在 applyTheme 一处（三处换档入口共用，别再各写一遍）。
  applyTheme(shownPalette.value);
});

const view = ref<HTMLElement | null>(null);
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let searchAddon: SearchAddon | null = null;
let observer: ResizeObserver | null = null;
let reportedCols = 0;
let reportedRows = 0;

// ---- 票 #14：工具条那颗配色按钮 + 六行浮层（hover 预览、点击才落盘）----
// 三条边界，逐条由同文件「票 #14 · 工具条配色浮层」那组用例钉住：
// ① hover = 只把 theme **整对象**换成那一档（同一个终端实例，PTY 与滚动缓冲不动，ADR:15）；移开 / ESC /
//    点击外部都还原成 props.palette 那份快照 —— 预览不写状态、不落盘、也不改 prop。
// ② 只有点击才 emit(palette, id, 档)：落盘在 App.onTerminalPalette 的窄通道 ql_set_palette，
//    本组件一次 ql_* 都不发（进程与配置的所有权都在 App，规格 §9.2 同一口径）。
// ③ 行序取 TERM_PALETTE_IDS、分组取表里那一行的 dark、颜色取表、档名取词典字面量 key：
//    组件源码里不得出现任何 hex —— 同文件那条源码扫描门会把硬编码打回来。
const paletteOpen = ref(false);
const popLeft = ref(0);
const popTop = ref(0);
// 正在预览的那一档（null = 没有预览）。它是本组件的局部态：不写回 prop、不落盘，浮层一关就清零。
const previewId = ref<TermPaletteId | null>(null);
// 票 #15：两份预览并存时的优先级 —— **本地浮层预览 > 外部（弹窗色块）预览 > 页签快照**。
// 本地优先的理由：用户正在工具条浮层里逐档扫，这时候弹窗那边的 hover 不该把这一屏换掉（同一屏只能有一档）。
// 三处「当前档」的读数（theme / 画布描边 / 查找高亮 decorations）一律走这一份 = spec #12 的「同源」结构门；
// 浮层里那六个勾选标记（is-current / aria-current）不走它——它标的是**落盘那份快照**，预览不该改选中标。
const shownPalette = computed<TermPaletteId | null | undefined>(() => previewId.value ?? props.palettePreview ?? props.palette);
const shownPaletteOf = computed(() => termPaletteOf(shownPalette.value));
// 外部预览变了（App 挂上 / 撤掉）→ 同一个实例上把 theme 换成那一档；不重建、不改快照。
// 构造那一次不带预览（预览只在 hover 期间存在），所以 new Terminal 的 theme 走下面 shownPaletteOf 那份。
watch(() => props.palettePreview, () => applyTheme(shownPalette.value));
const paletteBtn = ref<HTMLElement | null>(null);
const popRef = ref<HTMLElement | null>(null);

// 分组判据就是颜色表里那一行的 dark（这里不另立一份名单）：以后加一档只改 term-palettes.ts，浮层自己跟着分。
const paletteGroups = computed(() => [
  { key: 'light', label: t('ql.palette.group.light'), ids: TERM_PALETTE_IDS.filter((id) => !TERM_PALETTES[id].dark) },
  { key: 'dark', label: t('ql.palette.group.dark'), ids: TERM_PALETTE_IDS.filter((id) => TERM_PALETTES[id].dark) },
].filter((g) => g.ids.length > 0));

// 档名：六个 key 各写一次字面量 t()（key-coverage.test.ts 只认字面量 key，动态拼接的 key 进不了那道覆盖门）。
const paletteLabels: Record<TermPaletteId, () => string> = {
  paper: () => t('ql.palette.paper'),
  console: () => t('ql.palette.console'),
  'warm-paper': () => t('ql.palette.warm-paper'),
  charcoal: () => t('ql.palette.charcoal'),
  campbell: () => t('ql.palette.campbell'),
  'warm-night': () => t('ql.palette.warm-night'),
};

// 换 theme：整对象赋一个新对象（改 term.options.theme.background 这类内部属性不生效 —— ADR:15 的真机取证）。
// termPaletteOf 负责回落：预览传 id，还原传快照（快照缺省时回落默认档，与构造那次同一张嘴）。
function applyTheme(id: TermPaletteId | null | undefined): void {
  if (!term) return;
  term.options.theme = { ...termPaletteOf(id).theme };
  // 查找高亮跟着重铺：装饰的颜色是建装饰那一刻烘进 overlay 的，只换 theme 不会重绘已有的高亮 ——
  // 从 paper 换到暗底，旧那档淡紫会留在屏上，正是「theme / 描边 / 查找高亮同源」要防的现象（审查轮 spec 轴 (c)2）。
  refreshSearchDecorations();
}

// 换档后重铺查找装饰：先清旧的一批，再按当前查询用**新档那一行**的 decorations 铺一遍。
// 代价写清楚：重铺会重跑一次增量查找，所以「当前第几个匹配」可能挪一位、计数跟着刷新；
// 真机侧「计数不被抹成 0 / 0」由 TerminalTabView.search.test.ts 的 palette_switch_keeps_the_search_count_alive 钉。
function refreshSearchDecorations(): void {
  if (!searchAddon) return;
  searchAddon.clearDecorations();
  const q = query.value.trim();
  if (q) withProgrammaticSelection(() => searchAddon!.findNext(q, { ...searchOptions(), incremental: true }));
}

// hover 与键盘 focus 共用这对处理器：Tab 进浮层也能预览，且预览态只有一份
function onPaletteHover(id: TermPaletteId): void { previewId.value = id; applyTheme(id); }
function onPaletteLeave(): void {
  if (previewId.value === null) return;
  previewId.value = null;
  // 还原的目标 = shownPalette（此刻本地那份已清）：有外部预览就回到那一档，没有才回到快照
  applyTheme(shownPalette.value);
}
function onPalettePick(id: TermPaletteId): void {
  // 先清预览态再冒事件：屏幕就停在选中的那一档，等 App 把快照 prop 改成同一档。
  // 在这里还原就会看到一次「回闪成旧档」（用户实机最容易盯上的那一下）。
  previewId.value = null;
  emit('palette', props.id, id);
  closePalettePop();
}

function detachPopListeners(): void {
  window.removeEventListener('keydown', onPopKeyDown, true);
  window.removeEventListener('mousedown', onOutsideMouseDown, true);
}
function closePalettePop(): void {
  if (!paletteOpen.value) return;
  paletteOpen.value = false;
  detachPopListeners();
  // 关浮层不留预览：屏幕回到 shownPalette（外部预览还在就那档，否则快照）——与 onPaletteLeave 同一个还原口径
  if (previewId.value !== null) { previewId.value = null; applyTheme(shownPalette.value); }
}
function onPopKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  closePalettePop();
  paletteBtn.value?.focus();      // 关闭后焦点回那颗按钮，不让它掉回页面里
}
function onOutsideMouseDown(e: MouseEvent): void {
  const target = e.target as Node | null;
  if (target && (popRef.value?.contains(target) || paletteBtn.value?.contains(target))) return;
  closePalettePop();
}

// 浮层定位 = position: fixed + JS（与本仓 .dd-tip / .tpl-tip / .flag-tip 同一定位手法，理由在 style.css 那几段自己的注释里——
// absolute 会被容器裁切）。锚在按钮下缘 +6px：0px 会让浮层顶边与工具条读成贴死一体，留一条能看见的缝。
// 先渲染再量宽（不抄宽度当第二个真源）；贴右缘时整体左移，右侧留 4px 与「不贴死窗边」的下限一致，
// 窗极窄时 Math.max(4, …) 兜住左边界，不把浮层推出窗外（两个 4 是同一个下限的两半，不是各自拍的）。
async function openPalettePop(): Promise<void> {
  // 条目配置已删（restartDisabled）：没有可写 terminal_palette 的条目，按钮禁用、浮层也开不出，
  // 页签继续用它最后一份配色（App 在条目消失后不再对齐 —— ADR 0002；App.test.ts 钉着「删条目不跳档」）。
  if (props.restartDisabled) return;
  const el = paletteBtn.value;
  if (!el || paletteOpen.value) return;
  const r = el.getBoundingClientRect();
  popLeft.value = r.left;
  popTop.value = r.bottom + 6;
  paletteOpen.value = true;
  await nextTick();
  const pop = popRef.value;
  const vw = window.innerWidth;
  if (pop && vw > 0) {
    const maxLeft = vw - pop.offsetWidth - 4;
    if (popLeft.value > maxLeft) popLeft.value = Math.max(4, maxLeft);
  }
  // capture 阶段挂 window：查找输入框那类元素上的 mousedown 也要能关掉它，而不被组件外的事件顺序吃掉
  window.addEventListener('keydown', onPopKeyDown, true);
  window.addEventListener('mousedown', onOutsideMouseDown, true);
}

// ---- 尺寸（规格 §9.3 / 计划 审查重点 2）----
// v-show 切走的页宽高为 0，此时 fit() 会把 cols/rows 算成异常值写坏 PTY → 先按盒尺寸挡掉；
// 重新可见时 ResizeObserver 必然收到一次尺寸变化，再 fit。
function fitAndReport(force = false): void {
  const el = view.value;
  if (!el || !fitAddon) return;
  if (el.offsetWidth === 0 || el.offsetHeight === 0) return;
  fitAddon.fit();
  reportSize(force);
}

// 首帧必须上报（索引 K11(2)）：主进程 start() 不带尺寸、按 80×24 兜底建 PTY，
// 不上报这一次，终端就一直按 80×24 排版。ResizeObserver 会多次回调，同尺寸不重复发；
// force = true 供上层在「同一页签再次启动」（PTY 被重建为 80×24）时强制再报一次。
function reportSize(force = false): void {
  if (!term) return;
  const cols = term.cols;
  const rows = term.rows;
  if (cols <= 0 || rows <= 0) return;
  if (!force && cols === reportedCols && rows === reportedRows) return;
  reportedCols = cols;
  reportedRows = rows;
  props.onResize(props.id, cols, rows);
}

// ---- 复制 / 粘贴（规格 §8：file:// 下 navigator.clipboard 不可靠 → 走主进程）----
function copySelection(): void {
  if (!term) return;
  const text = term.getSelection();
  if (!text) return;
  void invoke('clipboard_write', text).catch(() => {});
}

// 粘贴的**唯一**实现路径（票 #24 / ADR 0003）：三条入口（Ctrl+V、Ctrl+Shift+V、无选区右键）都收到这里，
// 票 #25 的多行二次确认只加在这一条上 —— 别再给任何入口另写一遍粘贴。
async function pasteClipboard(): Promise<void> {
  if (!term) return;
  try {
    const text = await invoke<string>('clipboard_read');
    if (!text) return;
    // 票 #25：多行 → 先过二次确认，确认之前这里一个字节都不写进终端；取消/点遮罩 = 丢弃。
    if (isMultilinePaste(text)) { pendingPaste.value = text; return; }
    term.paste(text);
  } catch {
    // 主进程读失败：无界面后果（与 open_external 同口径）
  }
}

// ---- 票 #25（spec #21 / ADR 0003）：多行粘贴二次确认 ----
// 判定口径：去掉**一个**尾部换行之后仍含换行 = 多行 —— 从日志里复制一行命令（哪怕带一个回车）不打断（user story 9）。
// 复用主题化 ConfirmDialog（tone=primary；[粘贴] 自定义文案；[取消] 复用 common.cancel；点遮罩 = 取消）。
// 文案走响应式 t()：确认框开着切语言，标题/正文/[粘贴] 跟着重译（user story 15 / 真机读数⑧）。
const pendingPaste = ref<string | null>(null);   // 待确认的粘贴内容（null = 没有确认框）
function stripTrailingNewline(text: string): string { return text.replace(/(\r\n|\n|\r)$/, ''); }
function isMultilinePaste(text: string): boolean {
  const body = stripTrailingNewline(text);
  return body.includes('\n') || body.includes('\r');
}
const pasteConfirmMessage = computed(() =>
  t('ql.terminal.pasteConfirm.message', {
    // 行数 = 去掉尾部换行后的正文行数（2 行的命令批处理就显示 2，不数那个尾部回车）
    lines: pendingPaste.value === null ? 0 : stripTrailingNewline(pendingPaste.value).split(/\r\n|\n|\r/).length,
  }));
function onPasteConfirm(): void {
  if (pendingPaste.value === null) return;
  term?.paste(pendingPaste.value);   // 确认 → 写进终端，恰好一次
  pendingPaste.value = null;
}
function onPasteCancel(): void { pendingPaste.value = null; }   // [取消] / 点遮罩：整批丢弃，之后也不会补粘

// ---- 票 #22（spec #21 / ADR 0003）：选区口径 + 智能右键（SmartRightClick）----
// 「鼠标选区」的唯一真源：由终端库的选区变化事件驱动，只认鼠标在画面上拉出的那一段。
// addon-search 命中后会程序化 select() 选中匹配（真机契约由 search.test.ts 两条钉住），查找动作那一下用
// 同步标志排除；智能右键（票 #22）与工具条选区提示（票 #23）共用这一份，永不分歧（user story 23）。
// 复位的四条路：清空终端 / 清空查找（都走 resetSearchState）、右键复制完成（clearSelection 让事件转回来）、
// 组件卸载（term.dispose 之后这份态随组件实例一起消失）。
const hasMouseSelection = ref(false);
// true = 查找动作在途（同步窗口：包住每一处 findNext / findPrevious 调用，事件在同一拍里回来）。
// 在途收到的选区变化一律算「不是鼠标划的」；查找**之后**用户再划的那一段仍然照常置位（口径不过头）。
let programmaticSelection = false;
function withProgrammaticSelection(fn: () => void): void {
  programmaticSelection = true;
  try { fn(); } finally { programmaticSelection = false; }
}

// 智能右键（ADR 0003）：有鼠标选区 → 复制并清空选区（下一次右键直接粘贴）；无选区 → 粘贴（原习惯保留）。
// 前提 = 构造时关掉 rightClickSelectsWord（见 onMounted 构造注释）：不关，「无选区」这一半永远不成立。
// 粘贴只有一条实现路径（票 #3 把它收成三条入口共用）；多行确认（票 #4）也加在这一条上。
function onContextMenu(): void {
  if (hasMouseSelection.value) {
    copySelection();
    term?.clearSelection();   // 事件转回 onSelectionChange → 鼠标选区复位
    return;
  }
  void pasteClipboard();
}

// ---- 键盘（规格 §9.3 / 计划 审查重点 5；票 #24 起补 Ctrl+V = 粘贴）----
// 返回 false = 这条按键不进终端。**Ctrl+C 完全不拦**（原样交给终端做中断 —— ADR 0003 第一处取舍，
// 钉它的既有用例 ctrl_c_is_not_intercepted_and_reaches_the_terminal 保留不动）；
// 拦截的只有三个组合键：Ctrl+Shift+C 复制、Ctrl+Shift+V 粘贴、Ctrl+V 粘贴。
function onCustomKey(e: KeyboardEvent): boolean {
  if (e.type !== 'keydown') return true;
  if (!e.ctrlKey || e.altKey) return true;
  const key = (e.key ?? '').toLowerCase();
  const code = e.code ?? '';
  if (e.shiftKey) {
    if (key === 'c' || code === 'KeyC') { copySelection(); return false; }
    // 审查轮：带 Shift 的这一支同样要 preventDefault —— 浏览器原生粘贴事件与是否带 Shift 无关
    // （Chromium 里 Ctrl+Shift+V = 粘贴为纯文本，xterm 的隐藏 textarea 会自己收到 paste），
    // 不挡就与 pasteClipboard 叠成「粘两遍」。见下面不带 Shift 那支的 ①②。
    if (key === 'v' || code === 'KeyV') { e.preventDefault(); void pasteClipboard(); return false; }
    return true;
  }
  // 票 #24：Ctrl+V = 粘贴（不带 Shift）。拦截必须同时做两件事，少一件就出用户症状：
  // ① preventDefault 挡掉**浏览器原生粘贴事件** —— xterm 的隐藏 textarea 若自己收到 paste，
  //    会与我们这次的粘贴叠成「粘两遍」；
  // ② 返回 false 挡掉**终端库把 Ctrl+字母写成控制字符** —— 否则 ^V 先进了 PTY，跑着的程序收到脏字节。
  // 注意没有 Ctrl+C 分支：它带着 Shift 之外的原语义一路畅通（user story 7 / 真机读数⑦）。
  if (key === 'v' || code === 'KeyV') { e.preventDefault(); void pasteClipboard(); return false; }
  return true;
}

// ---- 查找（规格 §9.1「同一套工具条 UI 语言」）----
const query = ref('');
const searchCount = ref<{ cur: number; total: number }>({ cur: 0, total: 0 });
// 占位符名以词典为准（索引 K21(3)）
const countText = computed(() => t('ql.terminal.count', { cur: searchCount.value.cur, total: searchCount.value.total }));
const navDisabled = computed(() => searchCount.value.total === 0);
const queryEmpty = computed(() => query.value.length === 0);

// 计数来自 SearchAddon 的结果事件，而它只在带 decorations 时发。
// 四值取自**当前配色的那一行**（与 theme 同一张表 = term-palettes.ts）：这四值曾在本组件里硬编码成两档淡紫，
// 换配色时高亮不换、暗底上几乎看不见，因此 spec #12 把「theme 与查找 decorations 同源」定成结构性门。
function searchOptions(): { decorations: Record<string, string> } {
  return { decorations: { ...shownPaletteOf.value.decorations } };
}

// 查找状态复位：清掉高亮装饰 + 计数归零（空查询与「清空终端」共用同一条路径）
function resetSearchState(): void {
  searchAddon?.clearDecorations();
  searchCount.value = { cur: 0, total: 0 };
  hasMouseSelection.value = false;   // 票 #22：清空查找 / 清空终端都连带复位「鼠标选区」（spec 选区口径）
}

// dir = 0：输入变化时的增量查找；±1：上/下一个
function runSearch(dir: -1 | 0 | 1): void {
  if (!searchAddon) return;
  const q = query.value.trim();
  if (!q) {
    resetSearchState();
    return;
  }
  const opts = searchOptions();
  // 三处查找调用都包进 withProgrammaticSelection：真 addon-search 命中后会程序化选中匹配（票 #22 口径）
  if (dir === -1) withProgrammaticSelection(() => searchAddon!.findPrevious(q, opts));
  else if (dir === 1) withProgrammaticSelection(() => searchAddon!.findNext(q, opts));
  else withProgrammaticSelection(() => searchAddon!.findNext(q, { ...opts, incremental: true }));
}
watch(query, () => runSearch(0));
function onQueryClear(): void { query.value = ''; }

// 清空终端（规格 §9.1）：只清本实例的 buffer 与滚动区，不动上层状态。
// buffer 清空 = 既有匹配一并消失，所以查找计数与高亮也要复位，否则计数停在「1 / 3」、
// 上/下一个指向已经不存在的匹配。
function onClearTerminal(): void {
  if (!term) return;
  term.clear();
  resetSearchState();
}

// 工具条那颗进程态按钮（2026-10-20 两步用户要求：先 [x] → [停止]，再 [停止] → 停完变 [重新启动]）。
// 2026-10-24 用户要求把 [配色] 挪到那一排最右 → 它右边多一颗 [配色]，它不再是最后一颗（排内顺序见 <template>）。
// 判据与 QuickLaunch 列表行的状态按钮同源同口径（QuickLaunch.vue 的 stateOf/onToggle 是同一份 qlStates）：
// 运行中 → [停止]；未运行 → [重新启动]；在途（stopping，含 doQlStart 的启动探测在途）→ 「...」禁用。
const stateLabel = computed(() => (props.running ? t('ql.btn.stop') : t('ql.terminal.restart')));
const stateDisabled = computed(() => props.stopping || (!props.running && props.restartDisabled));

// 只有「不在途」才动，且运行中只报 stop、未运行只报 restart：:disabled 是界面，这道守卫才是契约
// （与 LogPanel.vue 的 onCloseClick 同构）。点了禁用的重启按钮也不冒泡，App 不会为已删除的配置发一次 ql_start。
function onStateClick(): void {
  if (props.stopping) return;
  if (props.running) { emit('stop', props.id); return; }
  if (props.restartDisabled) return;
  emit('restart', props.id);
}

// 链接（规格 §9.1）：复用既有 open_external（主进程已白名单校验，reject 静默）
function openLink(uri: string): void { void invoke('open_external', uri).catch(() => {}); }

onMounted(() => {
  const el = view.value;
  if (!el) return;
  // 取值逐字按计划 步骤 3 / 规格 §9.3
  // fontFamily 用字面量栈，必须与 src/style.css:29 的 --font-mono 逐字同值（改字体时两处同步）：这里不能用 CSS 变量——xterm 5.5.0 的 CharSizeService 走 canvas 测量，canvas 的 font 不解析 var()，格子按 canvas 默认字体量、字形按 CSS 解析的字体画 → 网格与字形不匹配（索引 K23(1)）
  // allowProposedApi 必开：查找计数依赖 addon-search 建匹配装饰，而装饰走 xterm 的 registerDecoration——
  // 该 API 在 @xterm/xterm 5.5.0 里仍是 EXPERIMENTAL（typings/xterm.d.ts:1118），未开此开关时它抛
  // 「You must set the allowProposedApi option to true to use proposed API」；抛出点在 _highlightAllMatches 内、
  // 早于 _fireResults，故计数事件从不触发 → 输入终端里存在的文本也恒显「0 / 0」且无上/下一个可用。
  // 打桩套件看不见这条真机契约（假 addon 无条件发结果事件），由 TerminalTabView.search.test.ts 钉住。
  // rightClickSelectsWord 必须显式关（票 #22 / ADR 0003）：这是库自己的右键处理器（5.5.0：mousedown(button=2)
  // → rightClickHandler → 选光标下的词），开着就抢在 onContextMenu 之前造出选区，「无选区 → 粘贴」这一半
  // 永远不成立，智能右键退化成「只复制、永不粘贴」。它的默认值按 isMac 走（macOS=true，Windows=false）——
  // 默认值靠平台，所以显式写死才稳。逐字门在 TerminalTabView.test.ts（打桩构造参数）+ search.test.ts（真库认这个开关）。
  term = new Terminal({ scrollback: 5000, fontSize: 13, fontFamily: "'Cascadia Code', Consolas, monospace", allowProposedApi: true, rightClickSelectsWord: false, theme: { ...shownPaletteOf.value.theme } });
  fitAddon = new FitAddon();
  searchAddon = new SearchAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(searchAddon);
  term.loadAddon(new WebLinksAddon((_e, uri) => openLink(uri)));
  term.open(el);
  term.onData((data) => props.onInput(props.id, data));
  term.attachCustomKeyEventHandler(onCustomKey);
  // 票 #22：选区变化事件 = 「鼠标选区」那份态的唯一驱动（查找在途的那一拍不算，见 withProgrammaticSelection）
  term.onSelectionChange(() => {
    hasMouseSelection.value = programmaticSelection ? false : !!term?.hasSelection();
  });
  searchAddon.onDidChangeResults((r) => {
    searchCount.value = { cur: r.resultIndex < 0 ? 0 : r.resultIndex + 1, total: r.resultCount };
  });
  props.register(props.id, (data) => term?.write(data));
  observer = new ResizeObserver(() => fitAndReport());
  observer.observe(el);
  fitAndReport();
});

onBeforeUnmount(() => {
  closePalettePop();   // 浮层挂在 window 上的两个监听必须跟着组件走（v-show 卸载即注销）
  props.unregister(props.id);
  observer?.disconnect();
  observer = null;
  term?.dispose();
  term = null;
  fitAddon = null;
  searchAddon = null;
});

// 供上层在「自动激活 / 再次启动」时显式 fit + 聚焦（规格 §9.2 的启动流程、任务 13 的 E5）；
// 常规切页签不需要它——v-show 恢复显示必然触发 ResizeObserver。
// fit 默认「不」强制上报（F8 去重）：任务 13 每次激活都会调 fit()，默认强制就等于每次切页签
// 都发一次多余的 ql_resize。只有「同一页签再次启动」那次例外——主进程把 PTY 重建为 80×24
// （索引 K11(2)），尺寸没变却必须重报，所以那种调用必须显式 fit(true)。
defineExpose({
  fit: (force = false): void => fitAndReport(force),
  focus: (): void => term?.focus(),
});
</script>
<template>
  <div class="log-pane log-pane--term" :data-tab-id="id" :data-tab-label="label" :data-tab-full-label="fullLabel">
    <div style="display: flex; justify-content: flex-start; align-items: center;">
      <!-- [清空终端]：icon-only + aria-label，盒型复用既有 .icon-btn（同 LogTabView 的清空日志） -->
      <button type="button" class="icon-btn icon-btn--noborder btn-term-clear"
        :aria-label="t('ql.terminal.clear')" :data-tooltip="t('ql.terminal.clear')" @click="onClearTerminal">
        <FontAwesomeIcon :icon="['far', 'trash-can']" />
      </button>
      <!-- 查找一组：输入即查 + 计数 + 上/下一个；清空查找复用 log.search.clear（索引 K21(2)） -->
      <div class="log-search">
        <input type="text" class="input log-search-input" v-model="query"
          :placeholder="t('ql.terminal.searchPlaceholder')" :aria-label="t('ql.terminal.searchPlaceholder')" />
        <button type="button" class="icon-btn icon-btn--noborder btn-search-clear"
          :aria-label="t('log.search.clear')" :data-tooltip="t('log.search.clear')" :disabled="queryEmpty" @click="onQueryClear">
          <FontAwesomeIcon :icon="['far', 'circle-xmark']" />
        </button>
        <span class="label log-search-count">{{ countText }}</span>
        <button type="button" class="icon-btn icon-btn--noborder btn-search-prev"
          :aria-label="t('ql.terminal.searchPrev')" :data-tooltip="t('ql.terminal.searchPrev')" :disabled="navDisabled" @click="runSearch(-1)">
          <FontAwesomeIcon :icon="['far', 'circle-up']" />
        </button>
        <button type="button" class="icon-btn icon-btn--noborder btn-search-next"
          :aria-label="t('ql.terminal.searchNext')" :data-tooltip="t('ql.terminal.searchNext')" :disabled="navDisabled" @click="runSearch(1)">
          <FontAwesomeIcon :icon="['far', 'circle-down']" />
        </button>
      </div>
      <!-- 进程态按钮（2026-10-20 替换原 [x]，同日第二轮加「停完变 [重新启动]」）：三态与列表行逐字同口径
           （索引 K30(1)）——运行中 = [停止] 可点、在途 = 半角三点 + 禁用（与 LaunchBar.vue:129 /
           QuickLaunch.vue:221 一致）、未运行 = [重新启动] 可点（页签保留，点它 = 列表行那颗 [启动]）。
           restartDisabled（配置已删除）时禁用：没有配置就没有可启动的东西。
           字号与盒都随本工具条同排，两处各由一条已定版的事实决定（取证台 .temp/term-toolbar-align，
           headless Chrome 量真盒，两轮用户截图逐条对过）：
           ① 字号不写 inline、继承 = 13.3333px（.icon-btn 不设字号 → UA 的 button{font:13.3333px}，
              同排 [清空终端] + 查找三颗皆如此）；列表行那颗的 10px 属于 24px 红色圆按钮的语境
              （QuickLaunch.vue 的 2026-10-15 定版），搬进这条工具条就是「比同排小一圈」= 第一轮截图。
           ② 盒 = 24×24（style.css:257 .log-pane .btn-term-state，与 .log-search .icon-btn 同尺寸）：
              tooltip 的 ::after 是 bottom: calc(100% + 6px)，锚在盒顶（style.css:607）——32px 盒顶 33
              比同排 24px 盒顶 37 高 4px，tooltip 就跟着高 4px = 第二轮截图「Restart 比 Next match 高」。
              收盒一并对齐 tooltip 起点、热区与盒心（行中心 49），不动 ::after、不加位移魔法数。
           文案 = 既有 ql.btn.stop + 新增 ql.terminal.restart（zh「重新启动」/ en 'Restart'，词典两侧齐全）。 -->
      <button type="button" class="icon-btn icon-btn--noborder btn-term-state"
        :aria-label="stateLabel" :data-tooltip="stateLabel"
        :disabled="stateDisabled" @click="onStateClick">
        <span v-if="stopping">...</span><FontAwesomeIcon v-else-if="running" :icon="['fas', 'stop']" /><FontAwesomeIcon v-else :icon="['fas', 'arrow-rotate-right']" />
      </button>
      <!-- 选区复制提示（票 #23 / spec #21）：仅「鼠标选区」存在时渲染（v-if 不占位），而那份态与智能右键同源
           → 「有提示」与「右键 = 复制」永不分歧（user story 13 / 23）。位置 = 进程态那颗之后、贴右缘的 [配色]
           之前：那两颗的盒与 tooltip 锚点一条不动（排内顺序门 + margin-left:auto 门都继续绿）。
           窄窗收缩省略号的规则在 style.css 的 .log-pane .term-copy-hint（24px 盒高同族、min-width:0 那条门）。
           文案 = 词典字面量 key ql.terminal.copyHint（中英两侧同一批齐全）；响应式 t() → 切语言当场重译，
           不需要重新划选区。 -->
      <span v-if="hasMouseSelection" class="term-copy-hint">{{ t('ql.terminal.copyHint') }}</span>
      <!-- 配色入口（票 #14）：盒 24×24 与同排其余几颗一致（style.css 里那一族收盒的定版理由同样适用，
           见 :252-263 那段取证注释）——盒顶一变 tooltip 就跟着高一截，那颗按钮已经被这件事返工过三轮。
           restartDisabled（条目配置已删）时禁用：没有条目就没有可写的 terminal_palette，页签停在它最后一份配色。
           位置 = 那一行的最右侧（2026-10-24 用户两轮：第一轮「挪到最右」被做成排内最后一颗 = 仍紧贴左边那一串，同日截图
           澄清要贴这一行的右缘 → style.css 那条 .log-pane .btn-term-palette 加 margin-left:auto 吸掉行内剩余空间；排内
           顺序仍是 DOM 顺序，盒 24×24 与间距一条没动）。两半都由 TerminalTabView.test.ts 的
           palette_button_is_the_rightmost_item_in_the_toolbar 钉住。副作用：那颗从此贴右缘，浮层每次都走既有的
           「贴右缘整体左移、右边留 4px」分支（下面 openPalettePop 那段），不再从按钮右下方向右溢出。 -->
      <button ref="paletteBtn" type="button" class="icon-btn icon-btn--noborder btn-term-palette"
        :aria-label="t('ql.terminal.palette')" :data-tooltip="t('ql.terminal.palette')"
        :disabled="restartDisabled" :aria-expanded="paletteOpen ? 'true' : 'false'" @click="openPalettePop">
        <FontAwesomeIcon :icon="['fas', 'palette']" />
      </button>
      <!-- 六行配色浮层（票 #14）：position: fixed + JS 定位（组件里 openPalettePop 那段），不塞进那一排 →
           那一排的 24px 定版与 .log-pane 的高度链都不受影响。分组 = 表里那一行的 dark、行序 = TERM_PALETTE_IDS；
           行 = 三格微条（底色 / 字色 / 两个 ANSI 槽，全部取表里的 hex）+ 档名 + 当前档的 ✓。
           hover 与键盘 focus 走同一对处理器：当场预览到身后那块真画布（整对象换 theme，不重建终端），移开还原；
           只有点击才 emit 给 App 落盘（窄通道 ql_set_palette），ESC 与点击外部关闭并还原预览。 -->
      <div v-if="paletteOpen" ref="popRef" class="term-palette-pop" role="menu"
        :aria-label="t('ql.terminal.palette')" :style="{ left: popLeft + 'px', top: popTop + 'px' }">
        <div v-for="g in paletteGroups" :key="g.key" class="term-palette-group">
          <div class="term-palette-group-label">{{ g.label }}</div>
          <button v-for="id in g.ids" :key="id" type="button" role="menuitem" class="term-palette-row"
            :class="{ 'is-current': id === paletteOf.id }" :data-palette="id"
            :aria-current="id === paletteOf.id ? 'true' : undefined"
            @mouseenter="onPaletteHover(id)" @mouseleave="onPaletteLeave()"
            @focus="onPaletteHover(id)" @blur="onPaletteLeave()"
            @click="onPalettePick(id)">
            <span class="term-palette-swatch" :style="{ background: TERM_PALETTES[id].theme.background }">
              <span class="term-palette-cell" :style="{ background: TERM_PALETTES[id].theme.foreground }"></span>
              <span class="term-palette-cell" :style="{ background: TERM_PALETTES[id].theme.red }"></span>
              <span class="term-palette-cell" :style="{ background: TERM_PALETTES[id].theme.magenta }"></span>
            </span>
            <span class="term-palette-name">{{ paletteLabels[id]() }}</span>
            <span v-if="id === paletteOf.id" class="term-palette-check" aria-hidden="true">✓</span>
          </button>
        </div>
      </div>
    </div>
    <!-- xterm 挂载点：沿用 .log-view 的 flex:1 高度链，只把它的 overflow-y 关掉（xterm 自带视口滚动）。
         描边取当前档的 canvasBorder（票 #13）：浅灰 / 暖纸那两档与卡片只差一档明度，靠描边才读作「有意另起一块台面」；
         暗底两档存的是字面 hex，paper / charcoal 存 transparent（不画）。outline 不占布局，故网格尺寸不受影响。
         底色取同一档的 theme.background（2026-10-24 用户截图「黑色配色的终端底部有白色间隙」）：FitAddon 只能按整行取 rows，
         画布底缘与本盒底缘之间恒剩 0–14px 属于**本盒自己的背景**——xterm 只给 .xterm-viewport 上色，本盒不上色就是卡片白。
         取证台 .temp/term-bottom-gap 前后两份截图对照：本盒不涂底色时那段余量读成白缝（真机读数 view 高 302 / 画布 300 → 2px，
         用户那张 150% 截图里是 8 CSS px），涂上同档底色后它与画布连成一块；另一半白缝（pane 的 8px 下内边距）由
         .log-pane--term 去掉。theme / 描边 / 查找高亮 / 盒底四处同源，换档时不分家。
         第二轮（「左右两侧的空隙也去掉，但保留左下和右下的圆角」）把左右 8px 也由 style.css 的 .log-pane--term .term-view 抵消掉，
         于是这句 overflow:hidden 还兼一件事：它裁掉绝对定位的 xterm 子孙（screen / viewport），画布的两个下角落才跟着那条 7px 内弧走，
         不会把字形的角顶出弧外——删掉这句，圆角就只剩背景是圆的。 -->
    <!-- 多行粘贴的二次确认（票 #25）：常驻挂载、:open 开关（Teleport 挂 body，与 App / QuickLaunchModal /
         TemplateModal 那三处同一个 ConfirmDialog）。用例在 body 里查 .confirm-* 节点。 -->
    <ConfirmDialog :open="pendingPaste !== null" :title="t('ql.terminal.pasteConfirm.title')"
      :message="pasteConfirmMessage" tone="primary" :confirm-text="t('ql.terminal.pasteConfirm.paste')"
      @confirm="onPasteConfirm" @close="onPasteCancel" />
    <div ref="view" class="log-view term-view" :style="{ overflow: 'hidden', minHeight: '0', background: shownPaletteOf.theme.background, outline: '1px solid ' + shownPaletteOf.canvasBorder, outlineOffset: '-1px' }" @contextmenu.prevent="onContextMenu"></div>
  </div>
</template>
