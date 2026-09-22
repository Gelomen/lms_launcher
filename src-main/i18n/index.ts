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

/** 主进程侧 t()：使用当前语言。 */
export function t(key: string, params?: Record<string, string | number>): string {
  return translate(dict[current] as Readonly<Record<string, string>>, key, params);
}
