// @vitest-environment happy-dom
// 组件级测试：LogTabView —— 日志行链接识别与 Ctrl+左键打开（规格 2026-08-31-log-link-ctrl-click-design §3.2/§5.2）：
// 含 http(s) 的行渲染 .ln-link（文本 = URL）；无链接行无 .ln-link；
// Ctrl+点击 → invoke('open_external', url)；普通左键不触发任何 IPC。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import LogTabView from './LogTabView.vue';

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
    expect(link.attributes('data-tooltip')).toBe('https://example.com/guide'); // hover tooltip = 全局 tip-up 方案（data-tooltip），原生 :title 不保留
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
