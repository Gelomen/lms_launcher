// 渲染端 IPC 封装——window.lms 由 preload 注入（contextIsolation 下唯一通道）
declare global {
  interface Window {
    lms: {
      invoke: (cmd: string, ...args: unknown[]) => Promise<unknown>;
      onLogLine: (cb: (e: { line: string; stream: 'sys' | 'out' | 'err' }) => void) => () => void;
      onProcessExit: (cb: (e: { code: number }) => void) => () => void;
      onTrayExitRequest: (cb: () => void) => () => void;
    };
  }
}

export function invoke<T = unknown>(cmd: string, ...args: unknown[]): Promise<T> {
  return window.lms.invoke(cmd, ...args) as Promise<T>;
}

export function onLogLine(cb: (e: { line: string; stream: 'sys' | 'out' | 'err' }) => void): () => void {
  return window.lms.onLogLine(cb);
}

export function onProcessExit(cb: (e: { code: number }) => void): () => void {
  return window.lms.onProcessExit(cb);
}

export function onTrayExitRequest(cb: () => void): () => void {
  return window.lms.onTrayExitRequest(cb);
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
