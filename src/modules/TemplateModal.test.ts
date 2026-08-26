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

// desc（描述）必填契约：desc 留空 → 保存被拒 + 红框与「必填」文案；标签文字为「描述」。
const descIn = (): HTMLInputElement => {
  const label = [...document.querySelectorAll('.modal-box label.label')].find((l) => (l.textContent ?? '').includes('描述'))!;
  return label.nextElementSibling as HTMLInputElement; // desc label 的下一兄弟节点即其 input
};

it('save_rejected_when_desc_empty', async () => {
    calls = []; mockLms(); mountModal(); await flush();

    const inputs = [...document.querySelectorAll('.modal-box input')];
    const idIn = inputs.find((i) => (i.placeholder ?? '').includes('小写字母'))!;
    const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    setter.call(idIn, 'qwen3'); idIn.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(mIn, 'D:/models/qwen.gguf'); mIn.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    // 标签文字应为「描述」（不再是 desc（说明））
    const labels = [...document.querySelectorAll('.modal-box label.label')].map((l) => l.textContent?.trim());
    expect(labels).toContain('描述');

    const saveBtn = [...document.querySelectorAll('.modal-actions button')].find((b) => b.textContent?.includes('保存'))!;
    saveBtn.click();
    await flush();

    // desc 留空 → 不发出 save_config，desc 输入框红框 + 「必填」文案
    expect(calls.filter((c) => c.cmd === 'save_config')).toHaveLength(0);
    expect(descIn().classList.contains('error')).toBe(true);
    expect(document.querySelector('.modal-box')?.textContent).toContain('必填');
  });

  it('saves_when_desc_filled', async () => {
    calls = []; mockLms(); mountModal(); await flush();

    const inputs = [...document.querySelectorAll('.modal-box input')];
    const idIn = inputs.find((i) => (i.placeholder ?? '').includes('小写字母'))!;
    const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    setter.call(idIn, 'qwen4'); idIn.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(mIn, 'D:/models/qwen.gguf'); mIn.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(descIn(), '日常推理'); descIn().dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    const saveBtn = [...document.querySelectorAll('.modal-actions button')].find((b) => b.textContent?.includes('保存'))!;
    saveBtn.click();
    await flush();

    const saved = calls.find((c) => c.cmd === 'save_config');
    expect(saved).toBeDefined();
    const [id, desc] = saved!.args as [string, string | null];
    expect(id).toBe('qwen4');
    expect(desc).toBe('日常推理');
  });

it('saves_when_id_and_required_m_filled', async () => {
    calls = []; mockLms(); mountModal(); await flush();

    const inputs = [...document.querySelectorAll('.modal-box input')];
    const idIn = inputs.find((i) => (i.placeholder ?? '').includes('小写字母'))!;
const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    setter.call(idIn, 'qwen2'); idIn.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(mIn, 'D:/models/qwen.gguf'); mIn.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(descIn(), '日常'); descIn().dispatchEvent(new Event('input', { bubbles: true }));
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

// ---- 关闭契约：点击遮罩以外区域不关闭窗口（仅「取消」/保存/删除可关）----
describe('TemplateModal close', () => {
  it('overlay_click_does_not_close', async () => {
    calls = []; mockLms();
    const w = mountModal(); await flush();
    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    overlay.click(); // 直接点遮罩（非 modal-box）
    await flush();
    expect(w.emitted('close')).toBeUndefined();
    expect(document.querySelector('.modal-overlay')).toBeDefined(); // 弹窗仍在
    w.unmount();
  });
});

// ---- options 行选项截断（2026-08-26：>10 字 → 前 10 字+…，tooltip 完整名，与启动控制下拉同机制）----
const LONG_OPT = '这是一个非常长的选项值用来验证模板弹窗内下拉选项的截断与省略号行为'; // 30 字 >10
describe('TemplateModal options truncation', () => {
  // 长名放首位 → fill() 默认选中它（options 恒默认首个），trigger 即带截断 label + tooltip
  const metaLong: typeof paramsMeta = { ...paramsMeta, params_options: { ctk: [LONG_OPT, 'q4_0'] } };

  it('option_label_truncates_beyond_10_chars_and_tooltips_full_value', async () => {
    calls = []; mockLms();
    const w = mount(TemplateModal, {
      attachTo: document.body,
      props: { open: true, id: '', values: {}, paramsMeta: metaLong, existingIds: [] },
    });
    await flush();

    // ctk 行（flag-label '-ctk' 的兄弟 .dropdown）：trigger 标签截断 + tooltip 全值
    const dd = [...document.querySelectorAll('.flag-grid label.flag-label')].find((l) => (l.textContent ?? '').trim() === '-ctk')!.nextElementSibling as Element;
    expect((dd as Element).querySelector('.select-label')!.textContent).toBe(LONG_OPT.slice(0, 8) + '…');
    expect(((dd as Element).querySelector('.select-trigger') as HTMLElement).dataset.tooltip).toBe(LONG_OPT);

    // 展开面板：li[0] 截断 + data-tooltip=完整值；li[1] 短选项不截断、无 tooltip
    ((dd as Element).querySelector('.select-trigger') as HTMLElement).click();
    await flush();
    const lis = [...document.querySelectorAll('.dropdown-panel li')] as HTMLElement[];
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe(LONG_OPT.slice(0, 8) + '…');
    expect(lis[0].dataset.tooltip).toBe(LONG_OPT);
    expect(lis[1].textContent).toBe('q4_0');
    expect(lis[1].dataset.tooltip).toBeUndefined();
    w.unmount();
  });

  it('save_submits_full_value_not_truncated_label', async () => {
    calls = []; mockLms();
    const w = mount(TemplateModal, {
      attachTo: document.body,
      props: { open: true, id: '', values: {}, paramsMeta: metaLong, existingIds: [] },
    });
    await flush();

    // 长选项即默认选中（fill opts[0]）：id + desc + -m 必填填齐后保存——yaml 值必须是完整长串，不是截断 label
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    const idIn = [...document.querySelectorAll('.modal-box input')].find((i) => (i.placeholder ?? '').includes('小写字母'))!;
    setter.call(idIn, 'qwen1');
    idIn.dispatchEvent(new Event('input', { bubbles: true }));
    // desc 必填（留空会拒保存）
    const descLb = [...document.querySelectorAll('.modal-box label.label')].find((l) => (l.textContent ?? '').includes('描述'))!;
    const descIn = descLb.nextElementSibling as HTMLInputElement;
    setter.call(descIn, 'd');
    descIn.dispatchEvent(new Event('input', { bubbles: true }));
    // -m 为 params 表第一个文本行（.row-cell input[0]）
    const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    setter.call(mIn, 'x.gguf');
    mIn.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    [...document.querySelectorAll('.modal-actions button')].find((b) => (b.textContent ?? '').includes('保存'))!.click();
    await flush();
    const save = calls.find((c) => c.cmd === 'save_config');
    expect(save).toBeDefined();
    const values = (save!.args as unknown[][])[2] as Record<string, string>;
    expect(values['ctk']).toBe(LONG_OPT); // 完整值入 yaml，截断仅展示层
    w.unmount();
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
