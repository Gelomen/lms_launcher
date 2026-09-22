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

export function getLang(): Lang {
  return lang.value;
}

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

/** 渲染端响应式 t()：读 lang ref，组件模板/计算属性自动重渲染。 */
export function t(key: string, params?: Record<string, string | number>): string {
  return translate(dict[lang.value] as Readonly<Record<string, string>>, key, params);
}
