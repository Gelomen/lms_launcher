// @vitest-environment happy-dom
// ConfirmDialog（方案 B：LM Studio 式紧凑对话框）契约：
// - open=false 不渲染；open=true Teleport 到 body 出现 .confirm-box（标题+说明）
// - [确认] emit confirm（调用方执行 IPC）；[取消] emit close（仅关窗，无副作用）
// - tone=danger → ok 按钮带 btn-danger（红）；tone=primary（默认）→ btn-primary（蓝）
// 注意：两个实例同时挂在 body 时全局 .confirm-* 选择器会撞车，故每条断言只用单实例并 unmount。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ConfirmDialog from './ConfirmDialog.vue';
import { applyLangLocal } from '../i18n';

function mountDlg(props: Record<string, unknown>): any {
  return mount(ConfirmDialog, { props });
}
const tick = () => new Promise((r) => setTimeout(r));

describe('ConfirmDialog', () => {
  it('renders nothing when open=false', () => {
    const w = mountDlg({ open: false, title: 'T', message: 'M' });
    expect(document.querySelector('.confirm-box')).toBeNull();
    w.unmount();
  });

  it('renders title+message and emits confirm on [确认]', async () => {
    const w = mountDlg({ open: true, title: '退出程序', message: '将停止并退出' });
    await tick();
    const box = document.querySelector('.confirm-box') as HTMLElement;
    expect(box.textContent).toContain('退出程序');
    expect(box.textContent).toContain('将停止并退出');
    (document.querySelector('.confirm-ok') as HTMLButtonElement).click();
    await tick();
    expect(w.emitted('confirm')).toHaveLength(1);
    w.unmount();
  });

  it('emits close on [取消]', async () => {
    const w = mountDlg({ open: true, title: 'T', message: 'M' });
    await tick();
    (document.querySelector('.confirm-cancel') as HTMLButtonElement).click();
    await tick();
    expect(w.emitted('close')).toHaveLength(1);
    w.unmount();
  });

  // 截断名 tooltip（2026-10-02 方案 B）：message 里被截断的名字渲染为独立片段 span，
  // hover 该片段弹自绘 .tpl-tip（与模板列表行 / 下拉长名同视觉语言），内容 = 完整名字（非整句）。
  const LONG_NAME = 'abcdefgabcdefgabcdefgabcdefgabcdefg'; // 视觉宽 35 > 预算 16+2
  const TRUNC_NAME = LONG_NAME.slice(0, 16) + '…';
  const SHORT_MSG = `确定删除配置「${TRUNC_NAME}」吗？`;

  it('truncated name renders as hoverable fragment with .tpl-tip showing full name', async () => {
    const w = mountDlg({ open: true, title: 'T', message: SHORT_MSG, tipName: TRUNC_NAME, tipFull: LONG_NAME });
    await tick();
    const msg = document.querySelector('.confirm-msg') as HTMLElement;
    expect(msg.textContent).toBe(SHORT_MSG); // 段落文案不变（仍是截断名 + 前后缀）
    const span = document.querySelector('.confirm-msg__name') as HTMLElement;
    expect(span).not.toBeNull();             // 名字独立成片段（只有它 hover 弹 tooltip）
    expect(span.textContent).toBe(TRUNC_NAME);
    expect(document.querySelector('.tpl-tip')).toBeNull(); // 未 hover：无浮层
    span.dispatchEvent(new MouseEvent('mouseenter'));
    await tick();
    const tip = document.querySelector('.tpl-tip') as HTMLElement;
    expect(tip).not.toBeNull();
    expect(tip.textContent).toBe(LONG_NAME); // 只显示完整名字
    span.dispatchEvent(new MouseEvent('mouseleave'));
    await tick();
    expect(document.querySelector('.tpl-tip')).toBeNull(); // 移开即消失
    w.unmount();
  });

  // 回归（2026-10-02）：调用方（TemplateModal）常驻挂载本组件，tipName/tipFull 常在 open 之后
  // 才从 undefined 变为有效值 —— 名字片段与浮层必须随 props 响应式出现。
  it('name fragment appears when tipName/tipFull bound after mount (常驻挂载场景)', async () => {
    const w = mountDlg({ open: true, title: 'T', message: 'M' }); // 挂载时配置名未定
    await tick();
    expect(document.querySelector('.confirm-msg__name')).toBeNull();
    w.setProps({ message: SHORT_MSG, tipName: TRUNC_NAME, tipFull: LONG_NAME });
    await tick();
    const span = document.querySelector('.confirm-msg__name') as HTMLElement;
    expect(span).not.toBeNull();
    expect(span.textContent).toBe(TRUNC_NAME);
    span.dispatchEvent(new MouseEvent('mouseenter'));
    await tick();
    expect(document.querySelector('.tpl-tip')?.textContent).toBe(LONG_NAME);
    w.unmount();
  });

  it('short name (no tipName/tipFull) renders plain text: no fragment, no tooltip', async () => {
    const w = mountDlg({ open: true, title: 'T', message: '确定删除配置「abcdefg」吗？' });
    await tick();
    expect(document.querySelector('.confirm-msg__name')).toBeNull(); // 未截断 → 无片段
    expect((document.querySelector('.confirm-msg') as HTMLElement).textContent).toBe('确定删除配置「abcdefg」吗？');
    expect(document.querySelector('.tpl-tip')).toBeNull();
    w.unmount();
  });

  it('danger tone → ok button red; primary (default) → blue', async () => {
    const wD = mountDlg({ open: true, title: 'T', message: 'M', tone: 'danger' });
    await tick();
    expect((document.querySelector('.confirm-ok') as HTMLButtonElement).className).toContain('btn-danger');
    wD.unmount();

    const wP = mountDlg({ open: true, title: 'T', message: 'M' }); // 默认 primary
    await tick();
    expect((document.querySelector('.confirm-ok') as HTMLButtonElement).className).toContain('btn-primary');
    wP.unmount();
  });

  // ===== S9（2026-10-03-i18n-misc-dialogs）：按钮文本 + aria-label 走词典 =====
  it('zh 回归：按钮文本与 aria-label 均为 取消 / 确认', async () => {
    const w = mountDlg({ open: true, title: 'T', message: 'M' });
    await tick();
    const cancel = document.querySelector('.confirm-cancel') as HTMLButtonElement;
    const ok = document.querySelector('.confirm-ok') as HTMLButtonElement;
    expect(cancel.textContent).toBe('取消');
    expect(cancel.getAttribute('aria-label')).toBe('取消');
    expect(ok.textContent).toBe('确认');
    expect(ok.getAttribute('aria-label')).toBe('确认');
    w.unmount();
  });

  describe('en smoke', () => {
    beforeEach(() => { applyLangLocal('en'); });
    afterEach(() => { applyLangLocal('zh'); });

    it('按钮文本与 aria-label = Cancel / Confirm', async () => {
      const w = mountDlg({ open: true, title: 'T', message: 'M' });
      await tick();
      const cancel = document.querySelector('.confirm-cancel') as HTMLButtonElement;
      const ok = document.querySelector('.confirm-ok') as HTMLButtonElement;
      expect(cancel.textContent).toBe('Cancel');
      expect(cancel.getAttribute('aria-label')).toBe('Cancel');
      expect(ok.textContent).toBe('Confirm');
      expect(ok.getAttribute('aria-label')).toBe('Confirm');
      w.unmount();
    });
  });
});
