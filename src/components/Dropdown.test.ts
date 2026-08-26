// @vitest-environment happy-dom
// 组件测试：Dropdown —— 选项 tooltip 悬浮层（.dd-tip，position:fixed）：hover 长名选项弹完整名字，移出消失。
import { describe, it, expect } from 'vitest';
import { mount, flushPromises as flush } from '@vue/test-utils';
import Dropdown from './Dropdown.vue';

describe('Dropdown option tooltip float', () => {
  const OPTS = [
    { value: 'a', label: 'abcdefghij…', tip: '这是一个非常长的配置描述名称完整版本' },
    { value: 'b', label: '短名' },
  ];

  it('panel_option_hover_floats_fixed_tooltip_with_full_name_and_leave_clears_it', async () => {
    const w = mount(Dropdown, { props: { value: 'a', options: OPTS }, attachTo: document.body });
    await flush();
    // 面板仅展开时渲染 li —— 先点开
    await w.find('.select-trigger').trigger('click');
    await flush();

    const li = w.findAll('.dropdown-panel li')[0];
    await li.trigger('mouseenter');
    // 悬浮层渲染完整名（截断阈值之外的全文）
    const tipEl = w.find('.dd-tip');
    expect(tipEl.exists()).toBe(true);
    expect(tipEl.text()).toBe(OPTS[0].tip as string);

    await li.trigger('mouseleave');
    expect(w.find('.dd-tip').exists()).toBe(false);
    w.unmount();
  });
});
