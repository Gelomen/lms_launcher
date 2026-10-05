// 渲染端 i18n 基座（spec §3.1/§3.3）。词典直接引用主进程侧单一真源（Vite 支持跨目录相对 import）。
import { computed, ref } from 'vue';
import { dict, translate, type Lang } from '../src-main/i18n/dict';
import { invoke } from './ipc';

// re-export：渲染端使用方（src/main.ts、SettingsModal.vue 等）统一从本模块 import type Lang，
// 与 src-main/i18n/index.ts 的 re-export 模式一致（根因：任务 1 落地时缺此行，导致 import type Lang 为类型错误）。
export type { Lang } from '../src-main/i18n/dict';

const lang = ref<Lang>('zh');

/** 当前语言（只读视图，变更请走 setLang / applyLangLocal）。 */
export const currentLang = computed<Lang>(() => lang.value);

/** 仅改本地状态 + <html lang>，不触碰持久化。启动取初值用。 */
export function applyLangLocal(l: Lang): void {
  lang.value = l;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  }
}

/** 用户切换：本地立即生效 + 通知主进程写 yaml / 重建托盘。 */
export function setLang(l: Lang): void {
  applyLangLocal(l);
  void invoke('set_language', l);
}

/** 渲染端响应式 t()：读 lang ref，组件模板/计算属性自动重渲染。缺 key 时返回 key 本身，并在 dev（NODE_ENV 非 production）下 console.warn（spec §3.1）。 */
export function t(key: string, params?: Record<string, string | number>): string {
  const table = dict[lang.value] as Readonly<Record<string, string>>;
  if (table[key] === undefined && process.env.NODE_ENV !== 'production') {
    console.warn(`[i18n] missing key: ${key} (lang=${lang.value})`);
  }
  return translate(table, key, params);
}

/**
 * 错误文案三通道（2026-10-05 i18n 响应性修复）：可译错误存 **key(+params)**、渲染时才翻译 → 切语言即时重译；
 * 不可译原文（IO/系统消息）存 errorRaw 原样透传；两者皆无 → 回退 fallbackKey。
 * 背景：此前把「赋值时刻翻译好的成品串」存进 ref/state（主进程经 IPC 传译串 / 渲染端赋值时 t()），
 * 切语言只重渲染模板、不会重译已存字符串 → 红字冻结在旧语言（用户反馈的 llama.cpp 行错误提示）。
 */
export interface ErrFields {
  errorKey?: string;
  errorParams?: Record<string, string | number>;
  errorRaw?: string;
}

/** key 是否存在于当前语言词典：渲染前校验「主进程传入的 key」，未知 key 回退通用文案而非显示调试串。 */
export function hasKey(key: string): boolean {
  return (dict[lang.value] as Readonly<Record<string, string>>)[key] !== undefined;
}

/** 解析错误文案（**渲染时**调用）：key → t()；未知 key → fallbackKey；errorRaw → 原文；皆无 → fallbackKey。 */
export function errTextOf(e: ErrFields | null | undefined, fallbackKey: string): string {
  if (e?.errorKey) return hasKey(e.errorKey) ? t(e.errorKey, e.errorParams) : t(fallbackKey);
  if (e?.errorRaw) return e.errorRaw;
  return t(fallbackKey);
}

/** IPC 错误结果 → 渲染端三通道字段：优先主进程给的 errorKey；否则原文 error；都没有 → fallbackKey（可译、随语言重译）。 */
export function errFromIpc(r: ErrFields & { error?: string }, fallbackKey: string): ErrFields {
  if (r.errorKey) return { errorKey: r.errorKey, errorParams: r.errorParams };
  if (r.error) return { errorRaw: r.error };
  return { errorKey: fallbackKey };
}
