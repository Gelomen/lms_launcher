import { describe, it, expect } from 'vitest';
import { checkLlamaInstall, installCheckMessage } from './llama-check';
import { tmpPath, rm, mkDir, writeText, jp } from './test-utils';

describe('llama-check.ts', () => {
  it('empty_or_blank_dir_is_unset', () => {
    expect(checkLlamaInstall('')).toBe('unset');
    expect(checkLlamaInstall('   ')).toBe('unset');
  });

  it('nonexistent_path_is_dir_missing', () => {
    const p = tmpPath('no-such-dir-xyz');
    rm(p);
    expect(checkLlamaInstall(p)).toBe('dir_missing');
  });

  it('dir_without_exe_is_exe_missing', () => {
    const dir = tmpPath('empty-llama-dir');
    rm(dir); mkDir(dir);
    expect(checkLlamaInstall(dir)).toBe('exe_missing');
    rm(dir);
  });

  it('dir_with_exe_is_ok', () => {
    const dir = tmpPath('ok-llama-dir');
    rm(dir); mkDir(dir);
    writeText(jp(dir, 'llama-server.exe'), 'stub');
    expect(checkLlamaInstall(dir)).toBe('ok');
    rm(dir);
  });

  it('messages_have_no_parentheses_and_match_status', () => {
    const dir = 'D:\AI\llama-cpp';
    expect(installCheckMessage(dir, 'unset')).toBe('[lms_launcher] 启动检测 · 未配置 llama.cpp 安装目录');
    expect(installCheckMessage(dir, 'dir_missing')).toBe('[lms_launcher] 启动检测 · 安装目录不存在：' + dir);
    expect(installCheckMessage(dir, 'exe_missing')).toBe('[lms_launcher] 启动检测 · 目录中未找到 llama-server.exe：' + dir);
    expect(installCheckMessage(dir, 'ok')).toBe('[lms_launcher] 启动检测 · llama-server.exe 已找到：' + dir);
    for (const s of ['unset', 'dir_missing', 'exe_missing', 'ok'] as const) {
      const m = installCheckMessage(dir, s);
      expect(m).not.toMatch(/[（(]/); // 批注：不带括号文字
    }
  });
});
