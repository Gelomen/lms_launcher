// @vitest-environment node
// 宽度预算截断（2026-08-26 spec）：CJK=2 / 拉丁=1；累计恰好等于 budget 不截断，超则取前 k 字 + …。
import { describe, it, expect } from 'vitest';
import { charWidth, visualWidth, truncateByWidth } from './truncate';

describe('charWidth / visualWidth', () => {
  it('cjk_char_is_2_latin_is_1', () => {
    expect(charWidth('中')).toBe(2);
    expect(charWidth('a')).toBe(1);
    expect(charWidth('3')).toBe(1);
    expect(charWidth('.')).toBe(1);
  });
  it('fullwidth_chars_count_as_2', () => {
    expect(charWidth('Ａ')).toBe(2);   // Ａ (ff21 fullwidth)
    expect(charWidth('、')).toBe(2);   // CJK punctuation
  });
  it('visual_width_sums', () => {
    expect(visualWidth('中文中文中文中文')).toBe(16); // 8 CJK × 2
    expect(visualWidth('Qwen3.8-27B-Ridge')).toBe(17);
    expect(visualWidth('中文abc')).toBe(7);           // 中=2 文=2 + a/b/c=3
  });
});

describe('truncateByWidth', () => {
  it('fits_exactly_budget_no_truncation', () => {
    expect(truncateByWidth('中文中文中文中文', 16)).toBe('中文中文中文中文'); // exactly 16 → untouched (Chinese parity)
    expect(truncateByWidth('qwen-model-name', 16)).toBe('qwen-model-name'); // 15 latin ≤ 16
  });
  it('one_char_over_budget_truncates_prefix_plus_ellipsis_(strict_grace0)', () => {
    const s = '中文中文中文中文a'; // width 17 → 默认 grace=2 下不手动截（交 CSS）；grace=0 严格模式 → first 8 CJK + …
    expect(truncateByWidth(s, 16)).toBe(s); // grace=2 default
    expect(truncateByWidth(s, 16, 0)).toBe('中文中文中文中文…');
    const latin = 'Qwen3.8-27B-Ridge-2'; // width 19 > 16 → prefix of 16 latin chars + …
    expect(truncateByWidth(latin, 16)).toBe(latin.slice(0, 16) + '…');
  });
  it('mixed_width_budget_cuts_on_real_width', () => {
    // 2 CJK (w=4) + 13 拉丁 = 宽 17 > 16；默认 grace=2 → 全量（交 CSS）；grace=0 严格 → 恰好 16（2 CJK + 12 拉丁）+ …
    const s = '中文' + 'a'.repeat(13);
    expect(truncateByWidth(s, 16)).toBe(s);
    expect(truncateByWidth(s, 16, 0)).toBe('中文' + 'a'.repeat(12) + '…');
  });
  it('over_budget_by_at_most_grace_returns_full_no_manual_ellipsis', () => {
    // 用户复报：Qwen3.8-27B-Ridge（宽 17）只超 1 宽度 → 全量渲染、不手动 +…；
    // 是否出 … 交给 CSS text-overflow（按实际像素，余量比估算预算大）
    const s = 'Qwen3.8-27B-Ridge'; // width 17 > 16, ≤ 16+2
    expect(visualWidth(s)).toBe(17);
    expect(truncateByWidth(s, 16)).toBe(s); // grace=2 default: untouched, no …
  });
  it('over_budget_more_than_grace_still_truncates_manually', () => {
    const s = 'Qwen3.8-27B-Ridge-instruct'; // width 24 > 16+2 → manual prefix + …
    expect(truncateByWidth(s, 16)).toBe(s.slice(0, 16) + '…');
  });
  it('grace_0_restores_strict_budget', () => {
    const s = 'Qwen3.8-27B-Ridge'; // width 17 > 16 → strict: cut now
    expect(truncateByWidth(s, 16, 0)).toBe('Qwen3.8-27B-Ridg…');
  });
  it('short_string_untouched', () => {
    expect(truncateByWidth('日常', 16)).toBe('日常');
    expect(truncateByWidth('abc', 16)).toBe('abc');
  });
});
