// llama.cpp 本地版本检测模块：解析 llama-server --version 输出。
// 纯函数模块，不依赖外部状态。

export interface LlamaVersion {
  type: 'release' | 'prerelease';
  version?: string;   // 版本号，如 '0.4.0'（dev 构建也带，type 区分）
  build?: number;     // build 号，两种类型都可能有
}

/**
 * 解析 llama-server --version 的输出文本。
 *
 * 真实输出格式（Windows nightly，2026-09 实测）：
 *   version: 0.3.0-dev (build 10679, commit 50f068fff)
 *   built with Clang 20.1.8 for Windows x86_64
 * 正式版则无 -dev 后缀：version: 0.4.0 (build 10852, commit ...)
 *
 * 兼容旧格式："llama-server v0.4.0 (build b10852)" / "llama-server b10952"
 *
 * @returns 解析后的版本对象，无法识别时返回 null
 */
export function parseLlamaVersion(output: string): LlamaVersion | null {
  if (typeof output !== 'string' || output.length === 0) {
    return null;
  }

  const trimmed = output.trim();

  // 真实 --version 输出：version: X.Y.Z[-dev] (build N, commit ...)，允许多行（第二行 built with ...）
  const realMatch = trimmed.match(/version:\s*(\d+\.\d+\.\d+)(-dev)?\s*\(build\s*(\d+)/i);
  if (realMatch) {
    return {
      type: realMatch[2] ? 'prerelease' : 'release',
      version: realMatch[1],
      build: parseInt(realMatch[3], 10),
    };
  }

  // Release 版本：llama-server v{version} (build b{build})
  const releaseMatch = trimmed.match(/^llama-server\s+v(\d+\.\d+\.\d+)(?:\s*\(build\s+b(\d+)\))?$/);
  if (releaseMatch) {
    const result: LlamaVersion = {
      type: 'release',
      version: releaseMatch[1],
    };
    if (releaseMatch[2]) {
      result.build = parseInt(releaseMatch[2], 10);
    }
    return result;
  }

  // Pre-release 版本：llama-server b{build}
  const preMatch = trimmed.match(/^llama-server\s+b(\d+)$/);
  if (preMatch) {
    return {
      type: 'prerelease',
      build: parseInt(preMatch[1], 10),
    };
  }

  return null;
}
