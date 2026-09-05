import { describe, it, expect } from 'vitest';
import { trayTooltipText } from './tray-tooltip';

describe('trayTooltipText', () => {
  it('non_empty_name_returns_trimmed_unchanged', () => {
    expect(trayTooltipText('Qwen3-30B')).toBe('Qwen3-30B');
    expect(trayTooltipText('  日常  ')).toBe('日常');
  });
  it('null_undefined_empty_whitespace_returns_placeholder', () => {
    expect(trayTooltipText(null)).toBe('暂无模板配置');
    expect(trayTooltipText(undefined)).toBe('暂无模板配置');
    expect(trayTooltipText('')).toBe('暂无模板配置');
    expect(trayTooltipText('   ')).toBe('暂无模板配置');
  });
});
