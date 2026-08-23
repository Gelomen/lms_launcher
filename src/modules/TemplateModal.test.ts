// @vitest-environment happy-dom
// 组件级测试：TemplateModal 保存契约——必填(-m)留空 → 保存被拒（计划 task-4 step 4「保存被拒」）。
// 弹窗经 <Teleport to="body"> 渲染，故在 document 层级断言 DOM。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, flushPromises as flush } from '@vue/test-utils';
import TemplateModal from './TemplateModal.vue';
import { defaultParams } from '../../src-main/config';

type Calls = Array<{ cmd: string; args: unknown[] }>;
let calls: Calls = [];

function mockLms(): void {
  (window as any).lms = {
    invoke: (cmd: string, ...args: unknown[]) => { calls.push({ cmd, args }); return Promise.resolve(null); },
    onLogLine: () => () => {},
    onProcessExit: () => () => {},
    onTrayExitRequest: () => () => {},
  };
}

afterEach(() => { document.body.innerHTML = ''; });

const paramsMeta = defaultParams();

function mountModal() {
  return mount(TemplateModal, {
    attachTo: document.body,
    props: { open: true, id: '', values: {}, paramsMeta, existingIds: [] },
  });
}

function setInput(sel: string, v: string): Promise<void> {
  const el = document.querySelector(sel) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return flush();
}

describe('TemplateModal', () => {
  it('save_rejected_when_required_m_empty', async () => {
    calls = []; mockLms(); mountModal(); await flush();

    // id 填了，-m（flag-grid 第一个文本行）留空 → 点保存必须被拒
    const inputs = [...document.querySelectorAll('.modal-box input')];
    const idIn = inputs.find((i) => (i.placeholder ?? '').includes('小写字母'))!;
    const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    expect(mIn.parentElement?.previousElementSibling.textContent).toBe('-m'); // 确认目标是 -m 行
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    setter.call(idIn, 'qwen1'); idIn.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    const saveBtn = [...document.querySelectorAll('.modal-actions button')].find((b) => b.textContent?.includes('保存'))!;
    saveBtn.click();
    await flush();

    // 断言：必填(-m)未填写 → 不发出 save_config，弹窗显示「必填项未填写」
    expect(calls.filter((c) => c.cmd === 'save_config')).toHaveLength(0);
    expect(document.querySelector('.modal-box')?.textContent).toContain('必填项未填写');
  });

  it('saves_when_id_and_required_m_filled', async () => {
    calls = []; mockLms(); mountModal(); await flush();

    const inputs = [...document.querySelectorAll('.modal-box input')];
    const idIn = inputs.find((i) => (i.placeholder ?? '').includes('小写字母'))!;
    const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    setter.call(idIn, 'qwen2'); idIn.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(mIn, 'D:/models/qwen.gguf'); mIn.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    const saveBtn = [...document.querySelectorAll('.modal-actions button')].find((b) => b.textContent?.includes('保存'))!;
    saveBtn.click();
    await flush();

    const saved = calls.find((c) => c.cmd === 'save_config');
    expect(saved).toBeDefined();
    const [id, , values] = saved!.args as [string, unknown, Record<string, string>];
    expect(id).toBe('qwen2');
    expect(values['m']).toBe('D:/models/qwen.gguf');
  });
});

// ---- 删除契约（2026-08-24 挪入弹窗）----
// 编辑模式挂载：id='qwen38'（isEdit 成立），返回 wrapper 供 emitted() 断言
function mountEdit(): ReturnType<typeof mount> {
  return mount(TemplateModal, {
    attachTo: document.body,
    props: { open: true, id: 'qwen38', values: {}, paramsMeta, existingIds: ['qwen38'] },
  });
}

function findDeleteBtn(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('.modal-actions button')].find(
    (b) => (b.textContent ?? '').includes('删除'),
  ) as HTMLButtonElement | undefined;
}

describe('TemplateModal delete', () => {
  it('delete_button_only_when_editing', async () => {
    calls = []; mockLms();
    const wNew = mountModal(); await flush();
    expect(findDeleteBtn()).toBeUndefined(); // 新建模式：无删除按钮
    wNew.unmount();

    const wEdit = mountEdit(); await flush();
    expect(findDeleteBtn()).toBeDefined(); // 编辑模式：左下角出现删除按钮
    wEdit.unmount();
  });

  it('deletes_when_confirmed', async () => {
    calls = []; mockLms(); const w = mountEdit(); await flush();
    vi.stubGlobal('confirm', () => true);
    try {
      findDeleteBtn()!.click();
      await flush();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(calls.find((c) => c.cmd === 'delete_config')).toEqual({ cmd: 'delete_config', args: ['qwen38'] });
    expect(w.emitted('deleted')?.[0]).toEqual(['qwen38']);
    document.body.innerHTML = '';
  });

  it('delete_error_shown_in_modal_without_deleted_emit', async () => {
    calls = [];
    (window as any).lms = {
      invoke: (cmd: string, ...args: unknown[]) => { calls.push({ cmd, args }); return Promise.reject(new Error('VALIDATION: 配置不存在')); },
      onLogLine: () => () => {},
      onProcessExit: () => () => {},
      onTrayExitRequest: () => () => {},
    };
    const w = mountEdit(); await flush();
    vi.stubGlobal('confirm', () => true);
    try {
      findDeleteBtn()!.click();
      await flush();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(w.emitted('deleted')).toBeUndefined(); // 失败不 emit、不关窗
    expect(document.querySelector('.modal-box')?.textContent).toContain('VALIDATION: 配置不存在');
    document.body.innerHTML = '';
  });
});
