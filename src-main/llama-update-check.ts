// llama.cpp GitHub Release 检查模块：获取最新 release 信息、解析下载链接、比较版本。
// 依赖 Task 1 的 LlamaVersion 接口和 parseLlamaVersion 函数。
// 网络请求使用 undici 支持代理配置。

import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { type LlamaVersion } from './llama-update-version';

const GITHUB_API_URL =
  'https://api.github.com/repos/ggml-org/llama.cpp/releases';

/**
 * 从 GitHub release body（markdown）中解析 Windows 下载链接。
 * body 格式示例：
 *   - Windows x64 (CPU): [download](https://...)
 *   - Windows x64 (CUDA 12): [download](https://...)
 *   - CUDA DLLs (12.6): [download](https://...)
 *
 * @returns 解析结果，无 Windows 链接时返回 null
 */
export function parseReleaseBody(body: string): {
  versionOptions: Array<{ label: string; downloadUrl: string }>;
  cudaDlls?: Array<{ version: string; downloadUrl: string }>;
} | null {
  if (typeof body !== 'string' || body.length === 0) return null;

  const versionOptions: Array<{ label: string; downloadUrl: string }> = [];
  const cudaDlls: Array<{ version: string; downloadUrl: string }> = [];

  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();

    // 先检查 CUDA DLLs 行（避免 "Windows x64 (CUDA 12)" 被误匹配）
    // 格式："- CUDA DLLs (12.6): [download](url)"
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

    // 匹配 markdown 列表项或普通行中的 Windows 下载链接
    // 格式："- Windows x64 (CPU): [download](url)" 或 "Windows x64 (CPU): https://..."
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
    versionOptions: Array<{ label: string; downloadUrl: string }>;
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
 * 获取 llama.cpp 最新的 release 信息。
 *
 * @param includePreRelease 是否包含预发布版本
 * @param proxy 代理 URL（可选），如 "http://127.0.0.1:7890"
 * @returns 最新 release 信息，失败时返回 null
 */
export async function fetchLlamaReleaseInfo(
  includePreRelease: boolean,
  proxy?: string
): Promise<{
  tag: string;
  versionOptions: Array<{ label: string; downloadUrl: string }>;
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

    // 筛选：includePreRelease=false 时只取非预发布
    let target: typeof releases[0] | null = null;
    for (const release of releases) {
      if (!includePreRelease && release.prerelease) continue;
      target = release;
      break;
    }

    if (!target) return null;

    // 解析 body 获取下载链接
    const parsed = parseReleaseBody(target.body || '');
    if (!parsed) return null;

    return {
      tag: target.tag_name,
      versionOptions: parsed.versionOptions,
      cudaDlls: parsed.cudaDlls,
      publishedAt: target.published_at,
    };
  } catch {
    return null;
  }
}
