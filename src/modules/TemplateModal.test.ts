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
    props: { open: true, id: '', values: {}, paramsMeta },
  });
}

// id 自动生成契约的 mock 返回——主进程生成的唯一 id（小写字母+数字，yaml 安全）
const SUGGEST_ID = 'tpl9f0k2m4x';

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

    // -m（flag-grid 第一个文本行）留空 → 点保存必须被拒（id 不再由用户填写，无输入框可填）
    const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    expect(mIn.parentElement?.previousElementSibling.textContent).toBe('-m'); // 确认目标是 -m 行
    await flush();

    // [保存] 按钮已改为右下角软盘图标角形按钮（2026-08-27）：.modal-save 无文字，按类名定位
const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
    saveBtn.click();
    await flush();

    // 断言：必填(-m)未填写 → 不发出 save_config，弹窗显示「必填项未填写」
    expect(calls.filter((c) => c.cmd === 'save_config')).toHaveLength(0);
    expect(document.querySelector('.modal-box')?.textContent).toContain('必填项未填写');
  });

// desc（名字）必填契约：desc 留空 → 保存被拒 + 红框与「必填」文案；标签文字为「名字」（2026-09 由「描述」改名，数据 key 仍为 desc）。
const descIn = (): HTMLInputElement => {
  const label = [...document.querySelectorAll('.modal-box label.label')].find((l) => (l.textContent ?? '').includes('名字'))!;
  return label.nextElementSibling as HTMLInputElement; // name label 的下一兄弟节点即其 input
};

it('save_rejected_when_desc_empty', async () => {
    calls = []; mockLms(); mountModal(); await flush();

    const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    setter.call(mIn, 'D:/models/qwen.gguf'); mIn.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    // 标签文字应为「名字」（2026-09 由「描述」改名；数据 key 仍为 desc）
    const labels = [...document.querySelectorAll('.modal-box label.label')].map((l) => l.textContent?.trim());
    expect(labels).toContain('名字');

    // [保存] 按钮已改为右下角软盘图标角形按钮（2026-08-27）：.modal-save 无文字，按类名定位
const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
    saveBtn.click();
    await flush();

    // desc 留空 → 不发出 save_config，desc 输入框红框 + 「必填」文案
    expect(calls.filter((c) => c.cmd === 'save_config')).toHaveLength(0);
    expect(descIn().classList.contains('error')).toBe(true);
    expect(document.querySelector('.modal-box')?.textContent).toContain('必填');
  });

  it('saves_when_desc_filled', async () => {
    calls = [];
    // suggest_config_id → 主进程生成的唯一 id（新建保存契约的核心一环）
    (window as any).lms = {
      invoke: (cmd: string, ...args: unknown[]) => { calls.push({ cmd, args }); if (cmd === 'suggest_config_id') return Promise.resolve(SUGGEST_ID); return Promise.resolve(null); },
      onLogLine: () => () => {}, onProcessExit: () => () => {}, onTrayExitRequest: () => () => {},
    };
    mountModal(); await flush();

    const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    setter.call(mIn, 'D:/models/qwen.gguf'); mIn.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(descIn(), '日常推理'); descIn().dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    // [保存] 按钮已改为右下角软盘图标角形按钮（2026-08-27）：.modal-save 无文字，按类名定位
const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
    saveBtn.click();
    await flush();

    const saved = calls.find((c) => c.cmd === 'save_config');
    expect(saved).toBeDefined();
    const [id, desc] = saved!.args as [string, string | null];
    expect(id).toBe(SUGGEST_ID); // id 来自 suggest_config_id，非用户输入
    expect(desc).toBe('日常推理');
  });

it('saves_when_required_m_filled_without_id_input', async () => {
    calls = [];
    (window as any).lms = {
      invoke: (cmd: string, ...args: unknown[]) => { calls.push({ cmd, args }); if (cmd === 'suggest_config_id') return Promise.resolve(SUGGEST_ID); return Promise.resolve(null); },
      onLogLine: () => () => {}, onProcessExit: () => () => {}, onTrayExitRequest: () => () => {},
    };
    mountModal(); await flush();

    // id 自动生成：只需 -m（必填）+ desc，不再有 id 输入框
const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    setter.call(mIn, 'D:/models/qwen.gguf'); mIn.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(descIn(), '日常'); descIn().dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    // [保存] 按钮已改为右下角软盘图标角形按钮（2026-08-27）：.modal-save 无文字，按类名定位
const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
    saveBtn.click();
    await flush();

    const saved = calls.find((c) => c.cmd === 'save_config');
    expect(saved).toBeDefined();
    const [id, , values] = saved!.args as [string, unknown, Record<string, string>];
    expect(id).toBe(SUGGEST_ID);
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
      props: { open: true, id: '', values: {}, paramsMeta: metaLong },
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

  // 宽度预算（2026-08-26 spec）：拉丁宽=1、预算 16——英文选项比旧按字符阈值显示更多。
  const LATIN_OPT = 'qwen3-32b-instruct-model'; // 24 latin → width 24 > 16
  it('latin_option_truncates_by_width_16', async () => {
    calls = []; mockLms();
    const metaLong: typeof paramsMeta = { ...paramsMeta, params_options: { ctk: [LATIN_OPT, 'q4_0'] } };
    const w = mount(TemplateModal, {
      attachTo: document.body,
      props: { open: true, id: '', values: {}, paramsMeta: metaLong },
    });
    await flush();
    const dd = [...document.querySelectorAll('.flag-grid label.flag-label')].find((l) => (l.textContent ?? '').trim() === '-ctk')!.nextElementSibling as Element;
    // LATIN_OPT = 'qwen3-32b-instruct-model' width 24 > 16+2 → 手动前 16 + …（旧按字符阈值 8）
    expect((dd as Element).querySelector('.select-label')!.textContent).toBe(LATIN_OPT.slice(0, 16) + '…');
    w.unmount();
  });

  it('save_submits_full_value_not_truncated_label', async () => {
    calls = [];
    (window as any).lms = {
      invoke: (cmd: string, ...args: unknown[]) => { calls.push({ cmd, args }); if (cmd === 'suggest_config_id') return Promise.resolve(SUGGEST_ID); return Promise.resolve(null); },
      onLogLine: () => () => {}, onProcessExit: () => () => {}, onTrayExitRequest: () => () => {},
    };
    const w = mount(TemplateModal, {
      attachTo: document.body,
      props: { open: true, id: '', values: {}, paramsMeta: metaLong },
    });
    await flush();

    // 长选项即默认选中（fill opts[0)）：desc + -m 必填填齐后保存（id 自动生成，无输入框）——yaml 值必须是完整长串，不是截断 label
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    // desc（名字）必填（留空会拒保存）
    const descLb = [...document.querySelectorAll('.modal-box label.label')].find((l) => (l.textContent ?? '').includes('名字'))!;
    const descIn = descLb.nextElementSibling as HTMLInputElement;
    setter.call(descIn, 'd');
    descIn.dispatchEvent(new Event('input', { bubbles: true }));
    // -m 为 params 表第一个文本行（.row-cell input[0]）
    const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    setter.call(mIn, 'x.gguf');
    mIn.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    // [保存] 按钮已是右下角软盘图标角形按钮（无文字），按 .modal-save 类名定位
(document.querySelector('.modal-save') as HTMLButtonElement).click();
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
    props: { open: true, id: 'qwen38', values: {}, paramsMeta },
  });
}

// [删除] 按钮已改为 FontAwesome trash 图标（无文字，2026-09）：按 .btn-delete 类名定位；
// querySelector 未命中返回 null → 归一化为 undefined（既有 toBeUndefined 断言契约）
function findDeleteBtn(): HTMLButtonElement | undefined {
  const el = document.querySelector('.modal-actions .btn-delete');
  return (el ?? undefined) as HTMLButtonElement | undefined;
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

// ---- [x] 关闭按钮 FontAwesome xmark 契约（2026-09）：文字 × → fa xmark 图标；
//     .modal-close font-size:16px 经 FA 继承定尺寸，hover 红底白字样式不变；a11y label 保留 ----
describe('TemplateModal close button', () => {
  it('close_button_is_fa_xmark_without_text', async () => {
    calls = []; mockLms();
    const w = mountModal(); await flush();
    const b = document.querySelector('.modal-head .modal-close') as HTMLButtonElement;
    expect(b).toBeDefined();
    expect(b.textContent?.trim().length).toBe(0);             // 「×」文字已移除
    expect(b.querySelector('svg')).not.toBeNull();            // FontAwesome xmark（svg 渲染）
    expect(b.getAttribute('aria-label')).toBe('关闭弹窗');      // a11y label 保留
    w.unmount();
  });
});

// ---- [保存] 软盘图标角形按钮契约（2026-08-27）：右下角形按钮 = 应用窗口标题栏关闭键同款语言；
//     「保存」二字 → 软盘 SVG，a11y label 保留；disabled=saving 沿用原契约 ----
describe('TemplateModal save button', () => {
  it('save_is_floppy_icon_corner_button_without_text', async () => {
    calls = []; mockLms();
    const w = mountModal(); await flush();
    const b = document.querySelector('.modal-save') as HTMLButtonElement;
    expect(b).toBeDefined();                                   // 右下角形按钮存在
    expect(b.textContent?.trim().length).toBe(0);              // 「保存」文字已移除
    expect(b.querySelector('svg')).not.toBeNull();             // 软盘图标（svg）
    expect(b.getAttribute('aria-label')).toBe('保存');          // a11y label 保留
    w.unmount();
  });
});

// ---- 标题栏契约（2026-08-27）：文字「新建模板」/「编辑模板」居中，[x] 在最右侧，点击 [x] emit close；底部取消按钮删除 ----
describe('TemplateModal titlebar', () => {
  it('new_mode_title_is_new_template_and_x_closes', async () => {
    calls = []; mockLms();
    const w = mountModal(); await flush();
    expect(document.querySelector('.modal-head .modal-title')?.textContent).toBe('新建模板');
    const xBtn = document.querySelector('.modal-head .modal-close') as HTMLButtonElement;
    expect(xBtn).toBeDefined();
    // [x] 关闭按钮文字 ×（2026-08）→ FontAwesome xmark 图标：无文字、含 svg；a11y label 保留
    expect(xBtn.textContent?.trim().length).toBe(0);
    expect(xBtn.querySelector('svg')).not.toBeNull();
    expect(xBtn.getAttribute('aria-label')).toBe('关闭弹窗');
    xBtn.click();
    await flush();
    expect(w.emitted('close')).toHaveLength(1);
    w.unmount();
  });

  it('edit_mode_title_is_edit_template', async () => {
    calls = []; mockLms();
    const w = mountEdit(); await flush();
    expect(document.querySelector('.modal-head .modal-title')?.textContent).toBe('编辑模板');
    const xBtn = document.querySelector('.modal-head .modal-close') as HTMLButtonElement;
    xBtn.click();
    await flush();
    expect(w.emitted('close')).toHaveLength(1);
    w.unmount();
  });

  it('cancel_button_removed_from_actions', async () => {
    calls = []; mockLms();
    const w = mountModal(); await flush();
    const btns = [...document.querySelectorAll('.modal-actions button')].map((b) => b.textContent?.trim());
    expect(btns).not.toContain('取消'); // 关闭功能挪到标题栏 [x]，底部不再渲染「取消」
    w.unmount();
  });
});

// ---- id 自动生成契约（v1.2 增量）：新建模板不再让用户填 id——无输入框；保存时先 invoke suggest_config_id
//      取主进程生成的唯一 id 再 save_config；编辑模式显示只读 id 文本（.id-view），无输入框、不可修改 ----

describe('TemplateModal auto id', () => {
  function mountNew() {
    return mount(TemplateModal, {
      attachTo: document.body,
      props: { open: true, id: '', values: {}, paramsMeta },
    });
  }

  it('new_mode_has_no_id_input_only_hint_or_value', async () => {
    calls = []; mockLms();
    const w = mountNew(); await flush();

    // 不再有 id 输入框：placeholder「小写字母与数字」的 input 不存在
    const inputs = [...document.querySelectorAll('.modal-box input')];
    expect(inputs.find((i) => (i.placeholder ?? '').includes('小写字母'))).toBeUndefined();
    // 无 .id-input（旧的 v-model id 输入框）
    expect(document.querySelector('.id-input')).toBeNull();
    w.unmount();
  });

  it('new_mode_shows_no_id_label_or_auto_hint', async () => {
    calls = []; mockLms();
    const w = mountNew(); await flush();

    // 新建模式：不显示「id」标签、也不显示「保存时自动生成」提示（id 完全静默自动）
    expect(document.querySelector('.id-hint')).toBeNull();
    expect(document.querySelector('.id-view')).toBeNull(); // 只读 id 仅编辑模式
    const labels = [...document.querySelectorAll('.modal-box label.label')].map((l) => l.textContent?.trim());
    expect(labels).not.toContain('id');
    w.unmount();
  });

  it('edit_mode_shows_readonly_id_without_input', async () => {
    calls = []; mockLms();
    const w = mountEdit(); await flush();

    // 只读 id 文本：.id-view 单行显示「id: xxx」，无输入框、不可编辑
    const view = document.querySelector('.id-view');
    expect(view).not.toBeNull();
    expect(view!.textContent?.trim()).toBe('id: qwen38'); // 格式「id: xxx」（2026-09 用户定）
    // .id-view 不是 input——是静态文本节点（内容不可修改）
    expect(view!.tagName.toLowerCase()).not.toBe('input');
    w.unmount();
  });

  it('new_mode_save_requests_suggested_id_then_saves_with_it', async () => {
    calls = [];
    (window as any).lms = {
      invoke: (cmd: string, ...args: unknown[]) => {
        calls.push({ cmd, args });
        if (cmd === 'suggest_config_id') return Promise.resolve(SUGGEST_ID);
        return Promise.resolve(null);
      },
      onLogLine: () => () => {},
      onProcessExit: () => () => {},
      onTrayExitRequest: () => () => {},
    };
    const w = mountNew(); await flush();

    // desc（名字）+ -m 必填填齐后保存（无 id 输入框，不需要填 id）
    const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    setter.call(mIn, 'D:/models/qwen.gguf'); mIn.dispatchEvent(new Event('input', { bubbles: true }));
    const descLb = [...document.querySelectorAll('.modal-box label.label')].find((l) => (l.textContent ?? '').includes('名字'))!;
    const descEl = descLb.nextElementSibling as HTMLInputElement;
    setter.call(descEl, '日常推理'); descEl.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    (document.querySelector('.modal-save') as HTMLButtonElement).click();
    await flush();

    // 先 suggest_config_id，后 save_config（携带返回的 id）
    const sIdx = calls.findIndex((c) => c.cmd === 'suggest_config_id');
    const save = calls.find((c) => c.cmd === 'save_config');
    expect(sIdx).toBeGreaterThanOrEqual(0);
    expect(save).toBeDefined();
    expect(calls.indexOf(save!)).toBeGreaterThan(sIdx);
    expect((save!.args as unknown[])[0]).toBe(SUGGEST_ID);
    w.unmount();
  });

  it('edit_mode_save_does_not_suggest_and_uses_existing_id', async () => {
    calls = []; mockLms();
    const w = mountEdit(); await flush();

    (document.querySelector('.modal-save') as HTMLButtonElement).click();
    await flush();

    // 编辑模式：不请求新 id，save_config 沿用 props.id（desc 必填——留空时保存被拒，这里只断言无 suggest）
    expect(calls.find((c) => c.cmd === 'suggest_config_id')).toBeUndefined();
    w.unmount();
  });

  it('suggest_error_shown_in_modal_without_save', async () => {
    calls = [];
    (window as any).lms = {
      invoke: (cmd: string, ...args: unknown[]) => {
        calls.push({ cmd, args });
        if (cmd === 'suggest_config_id') return Promise.reject(new Error('VALIDATION: id 生成失败'));
        return Promise.resolve(null);
      },
      onLogLine: () => () => {},
      onProcessExit: () => () => {},
      onTrayExitRequest: () => () => {},
    };
    const w = mountNew(); await flush();

    // 必填填齐后保存（desc + -m）
    const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    setter.call(mIn, 'x.gguf'); mIn.dispatchEvent(new Event('input', { bubbles: true }));
    const descLb = [...document.querySelectorAll('.modal-box label.label')].find((l) => (l.textContent ?? '').includes('名字'))!;
    const descEl = descLb.nextElementSibling as HTMLInputElement;
    setter.call(descEl, 'd'); descEl.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    (document.querySelector('.modal-save') as HTMLButtonElement).click();
    await flush();

    // suggest 失败 → 错误进 saveError 区展示，不发 save_config
    expect(calls.find((c) => c.cmd === 'save_config')).toBeUndefined();
    expect(document.querySelector('.modal-box')?.textContent).toContain('VALIDATION: id 生成失败');
    w.unmount();
  });
});
