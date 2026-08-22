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

/** invoke reject 的值是带 .message 的 Error——直接 String(err) 会得 [object Object] */
export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const isMissing = (msg: string): boolean => msg.startsWith("MISSING:");
export const isValidation = (msg: string): boolean => msg.startsWith("VALIDATION:");
