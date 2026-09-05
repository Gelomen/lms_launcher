// 日志查找纯函数测试（规格 2026-09-05-log-search-design §纯函数）：
// findMatches 单行区间（大小写不敏感、非重叠、空 query 空数组）；
// splitLineForSearch 分段（文本还原、链接内高亮、当前匹配标记、无 query 时 = linkify 映射）。
import { describe, it, expect } from 'vitest';
import { findMatches, splitLineForSearch } from './log-search';

describe('findMatches', () => {
  it('single_match_returns_range', () => {
    expect(findMatches('hello error world', 'error')).toEqual([{ start: 6, end: 11 }]);
  });
  it('case_insensitive', () => {
    expect(findMatches('Error: fatal ERROR', 'error')).toEqual([{ start: 0, end: 5 }, { start: 13, end: 18 }]);
  });
  it('repeated_non_overlapping', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([{ start: 0, end: 2 }, { start: 2, end: 4 }]);
  });
  it('no_match_and_empty_query_return_empty', () => {
    expect(findMatches('abc', 'z')).toEqual([]);
    expect(findMatches('abc', '')).toEqual([]);
  });
  it('query_with_spaces_matches_literally', () => {
    expect(findMatches('a b c', 'a b')).toEqual([{ start: 0, end: 3 }]);
  });
});

describe('splitLineForSearch', () => {
  it('no_query_segments_equal_linkify_mapping', () => {
    const segs = splitLineForSearch('open https://x.com/a now', '', null);
    expect(segs.map(s => s.text).join('')).toBe('open https://x.com/a now');
    expect(segs.find(s => s.inLink)?.url).toBe('https://x.com/a');
    expect(segs.every(s => !s.mark && !s.current)).toBe(true);
  });
  it('marks_split_plain_text_and_text_reconstructs_line', () => {
    const segs = splitLineForSearch('hello error world', 'error', null);
    expect(segs.map(s => s.text).join('')).toBe('hello error world');
    expect(segs.filter(s => s.mark)).toEqual([{ text: 'error', inLink: false, mark: true, current: false }]);
  });
  it('match_inside_link_segment_keeps_link_and_marks', () => {
    const line = 'see https://docs.example.com/err guide';
    const segs = splitLineForSearch(line, 'docs', null);
    expect(segs.map(s => s.text).join('')).toBe(line);
    const marked = segs.find(s => s.mark && s.inLink);
    expect(marked?.text).toBe('docs');
    expect(marked?.url).toBe('https://docs.example.com/err');
    // 未命中部分仍是可点击链接段
    expect(segs.filter(s => s.inLink).every(s => s.url === 'https://docs.example.com/err')).toBe(true);
  });
  it('current_range_flagged_current_not_plain_mark', () => {
    const segs = splitLineForSearch('Error: one Error two', 'error', { start: 0, end: 5 });
    const current = segs.find(s => s.current);
    expect(current).toEqual({ text: 'Error', inLink: false, mark: false, current: true });
    expect(segs.filter(s => s.mark && !s.current).map(s => s.text)).toEqual(['Error']);
  });
  it('match_straddling_link_boundary_splits_into_two_parts', () => {
    // 查询词横跨 文本→链接 边界：边界两侧各出半段高亮（可接受降级，文本还原优先）
    const line = 'ab https://x.com cd';
    const segs = splitLineForSearch(line, 'b h', null);
    expect(segs.map(s => s.text).join('')).toBe(line);
    expect(segs.filter(s => s.mark).map(s => s.text)).toEqual(['b ', 'h']);
  });
});
