import { describe, expect, it } from 'vitest';
import { getProgramArgs } from './argv-utils';

describe('getProgramArgs', () => {
  it('打包 exe 形态：argv=[exe, arg1, arg2] → [arg1, arg2]', () => {
    expect(getProgramArgs(['C:/app/update.exe', 'a.zip', 'C:/app'])).toEqual(['a.zip', 'C:/app']);
  });

  it('dev 形态：argv=[electron, script.js, arg1, arg2] → [arg1, arg2]', () => {
    expect(getProgramArgs(['C:/electron.exe', 'D:/src-update/main.js', 'a.zip', 'C:/app'])).toEqual(['a.zip', 'C:/app']);
  });

  it('dev 形态（.ts 入口）同样跳过两个元素', () => {
    expect(getProgramArgs(['C:/electron.exe', 'D:/src-update/main.ts', 'a.zip'])).toEqual(['a.zip']);
  });

  it('无参数 → 空数组', () => {
    expect(getProgramArgs(['C:/app/update.exe'])).toEqual([]);
  });
});
