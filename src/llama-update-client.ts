// llama.cpp 更新 API（Task 6）——渲染端类型化调用入口，走 invoke 通道
import { invoke } from './ipc';

export type LlamaUpdateStatus = 'up-to-date' | 'update-available' | 'unknown';

// 与主进程 LlamaVersion 契约一致（2026-09-14 修复：旧契约 {version, commit} 与主进程不匹配）
export interface LlamaVersion {
  type: 'release' | 'prerelease';
  version?: string;   // 如 '0.3.0'（dev 构建也带，type 区分）
  build?: number;     // 如 10679
}

export interface VersionOption {
  label: string;
  downloadUrl: string;
  cudaDllsUrl?: string;   // 行内关联的 CUDA DLLs 下载链接
}

export interface CudaDll {
  version: string;
  downloadUrl: string;
}

export interface LlamaUpdateCheckResult {
  success: boolean;
  status?: LlamaUpdateStatus;
  localVersion?: LlamaVersion;
  remoteVersion?: string;
  versionOptions?: VersionOption[];
  cudaDlls?: CudaDll[];
  error?: string;
}

export interface LlamaLocalVersionResult {
  success: boolean;
  version?: LlamaVersion;
  error?: string;
}

export interface LlamaUpdateConfig {
  last_version_type?: string;
  include_pre_release?: boolean;
}

export interface LlamaUpdateConfigResult {
  success: boolean;
  config?: LlamaUpdateConfig;
  error?: string;
}

export interface LlamaDownloadResult {
  success: boolean;
  error?: string;
}

// 默认包含 nightly：llama.cpp 的 stable release 只有 nightly-tag.txt 资产、无 Windows 二进制，
// 只看 stable 永远找不到可下载版本（2026-09-14 bug 根因之一）。
export function checkLlamaUpdate(includePreRelease = true): Promise<LlamaUpdateCheckResult> {
  return invoke('check_llama_update', { include_pre_release: includePreRelease });
}

export function getLlamaLocalVersion(): Promise<LlamaLocalVersionResult> {
  return invoke('get_llama_local_version');
}

export function downloadLlamaUpdate(downloadUrl: string, cudaDllsUrl?: string): Promise<LlamaDownloadResult> {
  return invoke('download_llama_update', { download_url: downloadUrl, cuda_dlls_url: cudaDllsUrl });
}

export function setLlamaUpdateConfig(config: Partial<LlamaUpdateConfig>): Promise<LlamaUpdateConfigResult> {
  return invoke('set_llama_update_config', config);
}

export function getLlamaUpdateConfig(): Promise<LlamaUpdateConfigResult> {
  return invoke('get_llama_update_config');
}
