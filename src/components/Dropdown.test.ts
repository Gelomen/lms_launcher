// @vitest-environment happy-dom
// 组件测试：Dropdown —— 选项 tooltip 悬浮层（.dd-tip，position:fixed）：hover 长名选项弹完整名字，移出消失。
// 2026-08-26 挪位 spec：tooltip 不再上方居中（会被应用窗口/裁剪区遮），改挂元素右侧垂直居中；
// 右侧估宽放不下时翻转到左缘内侧（.dd-tip--flip）。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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

// ---- 2026-10-13（用户反馈 + 截图：快捷启动弹窗打开 [终端] 下拉，面板把 .modal-body 撑出滚动条、又被弹窗底缘裁掉）
// 面板改视口浮层：position:fixed（与 .dd-tip / .flag-tip / .tpl-tip 同一手法），坐标由触发按钮矩形逐次写入内联 left/top/width。
// 这里钉机制三件事：
//   1) 面板计算样式 position = fixed（注入真实 style.css，同 QuickLaunchModal.test.ts:67-76 的手法）
//   2) 内联坐标来自触发按钮矩形：left = 左缘、top = 下缘 + 2px（原 CSS calc(var(--h-control) + 2px) 的间距）、width = 触发按钮宽
//   3) 打开期间所在容器滚动 / 窗口尺寸变化 -> 重算，面板恒贴触发按钮
describe('Dropdown panel is a viewport float', () => {
  const OPTS = [
    { value: 'a', label: 'Windows PowerShell' },
    { value: 'b', label: 'cmd' },
  ];

  function injectRealCss(): void {
    if (document.getElementById('__real-css__')) return;
    const st = document.createElement('style');
    st.id = '__real-css__';
    st.textContent = fs.readFileSync(path.join(process.cwd(), 'src', 'style.css'), 'utf8');
    document.head.appendChild(st);
  }

  function stubRect(el: HTMLElement, left: number, width: number, top: number, height: number): void {
    (el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
      ({ left, right: left + width, top, bottom: top + height, width, height, x: left, y: top }) as DOMRect;
  }

  it('panel_is_positioned_fixed_so_no_ancestor_overflow_clips_it', async () => {
    injectRealCss();
    const w = mount(Dropdown, { props: { value: 'a', options: OPTS }, attachTo: document.body });
    await flush();
    await w.find('.select-trigger').trigger('click');
    await flush();

    const panel = w.find('.dropdown-panel');
    expect(panel.exists()).toBe(true);
    // 浮层：不受 .modal-body / .modal-box / .card 的 overflow 裁剪，也不参与其滚动高度
    expect(getComputedStyle(panel.element as HTMLElement).position).toBe('fixed');
    w.unmount();
  });

  it('panel_coordinates_come_from_the_trigger_rect', async () => {
    const w = mount(Dropdown, { props: { value: 'a', options: OPTS }, attachTo: document.body });
    await flush();

    const trigger = w.find('.select-trigger').element as HTMLElement;
    // 触发按钮：左缘 300 / 宽 418 / 顶 204 / 高 32（--h-control）-> 面板顶 = 204 + 32 + 2 = 238
    stubRect(trigger, 300, 418, 204, 32);
    await w.find('.select-trigger').trigger('click');
    await flush();

    const panel = w.find('.dropdown-panel').element as HTMLElement;
    expect(panel.style.left).toBe('300px');
    expect(panel.style.top, '面板顶 = 触发按钮下缘 + 2px（原 CSS 间距）').toBe('238px');
    expect(panel.style.width).toBe('418px');
    w.unmount();
  });

  it('panel_follows_the_trigger_on_scroll_and_window_resize', async () => {
    const w = mount(Dropdown, { props: { value: 'a', options: OPTS }, attachTo: document.body });
    await flush();

    const trigger = w.find('.select-trigger').element as HTMLElement;
    stubRect(trigger, 300, 418, 204, 32);
    await w.find('.select-trigger').trigger('click');
    await flush();
    const panel = w.find('.dropdown-panel').element as HTMLElement;
    expect(panel.style.top).toBe('238px');

    // 所在容器滚动（.modal-body / .template-list 等）：scroll 不冒泡，组件挂 capture 监听才收得到
    stubRect(trigger, 300, 418, 90, 32);
    (w.element.parentElement ?? document.body).dispatchEvent(new Event('scroll'));
    await flush();
    expect(panel.style.top, '容器滚动后面板没跟随触发按钮').toBe('124px');

    // 窗口尺寸变化（弹窗 max-height:85vh 会随之重排）
    stubRect(trigger, 120, 380, 300, 32);
    window.dispatchEvent(new Event('resize'));
    await flush();
    expect(panel.style.left).toBe('120px');
    expect(panel.style.width).toBe('380px');
    expect(panel.style.top).toBe('334px');
    w.unmount();
  });
});
