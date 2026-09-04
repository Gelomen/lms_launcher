// 自动更新（spec 2026-09-05-download-integrity-check-design）：更新包下载完整性校验。
// 纯函数判定 + 流式文件哈希（可单测）；main.ts download_update 在落盘完成后调用，
// 失败时删半成品并返回 { ok: false, reason }。
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';

// 发布格式 sha256:<hex> 与本地实际摘要比较（大小写不敏感；格式不合法一律 false）
export function digestMatches(expected: string | null, actual: string): boolean {
  if (!expected) return false;
  const m = expected.match(/^sha256:([0-9a-f]{64})$/i);
  if (!m) return false;
  return m[1].toLowerCase() === actual.toLowerCase();
}

export interface IntegrityInput {
  expectedSize: number | null;   // Content-Length；null = 服务器未提供（跳过大小校验）
  actualSize: number;            // 落盘文件字节数
  expectedDigest: string | null; // 发布资产 sha256 校验和（sha256: + 64 hex）；null = 无（跳过哈希校验）
  actualDigest: string | null;   // 实际计算的 sha256 文件摘要
}

export interface IntegrityResult {
  ok: boolean;
  reason: string | null;   // 中文失败原因（渲染端 error 态直接展示）
}

// 两级校验判定（纯函数）：大小优先，其次 SHA-256
export function evaluateDownloadIntegrity(i: IntegrityInput): IntegrityResult {
  if (i.expectedSize !== null && i.actualSize !== i.expectedSize) {
    return {
      ok: false,
      reason: '下载不完整：收到 ' + i.actualSize + ' 字节 / 预期 ' + i.expectedSize + ' 字节，请重试',
    };
  }
  if (i.expectedDigest !== null) {
    if (i.actualDigest === null || i.actualDigest !== i.expectedDigest) {
      return {
        ok: false,
        reason: '校验失败：文件与发布版本不一致（SHA-256 不匹配），请重试',
      };
    }
  }
  return { ok: true, reason: null };
}

// 流式计算文件 SHA-256（hex）；文件不存在/IO 错 → reject（调用方走下载失败分支）
// 4MB 高水位：hash.update 为同步 CPU 操作，高吞吐时暂停上游防止内存堆积
export async function sha256FileAsync(file: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(file, { highWaterMark: 4 * 1024 * 1024 });
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}
