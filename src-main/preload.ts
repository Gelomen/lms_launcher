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
  onUpdateDownloadProgress: (cb: (e: { pct: number }) => void) => {
    const listener = (_e: unknown, payload: { pct: number }) => cb(payload);
    ipcRenderer.on('update-download-progress', listener);
    return () => ipcRenderer.removeListener('update-download-progress', listener);
  },
  // llama.cpp 更新下载进度
  onLlamaUpdateProgress: (cb: (e: { percent: number; stage: string }) => void) => {
    const listener = (_e: unknown, payload: { percent: number; stage: string }) => cb(payload);
    ipcRenderer.on('llama_update_progress', listener);
    return () => ipcRenderer.removeListener('llama_update_progress', listener);
  },
  // 托盘「检查更新」：主进程唤回窗口后通知渲染端执行与顶栏按钮相同的检查流程
  onTrayUpdateRequest: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('tray-update-request', listener);
    return () => ipcRenderer.removeListener('tray-update-request', listener);
  },
  onTraySettingsRequest: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('tray-settings-request', listener);
    return () => ipcRenderer.removeListener('tray-settings-request', listener);
  },
  // 启动检测（2026-11 用户确认）：whenReady 时 detectLlamaInstall 算出 4 态后推一次，
  // 安装目录卡片据此显示 ✓/✗（与「启动检测 · …」日志行同源同刻）
  onStartupLlamaCheck: (cb: (e: { status: string; dir: string }) => void) => {
    const listener = (_e: unknown, payload: { status: string; dir: string }) => cb(payload);
    ipcRenderer.on('startup-llama-check', listener);
    return () => ipcRenderer.removeListener('startup-llama-check', listener);
  },
  // GPU 卡片（spec 2026-09-09-gpu-card-design §4）：主进程每 ~2 秒推送合并后的卡数据
  onGpuStats: (cb: (e: { gpus: { luid: string; name: string; utilization: number; dedicatedUsed: number; dedicatedTotal: number; sharedUsed: number; sharedTotal: number }[] }) => void) => {
    const listener = (_e: unknown, payload: { gpus: { luid: string; name: string; utilization: number; dedicatedUsed: number; dedicatedTotal: number; sharedUsed: number; sharedTotal: number }[] }) => cb(payload);
    ipcRenderer.on('gpu-stats', listener);
    return () => ipcRenderer.removeListener('gpu-stats', listener);
  },
});
