// 视觉宽度预算截断（2026-08-26 spec）：CJK / 全角字符宽 = 2，其余 = 1。
// 用于下拉 trigger / 面板行 / 模板行名展示层——同一"宽度预算"下中文不超省、拉丁/英文显示更多字符。
export function charWidth(c: string): number {
  const cp = c.codePointAt(0) ?? 0;
  if (cp >= 0x4e00 && cp <= 0x9fff) return 2;      // CJK 统一表意文字（汉字）
  if (cp >= 0xf900 && cp <= 0xfaff) return 2;      // CJK 兼容表意文字（康熙部首）
  if (cp >= 0x3000 && cp <= 0x303f) return 2;      // CJK 标点
  if (cp >= 0xff00 && cp <= 0xffef) return 2;      // 全角形式（全角字母数字等）
  return 1;
}

export function visualWidth(s: string): number {
  let w = 0;
  for (const c of s) w += charWidth(c);
  return w;
}

/**
 * 取"宽度 ≤ budget 的最长前缀"：整个串宽度 ≤ budget → 原样返回（含恰好等于，保证中文旧契约不变）；
 * 否则截到第一个使累计超 budget 的字符之前 + …(U+2026)。
 */
export function truncateByWidth(s: string, budget: number): string {
  let w = 0;
  let kept = 0;
  for (const c of s) {
    if (w + charWidth(c) > budget) return s.slice(0, kept) + '…';
    w += charWidth(c);
    kept += c.length;
  }
  return s;
}
