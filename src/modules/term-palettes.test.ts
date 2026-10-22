// @vitest-environment node
// src/modules/term-palettes.test.ts —— 终端配色的**颜色表门**（spec #12 / 票 #13）。
// 六档 = 每档一份 xterm theme + 查找 decorations + 画布描边 + 明暗标记；hex 逐值取已被用户验收的
// 一次性原型 .scratch/term-theme-prototype/term-themes-renderer.ts（标识符一律按 GLOSSARY 改 palette 命名）。
// 本文件只管数据本身：档数与明暗分组、xterm 槽位齐全、未知 id 回落 paper、campbell 忠于外部真源。
// 「theme 与查找 decorations 必须取自同一张表」那条结构性门在 TerminalTabView.test.ts ——
// 只有对着组件断才咬得住「某个 hex 被单独硬编码回去」（搜索高亮曾就是硬编码淡紫）。
import { describe, it, expect } from 'vitest';
import { TERM_PALETTES, termPaletteOf } from './term-palettes';
import { TERM_PALETTE_DEFAULT, TERM_PALETTE_IDS } from '../../src-main/term-palettes';
import { dict } from '../../src-main/i18n/dict';

// xterm 的可着色槽位（= @xterm/xterm 5.5.0 的 ITerminalOptions.theme 键名，外部契约，故写在这里而不是从被测模块取）
const XTERM_THEME_SLOTS = [
  'background', 'foreground', 'cursor', 'cursorAccent', 'selectionBackground', 'selectionForeground',
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
] as const;
const DECORATION_KEYS = ['matchBackground', 'activeMatchBackground', 'matchOverviewRuler', 'activeMatchColorOverviewRuler'] as const;
const HEX = /^#[0-9A-F]{6}$/;

describe('term-palettes.ts · 六档预设的形状', () => {
  it('ids_and_the_table_agree_and_group_three_light_then_three_dark', () => {
    // id 真源 = src-main/term-palettes.ts；这里只断「表与清单同键同序」+ 三明三暗（票 #14 的浮层按 dark 分组）
    expect(Object.keys(TERM_PALETTES)).toEqual([...TERM_PALETTE_IDS]);
    const dark = TERM_PALETTE_IDS.filter((id) => TERM_PALETTES[id].dark);
    const light = TERM_PALETTE_IDS.filter((id) => !TERM_PALETTES[id].dark);
    expect(dark).toEqual(['charcoal', 'campbell', 'warm-night']);
    expect(light).toEqual(['paper', 'console', 'warm-paper']);
  });

  it('every_palette_fills_every_xterm_theme_slot_with_a_hex', () => {
    for (const id of TERM_PALETTE_IDS) {
      const theme = TERM_PALETTES[id].theme as Record<string, string | undefined>;
      for (const slot of XTERM_THEME_SLOTS) {
        expect(theme[slot], `${id}.${slot}`).toMatch(HEX);
      }
      // 表里不得有多余槽位（写错槽名 = xterm 静默忽略，只有这条门能发现）
      expect(Object.keys(theme).sort()).toEqual([...XTERM_THEME_SLOTS].sort());
    }
  });

  it('every_palette_carries_four_search_decorations_and_a_canvas_border', () => {
    for (const id of TERM_PALETTE_IDS) {
      const p = TERM_PALETTES[id];
      for (const key of DECORATION_KEYS) {
        expect(p.decorations[key], `${id}.decorations.${key}`).toMatch(HEX);
      }
      expect(Object.keys(p.decorations).sort()).toEqual([...DECORATION_KEYS].sort());
      // 描边三种合法写法：不画（transparent）/ 应用令牌（var(--border)）/ 字面 hex
      expect(p.canvasBorder, `${id}.canvasBorder`).toMatch(/^(transparent|var\(--border\)|#[0-9A-F]{6})$/);
      expect(p.id).toBe(id);
    }
  });
});

describe('term-palettes.ts · 取值与颜色真源', () => {
  it('unknown_or_missing_id_falls_back_to_the_default_palette_object', () => {
    for (const bad of ['bogus', '', 'PAPER', 'term-theme', null, undefined]) {
      expect(termPaletteOf(bad)).toBe(TERM_PALETTES[TERM_PALETTE_DEFAULT]);
    }
    expect(TERM_PALETTES[TERM_PALETTE_DEFAULT].theme.background).toBe('#FFFFFF');
    expect(termPaletteOf('charcoal')).toBe(TERM_PALETTES['charcoal']);
  });

  // 用户故事 3：「控制台深黑逐值等于 Windows Terminal 默认配色」。官方值 = 独立真源
  // （Microsoft Learn · Windows Terminal Color Schemes 的 Campbell 块），不是从被测表里抄回来的。
  // 官方块（Microsoft Learn 那段）除了 16 个 ANSI 槽，还带 cursorColor / selectionBackground 两槽 —— 两槽都进这条门。
  // 审查轮纠正：本注释曾写「selectionBackground 不属于 Campbell」，与官方块不符（官方给的是 #FFFFFF），
  // 于是表里那个 #EDEDED 是无人认领的自定值。现按官方取 #FFFFFF。
  // 真正不在官方块里的只有 cursorAccent / selectionForeground / decorations / canvasBorder = 本仓自定，不进这条门。
  it('campbell_is_the_windows_terminal_campbell_scheme_value_for_value', () => {
    expect(TERM_PALETTES['campbell'].theme).toMatchObject({
      background: '#0C0C0C', foreground: '#CCCCCC', cursor: '#FFFFFF',
      black: '#0C0C0C', red: '#C50F1F', green: '#13A10E', yellow: '#C19C00',
      selectionBackground: '#FFFFFF',
      blue: '#0037DA', magenta: '#881798', cyan: '#3A96DD', white: '#CCCCCC',
      brightBlack: '#767676', brightRed: '#E74856', brightGreen: '#16C60C', brightYellow: '#F9F1A5',
      brightBlue: '#3B78FF', brightMagenta: '#B4009E', brightCyan: '#61D6D6', brightWhite: '#F2F2F2',
    });
  });

  // 术语门：GLOSSARY「终端配色（TerminalPalette）」的 _Avoid_ 列了「主题」「皮肤」「风格」「画布」——
  // 这些词都不指这六档。上一轮里 console 那档的 zh 名「浅灰画布」/ en 'Light grey canvas' 就是撞了「画布」
  // （ADR 0001 里「画布」只指那块着色区，不能拿来当档名），靠这条门打回来。
  it('six_palette_display_names_obey_the_glossary_avoid_list', () => {
    const banned = ['主题', '皮肤', '风格', '画布', 'theme', 'skin', 'style', 'canvas'];
    for (const id of TERM_PALETTE_IDS) {
      for (const lang of ['zh', 'en'] as const) {
        const name = dict[lang][`ql.palette.${id}`];
        for (const word of banned) {
          expect(name.toLowerCase(), `ql.palette.${id} (${lang}) = ${name}`).not.toContain(word.toLowerCase());
        }
      }
    }
  });

  // paper = 迁移前生产代码里查找高亮的那四值（TerminalTabView.vue 曾硬编码淡紫）：换表不得改变默认档的观感
  it('paper_keeps_the_search_highlight_the_toolbar_shipped_before', () => {
    expect(TERM_PALETTES['paper'].decorations).toEqual({
      matchBackground: '#E9D5FF', activeMatchBackground: '#C4B5FD',
      matchOverviewRuler: '#8B5CF6', activeMatchColorOverviewRuler: '#8B5CF6',
    });
  });
});
