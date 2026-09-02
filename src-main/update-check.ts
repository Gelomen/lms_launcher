// 自动更新（规格 2026-09-01-auto-update）：版本检查纯函数层。
// 数据源：GitHub Releases API（latest）；资产命名约定 lms-launcher-v{version}-win64.zip。
// 纯函数 + 常量导出 → 可单测；网络请求由 main.ts 的 IPC 负责。

export const RELEASE_API_URL =
  'https://api.github.com/repos/Gelomen/lms_launcher/releases/latest';

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const TAG_RE = /^v?(\d+\.\d+\.\d+)$/;

export interface LatestReleaseInfo {
  tag: string;      // 已去 v 前缀的 semver
  zipUrl: string;   // 匹配 *-win64.zip 资产的 browser_download_url
}

// 严格 semver（无 v 前缀、无预发布后缀）→ [maj,min,pat]；不合规则 null
export function parseVersion(s: string): [number, number, number] | null {
  const m = s.match(VERSION_RE);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

// -1 = latest 更低 / 0 = 相等或任一侧解析失败 / 1 = latest 更新
// 只有 1 才视为「有新版」（失败保守 → 不弹更新）
export function compareVersions(cur: string, latest: string): -1 | 0 | 1 {
  const a = parseVersion(cur);
  const b = parseVersion(latest);
  if (!a || !b) return 0;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return b[i] < a[i] ? -1 : 1;
  }
  return 0;
}

// 解析 GitHub releases/latest 响应 → LatestReleaseInfo；tag 非 semver 或无 win64 zip 资产 → null
export function parseLatestRelease(json: unknown): LatestReleaseInfo | null {
  if (typeof json !== 'object' || json === null) return null;
  const r = json as Record<string, unknown>;
  const tagName = typeof r.tag_name === 'string' ? r.tag_name : '';
  const m = tagName.match(TAG_RE);
  if (!m) return null;
  const assets = Array.isArray(r.assets) ? r.assets : [];
  const zip = assets.find((a) => {
    const o = a as Record<string, unknown>;
    return (
      typeof o?.name === 'string' &&
      o.name.endsWith('-win64.zip') &&
      typeof o.browser_download_url === 'string'
    );
  });
  if (!zip) return null;
  const z = zip as Record<string, unknown>;
  return { tag: m[1], zipUrl: z.browser_download_url as string };
}
