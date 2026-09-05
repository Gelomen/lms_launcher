// 日志查找纯函数（规格 2026-09-05-log-search-design）：
// findMatches —— 单行内全部匹配区间（大小写不敏感、非重叠）；
// splitLineForSearch —— 一行切分为渲染段：先按 linkify 分段，再在绝对偏移上
// 与匹配区间求交切分高亮（链接内的匹配同样高亮且保留链接属性）。
import { linkify } from './linkify';

export interface MarkRange { start: number; end: number }

export interface RenderSeg {
  text: string;
  inLink: boolean;   // 是否位于链接内（保留 Ctrl+Click 行为）
  url?: string;      // inLink 时的链接地址
  mark: boolean;     // 普通匹配高亮
  current: boolean;  // 当前匹配高亮（深一档紫）
}

// 单行匹配区间：命中后从 end 继续（非重叠）；空 query → []。
export function findMatches(line: string, query: string): MarkRange[] {
  const out: MarkRange[] = [];
  if (query.length === 0) return out;
  const low = line.toLowerCase();
  const q = query.toLowerCase();
  let idx = low.indexOf(q);
  while (idx !== -1) {
    out.push({ start: idx, end: idx + q.length });
    idx = low.indexOf(q, idx + q.length);
  }
  return out;
}

// linkify 分段拼接还原原行且按序连续 → 用前缀长度累计即可还原每段绝对偏移。
export function splitLineForSearch(line: string, query: string, current: MarkRange | null): RenderSeg[] {
  const linkSegs = linkify(line);
  const ranges = query.length > 0 ? findMatches(line, query) : [];
  // 链接段绝对区间（[start,end) + url）
  const linkIntervals: Array<{ start: number; end: number; url: string }> = [];
  let off = 0;
  for (const s of linkSegs) {
    if (s.isLink) linkIntervals.push({ start: off, end: off + s.text.length, url: s.url! });
    off += s.text.length;
  }
  // 原子切割点：0/len + 每个链接边界 + 每个匹配边界
  const cuts = new Set<number>([0, line.length]);
  for (const li of linkIntervals) { cuts.add(li.start); cuts.add(li.end); }
  for (const r of ranges) { cuts.add(r.start); cuts.add(r.end); }
  if (current) { cuts.add(current.start); cuts.add(current.end); }
  const sorted = [...cuts].sort((a, b) => a - b);
  const segs: RenderSeg[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const s = sorted[i];
    const e = sorted[i + 1];
    const mid = (s + e) / 2;
    const link = linkIntervals.find(li => mid >= li.start && mid < li.end) ?? null;
    const cur = current !== null && s >= current.start && e <= current.end;
    // 当前匹配段只标记 current（深一档紫），不重复普通 mark
    const mark = !cur && ranges.some(r => s >= r.start && e <= r.end);
    segs.push({ text: line.slice(s, e), inLink: link !== null, url: link?.url, mark, current: cur });
  }
  // 合并相邻同属性段（保持 DOM 精简）
  const merged: RenderSeg[] = [];
  for (const seg of segs) {
    const last = merged[merged.length - 1];
    if (last && last.inLink === seg.inLink && last.mark === seg.mark && last.current === seg.current) {
      last.text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}
