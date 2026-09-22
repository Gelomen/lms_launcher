// i18n 词典单一真源（spec 2026-09-22-i18n-design §3.1）。
// 纯数据 + 纯函数，不 import electron/node——主进程与渲染端共用（渲染端经 ../src-main 相对 import）。
export type Lang = 'zh' | 'en';

export const dict = {
  zh: {
    'common.cancel': '取消',
    'settings.title': '设置',
    'settings.language': '语言',
    'settings.proxy.host': '代理地址',
    'settings.proxy.port': '端口',
    'settings.close': '关闭弹窗',
    'settings.save': '保存',
    'settings.proxy.err.partial': '端口不能为空（或留空禁用代理）',
    'settings.proxy.err.host': '代理地址须为 IPv4 或主机名（不含端口、协议、空格）',
    'settings.proxy.err.port': '端口须为 1–65535 的数字',
    'tray.open': '打开 LMS 启动器',
    'tray.checkUpdate': '检查更新',
    'tray.settings': '设置',
    'tray.exit': '退出',
    'tray.tooltip.empty': '暂无模板配置',
  },
  en: {
    'common.cancel': 'Cancel',
    'settings.title': 'Settings',
    'settings.language': 'Language',
    'settings.proxy.host': 'Proxy host',
    'settings.proxy.port': 'Port',
    'settings.close': 'Close dialog',
    'settings.save': 'Save',
    'settings.proxy.err.partial': 'Port is required (leave both empty to disable proxy)',
    'settings.proxy.err.host': 'Proxy host must be IPv4 or a hostname (no port, scheme, or spaces)',
    'settings.proxy.err.port': 'Port must be a number from 1-65535',
    'tray.open': 'Open LMS Launcher',
    'tray.checkUpdate': 'Check for updates',
    'tray.settings': 'Settings',
    'tray.exit': 'Exit',
    'tray.tooltip.empty': 'No templates',
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
