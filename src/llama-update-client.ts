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

// 2026 契约：打开弹窗的自动动作仅为「本地版本查询」（无网络、不比对远端）——
// unconfigured 判定 + 当前本地版本显示（unknown 态）。检查落定后本地版本显示
// 统一改由 check_llama_update 返回的 localVersion 派生（避免 --version 跑两次、
// 「本地版本」日志落两条）。
export interface LlamaLocalVersionResult {
  success: boolean;
  localVersion?: LlamaVersion;
  error?: string;   // 'unconfigured'：llama_dir 未配置
}

export interface LlamaUpdateConfig {
  last_llama_type?: string;
}
// 2026-09-17：include_pre_release 移除（stable 无 Windows 包，恒查 pre-release/nightly）

export interface LlamaUpdateConfigResult {
  success: boolean;
  config?: LlamaUpdateConfig;
  error?: string;
}

export interface LlamaDownloadResult {
  success: boolean;
  error?: string;
  /** 2026-09-17 两阶段更新：true=下载完且服务未运行，已自动安装完成；
   *  false=下载完但服务运行中，包已暂存 → 调 getPendingLlamaDownload 后 UI 显示「停止并更新」 */
  installed?: boolean;
}

/** 2026-09-17 两阶段更新：pending 包状态查询（「停止并更新」按钮的判定依据） */
export interface LlamaPendingDownload {
  /** 下载完成的包是否暂存在主进程内存 */
  pending: boolean;
  /** llama-server 是否运行（含外部进程的文件占用判定） */
  serverRunning: boolean;
  /** 被占用的文件名（仅文件名，不含路径） */
  lockedFiles: string[];
}

// 2026 契约：打开弹窗的唯一自动查询——本地版本（spawn llama-server --version，
// 主进程落一条「本地版本」日志）。llama_dir 未配置时返回 { success:false, error:'unconfigured' }。
export function getLlamaLocalVersion(): Promise<LlamaLocalVersionResult> {
  return invoke('get_llama_local_version');
}

// 2026-11 细化契约：打开弹窗即联网获取版本选项表（下拉立即可见）——只拉 release 信息
// （versionOptions + cudaDlls + 最新 tag），不执行本地 --version、不做版本比对、无 status
// （日志去重不变量：打开时唯一本地日志行仍来自 get_llama_local_version）。失败静默
// （渲染端不进入错误态，下拉不出现，用户手动「检查更新」恢复）。
export interface LlamaReleaseOptionsResult {
  success: boolean;
  versionOptions?: VersionOption[];
  cudaDlls?: CudaDll[];
  tag?: string;   // 最新 release tag（如 b11021）——仅供打开时的选项拉取参考，不比对
  error?: string;
}
export function getLlamaReleaseOptions(): Promise<LlamaReleaseOptionsResult> {
  return invoke('get_llama_release_options');
}

// 恒查 pre-release（nightly）：llama.cpp 的 stable release 只有 nightly-tag.txt 资产、无 Windows
// 二进制（2026-09-14 bug 根因），nightly 是唯一可下载来源（2026-09-17 定稿移除 includePreRelease 开关）。
// 2026 契约：最新版本 bNNNNN 的获取与本地比对只由手动「检查更新」/「重试」/「切换版本」触发。
export function checkLlamaUpdate(): Promise<LlamaUpdateCheckResult> {
  return invoke('check_llama_update');
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

// 2026-09-17 两阶段更新：查询下载完成的 pending 包与服务运行状态
export function getPendingLlamaDownload(): Promise<LlamaPendingDownload> {
  return invoke('get_pending_llama_download');
}

// 2026-09-17 两阶段更新：「停止并更新」点击 → 主进程先停 llama-server 再安装 pending 包
export function installLlamaUpdate(): Promise<{ success: boolean; error?: string }> {
  return invoke('install_llama_update');
}
