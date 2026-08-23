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

    // 配置行必须渲染：仅 id + 操作按钮；表头整行已移除，desc/参数预览不再显示
    expect(wrapper.text()).toContain('c1');
    expect(wrapper.text()).not.toContain('id'); // 表头 id 列标签已移除
    expect(wrapper.text()).not.toContain('日常');
    expect(wrapper.text()).not.toContain('-m x.gguf');
    expect(wrapper.text()).not.toContain('desc');
    expect(wrapper.text()).not.toContain('参数预览');
    expect(wrapper.findAll('.module-template table').length).toBe(1);
    wrapper.unmount();
  });

  it('list_has_no_delete_and_edit_modal_shows_it', async () => {
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
    const wrapper = mount(TemplateModule, { attachTo: document.body });
    await flush();

    // 列表行不再渲染删除按钮（新建模板 / 编辑除外，均不出现「删除」字样）
    expect(wrapper.text()).not.toContain('删除');

    // 点「编辑」→ teleport 到 body 的弹窗 modal-actions 最左出现删除按钮
    const editBtn = wrapper.findAll('button').find((b) => b.text() === '编辑')!;
    await editBtn.trigger('click');
    await flush();
    const del = [...document.querySelectorAll('.modal-actions button')].find(
      (b) => (b.textContent ?? '').includes('删除'),
    );
    expect(del).toBeDefined();
    wrapper.unmount();
  });
});
