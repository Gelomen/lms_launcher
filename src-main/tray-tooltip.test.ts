import { describe, it, expect } from 'vitest';
import { trayTooltipText } from './tray-tooltip';

const EMPTY = '暂无模板配置';

describe('trayTooltipText', () => {
  it('non_empty_name_returns_trimmed_unchanged', () => {
    expect(trayTooltipText('Qwen3-30B', EMPTY)).toBe('Qwen3-30B');
    expect(trayTooltipText('  日常  ', EMPTY)).toBe('日常');
  });
  it('null_undefined_empty_whitespace_returns_placeholder', () => {
    expect(trayTooltipText(null, EMPTY)).toBe(EMPTY);
    expect(trayTooltipText(undefined, EMPTY)).toBe(EMPTY);
    expect(trayTooltipText('', EMPTY)).toBe(EMPTY);
    expect(trayTooltipText('   ', EMPTY)).toBe(EMPTY);
  });
  it('placeholder_is_injected_by_caller(支持 i18n)', () => {
    expect(trayTooltipText(null, 'No templates')).toBe('No templates');
  });
});
