// @vitest-environment happy-dom
// 组件级测试：LogTabView —— 日志行链接识别与 Ctrl+左键打开（规格 2026-08-31-log-link-ctrl-click-design §3.2/§5.2）：
// 含 http(s) 的行渲染 .ln-link（文本 = URL）；无链接行无 .ln-link；
// Ctrl+点击 → invoke('open_external', url)；普通左键不触发任何 IPC。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import LogTabView from './LogTabView.vue';
import { applyLangLocal } from '../i18n';

const invoke = vi.fn().mockResolvedValue(undefined);
vi.mock('../ipc', () => ({
  invoke: (cmd: string, ...args: unknown[]) => invoke(cmd, ...args),
}));

interface E { line: string; stream: 'sys' | 'out' | 'err' }

function mountTab(lines: E[]): ReturnType<typeof mount> {
  return mount(LogTabView, { props: { id: 't', lines } });
}

describe('LogTabView 链接渲染', () => {
  beforeEach(() => { invoke.mockClear(); });

  it('link_line_renders_ln_link_span_with_url_text', () => {
    const w = mountTab([{ line: 'docs at https://example.com/guide end', stream: 'out' }]);
    const link = w.find('.ln-link');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe('https://example.com/guide');
    expect(link.attributes('data-tooltip')).toBe('Ctrl + Click 打开链接'); // hover tooltip = 全局 tip-up 方案（data-tooltip），固定文案，原生 :title 不保留
    // 行整体文本不变（段拼接还原原行）
    expect(w.find('.log-view').text()).toBe('docs at https://example.com/guide end');
    w.unmount();
  });

  it('line_without_link_renders_no_ln_link', () => {
    const w = mountTab([{ line: '0.01.000.000 I srv  init done', stream: 'err' }]);
    expect(w.find('.ln-link').exists()).toBe(false);
    w.unmount();
  });
});

describe('LogTabView Ctrl+点击', () => {
  beforeEach(() => { invoke.mockClear(); });

  it('ctrl_click_invokes_open_external_with_url', async () => {
    const w = mountTab([{ line: 'open http://llama.com/x.html now', stream: 'out' }]);
    await w.find('.ln-link').trigger('click', { ctrlKey: true });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('open_external', 'http://llama.com/x.html');
    w.unmount();
  });

  it('plain_click_does_not_invoke_any_ipc', async () => {
    const w = mountTab([{ line: 'open http://llama.com/x.html now', stream: 'out' }]);
    await w.find('.ln-link').trigger('click');
    expect(invoke).not.toHaveBeenCalled();
    w.unmount();
  });
});

describe('LogTabView 日志查找（规格 2026-09-05-log-search-design）', () => {
  const lines: E[] = [
    { line: 'boot ok', stream: 'out' },
    { line: 'Error: disk full', stream: 'err' },
    { line: 'error retrying now', stream: 'out' },
  ];

  it('typing_query_highlights_all_matches_and_shows_count', async () => {
    const w = mountTab([...lines]);
    const input = w.find('.log-search-input');
    await input.setValue('error');
    expect(w.findAll('.ln-mark').length).toBe(2);           // 两行各一处
    expect(w.find('.log-search-count').text()).toBe('0 / 2'); // 尚未跳转
    // 高亮不改变行文本内容
    expect(w.find('.log-view').text()).toContain('Error: disk full');
    w.unmount();
  });

  it('zero_matches_shows_0_and_disables_nav_buttons', async () => {
    const w = mountTab([...lines]);
    await w.find('.log-search-input').setValue('nope');
    expect(w.findAll('.ln-mark').length).toBe(0);
    expect(w.find('.log-search-count').text()).toBe('0 / 0');
    expect(w.find('.btn-search-prev').attributes('disabled')).toBeDefined();
    expect(w.find('.btn-search-next').attributes('disabled')).toBeDefined();
    w.unmount();
  });

  it('next_button_walks_matches_and_wraps', async () => {
    const w = mountTab([...lines]);
    await w.find('.log-search-input').setValue('error');
    const next = w.find('.btn-search-next');
    await next.trigger('click');
    expect(w.find('.log-search-count').text()).toBe('1 / 2');
    expect(w.find('.ln-mark--current').exists()).toBe(true);
    await next.trigger('click');
    expect(w.find('.log-search-count').text()).toBe('2 / 2');
    await next.trigger('click'); // 回绕到第 1 个
    expect(w.find('.log-search-count').text()).toBe('1 / 2');
    // 当前高亮落在行 2（0-based）
    const currentLine = w.find('.ln-mark--current').element.closest('p');
    expect((currentLine as HTMLElement).textContent).toContain('Error: disk full');
    w.unmount();
  });

  it('prev_button_from_no_current_jumps_to_last_match', async () => {
    const w = mountTab([...lines]);
    await w.find('.log-search-input').setValue('error');
    await w.find('.btn-search-prev').trigger('click');
    expect(w.find('.log-search-count').text()).toBe('2 / 2');
    const currentLine = w.find('.ln-mark--current').element.closest('p');
    expect((currentLine as HTMLElement).textContent).toContain('error retrying now');
    w.unmount();
  });

  it('jumping_disables_auto_scroll', async () => {
    const w = mountTab([...lines]);
    await w.find('.log-search-input').setValue('error');
    expect(w.find('input[type="checkbox"]').element.checked).toBe(true); // 默认勾选
    await w.find('.btn-search-next').trigger('click');
    expect(w.find('input[type="checkbox"]').element.checked).toBe(false);
    w.unmount();
  });

  it('clearing_query_removes_highlights_and_resets_count', async () => {
    const w = mountTab([...lines]);
    await w.find('.log-search-input').setValue('error');
    await w.find('.btn-search-next').trigger('click');
    await w.find('.log-search-input').setValue('');
    expect(w.findAll('.ln-mark, .ln-mark--current').length).toBe(0);
    expect(w.find('.log-search-count').text()).toBe('0 / 0');
    expect(w.find('.btn-search-prev').attributes('disabled')).toBeDefined();
    w.unmount();
  });

  it('match_count_shrink_resets_or_falls_back_current_index', async () => {
    // 规格 §行为 6：匹配列表变化后当前序号越界 → 回落到最后一个匹配 / 无匹配复位
    const w = mountTab([...lines]);
    await w.find('.log-search-input').setValue('error');
    await w.find('.btn-search-next').trigger('click'); // currentIdx = 0
    expect(w.find('.log-search-count').text()).toBe('1 / 2');
    // 场景 A：行变化使匹配缩减为 1 个 → 当前回落到唯一匹配
    await w.setProps({ lines: [{ line: 'all quiet', stream: 'out' }, { line: 'Error: retry', stream: 'err' }] });
    expect(w.find('.log-search-count').text()).toBe('1 / 1');
    expect(w.find('.ln-mark--current').exists()).toBe(true);
    const line = w.find('.ln-mark--current').element.closest('p');
    expect((line as HTMLElement).textContent).toContain('Error: retry');
    // 场景 B：行全部变化、匹配清零 → 高亮与计数复位、按钮禁用
    await w.setProps({ lines: [{ line: 'nothing to see', stream: 'out' }] });
    expect(w.findAll('.ln-mark, .ln-mark--current').length).toBe(0);
    expect(w.find('.log-search-count').text()).toBe('0 / 0');
    expect(w.find('.btn-search-next').attributes('disabled')).toBeDefined();
    w.unmount();
  });

  it('clear_query_button_empties_input_and_resets_highlights', async () => {
    // 用户追加（2026-09-05）：输入框与计数之间的 far circle-xmark 按钮，点击清空查找
    const w = mountTab([...lines]);
    await w.find('.log-search-input').setValue('error');
    expect(w.findAll('.ln-mark').length).toBe(2);
    await w.find('.btn-search-clear').trigger('click');
    expect(w.find('.log-search-input').element.value).toBe('');
    expect(w.find('.log-search-count').text()).toBe('0 / 0');
    expect(w.findAll('.ln-mark, .ln-mark--current').length).toBe(0);
    expect(w.find('.btn-search-clear').attributes('disabled')).toBeDefined(); // 空输入后自身禁用
    w.unmount();
  });

  it('clear_button_disabled_when_input_empty', () => {
    const w = mountTab([...lines]);
    expect(w.find('.btn-search-clear').attributes('disabled')).toBeDefined();
    w.unmount();
  });

  it('match_inside_url_is_highlighted_and_link_preserved', async () => {
    const w = mountTab([{ line: 'see https://docs.example.com/err guide', stream: 'out' }]);
    await w.find('.log-search-input').setValue('docs');
    const link = w.find('.ln-link');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe('https://docs.example.com/err'); // 文本完整
    expect(link.find('.ln-mark').exists()).toBe(true);        // 内部高亮段
    expect(link.find('.ln-mark').text()).toBe('docs');
    w.unmount();
  });
});


describe('LogTabView i18n', () => {
  const urlLine: E[] = [{ line: 'see https://example.com/x now', stream: 'out' }];

  it('zh: all control texts match current (zero regression)', () => {
    const w = mountTab(urlLine);
    expect(w.find('.label span').text()).toBe('自动滚动');
    expect(w.find('button[aria-label="清空日志"]').attributes('data-tooltip')).toBe('清空日志');
    const input = w.find('.log-search-input');
    expect(input.attributes('placeholder')).toBe('查找…');
    expect(input.attributes('aria-label')).toBe('日志查找');
    const searchClear = w.find('.btn-search-clear');
    expect(searchClear.attributes('aria-label')).toBe('清空查找');
    expect(searchClear.attributes('data-tooltip')).toBe('清空查找');
    expect(w.find('.btn-search-prev').attributes('aria-label')).toBe('上一个匹配');
    expect(w.find('.btn-search-prev').attributes('data-tooltip')).toBe('上一个');
    expect(w.find('.btn-search-next').attributes('aria-label')).toBe('下一个匹配');
    expect(w.find('.btn-search-next').attributes('data-tooltip')).toBe('下一个');
    expect(w.find('.ln-link').attributes('data-tooltip')).toBe('Ctrl + Click 打开链接');
    w.unmount();
    const e = mountTab([]);
    expect(e.find('.ln-dim').text()).toBe('暂无日志');
    e.unmount();
  });

  describe('en smoke', () => {
    beforeEach(() => { applyLangLocal('en'); });
    afterEach(() => { applyLangLocal('zh'); });

    it('toolbar = Auto-scroll / Clear', () => {
      const w = mountTab([]);
      expect(w.find('.label span').text()).toBe('Auto-scroll');
      const clear = w.find('button[aria-label="Clear"]');
      expect(clear.exists()).toBe(true);
      expect(clear.attributes('data-tooltip')).toBe('Clear');
      w.unmount();
    });

    it('search group = Find... / Search logs / Clear search', () => {
      const w = mountTab([]);
      expect(w.find('.log-search-input').attributes('placeholder')).toBe('Find...');
      expect(w.find('.log-search-input').attributes('aria-label')).toBe('Search logs');
      const searchClear = w.find('.btn-search-clear');
      expect(searchClear.attributes('aria-label')).toBe('Clear search');
      expect(searchClear.attributes('data-tooltip')).toBe('Clear search');
      w.unmount();
    });

    it('nav aria = Previous match / Next match, tooltip = Previous / Next', () => {
      const w = mountTab([]);
      expect(w.find('.btn-search-prev').attributes('aria-label')).toBe('Previous match');
      expect(w.find('.btn-search-prev').attributes('data-tooltip')).toBe('Previous');
      expect(w.find('.btn-search-next').attributes('aria-label')).toBe('Next match');
      expect(w.find('.btn-search-next').attributes('data-tooltip')).toBe('Next');
      w.unmount();
    });

    it('empty state = no logs', () => {
      const w = mountTab([]);
      expect(w.find('.ln-dim').text()).toBe('no logs');
      w.unmount();
    });

    it('link tooltip = Ctrl + Click to open link', () => {
      const w = mountTab(urlLine);
      expect(w.find('.ln-link').attributes('data-tooltip')).toBe('Ctrl + Click to open link');
      w.unmount();
    });

    it('non-translation items locked: match count and log body', async () => {
      const w = mountTab([
        { line: 'boot ok', stream: 'out' },
        { line: 'Error: disk full', stream: 'err' },
        { line: 'error retrying now', stream: 'out' },
      ]);
      expect(w.find('.log-search-count').text()).toBe('0 / 0');
      await w.find('.log-search-input').setValue('error');
      await w.find('.btn-search-next').trigger('click');
      expect(w.find('.log-search-count').text()).toBe('1 / 2');
      expect(w.find('.log-view').text()).toContain('Error: disk full');
      w.unmount();
    });
  });
});