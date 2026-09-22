// 最终审查 I-1 落地：规格 §3.1「缺失 key：返回 key 本身，并在 dev 下 console.warn（不抛错）」。
// node 环境纯模块测试（src-main/i18n 不 import electron），TDD：先 RED 后 GREEN。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { t, applyLang } from './index';

describe('main i18n t() 缺 key 告警（I-1）', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // 静默真实 warn 输出，避免测试 stderr 噪声（断言走 spy 调用记录）
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    applyLang('zh');
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('缺 key 返回 key 本身且 dev 下 console.warn（zh）', () => {
    applyLang('zh');
    expect(t('no.such.key')).toBe('no.such.key');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('no.such.key');
  });

  it('缺 key 返回 key 本身且 dev 下 console.warn（en）', () => {
    applyLang('en');
    expect(t('no.such.key')).toBe('no.such.key');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('no.such.key');
  });

  it('回归：正常 key 返回译文、applyLang 切换后 t 跟随、不 warn', () => {
    applyLang('zh');
    expect(t('common.cancel')).toBe('取消');
    expect(warnSpy).not.toHaveBeenCalled();
    applyLang('en');
    expect(t('common.cancel')).toBe('Cancel');
    expect(t('tray.open')).toBe('Open LMS Launcher');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
