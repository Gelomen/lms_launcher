// @vitest-environment happy-dom
// 组件级测试：LogPanel —— §4.4 五档行级关键字着色（纯显示层）：
// sys 行 ln-dim / error·fatal·err 关键字 → ln-err / warn 关键字或 glog W 级别 → ln-warn /
// server ready·listening → ln-ok / 其余普通输出无类。
//
// RED 依据（用户实机截图）：llama-server 在 Windows 上把 I/W/E 各级日志全写进 stderr，
// main.ts 标记 stream='err'；旧 cls() 里 stream==='err' 优先于关键字判定 → 每行全红。
// 规格 §4.4：着色只靠内容关键字启发式，stream 不是颜色依据；
// glog 时间戳+级别前缀（0.02.572.005 W srv）是稳定信号：W→橙、E/F→红、I→默认。
import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import LogPanel from './LogPanel.vue';

interface E { line: string; stream: 'sys' | 'out' | 'err' }

function rowClass(tab: 'launcher' | 'llama-server', lines: E[]): string[] {
  const buckets = { launcher: [], 'llama-server': [] } as Record<'launcher' | 'llama-server', E[]>;
  buckets[tab] = lines;
  const wrapper = mount(LogPanel, { props: { buckets } });
  const cls = wrapper.findAll('.log-pane[data-tab-id="' + tab + '"] p').map((p) => p.classes().join(' '));
  wrapper.unmount();
  return cls;
}

describe('LogPanel 行级着色', () => {
  it('stderr_line_without_error_keyword_is_not_red', () => {
    // 核心 bug：stream='err' 单独不能判红（llama-server I/W 日志全走 stderr）
    expect(rowClass('llama-server', [{ line: '0.02.489.298 I cmn  common_param: verbosity = 3', stream: 'err' }])).toEqual(['']);
    expect(rowClass('llama-server', [{ line: 'random crash text', stream: 'err' }])).toEqual(['']);
  });

  it('error_keyword_line_renders_ln_err_regardless_of_stream', () => {
    expect(rowClass('llama-server', [{ line: 'ERROR: model file not found', stream: 'out' }])).toEqual(['ln-err']);
    expect(rowClass('llama-server', [{ line: 'llama_server: FATAL exception thrown', stream: 'out' }])).toEqual(['ln-err']);
    expect(rowClass('llama-server', [{ line: '1.2.3.4 E srv  llama_server: boom', stream: 'err' }])).toEqual(['ln-err']);
  });

  it('warn_or_warning_line_renders_ln_warn_on_any_stream', () => {
    expect(rowClass('llama-server', [{ line: '[WARN] 显卡显存不足，回退 CPU', stream: 'out' }])).toEqual(['ln-warn']);
    // 截图中的 CORS 警告：stream=err + W 级别前缀 → 橙
    expect(rowClass('llama-server', [{ line: "0.02.572.010 W srv  llama_server: CORS is set to allow all origins ('*')", stream: 'err' }])).toEqual(['ln-warn']);
  });

  it('glog_level_prefix_maps_i_to_default_and_w_to_warn', () => {
    // I 级别：无关键字 → 默认深灰（不再红）
    expect(rowClass('llama-server', [{ line: "0.03.226.108 I srv  llama_server: server is ready", stream: 'err' }])).toEqual(['']);
    // W model unused tensor……（截图中一行）→ 橙
    expect(rowClass('llama-server', [{ line: '0.03.226.614 W model has unused tensor blk.64.attn_norm.weight -- ignoring', stream: 'err' }])).toEqual(['ln-warn']);
  });

  it('sys_line_renders_ln_dim_and_ready_renders_ln_ok', () => {
    expect(rowClass('launcher', [{ line: '[lms_launcher] 启动配置 · c1', stream: 'sys' }])).toEqual(['ln-dim']);
    expect(rowClass('llama-server', [{ line: 'server ready, listening on :8080', stream: 'out' }])).toEqual(['ln-ok']);
    // 普通输出不叠加着色类（无 class → join 为空串）
    expect(rowClass('llama-server', [{ line: 'n_gpu_layers 999', stream: 'out' }])).toEqual(['']);
  });
});

describe('LogPanel tab 隔离', () => {
  it('autoScroll state is per-tab (pausing one tab does not affect the other)', async () => {
    const buckets: Record<string, E[]> = { launcher: [], 'llama-server': [] };
    const w = mount(LogPanel, { props: { buckets } });
    // 两个 pane 各有一个自动滚动 checkbox
    const boxes = w.findAll('input[type="checkbox"]');
    expect(boxes.length).toBe(2);
    await boxes[0].setChecked(false);   // 暂停 launcher
    expect(boxes[1].element.checked as boolean | undefined).toBe(true); // llama-server 仍开
    // 再点恢复，仅本 tab 状态变化（互不串扰）
    await boxes[0].setChecked(true);
    expect(boxes[1].element.checked as boolean | undefined).toBe(true);
    w.unmount();
  });
});

describe('LogPanel 自动滚动行为', () => {
  it('autoScroll_keeps_view_pinned_to_bottom_on_new_lines', async () => {
    // RED 依据（用户反馈）：勾选 [自动滚动] 后新增日志行，视图不跟随滚到最新位置。
    // 根因：watch 里「仅当用户已在底部附近才滚」——scrollTop 永远停在顶部，判定永远为假（死循环）。
    const buckets: Record<string, E[]> = { launcher: [], 'llama-server': [] };
    const w = mount(LogPanel, { props: { buckets } });
    const view = w.find('.log-pane[data-tab-id="llama-server"] .log-view');
    const el = view.element as HTMLElement;
    // happy-dom 无真实布局：手工钉住滚动几何（内容 2000px，视口 100px）
    Object.defineProperty(el, 'scrollHeight', { value: 2000, writable: true });
    Object.defineProperty(el, 'clientHeight', { value: 100, writable: true });
    el.scrollTop = 0; // bug 场景：视图停在上部
    await w.setProps({ buckets: { launcher: [], 'llama-server': [
      { line: '0.01.000.000 I srv  first line', stream: 'err' },
      { line: '0.01.000.001 I srv  second line', stream: 'err' },
    ] } });
    await nextTick(); // Vue 渲染
    await nextTick(); // 组件内部 nextTick 后再读 DOM
    // 勾选自动滚动时，新日志到达应把视图滚到最新位置（底部 = scrollHeight）
    expect(el.scrollTop).toBe(2000);
    w.unmount();
  });
});
