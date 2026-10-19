// 渲染端 IPC 封装——window.lms 由 preload 注入（contextIsolation 下唯一通道）
// 也正因为是唯一通道，出站参数的「必须可结构化克隆」这条契约在这里一次做掉：见下面 invoke 上面的 plainArg。
// 这是本文件唯一的运行时 import；其余 import type 在构建期被擦除。
import { toRaw } from 'vue';
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
  dxgiIndex: number; // Task Manager 中的 GPU 编号
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
      onLlamaUpdateProgress: (cb: (e: { percent: number; stage: string }) => void) => () => void;
      onTrayUpdateRequest: (cb: () => void) => () => void;
      onTraySettingsRequest: (cb: () => void) => () => void;
      onGpuStats: (cb: (e: { gpus: GpuStats[] }) => void) => () => void;
      onStartupLlamaCheck: (cb: (e: { status: string; dir: string }) => void) => () => void;
      onStartupLlamaCheck: (cb: (e: { status: string; dir: string }) => void) => () => void;
      // 快捷启动（规格 2026-10-10 §8 的事件）：ql-data = 终端页签的 PTY 输出；ql-exit = 进程退出
      onQlData: (cb: (e: { tabId: string; data: string }) => void) => () => void;
      onQlExit: (cb: (e: { configId: string; code: number }) => void) => () => void;
    };
  }
}

// download_update 返回类型（S10 Task 4：增加结构化 reasonCode；2026-10-05 i18n 响应性：可译错误改传 errorKey）
// 可译错误 → errorKey(+errorParams)，由渲染端渲染时 t()（切语言即时重译）；不可译原文 → reason 透传。
export type DownloadUpdateResult =
  | { ok: true; zipPath: string; size: number }
  | { ok: false; code?: 'no-update-task'; errorKey?: string; errorParams?: Record<string, string | number>; reason?: string };

// run_update 返回类型（2026-10-05 i18n 响应性：失败由 throw 改结构化返回，可译错误传 errorKey）
// 成功路径主进程 app.exit(0) 直接终止进程，渲染端收不到 { ok:true }。
export type RunUpdateResult =
  | { ok: true }
  | { ok: false; errorKey?: string; errorParams?: Record<string, string | number>; error?: string };

// 出站参数必须是「可结构化克隆」的纯数据。ipcRenderer.invoke 用结构化克隆序列化参数，HTML 规范对
// 带 [[PrimaryTemplate]] 内部槽的对象（= Proxy）一律 DataCloneError，界面上因此只剩一句
// "An object could not be cloned."（2026-10-19 用户反馈：快捷启动 [可执行程序] 行点 [复制] 必现，
// 同一条 [命令行] 行正常 —— shell 态字段全是标量。回归用例：QuickLaunch.test.ts 的
// copy_of_exe_row_sends_a_payload_that_survives_structured_clone。）
// 成因：渲染端的列表都挂在 ref 上 = Vue 深层响应式，`list.items[id]` 本身是 Proxy，
// QuickLaunch.vue 的 onCopy 里 `{ ...src, name }` 只拆最外层、嵌套的 exe 数组仍是 Proxy。
// 契约放在这个唯一出口，而不是要求每个调用点自己剥代理：调用点只需知道「参数是快照」。
// toRaw 取响应式代理的原始对象（其自身属性本就是纯数据），再重建数组与普通对象 ——
// 顺带把出站值与调用方状态脱钩。标量原样透传；类实例 / Date / Map 本仓没有作为 IPC 载荷的用法，
// 取 toRaw 后原样交给克隆（真出现嵌套代理泄漏时，宁可抛 DataCloneError 也不静默改形）。
// 最小复现（Vue ref + 浅拷贝 + structuredClone，三行）留在取证台 .temp/ql-copy-clone-probe/probe.mjs。
function plainArg<T>(value: T): T {
  const raw = toRaw(value);
  if (Array.isArray(raw)) return raw.map((v) => plainArg(v)) as unknown as T;
  const proto = typeof raw === 'object' && raw !== null ? Object.getPrototypeOf(raw) : undefined;
  if (proto === Object.prototype || proto === null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = plainArg(v);
    return out as T;
  }
  return raw as T;
}

export function invoke<T = unknown>(cmd: string, ...args: unknown[]): Promise<T> {
  return window.lms.invoke(cmd, ...args.map((a) => plainArg(a))) as Promise<T>;
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

export function onLlamaUpdateProgress(cb: (e: { percent: number; stage: string }) => void): () => void {
  return window.lms.onLlamaUpdateProgress(cb);
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

// 启动检测（2026-08-31-startup-llama-check-design 的 UI 透出，2026-11 用户确认）：
// 主进程 whenReady 的 detectLlamaInstall 算出 4 态后推送一次（与「启动检测 · …」日志行同源同刻）。
// status 取值 = src-main/llama-check.ts 的 LlamaInstallStatus：unset / dir_missing / exe_missing / ok
export function onStartupLlamaCheck(cb: (e: { status: string; dir: string }) => void): () => void {
  return window.lms.onStartupLlamaCheck(cb);
}

// 快捷启动（规格 2026-10-10-quick-launch-card-design §8 的两个事件）：
// ql-data = 终端页签的 PTY 输出（tabId = 'ql:<configId>'）；ql-exit = 进程退出（页签保留、按钮回落）。
// 返回 preload 的 removeListener 清理函数（照 onLogLine 的用法），订阅方卸载时调用它。
export function onQlData(cb: (e: { tabId: string; data: string }) => void): () => void {
  return window.lms.onQlData(cb);
}

export function onQlExit(cb: (e: { configId: string; code: number }) => void): () => void {
  return window.lms.onQlExit(cb);
}
