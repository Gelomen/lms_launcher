// @vitest-environment happy-dom
// 真 xterm + 真 addon-search 的查找集成回归测试 —— 本文件**不打桩**，与 TerminalTabView.test.ts 相反。
//
// 为什么要有这个文件（用户反馈：命令行页签里输入终端里确实存在的文本，计数恒为「0 / 0」）：
// 打桩套件（规格 §12.5 / 索引 G8「xterm 与三个 addon 必须打桩」）里的假 SearchAddon 在 findNext 时
// **无条件**回调结果事件，所以「真实 xterm 拒绝建立查找装饰」这类真机故障在打桩套件里永远是绿的。
// 真实契约：addon-search 只在传了 decorations 时发计数事件，而它建装饰走 xterm 的 registerDecoration
// —— 该 API 在 @xterm/xterm 5.5.0 里是 EXPERIMENTAL（typings/xterm.d.ts:1118），未开 allowProposedApi
// 就抛「You must set the allowProposedApi option to true to use proposed API」，
// 抛出点在 _highlightAllMatches 内、早于 _fireResults → 计数事件从不触发，页签停在「0 / 0」。
// 这条缝只能由真 xterm 覆盖，故本文件按真机装配。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import TerminalTabView from './TerminalTabView.vue';
import { applyLangLocal } from '../i18n';

// happy-dom 无 ResizeObserver：组件挂载时会 new 一个（尺寸链用），这里给个空实现
class FakeResizeObserver {
  observe(): void { /* noop */ }
  unobserve(): void { /* noop */ }
  disconnect(): void { /* noop */ }
}
const realResizeObserver = globalThis.ResizeObserver;

// 渲染端 IPC：open_external / clipboard_* 在查找路径上不参与，给个空实现即可
vi.mock('../ipc', () => ({ invoke: () => Promise.resolve('') }));

/** 用户截图那类 PowerShell dir 输出：中文宽字符 + 表头 + 目标串在中间行。 */
function dirOutput(target: string): string {
  let s = '  目录: C:\\Users\\Gelomen\r\n';
  s += 'Mode                LastWriteTime         Length Name\r\n';
  s += '----                -------------         ------ ----\r\n';
  s += 'd----        18/10/2026  下午 5:44                .agents\r\n';
  s += 'd----        19/10/2026  下午 2:36                ' + target + '\r\n';
  s += 'd----        20/10/2026  上午 1:26                .vscode\r\n';
  return s;
}

/**
 * xterm.write 的解析在稍后的宏任务里跑（组件交出的 sink 不带写回调），
 * 所以写完必须等真实定时器跑一轮，才能对 buffer 发起查找。
 */
const settle = (ms = 40): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function mountReal(over: Record<string, unknown> = {}): Promise<{ w: VueWrapper; sink: (d: string) => void }> {
  let sink: ((d: string) => void) | null = null;
  const w = mount(TerminalTabView, {
    props: {
      id: 'ql:demo',
      label: 'Demo',
      fullLabel: 'Demo · PowerShell 7 (pwsh)',
      closable: true,
      closeDisabled: false,
      register: (_id: string, cb: (d: string) => void) => { sink = cb; },
      unregister: () => { /* noop */ },
      onInput: () => { /* noop */ },
      onResize: () => { /* noop */ },
      ...over,
    },
    attachTo: document.body,
  });
  await flushPromises();
  if (!sink) throw new Error('组件未在挂载时 register 输出 sink');
  return { w, sink: sink as (d: string) => void };
}

const countText = (w: VueWrapper): string => w.find('.log-search-count').text();

beforeEach(() => {
  applyLangLocal('zh');
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
});
afterEach(() => {
  globalThis.ResizeObserver = realResizeObserver;
  document.body.innerHTML = '';
});

describe('TerminalTabView 查找（真 xterm 集成）', () => {
  it('search_finds_text_that_exists_in_the_terminal', async () => {
    const { w, sink } = await mountReal();
    sink(dirOutput('.wslconfig'));
    await settle();
    await w.find('.log-search-input').setValue('wsl');
    await flushPromises();
    // 用户症状：终端里存在 wsl，计数却是「0 / 0」。真机契约要求报出 1 个匹配。
    expect(countText(w)).toBe('1 / 1');
    expect(w.find('.btn-search-next').attributes('disabled')).toBeUndefined();
    w.unmount();
  });

  it('wide_cjk_lines_do_not_break_the_match_count', async () => {
    // 中文宽字符占两列，addon 的 buffer↔string 偏移换算必须仍然成立
    const { w, sink } = await mountReal();
    sink(dirOutput('.ipython'));
    await settle();
    await w.find('.log-search-input').setValue('ipython');
    await flushPromises();
    expect(countText(w)).toBe('1 / 1');
    w.unmount();
  });

  it('several_matches_enable_navigation_and_number_them', async () => {
    const { w, sink } = await mountReal();
    sink('line one wsl here\r\nline two filler\r\nline three wsl again\r\n');
    await settle();
    await w.find('.log-search-input').setValue('wsl');
    await flushPromises();
    expect(countText(w)).toBe('1 / 2');
    await w.find('.btn-search-next').trigger('click');
    await flushPromises();
    expect(countText(w)).toBe('2 / 2');
    await w.find('.btn-search-prev').trigger('click');
    await flushPromises();
    expect(countText(w)).toBe('1 / 2');
    w.unmount();
  });

  it('text_absent_from_the_terminal_reports_zero_and_disables_navigation', async () => {
    const { w, sink } = await mountReal();
    sink(dirOutput('.wslconfig'));
    await settle();
    await w.find('.log-search-input').setValue('nosuchtext');
    await flushPromises();
    expect(countText(w)).toBe('0 / 0');
    expect(w.find('.btn-search-next').attributes('disabled')).toBeDefined();
    w.unmount();
  });
});
