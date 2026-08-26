// @vitest-environment happy-dom
// 组件测试：LaunchBar 配置下拉截断 —— 与模板行名相同优化（spec 2026-08-26-launchbar-dropdown-truncation）：
// >10 字 → 前 10 字 + …(U+2026)；hover tooltip 显示完整名字（trigger data-tooltip + 面板 li）。
import { describe, it, expect } from 'vitest';
import { mount, flushPromises as flush } from '@vue/test-utils';
import LaunchBar from './LaunchBar.vue';

const LONG = '这是一个非常长的配置描述名称用来验证启动控制下拉的截断与省略号行为'; // 29 字 >10
const READY = { running: false, stopping: false, configId: null };

function mockLms(map: Record<string, { desc?: string; values: Record<string, string> }>): void {
  (window as any).lms = {
    invoke: (cmd: string) => {
      if (cmd === 'get_configs') return Promise.resolve(map);
      return Promise.resolve(undefined);
    },
    onLogLine: () => () => {},
    onProcessExit: () => () => {},
    onTrayExitRequest: () => () => {},
  };
}

describe('LaunchBar config dropdown truncation', () => {
  it('trigger_label_truncates_beyond_10_chars_and_tooltips_full_name', async () => {
    mockLms({ long_cfg: { desc: LONG, values: {} } });
    const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
    await flush();

    // 触发按钮标签：前 8 字 + …（与模板行名同机制，阈值 8——窄容器 10 字仍换行撑高）
    expect(w.find('.select-label').text()).toBe(LONG.slice(0, 8) + '…');
    // tooltip（样式同「编辑」按钮）：trigger 携带 data-tooltip=完整名字
    expect(w.find('.select-trigger').attributes('data-tooltip')).toBe(LONG);

    // 展开面板：选项同样截断，li 携带完整名 tooltip
    await w.find('.select-trigger').trigger('click');
    await flush();
    const li = w.findAll('.dropdown-panel li')[0];
    expect(li.text()).toBe(LONG.slice(0, 8) + '…');
    expect(li.attributes('data-tooltip')).toBe(LONG);
    w.unmount();
  });

  it('short_name_shows_full_without_tooltip', async () => {
    mockLms({ short_cfg: { desc: '日常', values: {} } });
    const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
    await flush();

    // 短名（≤10）：完整显示、无省略号、无 tooltip 属性
    expect(w.find('.select-label').text()).toBe('日常');
    expect(w.find('.select-trigger').attributes('data-tooltip')).toBeUndefined();
    w.unmount();
  });

  // 宽度预算（2026-08-26 spec）：拉丁字符宽=1，预算 16——同一英文名下比旧的按 8 字符截断显示更多。
  const LATIN = 'qwen-27b-instruct-fp16'; // 22 latin → width 22 > 16
  it('latin_name_truncates_by_width_not_char_count', async () => {
    mockLms({ lat: { desc: LATIN, values: {} } });
    const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
    await flush();
    // 前 16 字符 + …（旧按字符阈值是 slice(0,8)）
    expect(w.find('.select-label').text()).toBe(LATIN.slice(0, 16) + '…');
    expect(w.find('.select-trigger').attributes('data-tooltip')).toBe(LATIN);
    await w.find('.select-trigger').trigger('click');
    await flush();
    const li = w.findAll('.dropdown-panel li')[0];
    expect(li.text()).toBe(LATIN.slice(0, 16) + '…');
    expect(li.attributes('data-tooltip')).toBe(LATIN);
    w.unmount();
  });

  it('latin_name_exactly_16_chars_shows_full_no_tooltip', async () => {
    mockLms({ lat: { desc: 'abcdefghij-klmno', values: {} } }); // exactly 16 latin → width 16
    const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
    await flush();
    expect(w.find('.select-label').text()).toBe('abcdefghij-klmno');
    expect(w.find('.select-trigger').attributes('data-tooltip')).toBeUndefined();
    w.unmount();
  });
});
