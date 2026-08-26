// @vitest-environment happy-dom
// 组件测试：Dropdown —— 选项 tooltip 悬浮层（.dd-tip，position:fixed）：hover 长名选项弹完整名字，移出消失。
// 2026-08-26 挪位 spec：tooltip 不再上方居中（会被应用窗口/裁剪区遮），改挂元素右侧垂直居中；
// 右侧估宽放不下时翻转到左缘内侧（.dd-tip--flip）。
import { describe, it, expect } from 'vitest';
import { mount, flushPromises as flush } from '@vue/test-utils';
import Dropdown from './Dropdown.vue';

describe('Dropdown option tooltip float', () => {
  const OPTS = [
    { value: 'a', label: 'abcdefghij…', tip: '这是一个非常长的配置描述名称完整版本' },
    { value: 'b', label: '短名' },
  ];

  function stubRect(el: HTMLElement, left: number, width: number, top = 100, height = 28): void {
    (el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
      ({ left, right: left + width, top, bottom: top + height, width, height, x: left, y: top }) as DOMRect;
  }

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

  it('panel_option_tooltip_positions_right_of_option_vertically_centered', async () => {
    const w = mount(Dropdown, { props: { value: 'a', options: OPTS }, attachTo: document.body });
    await flush();
    await w.find('.select-trigger').trigger('click');
    await flush();

    const li = w.findAll('.dropdown-panel li')[0];
    // 选项占位：left 50 / width 150，垂直中心 = 100 + 28/2 = 114
    stubRect(li.element, 50, 150);
    await li.trigger('mouseenter');

    const tipEl = w.find('.dd-tip');
    expect(tipEl.exists()).toBe(true);
    const style = tipEl.attributes('style') ?? '';
    // left = 元素右缘 + 8px 间隙（朝右延伸）；top = 元素垂直中心，CSS translateY(-50%) 居中
    expect(style).toContain('left: 208px');
    expect(style).toContain('top: 114px');
    // 非翻转：不带 flip 修饰类
    expect(tipEl.classes()).not.toContain('dd-tip--flip');
    w.unmount();
  });

  it('panel_option_tooltip_flips_left_when_no_room_right_in_viewport', async () => {
    const w = mount(Dropdown, { props: { value: 'a', options: OPTS }, attachTo: document.body });
    await flush();
    await w.find('.select-trigger').trigger('click');
    await flush();

    const li = w.findAll('.dropdown-panel li')[0];
    // 选项贴视口右侧（800px 窗口）：right=792，tooltip 估宽 ≈ 267px > 剩余空间 → flip
    stubRect(li.element, 642, 150);
    const origInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', { value: 800 });
    try {
      await li.trigger('mouseenter');
    } finally {
      if (origInnerWidth) Object.defineProperty(window, 'innerWidth', origInnerWidth);
      else delete (window as unknown as Record<string, unknown>)['innerWidth'];
    }

    const tipEl = w.find('.dd-tip');
    expect(tipEl.exists()).toBe(true);
    const style = tipEl.attributes('style') ?? '';
    // flip：left = 元素左缘 - 8px（tooltip 右缘贴锚点，CSS translateX(-100%)）；top 仍垂直居中
    expect(style).toContain('left: 634px');
    expect(style).toContain('top: 114px');
    expect(tipEl.classes()).toContain('dd-tip--flip');
    w.unmount();
  });
});
