// 主进程语言状态（spec §3.3）。纯模块：不 import electron，便于 node 环境单测。
import { dict, translate, type Lang } from './dict';

let current: Lang = 'zh';

export type { Lang } from './dict';

export function getLang(): Lang {
  return current;
}

export function applyLang(lang: Lang): void {
  current = lang;
}

/** 主进程侧 t()：使用当前语言。缺 key 时返回 key 本身，并在 dev（NODE_ENV 非 production）下 console.warn（spec §3.1）。 */
export function t(key: string, params?: Record<string, string | number>): string {
  const table = dict[current] as Readonly<Record<string, string>>;
  if (table[key] === undefined && process.env.NODE_ENV !== 'production') {
    console.warn(`[i18n] missing key: ${key} (lang=${current})`);
  }
  return translate(table, key, params);
}

export { resolveSystemLang } from './dict';
