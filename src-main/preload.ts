import { contextBridge, ipcRenderer } from 'electron';
// 渲染端只能看到这个白名单 API（contextIsolation 下无 Node 直权）
contextBridge.exposeInMainWorld('lms', {
  invoke: (cmd: string, ...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(cmd, ...args),
  onLogLine: (cb: (e: { line: string; stream: 'sys' | 'out' | 'err'; echoTabs?: string[] }) => void) => {
    const listener = (_e: unknown, payload: { line: string; stream: 'sys' | 'out' | 'err'; echoTabs?: string[] }) => cb(payload);
    ipcRenderer.on('log-line', listener);
    return () => ipcRenderer.removeListener('log-line', listener);
  },
  onProcessExit: (cb: (e: { code: number }) => void) => {
    const listener = (_e: unknown, payload: { code: number }) => cb(payload);
    ipcRenderer.on('process-exit', listener);
    return () => ipcRenderer.removeListener('process-exit', listener);
  },
  onTrayExitRequest: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('tray-exit-request', listener);
    return () => ipcRenderer.removeListener('tray-exit-request', listener);
  },
  onWinMaxChanged: (cb: (e: { maximized: boolean }) => void) => {
    const listener = (_e: unknown, payload: { maximized: boolean }) => cb(payload);
    ipcRenderer.on('win-max-changed', listener);
    return () => ipcRenderer.removeListener('win-max-changed', listener);
  },
});
