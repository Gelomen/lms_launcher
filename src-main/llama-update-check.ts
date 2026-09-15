// llama.cpp GitHub Release 检查模块：获取最新 release 信息、解析下载链接、比较版本。
// 依赖 Task 1 的 LlamaVersion 接口和 parseLlamaVersion 函数。
// 网络请求使用 undici 支持代理配置。

import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { type LlamaVersion } from './llama-update-version';

const GITHUB_API_URL =
  'https://api.github.com/repos/ggml-org/llama.cpp/releases';

/** 单个下载选项（含行内关联的 CUDA DLLs 链接） */
export interface VersionOption {
  label: string;
  downloadUrl: string;
  cudaDllsUrl?: string;
}

/**
 * 从 GitHub release body（markdown）中解析 Windows 下载链接。
 *
 * 真实 body 格式（2026-09 实测，b10955）：
 *   - [Windows x64 (CPU)](https://github.com/ggml-org/llama.cpp/releases/download/b10955/llama-b10955-bin-win-cpu-x64.zip)
 *   - [Windows x64 (CUDA 12)](<url>) - [CUDA 12.4 DLLs](<url>)   ← DLLs 链接内联在同一行
 *
 * 同时保留旧格式（"- Windows x64 (CPU): [download](url)"）兼容。
 *
 * @returns 解析结果，无 Windows 链接时返回 null
 */
export function parseReleaseBody(body: string): {
  versionOptions: VersionOption[];
  cudaDlls?: Array<{ version: string; downloadUrl: string }>;
} | null {
  if (typeof body !== 'string' || body.length === 0) return null;

  const versionOptions: VersionOption[] = [];
  const cudaDlls: Array<{ version: string; downloadUrl: string }> = [];

  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();

    // 真实格式："- [Windows x64 (CPU)](url)"，可选行尾 " - [CUDA 12.4 DLLs](url)"
    const realMatch = trimmed.match(
      /^\s*[-*]?\s*\[(Windows\s+[^\]]+)\]\(([^)\s]+)\)\s*(?:-\s*\[(?:CUDA\s+)?([^\]]*DLLs[^\]]*)\]\(([^)\s]+)\))?/i
    );
    if (realMatch) {
      const option: VersionOption = {
        label: realMatch[1].trim(),
        downloadUrl: realMatch[2].trim(),
      };
      // 行内 DLLs："[CUDA 12.4 DLLs](url)" → 关联到本选项 + 平铺列表
      if (realMatch[4]) {
        option.cudaDllsUrl = realMatch[4].trim();
        const versionMatch = realMatch[3].match(/(\d+(?:\.\d+)?)/);
        cudaDlls.push({
          version: versionMatch ? versionMatch[1] : 'unknown',
          downloadUrl: realMatch[4].trim(),
        });
      }
      versionOptions.push(option);
      continue;
    }

    // 旧格式："- CUDA DLLs (12.6): [download](url)"（独立行）
    const cudaMatch = trimmed.match(
      /^\s*[-*]?\s*(CUDA\s+DLLs[^:]*?):\s*(?:\[.*?\]\(([^)]+)\)|https:\/\/([^)\s]+))/i
    );
    if (cudaMatch) {
      const label = cudaMatch[1].trim();
      const url = (cudaMatch[2] || cudaMatch[3]).trim();
      // 提取版本号，如 "CUDA DLLs (12.6)" → "12.6"
      const versionMatch = label.match(/\((\d+(?:\.\d+)?)\)/);
      cudaDlls.push({
        version: versionMatch ? versionMatch[1] : 'unknown',
        downloadUrl: url,
      });
      continue;
    }

    // 旧格式："- Windows x64 (CPU): [download](url)" 或 "Windows x64 (CPU): https://..."
    const winMatch = trimmed.match(
      /^\s*[-*]?\s*(Windows[^:]+?):\s*(?:\[.*?\]\(([^)]+)\)|https:\/\/([^)\s]+))/i
    );
    if (winMatch) {
      versionOptions.push({
        label: winMatch[1].trim(),
        downloadUrl: (winMatch[2] || winMatch[3]).trim(),
      });
    }
  }

  if (versionOptions.length === 0 && cudaDlls.length === 0) return null;

  const result: {
    versionOptions: VersionOption[];
    cudaDlls?: Array<{ version: string; downloadUrl: string }>;
  } = { versionOptions };

  if (cudaDlls.length > 0) {
    result.cudaDlls = cudaDlls;
  }

  return result;
}

/**
 * 比较本地 llama.cpp 版本与远程 tag。
 *
 * @param local 本地解析后的版本（null 表示未检测到）
 * @param remoteTag GitHub release tag，如 "b10952" 或 "v0.4.0"
 * @returns 'up-to-date' | 'update-available' | 'unknown'
 */
export function compareLlamaVersions(
  local: LlamaVersion | null,
  remoteTag: string
): 'up-to-date' | 'update-available' | 'unknown' {
  if (!local) return 'unknown';

  const tag = remoteTag.trim();

  // remoteTag 是 build 号（如 "b10952"）
  const buildMatch = tag.match(/^b(\d+)$/);
  if (buildMatch) {
    const remoteBuild = parseInt(buildMatch[1], 10);
    if (local.build !== undefined) {
      return remoteBuild > local.build ? 'update-available' : 'up-to-date';
    }
    return 'unknown';
  }

  // remoteTag 是 release 版本（如 "v0.4.0"）
  const releaseMatch = tag.match(/^v?(\d+\.\d+\.\d+)$/);
  if (releaseMatch) {
    const remoteVersion = releaseMatch[1];
    if (local.version !== undefined) {
      const localParts = local.version.split('.').map(Number);
      const remoteParts = remoteVersion.split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if (remoteParts[i] > localParts[i]) return 'update-available';
        if (remoteParts[i] < localParts[i]) return 'up-to-date';
      }
      // 版本相同，比较 build 号
      if (local.build !== undefined) {
        const remoteBuildMatch = tag.match(/b(\d+)/);
        if (remoteBuildMatch) {
          const remoteBuild = parseInt(remoteBuildMatch[1], 10);
          return remoteBuild > local.build ? 'update-available' : 'up-to-date';
        }
      }
      return 'up-to-date';
    }
    // 本地是 pre-release（无 version），远程是 release → 更新可用
    return 'update-available';
  }

  return 'unknown';
}

/**
 * 获取 llama.cpp 最新的可用 release 信息。
 *
 * 2026-09-14 bug 修复：llama.cpp 的 stable release（vX.Y.Z）只有 nightly-tag.txt
 * 资产、没有任何 Windows 二进制 → 只查 stable 必然失败 → UI 报「获取远程版本失败」。
 * 2026-09-17 定稿：stable 无 Windows 包是上游事实（2026-09-17 实测 v0.4.1 资产仅
 * nightly-tag.txt）→ 不再提供 includePreRelease 开关（勾选框已移除），恒查 pre-release
 * （nightly b 号）：按列表顺序取第一个 body 中能解析出 Windows 下载链接的 release，
 * 不跳过 prerelease。
 *
 * @param proxy 代理 URL（可选），如 "http://127.0.0.1:7890"
 * @returns 最新 release 信息，失败时返回 null
 */
export async function fetchLlamaReleaseInfo(
  proxy?: string
): Promise<{
  tag: string;
  versionOptions: VersionOption[];
  cudaDlls?: Array<{ version: string; downloadUrl: string }>;
  publishedAt: string;
} | null> {
  try {
    const url = `${GITHUB_API_URL}?per_page=5`;

    let fetchFn: typeof fetch = fetch;
    let dispatcher: unknown = undefined;

    if (proxy) {
      const agent = new ProxyAgent({ uri: proxy });
      dispatcher = agent;
      fetchFn = undiciFetch as unknown as typeof fetch;
    }

    const response = await (fetchFn as any)(url, {
      headers: {
        'User-Agent': 'lms-launcher',
        'Accept': 'application/vnd.github.v3+json',
      },
      dispatcher,
    });

    if (!response.ok) {
      return null;
    }

    const releases = await response.json();
    if (!Array.isArray(releases) || releases.length === 0) return null;

    // 按列表顺序找第一个「body 能解析出 Windows 下载链接」的 release。
    // 恒含 prerelease：llama.cpp 的 Windows 二进制实际只有 nightly（b 号）发布，
    // stable 仅 nightly-tag.txt 资产（2026-09-14 bug 根因；2026-09-17 定稿恒查 nightly，
    // includePreRelease 开关与 UI 勾选框已移除）。
    let picked: { release: (typeof releases)[0]; parsed: NonNullable<ReturnType<typeof parseReleaseBody>> } | null = null;
    for (const release of releases) {
      const parsed = parseReleaseBody(release.body || '');
      if (parsed && parsed.versionOptions.length > 0) {
        picked = { release, parsed };
        break;
      }
    }
    if (!picked) return null;

    return {
      tag: picked.release.tag_name,
      versionOptions: picked.parsed.versionOptions,
      cudaDlls: picked.parsed.cudaDlls,
      publishedAt: picked.release.published_at,
    };
  } catch {
    return null;
  }
}
