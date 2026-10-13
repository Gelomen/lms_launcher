// @vitest-environment happy-dom
// 组件测试：快捷启动的新建/编辑弹窗（2026-10-10-quick-launch-card 任务 12）
// 判据：docs/superpowers/checks/2026-10-10-quick-launch-card/task-12-quick-launch-modal.md E1-E9
// 弹窗与 TemplateModal 同构：内容经 Teleport 渲染到 body，所以断言在 document 层级做。
// 第 9 条用例（E9 / 索引 K29）挂的是卡片：弹窗归卡片持有，接线在 QuickLaunch.vue（B3）。
// 它放在本文件里是为了让改动范围仍是 B1-B3（G3）——QuickLaunch.test.ts 的 7 条既有用例一字不改。
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mount, flushPromises as flush } from '@vue/test-utils';
import QuickLaunchModal from './QuickLaunchModal.vue';
import QuickLaunch from './QuickLaunch.vue';
import { t } from '../i18n';
import { truncateByWidth } from '../util/truncate';
import type { QuickLaunchEntry, QuickLaunchList } from '../src-main/quick-launch-config';
import type { TerminalInfo } from '../src-main/quick-launch-terminals';

type Calls = Array<{ cmd: string; args: unknown[] }>;
let calls: Calls = [];

// 主进程返回序 = quick-launch-terminals.ts:107-113 的探测顺序（powershell → cmd → pwsh → wsl）。
// 用例按这个顺序断言「不重排」（索引 K31(3) / 关闭 M1）：pwsh 不在第一项。
const TERMS: TerminalInfo[] = [
  { id: 'powershell', path: 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' },
  { id: 'cmd', path: 'C:\\WINDOWS\\System32\\cmd.exe' },
  { id: 'pwsh', path: 'C:\\Program Files\\WindowsApps\\pwsh.exe' },
  { id: 'wsl', path: 'C:\\WINDOWS\\System32\\wsl.exe' },
];

const SHELL_ENTRY: QuickLaunchEntry = { name: 'webui', type: 'shell', shell: 'pwsh', cmd: 'python -m webui' };

interface MockOpts {
  /** 数组 = 直接返回；Promise = 探测中（E3 用它钉「加载中禁用」） */
  terminals?: TerminalInfo[] | Promise<TerminalInfo[]>;
  save?: (id: unknown, entry: QuickLaunchEntry) => Promise<string>;
  del?: (id: string) => Promise<unknown>;
  pick?: string | null;
  list?: () => QuickLaunchList;
}

// 主进程契约（check C3）：ql_save 成功 = resolve 最终 id；校验失败 = reject（VALIDATION: 前缀）
function mockLms(o: MockOpts = {}): void {
  calls = [];
  (window as any).lms = {
    invoke: (cmd: string, ...args: unknown[]): Promise<unknown> => {
      calls.push({ cmd, args });
      if (cmd === 'ql_terminals') return Promise.resolve(o.terminals ?? TERMS);
      if (cmd === 'ql_save') return (o.save ?? (() => Promise.resolve('qlnew0001')))(args[0], args[1] as QuickLaunchEntry);
      if (cmd === 'ql_delete') return (o.del ?? (() => Promise.resolve(null)))(args[0] as string);
      if (cmd === 'ql_pick_exe') return Promise.resolve(o.pick ?? null);
      if (cmd === 'ql_list') return Promise.resolve(JSON.parse(JSON.stringify((o.list ?? (() => ({ items: {}, invalid: [] })))())));
      return Promise.resolve(null);
    },
  };
}

// running（修复轮 B · I-1）：App 的只读镜像 qlStates 经卡片派生给弹窗的运行态标志（缺省 = 未运行）
function mountModal(props: { open: boolean; id: string | null; entry: QuickLaunchEntry | null; running?: boolean }) {
  return mount(QuickLaunchModal, { attachTo: document.body, props });
}

// 真实 CSS 注入（同 QuickLaunch.test.ts:259-264 的手法）：Vitest 默认不处理 CSS，
// 读 computed style 必须自己把真样式灌进 document。两份都要：
//   src/style.css —— .card 的 1px 边框 / .input / .select-trigger 的 --h-control 高（218 的组成部分）；
//   QuickLaunchModal.vue 的 <style scoped> 原文 —— 定高数字就在这一段里。
// 原文里没有 [data-v-] 属性选择器（scoped 属性是编译期加的），所以直接灌裸文本即可命中 DOM。
function injectRealCss(): void {
  if (document.getElementById('__real-css__')) return;
  const scoped = fs.readFileSync(path.join(process.cwd(), 'src', 'modules', 'QuickLaunchModal.vue'), 'utf8')
    .split('<style scoped>')[1].split('</style>')[0];
  const global = fs.readFileSync(path.join(process.cwd(), 'src', 'style.css'), 'utf8');
  const st = document.createElement('style');
  st.id = '__real-css__';
  st.textContent = global + '\n' + scoped;
  document.head.appendChild(st);
}

// ---------- DOM 定位（表单 = label 与控件在 .flag-grid 里交替排列，按 label 文本取相邻控件）----------
const box = (): Element | null => document.querySelector('.modal-box');
const labelByText = (text: string): Element | null =>
  [...document.querySelectorAll('.modal-box label')].find((l) => (l.textContent ?? '').trim() === text) ?? null;
const controlOf = (text: string): Element | null => {
  const l = labelByText(text);
  return l ? l.nextElementSibling : null;
};
const inputOf = (text: string): HTMLInputElement | null => {
  const c = controlOf(text);
  if (!c) return null;
  return (c.tagName === 'INPUT' ? c : c.querySelector('input')) as HTMLInputElement | null;
};
const dropdownOf = (text: string): Element | null => {
  const c = controlOf(text);
  return c && c.classList.contains('dropdown') ? c : null;
};
const triggerOf = (text: string): Element | null => dropdownOf(text)?.querySelector('.select-trigger') ?? null;
const triggerText = (text: string): string => (triggerOf(text)?.querySelector('.select-label')?.textContent ?? '').trim();
function setInput(el: HTMLInputElement, v: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return flush();
}
async function openOptionLabels(root: Element): Promise<string[]> {
  (root.querySelector('.select-trigger') as HTMLButtonElement).click();
  await flush();
  return [...root.querySelectorAll('ul.dropdown-panel li')].map((li) => (li.textContent ?? '').trim());
}
async function pickOption(root: Element, label: string): Promise<void> {
  const labels = await openOptionLabels(root);
  const i = labels.indexOf(label);
  expect(i, 'option ' + label + ' not in ' + JSON.stringify(labels)).toBeGreaterThanOrEqual(0);
  (root.querySelectorAll('ul.dropdown-panel li')[i] as HTMLLIElement).click();
  await flush();
}
const saveBtn = (): HTMLButtonElement => document.querySelector('.modal-save') as HTMLButtonElement;
const saveCalls = (): Calls => calls.filter((c) => c.cmd === 'ql_save');

describe('QuickLaunchModal', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  // E1（计划 步骤 1）：默认类型 = 命令行 → 终端下拉 + 命令输入框；exe 字段与删除按钮不出现
  it('defaults_to_shell_type_with_terminal_dropdown_and_cmd_input', async () => {
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    expect(box()).not.toBeNull();
    expect(box()!.textContent).toContain(t('ql.modal.newTitle')); // 新建态标题（C1：id = null）

    // 类型走 Dropdown（F1），默认值 = shell
    const typeDd = dropdownOf(t('ql.modal.type'));
    expect(typeDd).not.toBeNull();
    expect(typeDd!.querySelector('select')).toBeNull();
    expect(typeDd!.querySelector('.select-trigger')).not.toBeNull();
    expect(triggerText(t('ql.modal.type'))).toBe(t('ql.modal.type.shell'));
    expect(await openOptionLabels(typeDd!)).toEqual([t('ql.modal.type.shell'), t('ql.modal.type.exe')]);

    // 命令行字段：终端下拉 + 命令输入框（空值）
    expect(dropdownOf(t('ql.modal.terminal'))).not.toBeNull();
    const cmd = inputOf(t('ql.modal.cmd'));
    expect(cmd).not.toBeNull();
    expect(cmd!.value).toBe('');
    // 可执行程序字段不出现
    expect(labelByText(t('ql.modal.exe'))).toBeNull();
    // 新建态无删除按钮（E6 前半）
    expect(document.querySelector('.btn-delete')).toBeNull();
    w.unmount();
  });

  // E2（计划 步骤 1）：切到可执行程序 → 终端与命令隐藏，出现 exe 路径 + 选择按钮（走 ql_pick_exe）
  it('switching_to_exe_hides_terminal_and_cmd_shows_path_and_pick_button', async () => {
    mockLms({ pick: 'D:\\Tools\\LM Studio.exe' });
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    await pickOption(dropdownOf(t('ql.modal.type'))!, t('ql.modal.type.exe'));

    expect(triggerText(t('ql.modal.type'))).toBe(t('ql.modal.type.exe'));
    expect(labelByText(t('ql.modal.terminal'))).toBeNull();
    expect(labelByText(t('ql.modal.cmd'))).toBeNull();
    const exe = inputOf(t('ql.modal.exe'));
    expect(exe).not.toBeNull();
    expect(exe!.value).toBe('');

    // 选择按钮：ql_pick_exe → 返回路径写入表单
    const cell = controlOf(t('ql.modal.exe'))!;
    const pickBtn = [...cell.querySelectorAll('button')].find((b) => b.getAttribute('data-tooltip') === t('ql.modal.btn.pick'));
    expect(pickBtn).toBeDefined();
    (pickBtn as HTMLButtonElement).click();
    await flush();
    expect(calls.filter((c) => c.cmd === 'ql_pick_exe').length).toBe(1);
    expect(exe!.value).toBe('D:\\Tools\\LM Studio.exe');

    // 取消对话框 = 返回 null → 不改表单（check C3）
    mockLms({ pick: null });
    const pickBtn2 = [...controlOf(t('ql.modal.exe'))!.querySelectorAll('button')]
      .find((b) => b.getAttribute('data-tooltip') === t('ql.modal.btn.pick')) as HTMLButtonElement;
    pickBtn2.click();
    await flush();
    expect(exe!.value).toBe('D:\\Tools\\LM Studio.exe');
    w.unmount();
  });

  // E3（规格 §9.4 / §6.1 / 索引 K31(3)）：终端下拉来自 ql_terminals；加载中禁用 + 占位文案；
  // 顺序按主进程返回序不重排；标签走字面量查表（F3）；预选第一项可用
  it('terminal_options_come_from_ql_terminals_and_are_disabled_while_loading', async () => {
    let resolveTerms: (v: TerminalInfo[]) => void = () => {};
    mockLms({ terminals: new Promise<TerminalInfo[]>((res) => { resolveTerms = res; }) });
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    // 打开弹窗即探测（C3：open 变 true 时拉取）
    expect(calls.filter((c) => c.cmd === 'ql_terminals').length).toBe(1);

    const termLabel = t('ql.modal.terminal');
    const trigger = triggerOf(termLabel) as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    // 加载中：禁用 + 占位文案（Dropdown 的 disabled / placeholder，E3 的硬断言）
    expect(trigger.getAttribute('disabled')).not.toBeNull();
    expect(trigger.querySelector('.select-label')!.textContent).toBe(t('ql.modal.terminal.loading'));

    // 探测完成 → 选项 = 主进程返回序（powershell/cmd/pwsh/wsl），不重排、不 pwsh 优先
    resolveTerms(TERMS);
    await flush();
    expect((triggerOf(termLabel) as HTMLButtonElement).getAttribute('disabled')).toBeNull();
    const labels = await openOptionLabels(dropdownOf(termLabel)!);
    // M19（修复轮 B）带来的期望变更：label 由父级按预算 16 截断，'PowerShell 7 (pwsh)'（宽 19）→ 'PowerShell 7 (pw…'。
    // 本用例钉的是「顺序 = 主进程返回序、不重排、不 pwsh 优先」，与截断无关，故只把期望值换成截断后的标签。
    expect(labels).toEqual([t('ql.term.powershell'), t('ql.term.cmd'), truncateByWidth(t('ql.term.pwsh'), 16), t('ql.term.wsl')]);
    // 预选第一项可用（K31(3)）
    expect(triggerText(termLabel)).toBe(t('ql.term.powershell'));
    w.unmount();
  });

  // E4（规格 §5.3-1 / F4）：空名 → 保存被拦下并显示 ql.err.nameRequired；不发 ql_save；
  // 其余六条规则不在渲染端复制（F4）
  it('empty_name_blocks_save_and_shows_ql_err_nameRequired', async () => {
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    await setInput(inputOf(t('ql.modal.cmd'))!, 'ping -n 1 127.0.0.1');
    saveBtn().click();
    await flush();

    expect(saveCalls().length).toBe(0);
    expect(box()!.textContent).toContain(t('ql.err.nameRequired'));
    expect(w.emitted('saved')).toBeUndefined();
    expect(box()).not.toBeNull(); // 拦下 = 不关窗

    // 即时提示：填上名字后该文案消失（不复制主进程的其它规则）
    await setInput(inputOf(t('ql.modal.name'))!, 'webui');
    expect(box()!.textContent).not.toContain(t('ql.err.nameRequired'));
    w.unmount();
  });

  // E5（规格 §5.3-2 / 索引 K31(2)）：主进程的重名文案原样进错误区（errMsg 剥壳），不关窗、不冒泡 saved；
  // 不在渲染端映射成 ql.err.nameTaken
  it('duplicate_name_from_main_process_shows_its_message_and_keeps_modal_open', async () => {
    // Electron 的 ipcRenderer 外壳（src/ipc.ts:88-96）：errMsg 剥掉后剩 VALIDATION: + 主进程文案
    mockLms({ save: () => Promise.reject(new Error("Error invoking remote method 'ql_save': Error: VALIDATION: 名字「webui」已存在")) });
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: { ...SHELL_ENTRY, name: 'other' } });
    await flush();

    await setInput(inputOf(t('ql.modal.name'))!, 'webui');
    saveBtn().click();
    await flush();

    const err = document.querySelector('.modal-body .error-text');
    expect(err).not.toBeNull();
    expect(err!.textContent).toBe('VALIDATION: 名字「webui」已存在'); // 主进程文案（带名字），非渲染端映射
    expect(err!.textContent).not.toContain(t('ql.err.nameTaken'));
    expect(box()).not.toBeNull();                 // 不关窗
    expect(w.emitted('saved')).toBeUndefined();   // 不冒泡 saved
    w.unmount();
  });

  // E6（规格 §9.4 / F2）：仅编辑态显示删除；删除需 ConfirmDialog 二次确认（取消无副作用）
  it('delete_button_only_in_edit_mode_and_requires_confirm_dialog', async () => {
    // 新建态：无删除按钮
    mockLms();
    const wNew = mountModal({ open: true, id: null, entry: null });
    await flush();
    expect(document.querySelector('.btn-delete')).toBeNull();
    wNew.unmount();
    document.body.innerHTML = '';
    calls = [];

    // 编辑态：有删除按钮（左下，F2）
    let delCalls = 0;
    mockLms({ del: (id) => { delCalls += 1; void id; return Promise.resolve(null); } });
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: SHELL_ENTRY });
    await flush();
    expect(box()!.textContent).toContain(t('ql.modal.editTitle'));
    const del = document.querySelector('.btn-delete') as HTMLButtonElement;
    expect(del).not.toBeNull();
    expect(del.getAttribute('aria-label')).toBe(t('ql.modal.btn.delete'));

    // 点删除 = 只开二次确认（tone=danger），不发 ql_delete
    del.click();
    await flush();
    const confirm = document.querySelector('.confirm-box');
    expect(confirm).not.toBeNull();
    expect(confirm!.textContent).toContain(t('ql.modal.delete.title'));
    expect(confirm!.textContent).toContain(t('ql.modal.delete.message', { name: SHELL_ENTRY.name }));
    expect(delCalls).toBe(0);
    expect(calls.filter((c) => c.cmd === 'ql_delete').length).toBe(0);

    // [取消] → 只关窗，无副作用
    (document.querySelector('.confirm-cancel') as HTMLButtonElement).click();
    await flush();
    expect(document.querySelector('.confirm-box')).toBeNull();
    expect(delCalls).toBe(0);
    expect(w.emitted('deleted')).toBeUndefined();

    // 再点删除 → [确认] 才 invoke('ql_delete', id) 并冒泡 deleted(id)
    (document.querySelector('.btn-delete') as HTMLButtonElement).click();
    await flush();
    (document.querySelector('.confirm-ok') as HTMLButtonElement).click();
    await flush();
    expect(calls.filter((c) => c.cmd === 'ql_delete').map((c) => c.args[0])).toEqual(['qla1b2c3d4']);
    expect(w.emitted('deleted')).toEqual([['qla1b2c3d4']]);
    w.unmount();
  });

  // E7（计划 emits / 索引 K14(2)）：保存成功 → emit saved；父组件负责关窗与刷新。
  // 保存按钮单飞：同一 tick 内连点两次只发一次 ql_save，飞行中按钮禁用
  it('save_success_emits_saved_and_closes', async () => {
    let resolveSave: (v: string) => void = () => {};
    mockLms({ save: () => new Promise<string>((res) => { resolveSave = res; }) });
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: SHELL_ENTRY });
    await flush();

    const btn = saveBtn();
    // 两次点击落在同一 tick：DOM 上的 disabled 还没打上，靠 saving 守卫（K14(2)）
    btn.click();
    btn.click();
    await flush();
    expect(saveCalls().length).toBe(1);
    expect((document.querySelector('.modal-save') as HTMLButtonElement).getAttribute('disabled')).not.toBeNull();

    resolveSave('qla1b2c3d4');
    await flush();
    expect(saveCalls()[0].args).toEqual(['qla1b2c3d4', SHELL_ENTRY]); // 编辑态沿用 props.id
    expect(w.emitted('saved')).toEqual([[]]);
    expect(w.emitted('close')).toBeUndefined(); // 关窗由持有者做（与 TemplateModule.vue:143 同构）
    // 结束后按钮恢复可用（单飞只覆盖飞行期间）
    expect((document.querySelector('.modal-save') as HTMLButtonElement).getAttribute('disabled')).toBeNull();
    w.unmount();
  });

  // E8（规格 §5.4 / 索引 K31(1)）：新建态向 ql_save 传 id = null，新 id 由主进程生成；
  // 只发该类型的字段（§5.3-6）
  it('new_entry_passes_id_null_to_ql_save', async () => {
    let sent: { id: unknown; entry: QuickLaunchEntry } | null = null;
    mockLms({ save: (id, entry) => { sent = { id, entry }; return Promise.resolve('qlzzzzzzzz'); } });
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    await setInput(inputOf(t('ql.modal.name'))!, '新建项');
    await pickOption(dropdownOf(t('ql.modal.terminal'))!, t('ql.term.cmd'));
    await setInput(inputOf(t('ql.modal.cmd'))!, 'ping -n 1 127.0.0.1');
    saveBtn().click();
    await flush();

    expect(sent).not.toBeNull();
    expect(sent!.id).toBeNull();
    expect(sent!.entry).toEqual({ name: '新建项', type: 'shell', shell: 'cmd', cmd: 'ping -n 1 127.0.0.1' });
    expect(w.emitted('saved')).toEqual([[]]);
    w.unmount();

    // exe 类型：只发 exe，不带 shell / cmd（§5.3-6）
    sent = null;
    const saveExe = (id: unknown, entry: QuickLaunchEntry) => { sent = { id, entry }; return Promise.resolve('qlyyyyyyyy'); };
    mockLms({ pick: 'D:\\Tools\\notepad.exe', save: saveExe });
    const w2 = mountModal({ open: true, id: null, entry: null });
    await flush();
    await pickOption(dropdownOf(t('ql.modal.type'))!, t('ql.modal.type.exe'));
    await setInput(inputOf(t('ql.modal.name'))!, '记事本');
    (controlOf(t('ql.modal.exe'))!.querySelector('button') as HTMLButtonElement).click();
    await flush();
    saveBtn().click();
    await flush();
    expect(sent).not.toBeNull();
    expect(sent!.id).toBeNull();
    expect(sent!.entry).toEqual({ name: '记事本', type: 'exe', exe: 'D:\\Tools\\notepad.exe' });
    w2.unmount();
  });

  // E9（索引 K29 / B3）：卡片挂载弹窗并接线 —— 新建 = 空表单；编辑 = 回填；
  // saved / deleted → 重拉 ql_list + 冒泡 changed；close → 只关窗不改动
  it('card_mounts_modal_and_refreshes_on_saved_deleted', async () => {
    const store: QuickLaunchList = { items: { a: { ...SHELL_ENTRY } }, invalid: [] };
    calls = [];
    (window as any).lms = {
      invoke: (cmd: string, ...args: unknown[]): Promise<unknown> => {
        calls.push({ cmd, args });
        if (cmd === 'ql_list') return Promise.resolve(JSON.parse(JSON.stringify(store)));
        if (cmd === 'ql_terminals') return Promise.resolve(TERMS);
        if (cmd === 'ql_save') {
          const id = (args[0] as string | null) ?? 'qlnew0001';
          store.items[id] = JSON.parse(JSON.stringify(args[1])) as QuickLaunchEntry;
          return Promise.resolve(id);
        }
        if (cmd === 'ql_delete') {
          delete store.items[args[0] as string];
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      },
    };
    const w = mount(QuickLaunch, { attachTo: document.body, props: { states: {} } });
    await flush();
    const rowNames = () => w.findAll('.tpl-row .tpl-row__id').map((l) => l.text());
    const listCalls = () => calls.filter((c) => c.cmd === 'ql_list').length;
    expect(rowNames()).toEqual(['webui']);
    const listCallsAfterMount = listCalls();

    // 点卡片「新建」→ 弹窗以空表单打开
    const newBtn = w.findAll('button').find((b) => b.attributes('data-tooltip') === t('ql.btn.new'))!;
    await newBtn.trigger('click');
    await flush();
    expect(box()).not.toBeNull();
    expect(box()!.textContent).toContain(t('ql.modal.newTitle'));
    expect((inputOf(t('ql.modal.name')) as HTMLInputElement).value).toBe('');
    expect(document.querySelector('.btn-delete')).toBeNull();

    // close → 只关窗，不改动（无写操作、无 changed）
    (document.querySelector('.modal-close') as HTMLButtonElement).click();
    await flush();
    expect(box()).toBeNull();
    expect(w.emitted('changed')).toBeUndefined();
    expect(calls.filter((c) => c.cmd === 'ql_save' || c.cmd === 'ql_delete').length).toBe(0);

    // 点行内「编辑」→ 以该条回填打开（名字 / 命令 / 终端都回填，不被「预选第一项」覆盖）
    const editBtn = w.findAll('.tpl-row')[0].findAll('button')
      .find((b) => b.attributes('data-tooltip') === t('ql.btn.edit'))!;
    await editBtn.trigger('click');
    await flush();
    expect(box()!.textContent).toContain(t('ql.modal.editTitle'));
    expect((inputOf(t('ql.modal.name')) as HTMLInputElement).value).toBe('webui');
    expect((inputOf(t('ql.modal.cmd')) as HTMLInputElement).value).toBe('python -m webui');
    // M19（修复轮 B）：trigger 显示的是截断后的 label（同 :189 的期望变更），本行钉的是「编辑态不被预选覆盖」
    expect(triggerText(t('ql.modal.terminal'))).toBe(truncateByWidth(t('ql.term.pwsh'), 16));
    expect(document.querySelector('.btn-delete')).not.toBeNull();

    // 改名字后保存 → 弹窗关、卡片重拉 ql_list、行名更新、冒泡 changed
    await setInput(inputOf(t('ql.modal.name'))!, 'webui-renamed');
    saveBtn().click();
    await flush();
    await flush();
    expect(saveCalls().length).toBe(1);
    expect(saveCalls()[0].args[0]).toBe('a');
    expect(box()).toBeNull();
    expect(listCalls()).toBeGreaterThan(listCallsAfterMount);
    expect(rowNames()).toEqual(['webui-renamed']);
    expect(w.emitted('changed')).toEqual([[]]);

    // 删除：编辑 → 删除 → 确认 → 该行消失且冒泡 changed
    const editBtn2 = w.findAll('.tpl-row')[0].findAll('button')
      .find((b) => b.attributes('data-tooltip') === t('ql.btn.edit'))!;
    await editBtn2.trigger('click');
    await flush();
    (document.querySelector('.btn-delete') as HTMLButtonElement).click();
    await flush();
    (document.querySelector('.confirm-ok') as HTMLButtonElement).click();
    await flush();
    await flush();
    expect(calls.filter((c) => c.cmd === 'ql_delete').map((c) => c.args[0])).toEqual(['a']);
    expect(rowNames()).toEqual([]);
    expect(w.emitted('changed')).toEqual([[], []]);
    // 卡片 emits 仍是 start/stop/changed（K29：不新增 new/edit 事件）
    const emittedKeys = Object.keys(w.emitted());
    expect(emittedKeys).toContain('changed');
    expect(emittedKeys).not.toContain('new');
    expect(emittedKeys).not.toContain('edit');
    w.unmount();
  });

  // ===== 修复轮 B（最终审查 I-1 / M19 / Minor 9）新增用例 =====

  // I-1（必修）：运行中的条目不能删 —— 删掉后卡片行消失（没有 [停止] 了），而页签的 [x] 因
  // closeDisabled（App.vue:358-369）永久禁用 → 既关不掉也停不掉。裁定 = 禁用 [删除]，
  // tooltip 接上**已存在**的键 ql.err.running（src-main/i18n/dict.ts:184 zh / :526 en，本轮不新建键）。
  it('delete_button_is_disabled_for_running_entry_and_shows_ql_err_running', async () => {
    let delCalls = 0;
    mockLms({ del: (id) => { delCalls += 1; void id; return Promise.resolve(null); } });
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: SHELL_ENTRY, running: true });
    await flush();

    // 编辑态仍渲染删除按钮（F2 的位置/图标不变），只是不可用
    const del = document.querySelector('.btn-delete') as HTMLButtonElement;
    expect(del).not.toBeNull();
    expect(del.getAttribute('disabled')).not.toBeNull();
    expect(del.getAttribute('data-tooltip')).toBe(t('ql.err.running'));

    // 机制断言（修复轮 B1）：tooltip 的渲染条件是**类选择器**，不是「属性存在」——
    // src/style.css:414-425 = `.tip-up::after { content: attr(data-tooltip) }` +
    // `.tip-up:hover::after { opacity: 1 }`；本组件的 .btn-delete（QuickLaunchModal.vue:338-353）
    // 没有任何 ::after 规则，所以只挂 data-tooltip 在真机上什么都不渲染（jsdom 只看属性 → 上一轮漏网）。
    // 对照正确用法：src/App.vue:565 = class="winbtn winbtn--github tip-down" + :data-tooltip（类与属性成对）。
    expect(del.classList.contains('tip-up'),
      'data-tooltip 已挂但缺 .tip-up 类 → style.css:414-425 的 ::after 不渲染（真机看不到 tooltip）').toBe(true);

    // 点了也不开二次确认、不发 ql_delete（守卫在模板与 onDelete 两处，任一被去掉本用例都红）
    del.click();
    await flush();
    expect(document.querySelector('.confirm-box')).toBeNull();
    expect(delCalls).toBe(0);
    expect(calls.filter((c) => c.cmd === 'ql_delete').length).toBe(0);
    expect(w.emitted('deleted')).toBeUndefined();
    w.unmount();
  });

  // I-1 负面对照（修复轮 B1）：tip-up 必须与 data-tooltip **同条件**挂载（只在 running 为真时）。
  // 理由在 style.css:414-425：`content: attr(data-tooltip)` 在属性缺失时求值为空串，
  // 而 .tip-up::after 仍带 padding / border-radius / 深灰底 → 无条件挂 tip-up 会让未运行条目的
  // 删除按钮在 hover 时弹出一个空白气泡。本用例就是钉这条负面对照（变异门 b 让它红）。
  it('tip_up_class_and_data_tooltip_are_mounted_only_while_running', async () => {
    mockLms();
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: SHELL_ENTRY, running: false });
    await flush();

    const del = document.querySelector('.btn-delete') as HTMLButtonElement;
    expect(del).not.toBeNull();
    expect(del.classList.contains('tip-up'), '未运行却挂了 .tip-up → hover 时渲染空 tooltip 气泡').toBe(false);
    expect(del.getAttribute('data-tooltip')).toBeNull();
    w.unmount();
  });

  // I-1 正对照：非运行的条目照旧可删（E6 的行为一字不变）——可用、不挂「正在运行」tooltip、
  // 点它开二次确认，[确认] 才发 ql_delete
  it('delete_button_stays_enabled_and_deletes_for_not_running_entry', async () => {
    mockLms();
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: SHELL_ENTRY, running: false });
    await flush();

    const del = document.querySelector('.btn-delete') as HTMLButtonElement;
    expect(del).not.toBeNull();
    expect(del.getAttribute('disabled')).toBeNull();
    expect(del.getAttribute('data-tooltip')).toBeNull(); // 未运行 → 不挂 ql.err.running

    del.click();
    await flush();
    expect(document.querySelector('.confirm-box')).not.toBeNull();
    (document.querySelector('.confirm-ok') as HTMLButtonElement).click();
    await flush();
    expect(calls.filter((c) => c.cmd === 'ql_delete').map((c) => c.args[0])).toEqual(['qla1b2c3d4']);
    expect(w.emitted('deleted')).toEqual([['qla1b2c3d4']]);
    w.unmount();
  });

  // M19（只修下拉那一半）：Dropdown.vue:4 明写「label 截断由父级负责」，此前传的是未截断全名。
  // 预算 16 = 规格 §11-1（与 App.vue:350 的页签预算同值）；完整名走 option.tip（Dropdown.vue:18 / :72）。
  it('terminal_dropdown_labels_are_truncated_to_budget_with_full_name_tip', async () => {
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    const dd = dropdownOf(t('ql.modal.terminal'))!;
    await openOptionLabels(dd);
    const items = [...dd.querySelectorAll('ul.dropdown-panel li')];
    const texts = items.map((li) => (li.textContent ?? '').trim());
    const tips = items.map((li) => li.getAttribute('data-tooltip'));

    // 夹具前提：'PowerShell 7 (pwsh)' 宽 19 > 16+2 → 确实该被截断（否则本用例测不到东西）
    const full = t('ql.term.pwsh');
    const cut = truncateByWidth(full, 16);
    expect(cut).not.toBe(full);
    const i = texts.indexOf(cut);
    expect(i, '终端标签未按预算 16 截断，实际 = ' + JSON.stringify(texts)).toBeGreaterThanOrEqual(0);
    expect(tips[i]).toBe(full); // 完整名在 tip 里（零新组件、零新键）

    // 短名不截断也不挂 tip：与 LaunchBar.vue:93-94 的 grace 口径一致（grace 内全量渲染 → 无 …、无 tooltip）
    const short = t('ql.term.wsl');
    const j = texts.indexOf(short);
    expect(j, '短名标签被误截断，实际 = ' + JSON.stringify(texts)).toBeGreaterThanOrEqual(0);
    expect(tips[j]).toBeNull();
    w.unmount();
  });

  // 2026-10-13（用户直接改）：名字与类型同一行 —— 名字输入框占控件列余下宽度，
  // 类型下拉定宽（.type-field，见 QuickLaunchModal.vue 的 <style scoped>）贴在名字输入框右边。
  // 这里钉的是 DOM 结构：同一个 .row-cell 里的兄弟节点，且类型在名字之后（= 视觉右侧）。
  it('name_input_and_type_dropdown_share_one_row', async () => {
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    const nameInput = inputOf(t('ql.modal.name')) as HTMLInputElement;
    const typeField = dropdownOf(t('ql.modal.type')) as HTMLElement;
    expect(nameInput).not.toBe(null);
    expect(typeField).not.toBe(null);

    // 同一行 = 同一个行容器里的兄弟节点（此前名字在 .flag-grid 之外、类型另占一行）
    const row = nameInput.parentElement as HTMLElement;
    expect(row.classList.contains('row-cell'), '名字输入框不在 .row-cell 行容器里').toBe(true);
    expect(typeField.parentElement).toBe(row);

    // 类型在名字输入框右边（DOM 顺序即视觉顺序：flex 行不反向）
    const kids = [...row.children];
    expect(kids.indexOf(typeField)).toBeGreaterThan(kids.indexOf(nameInput));
    // 定宽靠 .type-field（压过 style.css:289 的 .dropdown { width: 100% }）；缺类 = 又占满整列
    expect(typeField.classList.contains('type-field')).toBe(true);

    // 空名报错仍在名字那一格内（不占网格列，否则会把下一行「终端」标签挤到报错同一行）
    saveBtn().click();
    await flush();
    const err = row.parentElement!.querySelector('.error-text');
    expect(err, '空名提示不在名字那一格里').not.toBe(null);
    expect(err!.textContent).toBe(t('ql.err.nameRequired'));
    // 下一行字段仍是「label + 控件」相邻（controlOf 的相邻兄弟前提没被 grid 自动排布打乱）
    expect(dropdownOf(t('ql.modal.terminal'))).not.toBe(null);
    expect(inputOf(t('ql.modal.cmd'))).not.toBe(null);
    w.unmount();
  });

  // 2026-10-13（用户反馈：[类型] 切到「可执行程序」时弹窗变窄）：弹窗高度固定，以「命令行」态为准。
  // 218px 的构成（无头 Chromium 实测取证：真实 style.css + 本组件 scoped 样式 + 两态静态复刻；
  // 命令行态 .modal-box = 218 / 可执行程序态 = 180，差 38 = 一行 32 + 一个行距 6）：
  //   .card 上下边框 2 + .modal-head 32
  //   + .modal-body（padding 16×2 + .flag-grid margin-top 12 + 3 行 × 32 + 2 行距 × 6 = 152）
  //   + .modal-actions 32 = 218
  // 落点 = min-height（用户 2026-10-13 决定）：两种类型的常态高度严格一致；
  // 保存失败 / 空名的报错文案出现时允许自然长高一行，不出滚动条、不顶掉输入框。
  it('modal_height_is_fixed_to_the_shell_form_height_in_both_types', async () => {
    injectRealCss();
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    const style = () => getComputedStyle(box() as Element);
    // 定高值 = 命令行态实测高度（写在 <style scoped> 的 .modal-box 上）
    expect(style().minHeight, '弹窗未定高到命令行态的 218px').toBe('218px');
    // 不用 height 钉死：报错文案出现时弹窗自然长高（用户决定 A）
    expect(style().height, '用 height 钉死会把报错文案下方的输入框顶出可视区并出滚动条').not.toMatch(/^\d/);
    // 小窗口兜底不变：max-height 仍在（定高之后它是唯一的收缩门）。
    // 不断具体值：happy-dom 会把 85vh 按自己的视口换算成 px（本环境 768 → 652.8px），断字面量等于把用例绑到测试环境的视口高。
    expect(style().maxHeight, 'max-height 兜底被去掉：窗口很矮时弹窗不再收缩').not.toBe('');

    // 定高数字的依据 = 命令行态的 3 行控件。行数变了 218 就是旧数字，必须同步改（防陈旧门）
    const grid = document.querySelector('.modal-box .flag-grid') as HTMLElement;
    const controlCells = [...grid.children].filter((el) =>
      el.classList.contains('row-cell') || el.classList.contains('dropdown') || el.classList.contains('name-cell'));
    expect(controlCells.length, '命令行态的表单行数变了，218px 的推导要重算').toBe(3);

    // 切到可执行程序：同一个 .modal-box、同一个定高值（不得按类型给 .modal-box 再加一条高度规则）
    await pickOption(dropdownOf(t('ql.modal.type'))!, t('ql.modal.type.exe'));
    expect(labelByText(t('ql.modal.terminal'))).toBeNull(); // 表单确实已切到 exe 形态
    expect(style().minHeight, '切到可执行程序后定高值变了（弹窗又会变窄）').toBe('218px');
    expect(style().height).not.toMatch(/^\d/);
    w.unmount();
  });

  // Minor 9：删除确认文案用 trim 后的名字（与 save() 的 formName.trim() 同一处理），
  // 否则带尾空格的表单值在确认框里显示成「webui   」
  it('delete_confirm_message_uses_trimmed_name', async () => {
    mockLms();
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: SHELL_ENTRY });
    await flush();

    await setInput(inputOf(t('ql.modal.name'))!, 'webui   ');
    (document.querySelector('.btn-delete') as HTMLButtonElement).click();
    await flush();

    const confirm = document.querySelector('.confirm-box');
    expect(confirm).not.toBeNull();
    expect(confirm!.textContent).toContain(t('ql.modal.delete.message', { name: 'webui' }));
    expect(confirm!.textContent).not.toContain('webui   '); // 未 trim 的原文不出现
    w.unmount();
  });
});
