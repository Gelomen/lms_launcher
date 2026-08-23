// @vitest-environment happy-dom
// 组件级测试：TemplateModule —— 配置存在时必须渲染出行（preview() 摘要），不得白屏。
// RED 依据：bug#2 现场复现——首次成功保存后 .module-template 整个从 DOM 消失
// （TypeError: Cannot read properties of undefined (reading 'm') @ preview()）。
import { describe, it, expect } from 'vitest';
import { mount, flushPromises as flush } from '@vue/test-utils';
import TemplateModule from './TemplateModule.vue';
import { defaultParams } from '../../src-main/config';

const CONFIGS = {
  c1: { desc: '日常', values: { m: 'x.gguf', port: '9931' } },
};

describe('TemplateModule', () => {
  it('renders_config_rows_with_preview_after_load', async () => {
    (window as any).lms = {
      invoke: (cmd: string) => {
        if (cmd === 'get_configs') return Promise.resolve(CONFIGS);
        if (cmd === 'get_params') return Promise.resolve(defaultParams());
        return Promise.resolve(null);
      },
      onLogLine: () => () => {},
      onProcessExit: () => () => {},
      onTrayExitRequest: () => () => {},
    };
    const wrapper = mount(TemplateModule);
    await flush();

    // 配置行必须渲染：id、desc、preview（-m x.gguf --port 9931）
    expect(wrapper.text()).toContain('c1');
    expect(wrapper.text()).toContain('日常');
    expect(wrapper.text()).toContain('-m x.gguf');
    expect(wrapper.findAll('.module-template table').length).toBe(1);
    wrapper.unmount();
  });
});
