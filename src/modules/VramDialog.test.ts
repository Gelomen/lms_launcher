// @vitest-environment happy-dom
// VramDialog 契约:
// - open=false 不渲染;open=true Teleport 到 body 出现 .vram-dialog-box
// - 打开弹窗时:只要传入了已配置的 vramTotalGb(数字),输入框即回填该值;未配置(undefined)→ 空输入
//   (含"打开→关闭→再打开"反复开合:每次打开都以当前 prop 为准回填)
// - 保存:合法正数 emit saved + invoke('save_vram_total', n);空/非数字 → 错误提示不发 IPC
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import VramDialog from './VramDialog.vue';

vi.mock('../ipc', () => ({ invoke: vi.fn(() => Promise.resolve()), errMsg: (e: unknown) => String(e) }));
const { invoke } = await import('../ipc');
beforeEach(() => { vi.clearAllMocks(); document.body.innerHTML = ''; });

function mountDlg(props: Record<string, unknown>): any {
  return mount(VramDialog, { props });
}
const tick = () => new Promise((r) => setTimeout(r));
const dlgInput = () => document.querySelector('.vram-dialog-box input') as HTMLInputElement;

describe('VramDialog', () => {
  it('renders nothing when open=false', () => {
    const w = mountDlg({ open: false, vramTotalGb: 24 });
    expect(document.querySelector('.vram-dialog-box')).toBeNull();
    w.unmount();
  });

  it('pre-fills the input with the configured value on open', async () => {
    const w = mountDlg({ open: true, vramTotalGb: 24 });
    await tick();
    expect(dlgInput().value).toBe('24');
    w.unmount();
  });

  it('opens with an empty input when vramTotalGb is undefined (unconfigured)', async () => {
    const w = mountDlg({ open: true });
    await tick();
    expect(dlgInput().value).toBe('');
    w.unmount();
  });

  it('pre-fills the configured value when it arrives after mount (async load)', async () => {
    // 应用重启后 get_app_config 在组件挂载之后才返回:此时弹窗已打开,输入框仍须回填
    const w = mountDlg({ open: true, vramTotalGb: undefined });
    await tick();
    expect(dlgInput().value).toBe('');
    await w.setProps({ vramTotalGb: 24 });
    await tick();
    expect(dlgInput().value).toBe('24');
    w.unmount();
  });

  it('refills the configured value every time it is opened', async () => {
    const w = mountDlg({ open: true, vramTotalGb: 24 });
    await tick();
    // 用户改了输入框
    dlgInput().value = '99';
    dlgInput().dispatchEvent(new Event('input'));
    expect(dlgInput().value).toBe('99');
    await w.setProps({ open: false });
    await tick();
    await w.setProps({ open: true });
    await tick();
    expect(dlgInput().value).toBe('24');
    w.unmount();
  });

  it('saves a valid number → invoke save_vram_total + emit saved', async () => {
    const w = mountDlg({ open: true, vramTotalGb: 24 });
    await tick();
    (document.querySelector('.vram-dialog-box .btn-primary') as HTMLButtonElement).click();
    await tick();
    await tick();
    expect(invoke).toHaveBeenCalledWith('save_vram_total', 24);
    expect(w.emitted('saved')).toHaveLength(1);
    w.unmount();
  });

  it('rejects empty input without calling IPC', async () => {
    const w = mountDlg({ open: true });
    await tick();
    (document.querySelector('.vram-dialog-box .btn-primary') as HTMLButtonElement).click();
    await tick();
    expect(invoke).not.toHaveBeenCalled();
    expect((document.querySelector('.vram-dialog-box .error-text') as HTMLElement).textContent).toContain('须为正数');
    w.unmount();
  });
});
