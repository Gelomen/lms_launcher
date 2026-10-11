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

  it('缺 key 回 key + dev warn（I-1）', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      applyLangLocal('zh');
      expect(t('no.such.key')).toBe('no.such.key');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('no.such.key');
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// 任务 8（2026-10-10-quick-launch-card）：快捷启动 / 交互终端词条的落地门。
// check 表 task-08 E1（字面量断言）+ E5（对 TerminalId 四个值的枚举断言）。
// 为什么两条都要：key-coverage.test.ts:39-41 的 KEY_CALL 只认「t('字面量')」，
// 拼接式 t('ql.term.' + id) 被跳过（该表 A3 / F5）——本文件是那条缺口的唯一兜底；
// 而 key-coverage 的 walk()（:24）排除 .test.ts，所以这里用动态 key 不会触门。
// TerminalId 是封闭集合（规格 §3）：用 Record<TerminalId, …> 让「新增第五种终端」在类型层
// 就要求补一条断言，做法照 src-main/i18n/err-keys.ts + dict.test.ts:63-68。
import type { TerminalId } from '../src-main/quick-launch-config';

// 四个 id 来自规格 §6.1；en 取值逐字来自计划 任务 8 步骤 3 / check 表 C3
const TERM_IDS: Record<TerminalId, true> = { pwsh: true, powershell: true, cmd: true, wsl: true };
const TERM_LABEL_EN: Record<TerminalId, string> = {
  pwsh: 'PowerShell 7 (pwsh)',
  powershell: 'Windows PowerShell',
  cmd: 'Command Prompt (cmd)',
  wsl: 'WSL',
};

describe('快捷启动词条（任务 8 · check E1）', () => {
  it('ql.title 已落地，不是键名本身（中英两侧）', () => {
    applyLangLocal('zh');
    expect(t('ql.title')).not.toBe('ql.title');
    applyLangLocal('en');
    expect(t('ql.title')).not.toBe('ql.title');
  });

  it('四个终端标签的 en 取值逐字（check C3 / 计划 步骤 3）', () => {
    applyLangLocal('en');
    expect(t('ql.term.powershell')).toBe('Windows PowerShell');
    expect(t('ql.term.pwsh')).toBe('PowerShell 7 (pwsh)');
    expect(t('ql.term.cmd')).toBe('Command Prompt (cmd)');
    expect(t('ql.term.wsl')).toBe('WSL');
  });
});

describe('终端标签枚举（任务 8 · check E5 / F5 兜底）', () => {
  // 动态 key：兜的正是「源码若写成 t('ql.term.' + id) 则 key-coverage 扫不到」那条缺口（该表 A3）
  it('TerminalId 每个值在 zh/en 词典都有 ql.term.<id>，且不是键名本身 / en 逐字', () => {
    for (const id of Object.keys(TERM_IDS) as TerminalId[]) {
      const key = 'ql.term.' + id;
      applyLangLocal('zh');
      expect(t(key), key + '(zh)').not.toBe(key);
      applyLangLocal('en');
      expect(t(key), key + '(en)').not.toBe(key);
      expect(t(key), key + '(en)').toBe(TERM_LABEL_EN[id]);
    }
  });
});
