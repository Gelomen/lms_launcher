// src/modules/term-palettes.ts
// 终端配色（TerminalPalette）的颜色表 = 渲染端真源（spec #12 的 Implementation Decisions / ADR 0001 / 票 #13）。
// id 与缺省不在这里：真源是 src-main/term-palettes.ts（落盘校验与回落靠它），本文件只给每个 id 挂颜色。
// 依赖方向只有渲染端 → 主进程（与 src/i18n.ts:3 引同一份词典同一口径）。
//
// 六档 = 三种立场 × 明底/暗底（hex 逐值取已被用户验收的一次性原型 .scratch/term-theme-prototype/，
// 那里的标识符 termTheme / TERM_THEME_* 是过期命名，本文件一律改 palette 命名 —— GLOSSARY 的 _Avoid_ 排除「主题」）：
//   paper / charcoal        「与日志区同一张纸」：底色与日志页签同族，切页签零跳变，色相全取应用既有色族
//   console / campbell      「终端是另一块台面」：ANSI 忠于真机控制台，程序吐出的颜色与外部一致
//   warm-paper / warm-night 「柔光大地色」：把日志区 error/warn/ok 那套低饱和色系延伸到底色，久看不刺眼
// 暗底三档不是简单反色：ANSI 槽按暗底重新配平（浅底上「bright = 加深」，暗底上「bright = 提亮」）。
import { TERM_PALETTE_DEFAULT, isTermPaletteId, type TermPaletteId } from '../../src-main/term-palettes';

/** xterm 的可着色槽位（16 色 ANSI + 底色/字色/光标/选区）：槽名就是 @xterm/xterm 的 ITerminalOptions.theme 键名。 */
export type TermColorSlot =
  | 'background' | 'foreground' | 'cursor' | 'cursorAccent'
  | 'selectionBackground' | 'selectionForeground'
  | 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white'
  | 'brightBlack' | 'brightRed' | 'brightGreen' | 'brightYellow' | 'brightBlue'
  | 'brightMagenta' | 'brightCyan' | 'brightWhite';

/**
 * 一档配色 = 终端画布的完整着色说明。四件东西必须同处一行，换档才不会出现「底色换了、查找高亮还是淡紫」
 * （spec 的结构性同源门就钉这一点，见 TerminalTabView.test.ts）。
 * dark = 供外围 UI 决定怎么衬托这块画布，也是票 #14 浮层「明底 / 暗底」分组的依据。
 * canvasBorder = 画布描边（.term-view 的 outline）：让「比卡片深一档 / 浅一档」的画布读作有意为之。
 */
export interface TermPalette {
  id: TermPaletteId;
  dark: boolean;
  canvasBorder: string;
  /** addon-search 的高亮四值（原实现里是硬编码的两档淡紫，换配色必须一起换） */
  decorations: { matchBackground: string; activeMatchBackground: string; matchOverviewRuler: string; activeMatchColorOverviewRuler: string };
  theme: Partial<Record<TermColorSlot, string>>;
}

// ---- 明底三档 ----

/** paper：纯白，与静态日志页签同底同字色。色相全部取自 style.css 既有令牌，不引入新色值。缺省档。 */
const paper: TermPalette = {
  id: 'paper', dark: false, canvasBorder: 'transparent',
  theme: {
    background: '#FFFFFF', foreground: '#3B4252',
    cursor: '#8B5CF6', cursorAccent: '#FFFFFF',
    selectionBackground: '#E9D5FF', selectionForeground: '#222222',
    black: '#3B4252', red: '#D63E0A', green: '#557C1F', yellow: '#B27500',
    blue: '#3B82F6', magenta: '#8B5CF6', cyan: '#0E7490', white: '#6B7280',
    brightBlack: '#7A8194', brightRed: '#EF4444', brightGreen: '#16A34A', brightYellow: '#B45309',
    brightBlue: '#2563EB', brightMagenta: '#7C3AED', brightCyan: '#0E9384', brightWhite: '#9CA3AF',
  },
  decorations: { matchBackground: '#E9D5FF', activeMatchBackground: '#C4B5FD', matchOverviewRuler: '#8B5CF6', activeMatchColorOverviewRuler: '#8B5CF6' },
};

/** console：浅灰底（= 应用已有的 hover/页签灰），画布靠描边坐实。16 槽按浅底重新配过，只有部分与 campbell 同值。档名不叫「画布」——GLOSSARY 那词条的 _Avoid_ 里「画布」不指这六档。 */
const consolePalette: TermPalette = {
  id: 'console', dark: false, canvasBorder: 'var(--border)',
  theme: {
    background: '#F6F7F8', foreground: '#222222',
    cursor: '#8B5CF6', cursorAccent: '#FFFFFF',
    selectionBackground: '#DBEAFE', selectionForeground: '#222222',
    black: '#0C0C0C', red: '#C50F1F', green: '#0E7A0E', yellow: '#9A6A00',
    blue: '#0037DA', magenta: '#881798', cyan: '#0F7C9E', white: '#CCCCCC',
    brightBlack: '#767676', brightRed: '#E74856', brightGreen: '#16A34A', brightYellow: '#A87F14',
    brightBlue: '#057AEC', brightMagenta: '#B14FC0', brightCyan: '#2C87A6', brightWhite: '#E5E5E5',
  },
  decorations: { matchBackground: '#DBEAFE', activeMatchBackground: '#BFDBFE', matchOverviewRuler: '#3B82F6', activeMatchColorOverviewRuler: '#2563EB' },
};

/** warm-paper：暖白纸底 + 低饱和大地色 ANSI（日志区那套柔光色的延伸）。 */
const warmPaper: TermPalette = {
  id: 'warm-paper', dark: false, canvasBorder: 'var(--border)',
  theme: {
    background: '#FBF7EF', foreground: '#44403C',
    cursor: '#8B5CF6', cursorAccent: '#FFFFFF',
    selectionBackground: '#F1E4C8', selectionForeground: '#33302B',
    black: '#3F3A33', red: '#B4462F', green: '#5F7226', yellow: '#9A6A0B',
    blue: '#3E6C9E', magenta: '#7C5A9E', cyan: '#2E7D74', white: '#A8A093',
    brightBlack: '#8A8378', brightRed: '#D6603F', brightGreen: '#7E9438', brightYellow: '#9C7617',
    brightBlue: '#5B8BBE', brightMagenta: '#A855F7', brightCyan: '#3D8C81', brightWhite: '#C4BCAE',
  },
  decorations: { matchBackground: '#F1E4C8', activeMatchBackground: '#E3C99A', matchOverviewRuler: '#8B5CF6', activeMatchColorOverviewRuler: '#8B5CF6' },
};

// ---- 暗底三档（与上面同一套立场）----

/** charcoal：paper 的暗底镜像——同一应用色族的深色档，画布与卡片靠明度差成形。 */
const charcoal: TermPalette = {
  id: 'charcoal', dark: true, canvasBorder: 'transparent',
  theme: {
    background: '#1B2027', foreground: '#E4E8EF',
    cursor: '#8B5CF6', cursorAccent: '#FFFFFF',
    selectionBackground: '#3D3357', selectionForeground: '#F3F0FA',
    black: '#5B6472', red: '#E4674F', green: '#86B84A', yellow: '#D9A21B',
    blue: '#6FA8FF', magenta: '#A78BFA', cyan: '#3FB6CE', white: '#C6CBD4',
    brightBlack: '#8A93A3', brightRed: '#F19483', brightGreen: '#B4D36A', brightYellow: '#E9C46A',
    brightBlue: '#9CC2FF', brightMagenta: '#C4B5FD', brightCyan: '#7FD7E8', brightWhite: '#F3F5F8',
  },
  decorations: { matchBackground: '#3D3357', activeMatchBackground: '#5B4A80', matchOverviewRuler: '#A78BFA', activeMatchColorOverviewRuler: '#C4B5FD' },
};

/**
 * campbell：Windows Terminal 默认配色（Campbell）逐值照搬——外部控制台什么样，这里就什么样。
 * 逐值一致的范围 = 16 个 ANSI 槽 + background/foreground + cursor + selectionBackground
 * （官方 Campbell 块还带 cursorColor #FFFFFF 与 selectionBackground #FFFFFF 两槽，审查轮据此把表里的
 * #EDEDED 改回 #FFFFFF —— 之前那行注释误称「官方块没有 selectionBackground」）；
 * 只有 cursorAccent / selectionForeground / decorations / canvasBorder 是本仓自定（官方块没有），不进那条门。
 */
const campbell: TermPalette = {
  id: 'campbell', dark: true, canvasBorder: '#3B3B3B',
  theme: {
    background: '#0C0C0C', foreground: '#CCCCCC',
    cursor: '#FFFFFF', cursorAccent: '#0C0C0C',
    selectionBackground: '#FFFFFF', selectionForeground: '#0C0C0C',
    black: '#0C0C0C', red: '#C50F1F', green: '#13A10E', yellow: '#C19C00',
    blue: '#0037DA', magenta: '#881798', cyan: '#3A96DD', white: '#CCCCCC',
    brightBlack: '#767676', brightRed: '#E74856', brightGreen: '#16C60C', brightYellow: '#F9F1A5',
    brightBlue: '#3B78FF', brightMagenta: '#B4009E', brightCyan: '#61D6D6', brightWhite: '#F2F2F2',
  },
  decorations: { matchBackground: '#5B3E9E', activeMatchBackground: '#8B5CF6', matchOverviewRuler: '#8B5CF6', activeMatchColorOverviewRuler: '#8B5CF6' },
};

/** warm-night：warm-paper 的暗底镜像——暖褐夜幕 + 同一套低饱和大地色。 */
const warmNight: TermPalette = {
  id: 'warm-night', dark: true, canvasBorder: '#3A342A',
  theme: {
    background: '#262119', foreground: '#E8E1D3',
    cursor: '#8B5CF6', cursorAccent: '#FFFFFF',
    selectionBackground: '#4A3F2C', selectionForeground: '#F5EFE2',
    black: '#6E6558', red: '#D9705A', green: '#94A94C', yellow: '#C99A2E',
    blue: '#6E9BC7', magenta: '#B48CD1', cyan: '#5FA89E', white: '#C4BCAE',
    brightBlack: '#8A8378', brightRed: '#E89A86', brightGreen: '#B7C878', brightYellow: '#E0BE6B',
    brightBlue: '#93B8DC', brightMagenta: '#CBA9E4', brightCyan: '#8CC7BE', brightWhite: '#EFE9DE',
  },
  decorations: { matchBackground: '#6E5A34', activeMatchBackground: '#9C7F45', matchOverviewRuler: '#8B5CF6', activeMatchColorOverviewRuler: '#8B5CF6' },
};

/** 六档全表。票 #14 的浮层行与票 #15 的色块行都从这一张表取色（预览与落盘因此永远一致）。 */
export const TERM_PALETTES: Readonly<Record<TermPaletteId, TermPalette>> = {
  paper, console: consolePalette, 'warm-paper': warmPaper,
  charcoal, campbell, 'warm-night': warmNight,
};

/** 取值：未知 id / 缺省 → 默认档（渲染端不抛错，防御在 IPC 边界做，见 main.ts 的 ql_set_palette）。 */
export function termPaletteOf(id: string | null | undefined): TermPalette {
  return TERM_PALETTES[isTermPaletteId(id) ? id : TERM_PALETTE_DEFAULT];
}
