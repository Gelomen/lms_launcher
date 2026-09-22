import { describe, it, expect } from 'vitest';
import { dict, translate, resolveSystemLang } from './dict';

describe('i18n dict', () => {
  it('zh 与 en 的 key 集合完全一致', () => {
    expect(Object.keys(dict.zh).sort()).toEqual(Object.keys(dict.en).sort());
  });

  it('词典无空值', () => {
    for (const lang of ['zh', 'en'] as const) {
      for (const [k, v] of Object.entries(dict[lang])) expect(v, k).not.toBe('');
    }
  });

  it('translate 替换 {name} 占位符', () => {
    expect(translate({ 'a.b': '下载中 {pct}%' }, 'a.b', { pct: 42 })).toBe('下载中 42%');
  });

  it('缺失 key 返回 key 本身', () => {
    expect(translate(dict.zh, 'no.such.key')).toBe('no.such.key');
  });

  it('缺失参数保留占位符原文', () => {
    expect(translate({ 'a.b': '{x} and {y}' }, 'a.b', { x: '1' })).toBe('1 and {y}');
  });

  it('resolveSystemLang：zh 系 → zh，其余 → en', () => {
    expect(resolveSystemLang('zh-CN')).toBe('zh');
    expect(resolveSystemLang('zh-TW')).toBe('zh');
    expect(resolveSystemLang('en-US')).toBe('en');
    expect(resolveSystemLang('ja-JP')).toBe('en');
  });
});
