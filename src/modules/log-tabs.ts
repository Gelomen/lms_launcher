// 日志 tab 注册表 —— id 与显示顺序的单一真源（App 分桶 / LogPanel 标签条共用）。
// 新增应用 = 追加一行条目 + 渲染端路由（见 docs/superpowers/specs/2026-08-27-log-panel-tabs-design.md）。
export type LogTabId = 'launcher' | 'llama-server';

export interface LogTab { id: LogTabId; label: string }

// 顺序即 UI 左右顺序：LMS Launcher 在前，llama-server 在后（用户指定）。
export const LOG_TABS: ReadonlyArray<LogTab> = [
  { id: 'launcher', label: 'LMS Launcher' },
  { id: 'llama-server', label: 'llama-server' },
];