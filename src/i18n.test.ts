// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('./ipc', () => ({ invoke: (cmd: string, ...args: unknown[]) => invoke(cmd, ...args) }));

import { t, setLang, applyLangLocal } from './i18n';

beforeEach(() => {
  invoke.mockClear();
  applyLangLocal('zh');
});

describe('renderer i18n', () => {
  it('默认中文', () => {
    expect(t('common.cancel')).toBe('取消');
  });

  it('setLang 切英文 + 通知主进程 + 同步 html lang', () => {
    setLang('en');
    expect(t('common.cancel')).toBe('Cancel');
    expect(invoke).toHaveBeenCalledWith('set_language', 'en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('applyLangLocal 不触发 invoke（仅本地）', () => {
    applyLangLocal('en');
    expect(invoke).not.toHaveBeenCalled();
  });
});
