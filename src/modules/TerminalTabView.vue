<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCircleDown, faCircleUp, faCircleXmark, faTrashCan } from '@fortawesome/free-regular-svg-icons';
import { faArrowRotateRight, faDownLeftAndUpRightToCenter, faPalette, faStop, faUpRightAndDownLeftFromCenter } from '@fortawesome/free-solid-svg-icons';
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
library.add(faTrashCan, faCircleUp, faCircleDown, faCircleXmark, faStop, faArrowRotateRight, faPalette,
  faUpRightAndDownLeftFromCenter, faDownLeftAndUpRightToCenter);   // 后两枚 = 票 #31 的 [全屏]/[恢复]（solid 才有这两个图标；LogTabView 在它自己组件内也 add 过，两处各自注册）

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
  // 日志全屏（LogFullscreen，票 #31 / ADR 0004）：显示态归渲染外壳（App 持有），一路经 LogPanel 搬到这里。
  // 本组件只按它换文案与图标，不持有、不同步它 —— 三个页签共用同一个态，切页签不丢。
  fullscreen?: boolean;
}>();
// stop(id) / restart(id)：与 QuickLaunch 列表行的 [停止] / [启动] 一一对应，一路冒泡到
// App.doQlStop / doQlStart（invoke('ql_stop') / invoke('ql_start')）；
// 本组件不碰 IPC（进程所有权在 App，规格 §9.2），只报「这条页签要停 / 要重启」。
// palette(id, 档)（票 #13 留的接缝）：票 #14 的工具条浮层、票 #15 的弹窗色块选定一档时经这里冒给 App；
// 落盘（窄通道 ql_set_palette）与改页签快照都在 App.onTerminalPalette，本组件不判缺省也不落盘。
const emit = defineEmits<{ stop: [id: string]; restart: [id: string]; palette: [id: string, paletteId: TermPaletteId]; 'toggle-fullscreen': [] }>();

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

// ---- 尺寸（规格 §9.3 / 计划 审查重点 2 · #33「谁先换行列」· #35「一轮重绘落在一个坐标框里」）----
// v-show 切走的页宽高为 0，此时 fit() 会把 cols/rows 算成异常值写坏 PTY → 先按盒尺寸挡掉；
// 重新可见时 ResizeObserver 必然收到一次尺寸变化，再 fit。
//
// 这一整段只有一条账本，就一条不变式：**xterm 缓冲的最后 rows 行 == 伪控制台手里那一屏**（rows = 最近报给它的那个行数）。
// 伪控制台（ConPTY 的 pseudoconsole 模式）自己不存历史，行列一变就从 home 起把它此刻那一屏整屏重画一遍。取证台 bench7
// （真 node-pty + 真 pwsh，跑完 ls 之后一格一行连续 resize，读数 .temp/fs-clip/raw7-drag.chunks.json）逐段量到：
//   ① 每一轮 = ESC[?25l ESC[H <它手里此刻 newRows 行，行间 ESC[K CRLF> ESC[cursorRow;34H ESC[?25h，一轮 750~1650B；
//   ② 窗口**变小 = 从顶上掉行**（贴底，与 xterm 换行列同向）；**变大 = 在底下补空行**（贴顶，与 xterm 反向 —— C_拖大_13 末尾 CUP = ESC[12;34H，第 13 行就是空行）。
// 那一屏与「缓冲的最后 rows 行」一旦脱钩（xterm 的行数在错误的一拍变化，或两轮重绘叠在同一个旧坐标框里），
// 那一轮的 CRLF 链就把同一批内容在缓冲里留下两份 ⇒ 同一条内容两遍，再往后每一轮踩着上一轮滚雪球（#35 用户贴的就是这个形状）。
// 落点是缓冲底缘（ybase），不是视口顶（ydisp）—— 探针实测：把 ydisp 挪到 14，那轮 ESC[H 仍整屏画在 baseY=20 那一段上。
//
// 三个动作各自能把它弄断，所以各有一条硬口径：
//  A 换行列一律 **xterm 先、报尺寸在后**，并且 xterm 建页签时就声明「对面那个 PTY 是 ConPTY」（构造参数 `windowsPty.backend`，见下面 onMounted 里构造处那条注释）。
//    开了它，xterm 行数变大才是在缓冲**底下补上伪控制台那几行新的空行**，而不是把滚动缓冲里的历史拉进视口 —— xterm 源码
//    common/buffer/Buffer.ts:177-201 里那条分支的理由正是这个：「conpty reprints the screen with it's view of the world.
//    Once a line enters scrollback for conpty it remains there」。不开它：grow 把历史拉进视口 → 那轮重绘把历史盖成空行
//    （#33 的实测 buffer 37→43 = 10 行尾段 + 33 行空，[恢复] 之后历史永久没了）。#33 当时是靠「先报尺寸、重绘落地后才换 xterm 行列」
//    绕开这一格：绕得开历史被盖，绕不开 C，2026-10-26 由 #35 改回到这条正路上（两个方向同一支，不再按方向分流）。
//    行数变小也是这一支：xterm 先缩 = 历史进滚动缓冲；伪控制台丢掉顶上行之后重复的那几条尾巴，由 xterm 换行列时对「光标以下的空行」的处理顺手消掉。
//  B 一轮在途（报过尺寸、那轮重绘未落地）就**不报新尺寸、不换行列**（fitAndReport 只收「尺寸没变」那次空转 fit，其余直接交回，
//    这一轮收尾时再按盒子当下的尺寸追下一轮）—— 两轮重绘落在同一个旧坐标框里，第二轮把第一轮的落点顶下去一行。
//  C 换行列之前，视口**必须先贴回缓冲底部**（= 视口正好是那一屏的镜像）；这一轮的时长之内不再摆视口，轮末按开始前的位置
//    还回去：我们自己钉的就重钉一次（#33 要的那条画布下缘），用户自己在翻历史就原样还他那一行（#33「不抢位置」不变；
//    他在轮内自己挪了就改记他挪到的那一行，见 onScroll）。#33 的钉把视口停在镜像**之上**几行 = 换行列那一拍 xterm
//    自己那几条分支与显示态都按「屏幕不是那一屏」走，而鼠标按着边框拖时 ResizeObserver 每帧一发（十几毫秒一次），
//    每一轮都踩着上一轮 —— 摘掉这次贴底，行数变小那一轮实测把 10 条内容留下两遍（门 = resize 的 shrink 那格）。
// 门：TerminalTabView.drag.test.ts（真 xterm + 按 ①② 写死的伪控制台模型，播种就从当时的视口取 = t0 那条不变式先成立）——
// ① 一格一格慢拖，每一格之后查这条不变式；② 按住边框上下拖一趟，查「缓冲里任何一条非空内容都不得出现两遍」且最后追平盒子；
// ③ 一轮在途不收新尺寸、收尾后按盒子当下的尺寸追那一格。TerminalTabView.resize.test.ts 管这条链上 #33 要的那三样**结果**
// （历史活着、画布下缘是最后一条还有内容的行、不抢用户自己翻历史的位置）；构造参数那条由 TerminalTabView.test.ts 逐字钉住。
const ROUND_REPAINT_CAP_MS = 250;   // 等这轮整屏重绘的上限：到点还没数据 = 它不会来了（进程已退出等），照样收尾
const ROUND_REPAINT_QUIET_MS = 60;  // 重绘可能分成几段送来：最后一段之后再收尾，别在中间收尾
let roundTarget: { cols: number; rows: number } | null = null;   // 这一轮报出去的尺寸；null = 没有在途的一轮
let roundCapTimer: ReturnType<typeof setTimeout> | null = null;
let roundQuietTimer: ReturnType<typeof setTimeout> | null = null;
// 这一轮开始时视口所在的绝对行（null = 本来就贴在缓冲底部）+「不在底部是我们自己钉的、还是用户自己翻的」——轮末按这两条还位置。
let roundScrollLine: number | null = null;
let roundWasOurPin = false;
// 画布此刻是不是被我们钉在「最后一条还有内容的行」那一屏（见 revealLastContentLine）。新输出不松手，而是跟着最新那条内容重钉
// —— 只 scrollToBottom 的话，让位补在缓冲底下的那几行空行又回到下缘里，新输出看着像落在画布中间。
// 用户自己划上去看历史才交还给他（挂在 term.onScroll）。
let revealed = false;

function clearRoundTimers(): void {
  if (roundCapTimer !== null) { clearTimeout(roundCapTimer); roundCapTimer = null; }
  if (roundQuietTimer !== null) { clearTimeout(roundQuietTimer); roundQuietTimer = null; }
}

// 用户贴不贴在底部（viewportY >= baseY）。拿不到 buffer（打桩套件的假终端）= 按贴底处理。
function atBottom(): boolean {
  const b = term?.buffer?.active;
  return !b || b.viewportY >= b.baseY;
}

// 口径 C：换行列之前把视口贴回缓冲底部 = 视口正好是伪控制台那一屏的镜像。
// 它钉的不是字节的落点（那一轮整屏重绘从缓冲底缘 ybase 起画，跟视口停在哪无关，探针实测），钉的是「换行列那一拍
// xterm 自己那几条分支」与显示态是否都按「屏幕就是那一屏」走：摘掉这一次贴底，行数**变小**那一轮的链子就把
// 同一批内容留在缓冲里两遍（实测 LINE-12×2 … 共 10 条，门 = resize 的 shrink 那格）。
// 只借这一轮的时长 —— 开始前的位置记下来，endRound 里还回去，所以这不是「把用户的位置改掉」；
// 用户在轮内自己挪了就改记他挪到的那一行（见 onScroll）。
function pinViewportToMirror(): void {
  if (atBottom()) return;                        // 本来就贴底 = 不用动（假终端没 buffer 也走这一支）
  const b = term!.buffer!.active;
  if (roundScrollLine === null) {                // 追下一轮时账已经带过来，别把用户那一行 / 我们那一钉的账覆盖掉
    roundScrollLine = b.viewportY;
    roundWasOurPin = revealed;
  }
  term!.scrollToBottom();                        // onScroll 会把 revealed 清掉，所以那份账记在 roundWasOurPin 里
}

// 摆这一轮的两个定时器：上限到点 = 重绘不会来；数据到达后静默一拍 = 这轮的最后一段落地了。
function armRound(target: { cols: number; rows: number }): void {
  roundTarget = target;
  if (roundCapTimer !== null) clearTimeout(roundCapTimer);
  roundCapTimer = setTimeout(endRound, ROUND_REPAINT_CAP_MS);
}

// carryScroll 只有 endRound 追下一轮时传 true：上一轮「开始前的位置」还没还回去，这一轮要继续背着走。
function fitAndReport(force = false, carryScroll = false): void {
  const el = view.value;
  if (!el || !fitAddon || !term) return;
  if (el.offsetWidth === 0 || el.offsetHeight === 0) return;
  const dims = fitAddon.proposeDimensions();
  const sameSize = !!dims && dims.cols === term.cols && dims.rows === term.rows;
  // 口径 B：一轮在途 = 此刻的坐标框已经不新鲜，新尺寸先不收（这一刻换行列，那轮重绘就落在半途的旧框里）。
  // 尺寸没变的那次 fit 是空转，照跑（「每次 ResizeObserver 回调都 fit」这条既有口径不动）；force 例外：那是重建过的 PTY，没有旧框。
  if (roundTarget && !force) {
    if (sameSize) fitAddon.fit();
    return;
  }
  if (!carryScroll) { roundScrollLine = null; roundWasOurPin = false; }
  if (force) roundTarget = null;
  // 行列没变（盒子挪了几个像素、行高却不够换一格）= 不用报尺寸、不会有重绘，也就别动视口（摆一次就是白闪一下）
  if (sameSize && !force) { fitAddon.fit(); return; }
  pinViewportToMirror();                          // 口径 C：换行列之前先贴回镜像
  fitAddon.fit();                                 // 口径 A：xterm 先换行列，两个方向都是这一条
  const target = { cols: term.cols, rows: term.rows };
  // 与报尺寸的先后要紧：先把这一轮的账立起来再报 —— 那轮重绘可能就在同一拍里到（真机几毫秒，测试里更是同步），
  // 先报后立就漏了「这次重绘到了」的判据，这一轮只能等上限到点才收尾 = 拖窗口时每一格都慢一整条上限。
  armRound(target);
  if (!reportSize(target.cols, target.rows, force)) { endRound(); return; }   // 没发出去（去重命中）= 不会有重绘，直接把视口还回去
}

// 一轮收尾（重绘落地后静默一拍，或上限到点）：盒子还在变就按当下的尺寸追下一轮 → 追平了才摆视口。
// 中途摆视口（钉 / 还位置）会把视口顶离镜像，下一轮重绘的落点又对不上 —— 同一条漂移，只是换了来源。
function endRound(): void {
  clearRoundTimers();
  const wasRound = roundTarget;
  roundTarget = null;
  if (!term) return;
  const el = view.value;
  const next = el && fitAddon && el.offsetWidth !== 0 && el.offsetHeight !== 0 ? fitAddon.proposeDimensions() : null;
  // 追下一轮的判据是「盒子在这一轮里又变了」= 拿它跟**这轮报出去的尺寸**比，不是跟 xterm 比：
  // 后者在某一轮 fit 与 propose 永远差一格时会自己转起来。拖窗口要的是「变一次追一次」。
  if (next && next.cols > 0 && next.rows > 0 && wasRound && (next.cols !== wasRound.cols || next.rows !== wasRound.rows)) {
    fitAndReport(false, true);
    return;
  }
  restoreViewportAfterRound();
}

// 口径 C 的后半段：把这一轮为了对齐而按到底部的视口还回去。
// 用户自己在翻历史 → 原样还他那一行（#33「resize 不抢位置」）；贴底 / 我们自己钉的 → 重钉一次画布下缘（#33「下缘是最后一条有内容的行」）。
function restoreViewportAfterRound(): void {
  const b = term?.buffer?.active;
  const saved = roundScrollLine;
  const ours = roundWasOurPin;
  roundScrollLine = null;
  roundWasOurPin = false;
  if (!term || !b) return;                       // 假终端：没有 buffer 就没有位置可还
  if (saved !== null && !ours) {
    const target = Math.min(saved, b.baseY);     // 行数变大时 baseY 会涨，那一行还在原来的绝对位置上
    if (target < b.baseY) term.scrollToLine(target);
    return;
  }
  revealLastContentLine();
}

// 把「最后一条还有内容的行」钉到画布底缘：伪控制台换完行列之后画布的下缘必然是它手里没有的空行（口径 ②：变大 = 在底下补空行），
// 不钉就是「全屏了还是只看到那几行，下面一片空」（#33 的用户读数）。往哪儿翻两头都要收住：不越过缓冲顶（clamp 到 0），也不把空行从画布**上缘**翻进来（见下面那条 while）。
// 判据不是「PTY 光标那一行」：那轮重绘末尾的 CUP 落在旧视口的最后一行上，换完行列之后那个绝对行号已经不是 PTY 光标的语义
// （取证台换序读数：baseY 17、光标绝对行 59、rows 43，按光标钉恰好钉回不动）。所以取「从画布底缘往上第一条有内容的行」。
function revealLastContentLine(): void {
  const b = term?.buffer?.active;
  if (!b || !term) return;
  const bottom = b.baseY + term.rows - 1;
  let last = bottom;
  for (; last >= b.baseY; last--) {
    const line = b.getLine(last);
    if (line && line.translateToString(true).trim() !== '') break;
  }
  if (last < b.baseY) return;                  // 画布里一条有内容的行都找不到 = 没什么可钉（clamp 到 0 会把人拽去看最早那一行）
  if (last === bottom) return;                 // 下缘本来就有内容（流式页签那种）= 不用钉
  let target = Math.max(0, last - term.rows + 1);
  // 往上翻是把空行压到画布下缘之外，但不能反过来在画布**上缘**造出一条空行。缓冲里内容不足一屏时那一翻就会翻过界：
  // #34 的 [清空终端] 之后正是这种画面（一行提示符 + 一整屏空行，baseY 1、rows 27、最后一条有内容的行是 14），
  // clamp 到 0 之后画布第一条就是那条空白、命令落在第 2 行 = 用户报的症状被这条钉自己造了出来
  // （探针读数：after=["", "PS …> ls && git st", …]，cmdIdx 1）。
  // 所以只翻到「那一屏顶上不是空行」的那一档，最多翻到贴底（baseY）。
  while (target < b.baseY) {
    const top = b.getLine(target);
    if (top && top.translateToString(true).trim() !== '') break;
    target++;
  }
  if (target < b.viewportY) {
    // 顺序要紧：scrollToLine 同步发 onScroll（那条会把 revealed 清掉），所以「钉上」写在它之后
    term.scrollToLine(target);
    revealed = true;
  }
}

// 输出入口（#33：它顺带是「这次重绘到了」的判据；#35：重绘分成几段送来，每一段喂进去之前都得先贴回镜像）
function writeOutput(data: string): void {
  if (!term) return;
  if (roundTarget) {                        // 这一轮在途：不再摆视口 —— 字节的落点是缓冲底缘（ybase），与视口停在哪无关
    term.write(data);                       // （探针实测：把 ydisp 挪到 14，那轮 ESC[H 仍整屏画在 baseY=20 那一段上）
    if (roundQuietTimer !== null) clearTimeout(roundQuietTimer);
    roundQuietTimer = setTimeout(endRound, ROUND_REPAINT_QUIET_MS);
    return;
  }
  // 这一屏是我们钉的 → 新输出继续钉着：先跟到底部（term.write 的解析在后面的宏任务里，此刻只能先到旧底部），
  // 解析完再由 write 的回调把「最后一条还有内容的行」钉回下缘。#33 那条口径不是只在让位时成立一次 ——
  // 让位之后伪控制台那几行补出来的空行还留在缓冲底下，只 scrollToBottom 的话下缘又回到空行里（实测：新输出落在画布中间、下面一片空）。
  // 用户自己划上去看历史时 revealed 已被 term.onScroll 清掉 → 这里什么都不摆，不抢位置。
  const follow = revealed;
  if (follow) {
    revealed = false;                       // 先撤账：write 里若有滚动，onScroll 之后由回调重新记账
    term.scrollToBottom();
  }
  term.write(data, follow ? revealLastContentLine : undefined);
}


// 首帧必须上报（索引 K11(2)）：主进程 start() 不带尺寸、按 80×24 兜底建 PTY，
// 不上报这一次，终端就一直按 80×24 排版。ResizeObserver 会多次回调，同尺寸不重复发；
// force = true 供上层在「同一页签再次启动」（PTY 被重建为 80×24）时强制再报一次。
function reportSize(cols: number, rows: number, force = false): boolean {
  if (cols <= 0 || rows <= 0) return false;
  if (!force && cols === reportedCols && rows === reportedRows) return false;   // 没发出去 = 伪控制台不会回那轮重绘
  reportedCols = cols;
  reportedRows = rows;
  props.onResize(props.id, cols, rows);
  return true;
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
// 拆行只做一次（审查轮）：「是不是多行」与正文里显示的行数必须来自同一次拆行，否则改了其中一处就会出现
// 「弹了框却写着 1 行」这类自相矛盾。三种行尾都认（LF / CRLF / 裸 CR），与既有判据口径一致。
const LINE_BREAK = /\r\n|\n|\r/;
const TRAILING_LINE_BREAK = new RegExp(LINE_BREAK.source + "$");
// 去掉**一个**尾部行尾（user story 9）之后按行尾拆：两行的命令批处理 → 长度 2；一行命令带一个回车 → 长度 1。
function pasteLines(text: string): string[] { return text.replace(TRAILING_LINE_BREAK, "").split(LINE_BREAK); }
function isMultilinePaste(text: string): boolean { return pasteLines(text).length > 1; }
const pasteConfirmMessage = computed(() =>
  t('ql.terminal.pasteConfirm.message', {
    // 行数 = 去掉一个尾部行尾后的正文行数（2 行的命令批处理就显示 2，不数那个尾部回车）
    lines: pendingPaste.value === null ? 0 : pasteLines(pendingPaste.value).length,
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
// 粘贴只有一条实现路径（票 #24 把它收成三条入口共用）；多行确认（票 #25）也加在这一条上。
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
//
// #34：清屏是两步，不是一步。xterm 的 clear() 只搬客户端那一屏（光标行抬到第 0 行、下面补空行），
// ConPTY 那侧对此一无所知 —— 它下一次重画输入行仍按**它自己那 27 行窗口的行号**发绝对定位
// （取证台实测：[清空终端] 后逐键敲 ls，PSReadLine 发来 ESC[27;34H），于是命令落在清空后缓冲的最后一行、
// 中间整片空白（复放读数：row0 = 清空前保留的那一行旧提示符、row1..25 全空、row26 = 新命令 —— 与用户贴的画布同一形态）。
// 让 shell 自己清屏才对得齐：Ctrl+L 之后伪控制台的光标回到窗口第 1 行，此后它的绝对定位与 xterm 同框
// （实测读数 ESC[1;35H / ESC[3;1H；复放这条空白块就没了）。这与 #33 同族（客户端状态 vs ConPTY 坐标框脱钩），但修法不同：
// 那边是换行列的先后，这边是清屏要不要让 shell 也清一次 —— 拿 resize 往返去逼 ConPTY 重绘会把旧内容画回来，等于撤销清空。
// 终端页签只可能来自 shell 条目（ql_start 对 exe 返回 tabId:null → App.vue 不建页签；GLOSSARY「快捷启动条目」也写明 exe 没有终端），
// 所以这颗按钮发往 PTY 的字节一定是喂给 shell 的，Ctrl+L 不会被别的程序读成别的东西。
// PTY 已停时不发这一字节：quick-launch.ts 的 write 对没有实例的 id 抛 STATE（App 那侧 catch 掉了没有界面后果，但没必要空跑一趟 IPC）。
function onClearTerminal(): void {
  if (!term) return;
  term.clear();
  resetSearchState();
  if (props.running) props.onInput(props.id, '\x0c');   // Ctrl+L：让 shell 自己清屏，它的坐标框跟着回到窗口第 1 行
}

// 工具条那颗进程态按钮（2026-10-20 两步用户要求：先 [x] → [停止]，再 [停止] → 停完变 [重新启动]）。
// 2026-10-24 用户要求把 [配色] 挪到那一排最右 → 它右边多一颗 [配色]，它不再是最后一颗（排内顺序见 <template>）。
// 判据与 QuickLaunch 列表行的状态按钮同源同口径（QuickLaunch.vue 的 stateOf/onToggle 是同一份 qlStates）：
// 运行中 → [停止]；未运行 → [重新启动]；在途（stopping，含 doQlStart 的启动探测在途）→ 「...」禁用。
const stateLabel = computed(() => (props.running ? t('ql.btn.stop') : t('ql.terminal.restart')));
const stateDisabled = computed(() => props.stopping || (!props.running && props.restartDisabled));

// 日志全屏那颗（票 #31 / ADR 0004）：文案与图标都跟着外壳那份态走，aria-label 与气泡同源（就是同一份 t() 的结果）。
// 词典 log.fullscreen.enter / log.fullscreen.exit 中英同批齐全；响应式 t() → 切语言当场重译，不冻结。
// 三个页签共用同一个态：本组件只上报「翻一下」，翻不翻、上区让不让位都归外壳（App 持有）。
const fullscreenLabel = computed(() => (props.fullscreen ? t('log.fullscreen.exit') : t('log.fullscreen.enter')));
function onToggleFullscreen(): void { emit('toggle-fullscreen'); }

// 重新启动之前把这块画布整个换新（#37「[停止] → [重新启动] 之后，画布上仍是重启前跑过的命令」）。
// 为什么必须有这一步：页签与它的 xterm 缓冲在「停止 → 重新启动」之间是**保活**的（LogPanel 的 v-show + 规格 §7.5「页签保留」），
// 而对侧换成了一个**全新的伪控制台** —— 它只重画自己那一屏，既不知道客户端攒着多少历史，也没有能力删：
// 取证台实测四款终端（pwsh / powershell / cmd / wsl）新建 PTY 的第一段都是 16B「ESC[?9001h ESC[?1004h」（t=40~310ms，与 #36 同源），
// 紧随「ESC[2J + home + 横幅 + 提示符」—— **有 ESC[2J、没有 ESC[3J**；而 xterm 5.5.0 的 ESC[2J 只把「视口那 rows 行」抹平
// （InputHandler.eraseInDisplay case 2 → _resetBufferLine(j) 取的是 lines.get(**ybase** + y)），视口之上的历史一条不动
// （真删历史的是 case 3 = ESC[3J，新会话从不发这一条）。再叠上尺寸那一拍（PTY 重建为 80×24 → App 的 fit(true) 强制重报 →
// 一整屏重绘落在缓冲底缘，把底缘往下顶一整屏）：每重启一次，缓冲里就多**一段**新会话的屏，旧那段的横幅与提示符留在上面
// = 用户贴的那一串「PS ... > ls」。画布上多出来那一截空白是同一脱钩的另一头（ADR 0005 / 0006 那一族）。
//
// 这一拍只碰客户端（xterm 的 reset() 自己会补一发焦点报告，见下面 reset() 那两行）：ADR 0005 那两步在这里只剩「客户端清缓冲」这半 —— 对面那个伪控制台是刚建的，
// 它那一屏本来就是空的、行号本来就在窗口第 1 行，不需要也不该再补一发 Ctrl+L：新 shell 还没开始读行，写进去的字节会撞上
// #36 那一格（规范模式下被内核回显一遍）。
//
// 为什么是 reset() 而不是 clear()（[清空终端] 那颗用的是后者）：clear() 把**光标那一行**留作第 0 行
// （@xterm/xterm 5.5.0 browser/Terminal.ts:1224-1231），留下的正是旧会话最后那条提示符 —— 正是这张票要清掉的东西。
// reset() 才是「客户端整块换新」：缓冲与滚动历史、DEC 模式、查找装饰、选区一并归零，与对面那个全新的 PTY 对等。
// 它不重建服务（同文件 :1253-1268 只走 _setup() 的 windowsPty 那一支，并把自定义键盘处理器接回去），
// 所以三个 addon（fit / search / web-links）与构造参数 windowsPty 一条不少。
function clearForRestart(): void {
  if (!term) return;
  // 一轮在途的账作废：对面换了，那一轮的整屏重绘永远不会再来
  clearRoundTimers();
  roundTarget = null;
  roundScrollLine = null;
  roundWasOurPin = false;
  // 顺带如实登记：reset() 会带出一发**焦点报告**字节（开着 ESC[?1004h 时进出焦点发 ESC[I / ESC[O，
  // @xterm/xterm 5.5.0 browser/Terminal.ts:295 / :1283）。组件不拦它（那要改 onData 那条契约），因为清画布这一拍
  // 对侧没有进程 —— App.vue 的 terminalWritable 把它挡在 IPC 之前，ql_write 一次都不会发（门在 App.test.ts）。
  term.reset();
  resetSearchState();   // 缓冲清空 = 既有匹配一并消失，计数与高亮跟着复位（与 onClearTerminal 同一口径）
}

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
  // windowsPty（#35 / ADR 0006）：向 xterm 声明「对面那个 PTY 是 ConPTY」。只报 backend、故意不报 buildNumber。
  // 为什么这一页签对面必然是 ConPTY：本应用只出 Windows 包（electron-builder.yml:36 win: target: portable），页签对面的 PTY
  // 只有一个来源 = 主进程 node-pty 的 pty.spawn（quick-launch.ts:168-178，shellExe 全是 pwsh / powershell / cmd / wsl），Windows 上它就是
  // ConPTY；提权页签那条也一样（host 进程内部同样 pty.spawn，ql-pty-host.ts:210）。
  // 它只翻转一处行为：xterm 行数变大时是在缓冲**底下补空行**（与伪控制台「变大 = 在底下补空行」同向，见上面尺寸那段的读数 ②），
  // 而不是按光标行号把滚动缓冲里的历史拉进视口（@xterm/xterm 5.5.0 common/buffer/Buffer.ts:180-183，库自己的理由：
  // "conpty reprints the screen with it's view of the world. Once a line enters scrollback for conpty it remains there"）。
  // 少了它，grow 那轮整屏重绘会把刚被拉进视口的历史盖成空行（#33 实测：buffer 37→43 = 10 行尾段 + 33 行空，[恢复] 之后历史永久没了）。
  // 故意不给 buildNumber：它一旦有值就顺带开两件事 —— ① buildNumber < 21376 时启用 windowsMode 那套换行启发式（CoreTerminal.ts:259-271），
  // 而 InputHandler.ts:721-725 明确写着 ConPTY 该关掉它（"windowsMode should be disabled, which is recommended on Windows build 21376 and above"）；
  // ② 按 buildNumber 决定列数变化要不要 reflow（Buffer.ts:292-298）。这两件都会让整屏重绘的行落点更难算；只报 backend 时 xterm 5.5.0 两处都保持关闭。
  term = new Terminal({ scrollback: 5000, fontSize: 13, fontFamily: "'Cascadia Code', Consolas, monospace", allowProposedApi: true, rightClickSelectsWord: false, windowsPty: { backend: 'conpty' }, theme: { ...shownPaletteOf.value.theme } });
  fitAddon = new FitAddon();
  searchAddon = new SearchAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(searchAddon);
  term.loadAddon(new WebLinksAddon((_e, uri) => openLink(uri)));
  term.open(el);
  term.onData((data) => props.onInput(props.id, data));
  // #33：钉住的那一屏只归我们钉。滚位一旦不是这条钉造成的（用户自己划上去看历史）就交还给他 ——
  // 下一条输出不该把他从历史里拽回底部（门：the_pin_lets_go_as_soon_as_the_user_moves_the_scroll_position_himself，
  // 与「a_user_who_had_scrolled_up_is_not_moved_by_the_grow」同一口径）。
  term.onScroll(() => {
    revealed = false;
    // 一轮在途时用户自己把视口挪走（一只手按着边框拖、另一只手滚轮是常见姿势）：把他此刻那一行记进这一轮的账，
    // 轮末由 restoreViewportAfterRound 原样还他。门 = drag 的 a_scroll_by_the_user_while_a_round_is_in_flight_…，
    // 三个变异各自都让它红（读数 11 → 0 = 轮末按「我们自己钉的」重钉，他翻的历史被悄悄换成底部）：
    //   ① 整支摘掉；② 去掉「顺带覆盖 roundWasOurPin」；③ 退回「只在没记过时才记」。
    // ②③ 为什么要**覆盖**：拖一趟里 endRound 会一格一格追下一轮，他可能在我们贴底之后接着往上划 —— 记的得是他
    // 最新停的那一行；而且他从那一钉上接手了，轮末就不该再按我们的口径重钉。
    // 我们自己那几次摆视口不会误记进这一支：贴底跑在 armRound 之前（roundTarget 还没立起来），还位置与重钉下缘
    // 都跑在 endRound 把 roundTarget 清空之后。所以这里不需要「程序化滚动」标志位（加上去没有任何门会红，实测）。
    if (roundTarget) {
      const b = term?.buffer?.active;
      if (b) {
        roundScrollLine = b.viewportY >= b.baseY ? null : b.viewportY;
        roundWasOurPin = false;
      }
    }
  });
  term.attachCustomKeyEventHandler(onCustomKey);
  // 票 #22：选区变化事件 = 「鼠标选区」那份态的唯一驱动（查找在途的那一拍不算，见 withProgrammaticSelection）
  term.onSelectionChange(() => {
    hasMouseSelection.value = programmaticSelection ? false : !!term?.hasSelection();
  });
  searchAddon.onDidChangeResults((r) => {
    searchCount.value = { cur: r.resultIndex < 0 ? 0 : r.resultIndex + 1, total: r.resultCount };
  });
  props.register(props.id, writeOutput);
  observer = new ResizeObserver(() => fitAndReport());
  observer.observe(el);
  fitAndReport();
});

onBeforeUnmount(() => {
  closePalettePop();   // 浮层挂在 window 上的两个监听必须跟着组件走（v-show 卸载即注销）
  props.unregister(props.id);
  clearRoundTimers();
  roundTarget = null;
  roundScrollLine = null;
  roundWasOurPin = false;
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
  clearForRestart: (): void => clearForRestart(),
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
      <!-- 日志全屏那颗（票 #31 / ADR 0004）：这一行**新的**最右颗，[配色] 退为次右——吸行内剩余空间的 auto margin
           仍留在 [配色] 身上，所以排内 DOM 顺序仍然等于视觉顺序，两颗都没有另加 margin。
           盒 24×24 沿用那一族（style.css 里那段 24px 族的取证理由一条不改：盒高一变，tooltip 锚点就跟着偏，
           [配色] 已经为这件事返工过三轮）。图标：[全屏] = solid up-right-and-down-left-from-center、
           [恢复] = solid down-left-and-up-right-to-center（两个面各自注册，同 [x] 那颗的先例）。
           三个页签都有这颗、位置一致：静态日志页签那一排没有 [配色]，由 LogTabView 那份自己贴行右缘（style.css）。
           本组件不持有这个态：点一下只上报外壳（App 持有一份，切页签不丢）。 -->
      <button type="button" class="icon-btn icon-btn--noborder btn-log-fullscreen"
        :aria-label="fullscreenLabel" :data-tooltip="fullscreenLabel" @click="onToggleFullscreen">
        <FontAwesomeIcon :icon="fullscreen ? ['fas', 'down-left-and-up-right-to-center'] : ['fas', 'up-right-and-down-left-from-center']" />
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
