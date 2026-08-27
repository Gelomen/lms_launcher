// @vitest-environment happy-dom
// ConfirmDialog（方案 B：LM Studio 式紧凑对话框）契约：
// - open=false 不渲染；open=true Teleport 到 body 出现 .confirm-box（标题+说明）
// - [确认] emit confirm（调用方执行 IPC）；[取消] emit close（仅关窗，无副作用）
// - tone=danger → ok 按钮带 btn-danger（红）；tone=primary（默认）→ btn-primary（蓝）
// 注意：两个实例同时挂在 body 时全局 .confirm-* 选择器会撞车，故每条断言只用单实例并 unmount。
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ConfirmDialog from './ConfirmDialog.vue';

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

  it('renders message full-text title attr when provided', async () => {
    const w = mountDlg({ open: true, title: 'T', message: '确定删除配置「abcdefg」吗？', tip: '确定删除配置「abcdefgabcdefgabcdefgabcdefgabcdefg」吗？' });
    await tick();
    expect((document.querySelector('.confirm-msg') as HTMLElement).getAttribute('title'))
      .toBe('确定删除配置「abcdefgabcdefgabcdefgabcdefgabcdefg」吗？'); // title=完整值
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
});
