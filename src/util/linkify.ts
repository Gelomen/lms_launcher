// 日志行链接识别（规格 2026-08-31-log-link-ctrl-click-design §3.1）：
// 纯函数，无 DOM/无副作用。把一行文本切分为「文本段 + 链接段」交替序列，
// 拼接所有段还原原行。只识别 http/https；尾部标点剥离（Windows Terminal 同款）。
export interface LinkSeg { text: string; isLink: boolean; url?: string }

const URL_RE = /https?:\/\/[^\s"'<>]+/g;
const TRAIL_PUNCT = '.,;:!?)]}>';

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
