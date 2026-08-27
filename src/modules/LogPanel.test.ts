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
import { mount } from '@vue/test-utils';
import LogPanel from './LogPanel.vue';

interface E { line: string; stream: 'sys' | 'out' | 'err' }

function rowClass(lines: E[]): string[] {
  // 任务 2 临时适配：props 改为 buckets，着色断言仍经 llama-server 桶触达（任务 3 迁 pane 选择器）
  const wrapper = mount(LogPanel, { props: { buckets: { launcher: [], 'llama-server': lines } } });
  const cls = wrapper.findAll('.log-view p').map((p) => p.classes().join(' '));
  wrapper.unmount();
  return cls;
}

describe('LogPanel 行级着色', () => {
  it('stderr_line_without_error_keyword_is_not_red', () => {
    // 核心 bug：stream='err' 单独不能判红（llama-server I/W 日志全走 stderr）
    expect(rowClass([{ line: '0.02.489.298 I cmn  common_param: verbosity = 3', stream: 'err' }])).toEqual(['']);
    expect(rowClass([{ line: 'random crash text', stream: 'err' }])).toEqual(['']);
  });

  it('error_keyword_line_renders_ln_err_regardless_of_stream', () => {
    expect(rowClass([{ line: 'ERROR: model file not found', stream: 'out' }])).toEqual(['ln-err']);
    expect(rowClass([{ line: 'llama_server: FATAL exception thrown', stream: 'out' }])).toEqual(['ln-err']);
    expect(rowClass([{ line: '1.2.3.4 E srv  llama_server: boom', stream: 'err' }])).toEqual(['ln-err']);
  });

  it('warn_or_warning_line_renders_ln_warn_on_any_stream', () => {
    expect(rowClass([{ line: '[WARN] 显卡显存不足，回退 CPU', stream: 'out' }])).toEqual(['ln-warn']);
    // 截图中的 CORS 警告：stream=err + W 级别前缀 → 橙
    expect(rowClass([{ line: "0.02.572.010 W srv  llama_server: CORS is set to allow all origins ('*')", stream: 'err' }])).toEqual(['ln-warn']);
  });

  it('glog_level_prefix_maps_i_to_default_and_w_to_warn', () => {
    // I 级别：无关键字 → 默认深灰（不再红）
    expect(rowClass([{ line: "0.03.226.108 I srv  llama_server: server is ready", stream: 'err' }])).toEqual(['']);
    // W model unused tensor……（截图中一行）→ 橙
    expect(rowClass([{ line: '0.03.226.614 W model has unused tensor blk.64.attn_norm.weight -- ignoring', stream: 'err' }])).toEqual(['ln-warn']);
  });

  it('sys_line_renders_ln_dim_and_ready_renders_ln_ok', () => {
    expect(rowClass([{ line: '[lms_launcher] 启动配置 · c1', stream: 'sys' }])).toEqual(['ln-dim']);
    expect(rowClass([{ line: 'server ready, listening on :8080', stream: 'out' }])).toEqual(['ln-ok']);
    // 普通输出不叠加着色类（无 class → join 为空串）
    expect(rowClass([{ line: 'n_gpu_layers 999', stream: 'out' }])).toEqual(['']);
  });
});
