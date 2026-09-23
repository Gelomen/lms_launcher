// i18n 词典单一真源（spec 2026-09-22-i18n-design §3.1）。
// 纯数据 + 纯函数，不 import electron/node——主进程与渲染端共用（渲染端经 ../src-main 相对 import）。
export type Lang = 'zh' | 'en';

export const dict = {
  zh: {
    'common.cancel': '取消',
    'settings.title': '设置',
    'settings.proxy.host': '代理地址',
    'settings.proxy.port': '端口',
    'settings.close': '关闭弹窗',
    'settings.save': '保存',
    'settings.proxy.err.partial': '代理地址与端口须同时填写（或都留空以禁用代理）',
    'settings.proxy.err.host': '代理地址须为 IPv4 或主机名（不含端口、协议、空格）',
    'settings.proxy.err.port': '端口须为 1–65535 的数字',
    'tray.open': '打开 LMS 启动器',
    'tray.checkUpdate': '检查更新',
    'tray.settings': '设置',
    'tray.exit': '退出',
    'tray.tooltip.empty': '暂无模板配置',
    'app.brand': 'LMS 启动器',
    'app.winbar.github': 'GitHub 仓库',
    // 三键（最小化/最大化/还原/关闭）tooltip 已移除（2026-09-23 CDP 根因修复），aria-label 走静态中文
    'app.update.pill.available': '有新版本!',
    'app.update.pill.downloading': '下载中 {pct}%',
    'app.update.tip.available': '发现新版本 v{version}，点击查看并安装',
    'app.update.tip.downloading': '下载中 {pct}%，点击查看进度',
    'app.exit.title': '退出程序',
    'app.exit.message': '将停止 llama-server 并退出，是否确认？',
    // 目录卡片（S2 2026-09-23-i18n-dir-card）：值与 DirModule.vue 现状中文串逐字一致
    'dir.title': 'llama.cpp 安装目录',
    'dir.btn.select': '选择 llama.cpp 安装目录',
    'dir.status.ok': 'llama-server.exe 已找到',
    'dir.status.exe_missing': '未找到 llama-server.exe',
    'dir.status.dir_missing': 'llama.cpp 安装目录不存在',
    'dir.status.saving': '保存中…',
    // 启动控制卡片（S3 2026-09-23-i18n-launch-card）
    'launch.title': '启动 llama-server', // 2026-09-23 用户文案修订：原「llama-server 启动控制」
    'launch.placeholder.select': '选择配置…',
    'launch.placeholder.empty': '暂无模板配置',
  },
  en: {
    'common.cancel': 'Cancel',
    'settings.title': 'Settings',
    'settings.proxy.host': 'Proxy host',
    'settings.proxy.port': 'Port',
    'settings.close': 'Close dialog',
    'settings.save': 'Save',
    'settings.proxy.err.partial': 'Host and port must both be set (or leave both empty to disable proxy)',
    'settings.proxy.err.host': 'Proxy host must be IPv4 or a hostname (no port, scheme, or spaces)',
    'settings.proxy.err.port': 'Port must be a number from 1-65535',
    'tray.open': 'Open LMS Launcher',
    'tray.checkUpdate': 'Check for updates',
    'tray.settings': 'Settings',
    'tray.exit': 'Exit',
    'tray.tooltip.empty': 'No templates',
    'app.brand': 'LMS Launcher',
    'app.winbar.github': 'GitHub repository',
    'app.update.pill.available': 'New version!',
    'app.update.pill.downloading': '{pct}%',
    'app.update.tip.available': 'Version {version} available, click to view and install',
    'app.update.tip.downloading': 'Downloading {pct}%, click to view progress',
    'app.exit.title': 'Exit',
    'app.exit.message': 'llama-server will be stopped. Continue?',
    // 目录卡片（S2 2026-09-23-i18n-dir-card）
    'dir.title': 'llama.cpp directory',
    'dir.btn.select': 'Select directory',
    'dir.status.ok': 'llama-server.exe is available',
    'dir.status.exe_missing': 'llama-server.exe not found',
    'dir.status.dir_missing': "llama.cpp directory doesn't exist",
    'dir.status.saving': 'Saving...',
    // 启动控制卡片（S3 2026-09-23-i18n-launch-card）
    'launch.title': 'Launch llama-server',
    'launch.placeholder.select': 'Select a config...',
    'launch.placeholder.empty': 'No templates',
  },
} as const;

/** 占位符 `{name}` 替换；缺失 key 返回 key 本身；缺失参数保留占位符原文。 */
export function translate(
  table: Readonly<Record<string, string>>,
  key: string,
  params?: Readonly<Record<string, string | number>>,
): string {
  const raw = table[key];
  if (raw === undefined) return key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) =>
    params[name] !== undefined ? String(params[name]) : m,
  );
}

/** 系统 locale → 语言：zh 系 → zh，其余 → en。 */
export function resolveSystemLang(locale: string): Lang {
  return /^zh/i.test(locale ?? '') ? 'zh' : 'en';
}
