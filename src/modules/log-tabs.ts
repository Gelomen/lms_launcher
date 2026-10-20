// 日志 tab 注册表 —— id 与显示顺序的单一真源（App 分桶 / LogPanel 标签条共用）。
// 新增应用 = 追加一行条目 + 渲染端路由（见 docs/superpowers/specs/2026-08-27-log-panel-tabs-design.md）。
export type LogTabId = 'launcher' | 'llama-server';

export interface LogTab { id: LogTabId; label: string }

// 顺序即 UI 左右顺序：LMS Launcher 在前，llama-server 在后（用户指定）。
export const LOG_TABS: ReadonlyArray<LogTab> = [
  { id: 'launcher', label: 'LMS Launcher' },
  { id: 'llama-server', label: 'llama-server' },
];

// ---- 快捷启动终端页签（规格 2026-10-10-quick-launch-card-design §9.2 / 计划 §任务 10 接口）----
// 终端页签 id = 前缀 + 配置 id；需要 configId 处按索引 K2 用 id.slice(QL_TAB_PREFIX.length) 反解，不新增 API。
export const QL_TAB_PREFIX = 'ql:';

export function qlTabId(configId: string): string {
  return QL_TAB_PREFIX + configId;
}

// 两种页签共存（规格 §9.1）：text = 既有 LogTabView（不改）；terminal = TerminalTabView（xterm）。
export type LogTabKind = 'text' | 'terminal';

/**
 * 页签条目（索引 K26(2)）：label 是**构造方**（任务 13 的 App 接线）用 truncateByWidth(fullLabel, 16) 生成的短名，
 * LogPanel 只渲染 label、并在 label 与 fullLabel 不同时把 fullLabel 做成 hover 浮层（2026-10-20：原 native
 * title 已换成仓内自绘 .dd-tip，见 LogPanel.vue 的 onTabEnter），不再二次截断（两处预算会互相抵消）。
 * closeDisabled = 该页签的终端仍在运行，[x] 禁用（计划 审查重点 3 / R3：运行中关掉页签会留下孤儿 PTY）。
 */
export interface LogTabItem {
  id: string;
  label: string;
  fullLabel: string;
  kind: LogTabKind;
  closable: boolean;
  closeDisabled: boolean;
  configId?: string;
}