// src-main/term-palettes.ts
// 终端配色（TerminalPalette）的 id 真源（spec #12 / ADR 0001 / GLOSSARY「终端配色」）。
// 六个 id 从此是**对外契约**（ADR:13）：改名要做兼容或迁移，所以新增一档先改这里，再谈界面。
// 颜色不在本文件：主进程只判 id 合法性与缺省，颜色表在渲染端 src/modules/term-palettes.ts
// （依赖方向只允许渲染端 → 主进程，与 quick-launch-config 的条目形状同一口径）。

/** 六档预设 = 只有这六个 id，不是可扩展枚举（GLOSSARY:18）。 */
export type TermPaletteId = 'paper' | 'console' | 'warm-paper' | 'charcoal' | 'campbell' | 'warm-night';

// 数组顺序 = 选择器的分组顺序：三档明底在前、三档暗底在后（票 #14 的浮层、票 #15 的色块行都按它排）。
export const TERM_PALETTE_IDS: readonly TermPaletteId[] = ['paper', 'console', 'warm-paper', 'charcoal', 'campbell', 'warm-night'];

// 缺省档 = 纯白（与静态日志页签同底同字色）。「界面只负责选，不负责判缺省」（GLOSSARY:19），
// 所以缺省值只在这里定义一次：落盘侧缺键/非法值回落到它，渲染端未知 id 也回落到它。
export const TERM_PALETTE_DEFAULT: TermPaletteId = 'paper';

/** id 校验（形状照 quick-launch-config.ts 里那个导出的 isTerminalId，不按行号锚——本仓加代码会把行号推偏）：非字符串 / 表外值一律 false。 */
export function isTermPaletteId(value: unknown): value is TermPaletteId {
  return typeof value === 'string' && (TERM_PALETTE_IDS as readonly string[]).includes(value);
}
