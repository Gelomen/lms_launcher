// 渲染端 IPC 封装——window.lms 由 preload 注入（contextIsolation 下唯一通道）
// GPU 卡片（spec 2026-09-09-gpu-card-design §3/§4）：主进程 gpu-stats 事件的合并结果。
// 字节单位；合计行（专用 + 共享）由组件层计算，不在数据层。
export interface GpuStats {
  luid: string; // 小写 luid 串（真机双 0x 形状 0x00000000_0x00010fbf；字符串不透明键，组件不解析）
  name: string; // DXGI 卡名；join 不上回退 "GPU 序号"
  utilization: number; // 0-100
  dedicatedUsed: number; // 字节
  dedicatedTotal: number;
  sharedUsed: number;
  sharedTotal: number;
}
declare global {
  interface Window {
    lms: {
      invoke: (cmd: string, ...args: unknown[]) => Promise<unknown>;
      onLogLine: (cb: (e: { line: string; stream: 'sys' | 'out' | 'err'; echoTabs?: string[] }) => void) => () => void;
      onProcessExit: (cb: (e: { code: number }) => void) => () => void;
      onTrayExitRequest: (cb: () => void) => () => void;
      onWinMaxChanged: (cb: (e: { maximized: boolean }) => void) => () => void;
      onUpdateDownloadProgress: (cb: (e: { pct: number }) => void) => () => void;
      onTrayUpdateRequest: (cb: () => void) => () => void;
      onTraySettingsRequest: (cb: () => void) => () => void;
      onGpuStats: (cb: (e: { gpus: GpuStats[] }) => void) => () => void;
    };
  }
}

export function invoke<T = unknown>(cmd: string, ...args: unknown[]): Promise<T> {
  return window.lms.invoke(cmd, ...args) as Promise<T>;
}

export function onLogLine(cb: (e: { line: string; stream: 'sys' | 'out' | 'err'; echoTabs?: string[] }) => void): () => void {
  return window.lms.onLogLine(cb);
}

export function onProcessExit(cb: (e: { code: number }) => void): () => void {
  return window.lms.onProcessExit(cb);
}

export function onTrayExitRequest(cb: () => void): () => void {
  return window.lms.onTrayExitRequest(cb);
}

export function onWinMaxChanged(cb: (e: { maximized: boolean }) => void): () => void {
  return window.lms.onWinMaxChanged(cb);
}

export function onUpdateDownloadProgress(cb: (e: { pct: number }) => void): () => void {
  return window.lms.onUpdateDownloadProgress(cb);
}

export function onTrayUpdateRequest(cb: () => void): () => void {
  return window.lms.onTrayUpdateRequest(cb);
}

// 托盘「设置」（2026-10-01 update-proxy-settings）：主进程唤回窗口后通知渲染端打开设置弹窗
export function onTraySettingsRequest(cb: () => void): () => void {
  return window.lms.onTraySettingsRequest(cb);
}

/**
 * invoke 的 reject 值是带 .message 的 Error——直接 String(err) 会得 [object Object]。
 * Electron 主进程侧抛出的 Error 经 ipcRenderer.invoke 会被包一层外壳：
 *   "Error invoking remote method 'get_configs': Error: MISSING: ..."
 *   （外层 Error.message 还额外多一行 'Error invoking remote method'）。
 * 分类（isMissing / isValidation）与展示都基于**剥掉外壳后的原始消息**：
 * - errMsg 负责剥壳，露出 MISSING:/VALIDATION:/YAML:... 等真正内容；
 * - isMissing / isValidation 用「包含匹配」兜底——万一未来再有多余的外壳，仍能识别。
 */
export function errMsg(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/^\s*(?:Error invoking remote method '[^']*':\s*)?(?:Error:\s*)*/, '');
}

export const isMissing = (msg: string): boolean => msg.includes("MISSING:");
export const isValidation = (msg: string): boolean => msg.includes("VALIDATION:");

export function onGpuStats(cb: (e: { gpus: GpuStats[] }) => void): () => void {
  return window.lms.onGpuStats(cb);
}
