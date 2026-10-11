import { describe, expect, it } from 'vitest';
import { nextCopyName } from './copy-name';

describe('nextCopyName', () => {
  it('首次复制加 - copy 后缀', () => {
    expect(nextCopyName('Qwen', new Set(['Qwen']))).toBe('Qwen - copy');
  });
  it('已占用时递增编号', () => {
    expect(nextCopyName('Qwen', new Set(['Qwen', 'Qwen - copy']))).toBe('Qwen - copy 2');
  });
  it('源名本身是复制品时剥后缀重算', () => {
    expect(nextCopyName('Qwen - copy', new Set(['Qwen - copy']))).toBe('Qwen - copy 2');
    expect(nextCopyName('Qwen - copy 2', new Set(['Qwen - copy 2']))).toBe('Qwen - copy');
  });
});
