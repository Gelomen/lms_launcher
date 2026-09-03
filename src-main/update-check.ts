// 自动更新（规格 2026-09-01-auto-update）：版本检查纯函数层。
// 数据源：GitHub Releases API（latest）；资产命名约定 lms-launcher-v{version}-win64.zip。
// 纯函数 + 常量导出 → 可单测；网络请求由 main.ts 的 IPC 负责。

export const RELEASE_API_URL =
  'https://api.github.com/repos/Gelomen/lms_launcher/releases/latest';

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;
// 2026-09-03：GitHub releases/latest 允许预发布 tag（如 v0.2.0-rc.1）。
// 旧正则只认严格 semver → 解析失败 → 报「无法连接更新服务器或解析版本信息」。
// 现接受 -rc.1 / -beta.2 等预发布后缀。
const TAG_RE = /^v?((\d+\.\d+\.\d+)(-[0-9A-Za-z.]+)?)$/;

export interface LatestReleaseInfo {
  tag: string;      // 已去 v 前缀的 semver（可能带预发布后缀）
  zipUrl: string;   // 匹配 *-win64.zip 资产的 browser_download_url
}

// 严格 semver（无 v 前缀、无预发布后缀）→ [maj,min,pat]；不合规则 null
export function parseVersion(s: string): [number, number, number] | null {
  const m = s.match(VERSION_RE);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

// 宽松解析：基础三位数字 + 可选预发布后缀（compareVersions 内部使用）
const LOOSE_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
interface LooseVersion {
  n: [number, number, number];
  pre: string | null;
}
function parseLoose(s: string): LooseVersion | null {
  const m = s.match(LOOSE_RE);
  if (!m) return null;
  return {
    n: [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)],
    pre: m[4] ?? null,
  };
}

// -1 = latest 更低 / 0 = 相等或任一侧解析失败 / 1 = latest 更新
// 只有 1 才视为「有新版」（失败保守 → 不弹更新）
// 预发布语义：
//   - 基础版本不同 → 比基础版本（0.2.0-rc.1 对 0.1.x 仍是新版）
//   - 基础版本相同：稳定版 vs 预发布 → 预发布更早（0.2.0-rc.1 不算 0.2.0 的新版）
//   - 同为预发布 → 按后缀字符串顺序（简化）
export function compareVersions(cur: string, latest: string): -1 | 0 | 1 {
  const a = parseLoose(cur);
  const b = parseLoose(latest);
  if (!a || !b) return 0;
  for (let i = 0; i < 3; i++) {
    if (a.n[i] !== b.n[i]) return b.n[i] < a.n[i] ? -1 : 1;
  }
  if (a.pre === null && b.pre === null) return 0;
  if (a.pre !== null && b.pre === null) return 1; // cur 是 rc，latest 是正式版 → 更新
  if (a.pre === null && b.pre !== null) return 0; // latest 是该版本的 rc → 不算更新
  // 走到这里 a.pre / b.pre 均非 null（上方已排除 null 组合）
  const ap = a.pre as string;
  const bp = b.pre as string;
  return ap === bp ? 0 : ap < bp ? -1 : 1;
}

// 解析 GitHub releases/latest 响应 → LatestReleaseInfo；tag 非 semver 或无匹配 zip 资产 → null
// 资产命名优先级：
//   1) 规范新式命名 *-win64.zip（docs 约定的 lms-launcher-v{version}-win64.zip）
//   2) 历史命名 LMS-Launcher-v{version}.zip（2026-08-28 v0.1.0 实际上传的资产名）
// 若未来重新发布，仍推荐用 *-win64.zip（含架构信息）；历史命名仅作兼容。
export function parseLatestRelease(json: unknown): LatestReleaseInfo | null {
  if (typeof json !== 'object' || json === null) return null;
  const r = json as Record<string, unknown>;
  const tagName = typeof r.tag_name === 'string' ? r.tag_name : '';
  const m = tagName.match(TAG_RE);
  if (!m) return null;
  const assets = Array.isArray(r.assets) ? r.assets : [];
  const hasDownloadUrl = (o: unknown): o is { name: string; browser_download_url: string } => {
    const rec = o as Record<string, unknown> | null;
    return (
      !!rec &&
      typeof rec.name === 'string' &&
      typeof rec.browser_download_url === 'string'
    );
  };
  // 1) 优先：新式 win64 zip
  const zip =
    assets.find((a) =>
      hasDownloadUrl(a) && a.name.endsWith('-win64.zip')
    ) ??
    // 2) 兼容：历史 LMS-Launcher-v{version}.zip（大小写不敏感、去分隔符后包含 version 数字）
    (() => {
      const version = m[1];
      const normVersion = version.replace(/[^a-z0-9]/g, '');
      return assets.find((a) => {
        if (!hasDownloadUrl(a)) return false;
        const name = a.name.toLowerCase();
        if (!name.endsWith('.zip')) return false;
        if (!name.includes('launcher')) return false;
        return name.replace(/[^a-z0-9]/g, '').includes(normVersion);
      });
    })();
  if (!zip) return null;
  return { tag: m[1], zipUrl: zip.browser_download_url };
}
