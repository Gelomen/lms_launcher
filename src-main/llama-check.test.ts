import { describe, it, expect } from 'vitest';
import { checkLlamaInstall, installCheckMessage } from './llama-check';
import { applyLang } from './i18n';

describe('checkLlamaInstall', () => {
  it('returns unset for empty dir', () => {
    expect(checkLlamaInstall('')).toBe('unset');
  });

  it('returns unset for whitespace-only dir', () => {
    expect(checkLlamaInstall('   ')).toBe('unset');
  });
});

describe('installCheckMessage', () => {
  it('zh: 4 态启动检测行中文', () => {
    applyLang('zh');
    expect(installCheckMessage('D:/x', 'unset')).toBe('[lms_launcher] 启动检测 · 未配置 llama.cpp 安装目录');
    expect(installCheckMessage('D:/x', 'dir_missing')).toBe('[lms_launcher] 启动检测 · llama.cpp 安装目录不存在：D:/x');
    expect(installCheckMessage('D:/x', 'exe_missing')).toBe('[lms_launcher] 启动检测 · 目录中未找到 llama-server.exe：D:/x');
    expect(installCheckMessage('D:/x', 'ok')).toBe('[lms_launcher] 启动检测 · llama-server.exe 已找到：D:/x');
  });

  it('en: 4 态启动检测行英文', () => {
    applyLang('en');
    expect(installCheckMessage('D:/x', 'unset')).toBe('[lms_launcher] Startup check · llama.cpp directory not set');
    expect(installCheckMessage('D:/x', 'dir_missing')).toBe('[lms_launcher] Startup check · llama.cpp directory does not exist: D:/x');
    expect(installCheckMessage('D:/x', 'exe_missing')).toBe('[lms_launcher] Startup check · llama-server.exe not found in directory: D:/x');
    expect(installCheckMessage('D:/x', 'ok')).toBe('[lms_launcher] Startup check · llama-server.exe available: D:/x');
    applyLang('zh');
  });
});

describe('en prefix retention', () => {
  it('en: startup check lines are in English', () => {
    applyLang('en');
    expect(installCheckMessage('D:/x', 'unset')).toBe('[lms_launcher] Startup check · llama.cpp directory not set');
    expect(installCheckMessage('D:/x', 'ok')).toBe('[lms_launcher] Startup check · llama-server.exe available: D:/x');
    applyLang('zh');
  });
});