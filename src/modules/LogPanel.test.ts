// @vitest-environment happy-dom
// 组件级测试：LogPanel —— §4.4 五档行级关键字着色（纯显示层）：
// sys 行 ln-dim / err 或 error·fatal → ln-err / warn·warning → ln-warn /
// server ready·listening → ln-ok / 其余普通输出无类。
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LogPanel from './LogPanel.vue';

interface E { line: string; stream: 'sys' | 'out' | 'err' }

function rowClass(lines: E[]): string[] {
  const wrapper = mount(LogPanel, { props: { lines } });
  const cls = wrapper.findAll('.log-view p').map((p) => p.classes().join(' '));
  wrapper.unmount();
  return cls;
}

describe('LogPanel 行级着色', () => {
  it('warn_or_warning_line_renders_ln_warn', () => {
    expect(rowClass([{ line: '[WARN] 显卡显存不足，回退 CPU', stream: 'out' }])).toEqual(['ln-warn']);
    expect(rowClass([{ line: 'warning: unsupported flag -foo', stream: 'out' }])).toEqual(['ln-warn']);
  });

  it('error_or_err_line_renders_ln_err', () => {
    expect(rowClass([{ line: 'ERROR: model file not found', stream: 'out' }])).toEqual(['ln-err']);
    expect(rowClass([{ line: 'random crash text', stream: 'err' }])).toEqual(['ln-err']);
  });

  it('sys_line_renders_ln_dim', () => {
    expect(rowClass([{ line: '[lms_launcher] 启动配置 · c1', stream: 'sys' }])).toEqual(['ln-dim']);
  });

  it('ready_line_renders_ln_ok_and_plain_line_has_no_class', () => {
    expect(rowClass([{ line: 'server ready, listening on :8080', stream: 'out' }])).toEqual(['ln-ok']);
    // 普通输出不叠加着色类（无 class → join 为空串）
    expect(rowClass([{ line: 'n_gpu_layers 999', stream: 'out' }])).toEqual(['']);
  });
});
