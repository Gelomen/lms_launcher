// llama.cpp 更新 API（Task 6）——渲染端类型化调用入口，走 invoke 通道
import { invoke } from './ipc';

export type LlamaUpdateStatus = 'up-to-date' | 'update-available' | 'unknown';

export interface LlamaVersion {
  version: string;
  commit: string | null;
}

export interface VersionOption {
  label: string;
  downloadUrl: string;
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

export function checkLlamaUpdate(includePreRelease = false): Promise<LlamaUpdateCheckResult> {
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
