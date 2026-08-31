// 日志行链接识别（规格 2026-08-31-log-link-ctrl-click-design §3.1）：
// 纯函数，无 DOM/无副作用。把一行文本切分为「文本段 + 链接段」交替序列，
// 拼接所有段还原原行。只识别 http/https；尾部标点剥离（Windows Terminal 同款）。
export interface LinkSeg { text: string; isLink: boolean; url?: string }

const URL_RE = /https?:\/\/[^\s"'<>]+/g;
// 规格 §3.1 字面表：.,;:!?)]}>">'（"/' 因正则已排除而不可达，列出仅为与规格逐字对齐）
const TRAIL_PUNCT = '.,;:!?)]}>">\'';

export function linkify(line: string): LinkSeg[] {
  // 快速路径：绝大多数日志行不含 http，零正则开销
  if (!line.includes('http')) return [{ text: line, isLink: false }];
  const segs: LinkSeg[] = [];
  let last = 0;
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(line)) !== null) {
    const start = m.index;
    let url = m[0];
    // 相邻无空格双链接（规格 §3.1 迭代）：匹配内部再出现 http(s):// 时在此截断，
    // 后半（截断点起）由下一轮识别为独立链接段；lastIndex 回拨到截断点，否则 exec 自动前进会跳过后半。
    const proto = [url.indexOf('https://', 8), url.indexOf('http://', 7)].filter((i) => i > 0);
    if (proto.length > 0) {
      url = url.slice(0, Math.min(...proto));
      URL_RE.lastIndex = start + url.length;
    }
    // 尾部标点逐个剥掉（URL 不以这些字符收尾）；剥回的部分归入后随文本段
    while (url.length > 0 && TRAIL_PUNCT.includes(url[url.length - 1])) {
      url = url.slice(0, -1);
    }
    if (start > last) segs.push({ text: line.slice(last, start), isLink: false });
    if (url.length > 0) segs.push({ text: url, isLink: true, url });
    last = start + url.length;
  }
  if (last < line.length) segs.push({ text: line.slice(last), isLink: false });
  return segs;
}
