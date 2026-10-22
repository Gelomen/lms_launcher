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
import { TERM_PALETTES } from './term-palettes';                       // 票 #15：色块的颜色表（渲染端真源）
// 票 #15：id 与缺省的真源在主进程那一份（与 TerminalTabView.vue:15 同一先例；测试侧引运行时值是安全的）
import { TERM_PALETTE_DEFAULT, TERM_PALETTE_IDS, type TermPaletteId } from '../../src-main/term-palettes';
import type { QuickLaunchEntry, QuickLaunchList } from '../src-main/quick-launch-config';
import type { TerminalInfo } from '../src-main/quick-launch-terminals';

type Calls = Array<{ cmd: string; args: unknown[] }>;
let calls: Calls = [];

// 主进程返回序 = quick-launch-terminals.ts:107-113 的探测顺序（powershell → cmd → pwsh → wsl）。
// 用例按这个顺序断言「不重排」（索引 K31(3) / 关闭 M1）：pwsh 不在第一项。
// 2026-10-16（2026-10-16-quick-launch-terminal-icons 规格 §6.3 / §7.1-11）：每项带一个**可区分**的 icon
// （PNG data URL 的形状 = 主进程 ql-terminal-icons.ts 补的那个字段）。四个串互不相同，
// 才钉得住「第 n 项的 <img src> = 第 n 项的 icon」这层对应关系（不是「渲染出了某个图标」就算过）。
// 既有用例断的是 li 的 textContent 与 .select-label 的文本，图标不混进文本，所以不受影响。
const TERMS: TerminalInfo[] = [
  { id: 'powershell', path: 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', icon: 'data:image/png;base64,AAAA' },
  { id: 'cmd', path: 'C:\\WINDOWS\\System32\\cmd.exe', icon: 'data:image/png;base64,BBBB' },
  { id: 'pwsh', path: 'C:\\Program Files\\WindowsApps\\pwsh.exe', icon: 'data:image/png;base64,CCCC' },
  { id: 'wsl', path: 'C:\\WINDOWS\\System32\\wsl.exe', icon: 'data:image/png;base64,DDDD' },
];

// 任务 8（规格 §6.2）：夹具带 admin: false —— 弹窗的 payload 现在总是显式带这个字段（§8-K4「落盘总是显式写」），
// :383 的 args 断言用 SHELL_ENTRY 逐字比对，所以夹具与 payload 必须同一取值。
// 票 #15（spec #12）：terminal_palette 同理 —— shell 条目总是显式带这一键（quick-launch-config.ts:95 / :118 两处
// 都过 termPaletteOr 归一），所以夹具带上缺省值 paper：这样「payload 与夹具逐字相等」这条既有的硬断言
// 在票 #15 之后仍然咬得住（缺省值而不是某个特殊档，避免把这条门变成自证）。
const SHELL_ENTRY: QuickLaunchEntry = { name: 'webui', type: 'shell', shell: 'pwsh', cmd: 'python -m webui', admin: false, terminal_palette: 'paper' };

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
//   src/style.css —— .card 的 1px 边框 / .input / .select-trigger 的 --h-control 高（定高数字的组成部分）；
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
// 任务 8（规格 §6.2 / §8-K8）：「终端」那一行的控件格改成 .field-cell（内部 .row-cell 装下拉 + 开关），
// 标签的相邻兄弟不再是 .dropdown 本身 → 控件格不是下拉时，退一步在控件格里取 .dropdown。
// 语义不变：返回的仍是那个 .dropdown（trigger / 面板都在它的子树里），既有断言一字不改。
const dropdownOf = (text: string): Element | null => {
  const c = controlOf(text);
  if (!c) return null;
  return c.classList.contains('dropdown') ? c : c.querySelector('.dropdown');
};
const triggerOf = (text: string): Element | null => dropdownOf(text)?.querySelector('.select-trigger') ?? null;
const triggerText = (text: string): string => (triggerOf(text)?.querySelector('.select-label')?.textContent ?? '').trim();
// 2026-10-16（[类型] 前加图标）：元素内所有 svg 的「前缀:图标名」清单——vue-fontawesome 把
// IconDefinition 的 prefix / iconName 写进 data-prefix / data-icon，据此钉「挂的是哪个图标」。
function iconTags(el: Element): string[] {
  return [...el.querySelectorAll('svg')].map((s) => s.getAttribute('data-prefix') + ':' + s.getAttribute('data-icon'));
}
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
    // 2026-10-13（用户直接改）：终端标签不再按预算截断，选项 = 完整标签原文。
    // 本用例钉的是「顺序 = 主进程返回序、不重排、不 pwsh 优先」。
    expect(labels).toEqual([t('ql.term.powershell'), t('ql.term.cmd'), t('ql.term.pwsh'), t('ql.term.wsl')]);
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

  // 2026-10-13（用户直接改）：名字非空而命令为空 → 「命令不能为空」从弹窗顶部错误区
  // 挪到命令输入框下方（与空名同一手法：文案复用主进程校验的既有键 err.ql.cmdRequired，不新建键）。
  it('empty_cmd_shows_the_error_below_the_cmd_input_not_at_the_top', async () => {
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    await setInput(inputOf(t('ql.modal.name'))!, 'webui');
    saveBtn().click();
    await flush();

    expect(saveCalls().length).toBe(0); // 渲染端先拦下，不发无谓的 ql_save
    const cell = controlOf(t('ql.modal.cmd'))!;
    const err = cell.querySelector('.error-text');
    expect(err, '命令为空时报错没有渲染在命令输入框下方').not.toBe(null);
    expect(err!.textContent).toBe(t('err.ql.cmdRequired'));
    expect(document.querySelector('.modal-body > .error-text'), '报错仍留在弹窗顶部错误区').toBeNull();
    expect(document.querySelector('.name-cell .error-text'), '命令的报错串到了名字那一格').toBeNull();
    // 输入框标红，与空名同一口径（style.css:174 .input.error）
    expect(inputOf(t('ql.modal.cmd'))!.classList.contains('error')).toBe(true);

    // 填上命令 → 即时消失，再点保存就正常发出
    await setInput(inputOf(t('ql.modal.cmd'))!, 'ping -n 1 127.0.0.1');
    expect(cell.querySelector('.error-text')).toBeNull();
    saveBtn().click();
    await flush();
    expect(saveCalls().length).toBe(1);
    w.unmount();
  });

  // ---------- 2026-10-17（用户改口径）：命令行的多行编辑 ----------
  // 用户原话（逐字）：「更改策略, 默认依然是现状的输入框, 不改变输入框高度, 也不需要自动换行,
  // 然后在这个输入框的右侧, 添加 [+] 按钮, 点击会自动在当前输入框下方创建新的输入框,
  // 只有默认的输入框有 [+] 按钮, 下方被手动创建的输入框右侧只有 [-] 按钮, 点击删除该输入框」
  // 落盘口径不变：cmd 仍是一条字符串（配置 schema / 主进程校验一字不改），行间以 \n 连接、空行丢弃；
  // 送进 PTY 前由主进程把行分隔归一成 \r（quick-launch.ts 的 toPtyInput，真机实测留档
  // .temp/ql-cmd-rows-newline/probe.md：裸 \n 会被 ConPTY 吞掉，两行拼成一条命令）。
  const cmdCellEl = (): HTMLElement | null => document.querySelector('.modal-box .cmd-cell');
  const cmdRows = (): HTMLElement[] =>
    [...(cmdCellEl()?.children ?? [])].filter((el) => el.classList.contains('row-cell')) as HTMLElement[];
  const rowInput = (row: HTMLElement): HTMLInputElement => row.querySelector('input') as HTMLInputElement;
  const cmdRowInputs = (): HTMLInputElement[] => cmdRows().map(rowInput);
  const rowBtn = (row: HTMLElement, key: string): HTMLButtonElement | null =>
    ([...row.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === t(key)) as HTMLButtonElement) ?? null;

  // ---------- 票 #3（spec #1「弹窗」段）：[程序路径] 的多行——与上面命令行的手法同一套 ----------
  // 定位口径照抄 cmdRow*：所有行都在同一个 .field-cell（这里叫 .exe-cell）里纵向排布，
  // 每行是一个 .row-cell（输入框 + 自己的 [选择文件] + [+] / [-]）。按钮按 aria-label 取（票 #3：不带悬浮气泡）。
  const exeCellEl = (): HTMLElement | null => document.querySelector('.modal-box .exe-cell');
  const exeRows = (): HTMLElement[] =>
    [...(exeCellEl()?.children ?? [])].filter((el) => el.classList.contains('row-cell')) as HTMLElement[];
  const exeRowInputs = (): HTMLInputElement[] => exeRows().map((row) => rowInput(row));
  const pickBtnOf = (row: HTMLElement): HTMLButtonElement | null =>
    ([...row.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === t('ql.modal.btn.pick')) as HTMLButtonElement) ?? null;
  // 多行用例都要先切到「可执行程序」态
  const toExeType = async (): Promise<void> => {
    await pickOption(dropdownOf(t('ql.modal.type'))!, t('ql.modal.type.exe'));
  };

  // 按钮的归属与位置：默认行只有 [+]、追加行只有 [-]；[+] 在输入框右侧；新行开在当前行下方；
  // [-] 删的是被点的那一行（不是最后一行），且不把后面几行的值串位。
  it('only_the_default_cmd_row_has_plus_and_added_rows_have_minus', async () => {
    injectRealCss();
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    // 默认态 = 现状：一行、空的、右侧只有 [+]，没有 [-]
    expect(cmdRows().length, '默认态不止一行命令输入框').toBe(1);
    expect(cmdRowInputs()[0].value).toBe('');
    const add0 = rowBtn(cmdRows()[0], 'ql.modal.btn.addCmd');
    expect(add0, '默认行没有 [+] 按钮').not.toBe(null);
    expect(rowBtn(cmdRows()[0], 'ql.modal.btn.removeCmd'), '默认行却有 [-] 按钮').toBe(null);
    // 「输入框的右侧」= 同一个行容器里、输入框之后（flex 行不反向，DOM 顺序即视觉顺序）
    const kids0 = [...cmdRows()[0].children];
    expect(kids0.indexOf(add0 as HTMLButtonElement), '[+] 不在默认行输入框的右侧').toBeGreaterThan(kids0.indexOf(cmdRowInputs()[0]));
    // 「不改变输入框高度, 也不需要自动换行」= 它还是单行 <input>（换成 textarea 才会换行 / 出滚动条）
    expect(cmdRowInputs()[0].tagName, '命令输入框被换成了能换行的控件').toBe('INPUT');

    // 点 [+] → 在默认行**下方**多出一行
    (add0 as HTMLButtonElement).click();
    await flush();
    expect(cmdRows().length, '点 [+] 没有新增一行').toBe(2);
    const cellKids = [...(cmdCellEl() as HTMLElement).children];
    expect(cellKids.indexOf(cmdRows()[1]), '新行不在默认行下方').toBeGreaterThan(cellKids.indexOf(cmdRows()[0]));
    // 追加行：只有 [-]，没有 [+]；默认行的 [+] 照旧还在
    expect(rowBtn(cmdRows()[1], 'ql.modal.btn.removeCmd'), '追加行没有 [-] 按钮').not.toBe(null);
    expect(rowBtn(cmdRows()[1], 'ql.modal.btn.addCmd'), '追加行却有 [+] 按钮（只有默认行有）').toBe(null);
    expect(rowBtn(cmdRows()[0], 'ql.modal.btn.addCmd'), '追加行之后默认行的 [+] 没了').not.toBe(null);

    // 再加一行 → 三行；填上值后点中间那行的 [-] → 删掉的必须是中间那行
    rowBtn(cmdRows()[0], 'ql.modal.btn.addCmd')!.click();
    await flush();
    expect(cmdRows().length).toBe(3);
    await setInput(cmdRowInputs()[1], 'A');
    await setInput(cmdRowInputs()[2], 'B');
    rowBtn(cmdRows()[1], 'ql.modal.btn.removeCmd')!.click();
    await flush();
    expect(cmdRows().length, '点 [-] 没有删掉那一行').toBe(2);
    expect(cmdRowInputs().map((i) => i.value), '删错了行，或删行把后面几行的值串位了（:key 用了 index）').toEqual(['', 'B']);

    // 多行不新增 .flag-grid 的网格行 → 定高门（命令行态 controlCells = 4）不被带歪，定高地板一字不改
    const grid = document.querySelector('.modal-box .flag-grid') as HTMLElement;
    const controlCells = [...grid.children].filter((el) =>
      el.classList.contains('field-cell') || el.classList.contains('dropdown') || el.classList.contains('name-cell'));
    expect(controlCells.length, '多行命令把 .flag-grid 的控件行数带变了，261px 的推导要重算').toBe(4);
    expect(getComputedStyle(box() as Element).minHeight, '多行命令改掉了弹窗的定高地板').toBe('261px');
    w.unmount();
  });

  // 落盘：多行 = 一条以 \n 连接的 cmd 字符串，空行丢弃（空行送进终端就是一条空命令）。
  // 除此之外 payload 一字不改：仍只带该类型的字段（规格 §5.3-6）。
  it('multi_row_cmd_saves_joined_by_newline_and_drops_blank_rows', async () => {
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    await setInput(inputOf(t('ql.modal.name'))!, 'webui');
    await setInput(cmdRowInputs()[0], 'ping -n 1 127.0.0.1');
    rowBtn(cmdRows()[0], 'ql.modal.btn.addCmd')!.click();   // 第二行故意留空
    await flush();
    rowBtn(cmdRows()[0], 'ql.modal.btn.addCmd')!.click();
    await flush();
    await setInput(cmdRowInputs()[2], 'dir');
    saveBtn().click();
    await flush();

    expect(saveCalls().length).toBe(1);
    const entry = saveCalls()[0].args[1] as QuickLaunchEntry;
    expect(entry.cmd, '多行没有以 \n 连接，或空行没被丢掉').toBe('ping -n 1 127.0.0.1\ndir');
    expect(entry, '多行改动顺带改了 payload 形状').toEqual({
      // 票 #15：shell 的 payload 多一个 terminal_palette（这里没点色块 = 缺省档），多行仍是一条 \n 连接的字符串
      name: 'webui', type: 'shell', shell: 'powershell', cmd: 'ping -n 1 127.0.0.1\ndir', admin: false, terminal_palette: 'paper',
    });
    w.unmount();
  });

  // 回读：cmd 里带换行（block scalar）→ 一行一个输入框；单行 cmd（现存所有配置）→ 仍是一行。
  it('editing_a_multiline_cmd_refills_one_row_per_line', async () => {
    mockLms();
    const MULTI: QuickLaunchEntry = { name: 'webui', type: 'shell', shell: 'pwsh', cmd: 'python -m webui\npip install x', admin: false };
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: MULTI });
    await flush();

    expect(cmdRowInputs().map((i) => i.value), '多行 cmd 没有按行回填成多个输入框').toEqual(['python -m webui', 'pip install x']);
    expect(rowBtn(cmdRows()[0], 'ql.modal.btn.addCmd'), '回填的第一行没有 [+]').not.toBe(null);
    expect(rowBtn(cmdRows()[1], 'ql.modal.btn.addCmd'), '回填的第二行却有 [+]').toBe(null);
    w.unmount();

    // 单行 cmd = 今天所有已存在的配置：一字不改，仍是一行
    const w2 = mountModal({ open: true, id: 'qla1b2c3d4', entry: SHELL_ENTRY });
    await flush();
    expect(cmdRows().length, '单行 cmd 却多出了一行').toBe(1);
    expect(cmdRowInputs()[0].value).toBe('python -m webui');
    w2.unmount();
  });

  // 一行有效内容都没有 = 「命令不能为空」（与单行时代的 trim().length === 0 等价）：
  // 报错仍在命令那一格内、输入框标红，且不发 ql_save。
  it('all_blank_cmd_rows_block_save_with_the_error_below_the_first_row', async () => {
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    await setInput(inputOf(t('ql.modal.name'))!, 'webui');
    rowBtn(cmdRows()[0], 'ql.modal.btn.addCmd')!.click();
    await flush();
    saveBtn().click();
    await flush();

    expect(saveCalls().length, '全是空行却发了 ql_save').toBe(0);
    const err = cmdCellEl()!.querySelector('.error-text');
    expect(err, '全空行时「命令不能为空」没渲染在命令那一格内').not.toBe(null);
    expect(err!.textContent).toBe(t('err.ql.cmdRequired'));
    expect(cmdRowInputs().every((i) => i.classList.contains('error')), '空行没全部标红').toBe(true);

    // 填上任意一行 → 报错即时消失（与单行时代的即时消错口径一致）
    await setInput(cmdRowInputs()[1], 'dir');
    expect(cmdCellEl()!.querySelector('.error-text')).toBeNull();
    w.unmount();
  });

  // 同上，可执行程序态：路径为空 → 「可执行程序路径不能为空」在路径输入框下方（err.ql.exeRequired）
  it('empty_exe_shows_the_error_below_the_exe_path_input_not_at_the_top', async () => {
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    await pickOption(dropdownOf(t('ql.modal.type'))!, t('ql.modal.type.exe'));
    await setInput(inputOf(t('ql.modal.name'))!, '记事本');
    saveBtn().click();
    await flush();

    expect(saveCalls().length).toBe(0);
    const cell = controlOf(t('ql.modal.exe'))!;
    const err = cell.querySelector('.error-text');
    expect(err, '路径为空时报错没有渲染在路径输入框下方').not.toBe(null);
    expect(err!.textContent).toBe(t('err.ql.exeRequired'));
    expect(document.querySelector('.modal-body > .error-text'), '报错仍留在弹窗顶部错误区').toBeNull();
    expect(inputOf(t('ql.modal.exe'))!.classList.contains('error')).toBe(true);

    // 选到文件 → 即时消失，再点保存就正常发出
    mockLms({ pick: 'D:\\Tools\\notepad.exe' });
    (cell.querySelector('button') as HTMLButtonElement).click();
    await flush();
    expect(cell.querySelector('.error-text')).toBeNull();
    saveBtn().click();
    await flush();
    expect(saveCalls().length).toBe(1);
    w.unmount();
  });

  // ===== 票 #3（spec #1「弹窗」段）：[程序路径] 多行 =====
  // AC-1：默认那一行「与今天完全一样」——单行不换行的输入框、[选择文件] 在输入框右侧，
  // 只是 [选择文件] 右边多一个 [+]；默认行没有 [-]。
  it('exe_path_default_row_has_pick_then_plus_and_no_minus', async () => {
    injectRealCss();
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();
    await toExeType();

    expect(exeRows().length, '默认态不止一行程序路径输入框').toBe(1);
    const input = exeRowInputs()[0];
    expect(input.value).toBe('');
    // 「高度不变、不需要自动换行」= 它还是单行 <input>（换成 textarea 才会换行 / 出滚动条）
    expect(input.tagName, '路径输入框被换成了能换行的控件').toBe('INPUT');
    // 输入框仍是 .input（既有样式：--h-control 高 / 报错标红），行容器仍是 .row-cell（既有行内布局）
    expect(input.classList.contains('input'), '路径输入框不再是 .input').toBe(true);

    const kids = [...exeRows()[0].children];
    const pick = pickBtnOf(exeRows()[0]);
    const add = rowBtn(exeRows()[0], 'ql.modal.btn.addExe');
    expect(pick, '默认行没有 [选择文件]').not.toBe(null);
    expect(add, '默认行没有 [+] 按钮').not.toBe(null);
    expect(rowBtn(exeRows()[0], 'ql.modal.btn.removeExe'), '默认行却有 [-] 按钮').toBe(null);
    // 「[选择文件] 在输入框右侧」+「[+] 在 [选择文件] 右边」= 同一个行容器里 input → pick → [+]
    expect(kids.indexOf(input), '输入框不在 .row-cell 行容器里').toBeGreaterThanOrEqual(0);
    expect(kids.indexOf(pick as HTMLButtonElement), '[选择文件] 不在输入框右侧').toBeGreaterThan(kids.indexOf(input));
    expect(kids.indexOf(add as HTMLButtonElement), '[+] 不在 [选择文件] 右边').toBeGreaterThan(kids.indexOf(pick as HTMLButtonElement));
    // 报错位置门不受影响：报错 <p> 仍在同一个 .field-cell 内（该门用例已钉，这里只钉它的容器不变）
    const cell = controlOf(t('ql.modal.exe')) as HTMLElement;
    expect(cell.classList.contains('field-cell'), '路径那一格不再是 .field-cell（报错位置门要红）').toBe(true);
    expect(exeCellEl(), '多行容器 .exe-cell 不是路径那一格').toBe(cell);
    w.unmount();
  });

  // AC-2：点 [+] 在下方追加一行空路径**并聚焦它**；追加行只有 [-]、没有 [+]；默认行的 [+] 照旧还在。
  // 顺带钉住票 #3 的硬约束：多行不新增 .flag-grid 的网格行 → 控件格计数门（可执行程序态 3）与定高门一字不改。
  it('plus_appends_an_exe_path_row_below_and_focuses_it', async () => {
    injectRealCss();
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();
    await toExeType();

    // 先在默认行打一条路径：这样「追加到下方」与「插到最前面」这两种实现可区分
    // （只看 DOM 子节点先后是恒真的：exeRows() 本身就是按 DOM 顺序取的）。
    await setInput(exeRowInputs()[0], 'D:\\top.exe');

    const add0 = rowBtn(exeRows()[0], 'ql.modal.btn.addExe') as HTMLButtonElement;
    add0.click();
    await flush();
    expect(exeRows().length, '点 [+] 没有新增一行程序路径').toBe(2);
    // 「在当前输入框**下方**创建新的输入框」= 已经打字的这一行仍是最上面一行，空行在它下面
    expect(exeRowInputs().map((i) => i.value), '新行没有追加在默认行下方（插到了最前面？）').toEqual(['D:\\top.exe', '']);
    // 带 [+] 的仍是最上面那一行（默认行跟着值走，不跟着位置走）
    expect(rowBtn(exeRows()[0], 'ql.modal.btn.addExe'), '[+] 不在最上面那一行').not.toBe(null);
    expect(rowBtn(exeRows()[1], 'ql.modal.btn.addExe'), '[+] 跑到了追加行上').toBe(null);
    // 「点 [+] 追加一行空路径并聚焦它」：焦点落在新输入框上，且它是空的那一行
    expect(exeRowInputs()[1].value, '被聚焦的不是新加的空行').toBe('');
    expect(document.activeElement, '[+] 之后焦点没落到新输入框').toBe(exeRowInputs()[1]);
    // 追加行：只有 [-]，没有 [+]；默认行的 [+] 还在（可以继续加）
    expect(rowBtn(exeRows()[1], 'ql.modal.btn.removeExe'), '追加行没有 [-] 按钮').not.toBe(null);
    expect(rowBtn(exeRows()[1], 'ql.modal.btn.addExe'), '追加行却有 [+] 按钮（只有默认行有）').toBe(null);
    expect(rowBtn(exeRows()[0], 'ql.modal.btn.addExe'), '追加行之后默认行的 [+] 没了').not.toBe(null);
    // 每一行都有自己的 [选择文件]（AC-4 的形状部分）
    expect(pickBtnOf(exeRows()[1]), '追加行没有自己的 [选择文件]').not.toBe(null);

    // 再加一行 → 三行。这两条断言（可执行程序态控件格计数 = 3 / minHeight = 261px）**逐字照抄**既有的定高门与
    // 控件格计数门（上面的 only_the_default_cmd_row_has_plus… 与下面的 modal_height_is_fixed… 各钉一次）：
    // 同一段断言、同一个期望值，这里只是把它们在**新的状态**下再跑一次——可执行程序态 + 三行路径。
    // 票 #3 的硬约束就是「四张既有门一字不动照样绿」，所以这里不改它们的断言，只换现场；删掉这两行
    // 就等于放弃「多行没有把弹窗定高带歪」这条 AC-8 的取证。
    rowBtn(exeRows()[0], 'ql.modal.btn.addExe')!.click();
    await flush();
    expect(exeRows().length).toBe(3);
    const grid = document.querySelector('.modal-box .flag-grid') as HTMLElement;
    const controlCells = [...grid.children].filter((el) =>
      el.classList.contains('field-cell') || el.classList.contains('dropdown') || el.classList.contains('name-cell'));
    expect(controlCells.length, '多行程序路径把 .flag-grid 的控件行数带变了，261px 的推导要重算').toBe(3);
    expect(getComputedStyle(box() as Element).minHeight, '多行程序路径改掉了弹窗的定高地板').toBe('261px');
    // 只数「网格子节点」挡不住一种走偏：把每行做成 .flag-grid 的独立行（格数变了，上面的门会红）；
    // 也挡不住把 .exe-cell 的纵向排布规则删掉（行仍在一个格内，但 flex 列没了 → 真机上会横排 / 贴死）。
    // 这里钉的是同一条 CSS 契约（同 type_field_is_widened_to_180px 的手法，injectRealCss 已注入真样式）：
    const cellStyle = getComputedStyle(exeCellEl() as Element);
    expect(cellStyle.display, '.exe-cell 不再是 flex 容器').toBe('flex');
    expect(cellStyle.flexDirection, '.exe-cell 不是纵向排布（多行会在同一格里横排）').toBe('column');
    expect(cellStyle.gap, '.exe-cell 的行距不是既有的 6px 口径（与 .flag-grid gap 同值）').toBe('6px');
    w.unmount();
  });

  // AC-3：点第 2 行的 [-] → 删掉的正是第 2 行，第 3 行的路径仍在（删中间行不串位）。
  // 同一手法照抄命令行的那一条：:key 用行 id、[-] 按 id 删，按 index 做 key / 删除都会串位。
  it('minus_on_the_second_exe_row_deletes_exactly_that_row', async () => {
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();
    await toExeType();

    rowBtn(exeRows()[0], 'ql.modal.btn.addExe')!.click();
    await flush();
    rowBtn(exeRows()[0], 'ql.modal.btn.addExe')!.click();
    await flush();
    expect(exeRows().length).toBe(3);
    await setInput(exeRowInputs()[1], 'D:\\A.exe');
    await setInput(exeRowInputs()[2], 'D:\\B.exe');

    // 删之前记住「第 3 行的输入框」是哪一个 DOM 节点
    const thirdInput = exeRowInputs()[2];

    rowBtn(exeRows()[1], 'ql.modal.btn.removeExe')!.click();
    await flush();
    expect(exeRows().length, '点 [-] 没有删掉那一行').toBe(2);
    expect(exeRowInputs().map((i) => i.value), '删错了行，或删行把后面几行的值串位了（:key 用了 index）')
      .toEqual(['', 'D:\\B.exe']);
    // 值层面的断言对 :key=index **不敏感**（v-model 会把复用节点的值改写到新的行上），
    // 但代价是「第 3 行」这个输入框被换成了另一个节点：光标 / 选区 / IME 组合态 / 滚动位置全跳走——
    // 这就是用户说的「串位」。所以再钉一层：承载第 3 行路径的还是原来那个节点（:key 用行 id 的直接后果）。
    expect(exeRowInputs()[1], '第 3 行的输入框被换成了另一个节点（:key 用了 index，光标/选区会跳到别的行）')
      .toBe(thirdInput);
    // 默认行仍然可加（两行时 [+] 还在默认行、[-] 只在追加行）
    expect(rowBtn(exeRows()[0], 'ql.modal.btn.removeExe'), '默认行出现了 [-]').toBe(null);
    expect(rowBtn(exeRows()[0], 'ql.modal.btn.addExe'), '删一行后默认行的 [+] 没了').not.toBe(null);
    w.unmount();
  });

  // AC-4：每一行的 [选择文件] 只写它自己那一行（其余行的值一字不动）；对话框取消 = null → 不改任何值。
  // 这也是「一次只选一个文件」的既有口径（spec #1 Out of Scope 2：选文件的 IPC 与对话框属性一字不改）。
  it('each_exe_row_picker_fills_only_its_own_row_and_cancel_changes_nothing', async () => {
    mockLms({ pick: 'D:\\Tools\\second.exe' });
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();
    await toExeType();
    await setInput(exeRowInputs()[0], 'D:\\keep-first.exe');
    rowBtn(exeRows()[0], 'ql.modal.btn.addExe')!.click();
    await flush();
    await setInput(exeRowInputs()[1], 'D:\\keep-second.exe');
    const pickCallsBefore = calls.filter((c) => c.cmd === 'ql_pick_exe').length;

    // 点第二行的 [选择文件] → 只有第二行被改写，第一行逐字不动
    (pickBtnOf(exeRows()[1]) as HTMLButtonElement).click();
    await flush();
    expect(calls.filter((c) => c.cmd === 'ql_pick_exe').length, '一次点击发了不止一次 ql_pick_exe')
      .toBe(pickCallsBefore + 1);
    expect(exeRowInputs()[1].value, '本行没有被 [选择文件] 填上').toBe('D:\\Tools\\second.exe');
    expect(exeRowInputs()[0].value, '别的行被顺带改了').toBe('D:\\keep-first.exe');

    // 取消（主进程返回 null）→ 任何一行都不改（check C3 的既有口径，逐行同样成立）
    mockLms({ pick: null });
    (pickBtnOf(exeRows()[0]) as HTMLButtonElement).click();
    await flush();
    expect(exeRowInputs().map((i) => i.value), '取消选择却改了值').toEqual(['D:\\keep-first.exe', 'D:\\Tools\\second.exe']);
    w.unmount();
  });

  // AC-5：保存载荷 = 逐行 trim + 丢掉空行后的**有序数组**（顺序 = 从上到下）。
  // 配置层的落盘形状早就要求数组（quick-launch-config.ts:14 exe?: string[] + normalizeExeList），
  // 本票之前的弹窗发的是标量 → 主进程按「该条非法」拒绝，这条用例就是钉住这条实际缺陷。
  it('exe_rows_save_as_a_trimmed_ordered_array_and_drop_blank_rows', async () => {
    let sent: { id: unknown; entry: QuickLaunchEntry } | null = null;
    mockLms({ save: (id, entry) => { sent = { id, entry }; return Promise.resolve('qlnew0001'); } });
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();
    await toExeType();
    await setInput(inputOf(t('ql.modal.name'))!, '一组程序');

    await setInput(exeRowInputs()[0], '  D:\\first.exe  ');
    rowBtn(exeRows()[0], 'ql.modal.btn.addExe')!.click();
    await flush();
    rowBtn(exeRows()[0], 'ql.modal.btn.addExe')!.click();
    await flush();
    // 中间那一行故意留空（手滑留的空行不得落盘），第三行填上
    await setInput(exeRowInputs()[2], 'D:\\third.exe');

    saveBtn().click();
    await flush();
    expect(saveCalls().length).toBe(1);
    expect(sent).not.toBeNull();
    expect(sent!.entry.exe, '保存的不是 trim + 丢空行后的有序数组').toEqual(['D:\\first.exe', 'D:\\third.exe']);
    // 其余字段一字不改：仍只带该类型的字段（§5.3-6）
    expect(sent!.entry, '多行改动顺带改了 payload 形状').toEqual({
      name: '一组程序', type: 'exe', exe: ['D:\\first.exe', 'D:\\third.exe'], admin: false,
    });
    w.unmount();
  });

  // AC-6：所有行都空 → 既有「可执行程序路径不能为空」（err.ql.exeRequired），位置仍在路径那一格内，
  // 且不发 ql_save；填上**任意一行**（不是只填第一行）报错即时消失。
  it('all_blank_exe_rows_block_save_with_the_error_still_in_the_path_cell', async () => {
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();
    await toExeType();
    await setInput(inputOf(t('ql.modal.name'))!, '记事本');
    rowBtn(exeRows()[0], 'ql.modal.btn.addExe')!.click();
    await flush();

    saveBtn().click();
    await flush();
    expect(saveCalls().length, '全是空行却发了 ql_save').toBe(0);
    const cell = controlOf(t('ql.modal.exe')) as HTMLElement;
    const err = cell.querySelector('.error-text');
    expect(err, '全空行时「路径不能为空」没渲染在路径那一格内').not.toBe(null);
    expect(err!.textContent).toBe(t('err.ql.exeRequired'));
    expect(document.querySelector('.modal-body > .error-text'), '报错仍留在弹窗顶部错误区').toBeNull();
    expect(exeRowInputs().every((i) => i.classList.contains('error')), '空行没全部标红').toBe(true);
    // 只有一条报错：多行不产生多条同文案的报错，也不串到别的格子
    expect(cell.querySelectorAll('.error-text').length, '多行产生了不止一条报错').toBe(1);
    expect(document.querySelectorAll('.name-cell .error-text').length, '路径的报错串到了名字那一格').toBe(0);

    // 填上第二行（不是默认行）→ 报错即时消失，与单行时代的即时消错口径一致
    await setInput(exeRowInputs()[1], 'D:\\Tools\\notepad.exe');
    expect(cell.querySelector('.error-text'), '填上任意一行后报错没有消失').toBeNull();
    expect(exeRowInputs()[0].classList.contains('error'), '报错消失后输入框仍是标红态').toBe(false);
    w.unmount();
  });

  // AC-7 回填：exe 有两条 → 两个输入框，逐条对位（第一条在上），按钮归属与新建态一致
  // （第一条有 [+]、第二条只有 [-]）；条目缺 exe → 一行空行。
  // 到渲染端的 exe 一定是 string[]（主进程 normalizeEntry 已归一），所以这里不给标量夹具。
  it('editing_an_entry_with_two_exe_paths_refills_two_rows_in_order', async () => {
    mockLms();
    const TWO: QuickLaunchEntry = { name: '一组程序', type: 'exe', exe: ['D:\\first.exe', 'D:\\third.exe'], admin: false };
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: TWO });
    await flush();

    expect(exeRowInputs().map((i) => i.value), '两条路径没有按条回填成两个输入框')
      .toEqual(['D:\\first.exe', 'D:\\third.exe']);
    expect(rowBtn(exeRows()[0], 'ql.modal.btn.addExe'), '回填的第一行没有 [+]').not.toBe(null);
    expect(rowBtn(exeRows()[0], 'ql.modal.btn.removeExe'), '回填的第一行却有 [-]').toBe(null);
    expect(rowBtn(exeRows()[1], 'ql.modal.btn.removeExe'), '回填的第二行没有 [-]').not.toBe(null);
    expect(rowBtn(exeRows()[1], 'ql.modal.btn.addExe'), '回填的第二行却有 [+]').toBe(null);
    expect(pickBtnOf(exeRows()[1]), '回填的第二行没有自己的 [选择文件]').not.toBe(null);
    w.unmount();

    // 缺 exe 字段（旧配置 / 旧夹具）→ 一行空输入框，不崩、不出空行以外的东西
    const w2 = mountModal({ open: true, id: 'qlb2c3d4e5', entry: { name: '没有路径', type: 'exe', admin: false } as QuickLaunchEntry });
    await flush();
    expect(exeRows().length, '缺 exe 字段时不止一行空输入框').toBe(1);
    expect(exeRowInputs()[0].value, '缺 exe 字段时那一行不是空的').toBe('');
    expect(rowBtn(exeRows()[0], 'ql.modal.btn.addExe'), '缺 exe 字段时默认行没有 [+]').not.toBe(null);
    w2.unmount();

    // 不做旧格式兼容（spec #1 Out of Scope 4）：标量写法在配置层就进 invalid，永远到不了渲染端；
    // 万一有人顺手套回标量，这里也不「半支持」——一律按「没有」处理成一行空行，而不是把标量当一条路径。
    const w3 = mountModal({ open: true, id: 'qlc3d4e5f6', entry: { name: '旧写法', type: 'exe', exe: 'D:\\legacy.exe', admin: false } as unknown as QuickLaunchEntry });
    await flush();
    expect(exeRows().length, '标量写法被当成了合法的一条路径（本仓不做旧格式兼容）').toBe(1);
    expect(exeRowInputs()[0].value, '标量写法却把值填进了输入框').toBe('');
    w3.unmount();
  });

  // 上一轮的实测教训（登记在 QuickLaunchModal.vue 的 cmd 行注释里）：给 [+] / [-] 挂 .tip-up 气泡
  // 会把气泡探出 .flag-grid 边界、把 .modal-body 顶出 10px 横向滚动条 → 定高门与「两态同高」全被带歪。
  // 票 #3 沿用同一个做法：两个新按钮**不带**气泡（无 .tip-up 类、无 data-tooltip），只带 aria-label；
  // [选择文件] 的既有气泡一字不改（它是 .file-btn + tip-up，属既有外观的一部分）。
  it('exe_row_plus_and_minus_buttons_have_no_tooltip_bubbles_only_aria_labels', async () => {
    injectRealCss();
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();
    await toExeType();
    rowBtn(exeRows()[0], 'ql.modal.btn.addExe')!.click();
    await flush();

    const add = rowBtn(exeRows()[0], 'ql.modal.btn.addExe') as HTMLButtonElement;
    const remove = rowBtn(exeRows()[1], 'ql.modal.btn.removeExe') as HTMLButtonElement;
    expect(add.getAttribute('aria-label'), '默认行的 [+] 没有 aria-label').toBe(t('ql.modal.btn.addExe'));
    expect(remove.getAttribute('aria-label'), '追加行的 [-] 没有 aria-label').toBe(t('ql.modal.btn.removeExe'));
    for (const [tag, btn] of [['[+]', add], ['[-]', remove]] as const) {
      expect(btn.classList.contains('tip-up'), tag + ' 挂了 .tip-up → style.css:414 的 ::after 会渲染气泡，把弹窗顶出横向滚动条').toBe(false);
      expect(btn.getAttribute('data-tooltip'), tag + ' 仍带 data-tooltip').toBeNull();
    }
    // [选择文件] 的既有气泡不动（两行都有，且仍带 tip-up + data-tooltip）
    for (const row of exeRows()) {
      const pick = pickBtnOf(row) as HTMLButtonElement;
      expect(pick.classList.contains('tip-up'), '[选择文件] 的既有气泡被去掉了').toBe(true);
      expect(pick.getAttribute('data-tooltip')).toBe(t('ql.modal.btn.pick'));
    }
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
    // 未开关 = admin: false（真布尔，不是 'false' / 缺字段：§8-K4 + 任务 7 的 e.admin === true 分流）
    // 票 #15：shell 的 payload 也总是显式带 terminal_palette（没点色块 = 表里的缺省档 paper）
    expect(sent!.entry).toEqual({ name: '新建项', type: 'shell', shell: 'cmd', cmd: 'ping -n 1 127.0.0.1', admin: false, terminal_palette: 'paper' });
    expect(w.emitted('saved')).toEqual([[]]);
    w.unmount();

    // exe 类型：只发 exe，不带 shell / cmd（§5.3-6）。
    // 票 #3 / spec #1 配置层：exe 的落盘形状是**有序数组**（quick-launch-config.ts:14 + normalizeExeList），
    // 单条路径 = 只含一个元素的数组；写成标量会被主进程 validateEntry 判非法（那就是本票要修的实际缺陷）。
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
    expect(sent!.entry).toEqual({ name: '记事本', type: 'exe', exe: ['D:\\Tools\\notepad.exe'], admin: false });
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
    // 2026-10-13（用户直接改）：trigger 显示完整标签（终端标签不再截断），本行钉的是「编辑态不被预选覆盖」
    expect(triggerText(t('ql.modal.terminal'))).toBe(t('ql.term.pwsh'));
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
  // （2026-10-20：页签工具条那颗改成 [停止]，这条死路多了一处出口；禁用 [删除] 的裁定不变。）
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
    // style.css「.tip-* tooltip」段 = `.tip-right::after { content: attr(data-tooltip) }` +
    // `.tip-right:hover::after { opacity: 1 }`；本组件的 .btn-delete 自身
    // 没有任何 ::after 规则，所以只挂 data-tooltip 在真机上什么都不渲染（jsdom 只看属性 → 上一轮漏网）。
    // 对照正确用法：src/App.vue:565 = class="winbtn winbtn--github tip-down" + :data-tooltip（类与属性成对）。
    // 2026-10-19（用户报告 + 截图）：[删除] 贴弹窗左下角，.tip-up 气泡被窗口左缘裁掉 → 改用 .tip-right（挂按钮右侧）。
    expect(del.classList.contains('tip-right'),
      'data-tooltip 已挂但缺 .tip-right 类 → style.css 的 ::after 不渲染（真机看不到 tooltip）').toBe(true);

    // 点了也不开二次确认、不发 ql_delete（守卫在模板与 onDelete 两处，任一被去掉本用例都红）
    del.click();
    await flush();
    expect(document.querySelector('.confirm-box')).toBeNull();
    expect(delCalls).toBe(0);
    expect(calls.filter((c) => c.cmd === 'ql_delete').length).toBe(0);
    expect(w.emitted('deleted')).toBeUndefined();
    w.unmount();
  });

  // I-1 负面对照（修复轮 B1）：tip-right 必须与 data-tooltip **同条件**挂载（只在 running 为真时）。
  // 理由在 style.css「.tip-* tooltip」段：`content: attr(data-tooltip)` 在属性缺失时求值为空串，
  // 而 .tip-right::after 仍带 padding / border-radius / 深灰底 → 无条件挂 tip-right 会让未运行条目的
  // 删除按钮在 hover 时弹出一个空白气泡。本用例就是钉这条负面对照（变异门 b 让它红）。
  it('tip_right_class_and_data_tooltip_are_mounted_only_while_running', async () => {
    mockLms();
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: SHELL_ENTRY, running: false });
    await flush();

    const del = document.querySelector('.btn-delete') as HTMLButtonElement;
    expect(del).not.toBeNull();
    expect(del.classList.contains('tip-right'), '未运行却挂了 .tip-right → hover 时渲染空 tooltip 气泡').toBe(false);
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

  // 2026-10-13（用户直接改）：[终端] 这一格占满 .flag-grid 的控件列（520px 弹窗里 ≈418px），
  // 原 M19 的「预算 16 + …」在宽度够的前提下仍把 'PowerShell 7 (pwsh)'（宽 19）/ 'Command Prompt (cmd)'（宽 20）
  // 截断成带 … 的短名 —— 该截断已去掉。本用例钉的是：trigger 与面板选项都是完整标签原文，
  // 且不挂 data-tooltip（没有截断就不需要 .dd-tip 补全悬浮层）。
  it('terminal_dropdown_labels_are_rendered_in_full_without_tip', async () => {
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    const dd = dropdownOf(t('ql.modal.terminal'))!;
    await openOptionLabels(dd);
    const items = [...dd.querySelectorAll('ul.dropdown-panel li')];
    const texts = items.map((li) => (li.textContent ?? '').trim());
    const tips = items.map((li) => li.getAttribute('data-tooltip'));

    // 面板选项 = 完整标签，一字不差（含原本会被截断的宽 19 / 宽 20 两条）
    expect(texts).toEqual([t('ql.term.powershell'), t('ql.term.cmd'), t('ql.term.pwsh'), t('ql.term.wsl')]);
    expect(texts.some((s) => s.includes('…')), '选项里仍有 …：' + JSON.stringify(texts)).toBe(false);
    expect(tips, '未截断却仍挂了 tooltip：' + JSON.stringify(tips)).toEqual([null, null, null, null]);

    // trigger 同理：预选第一项显示完整名
    expect(triggerText(t('ql.modal.terminal'))).toBe(t('ql.term.powershell'));
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

// 2026-10-16（用户直接改）：[类型] 的两项前加图标——「命令行」前 terminal、「可执行程序」前 file-code，
// 面板选项与收起态的 trigger 都要有（用户选定「面板选项 + trigger 都加」）。
// 图标来源按真实款式分前缀（用户选定）：terminal 只在 free-solid → fas；file-code 取 free-regular → far。
// 这里钉的是 DOM：选项文字一字不改（图标不混进 textContent）、图标在文字之前、trigger 随选中项换图标。
it('type_options_and_trigger_carry_the_type_icons', async () => {
  mockLms();
  const w = mountModal({ open: true, id: null, entry: null });
  await flush();

  const dd = dropdownOf(t('ql.modal.type')) as HTMLElement;
  // 面板只点一次：openOptionLabels / pickOption 各自都会点 trigger，连着用第二次点的是「关闭」
  (dd.querySelector('.select-trigger') as HTMLButtonElement).click();
  await flush();
  const items = [...dd.querySelectorAll('ul.dropdown-panel li')];
  expect(items.map((li) => (li.textContent ?? '').trim()), '面板选项文案变了').toEqual([t('ql.modal.type.shell'), t('ql.modal.type.exe')]);
  expect(items.map((li) => iconTags(li)), '面板选项的图标不对：' + JSON.stringify(items.map((li) => iconTags(li)))).toEqual([['fas:terminal'], ['far:file-code']]);
  for (const li of items) {
    expect((li.firstElementChild?.tagName ?? '').toLowerCase(), '选项里图标不在文字之前').toBe('svg');
  }

  // 收起态：trigger 带当前选中项（默认「命令行」= E1）的图标，且排在 .select-label 之前
  const trig = triggerOf(t('ql.modal.type')) as HTMLElement;
  const kids = [...trig.children].map((el) => el.tagName === 'svg'
    ? 'icon:' + (el.getAttribute('data-prefix') ?? '') + ':' + (el.getAttribute('data-icon') ?? '')
    : String(el.className));
  expect(kids, 'trigger 子节点顺序不对：' + JSON.stringify(kids)).toEqual(['icon:fas:terminal', 'select-label', 'select-caret']);

  // 切到「可执行程序」→ trigger 的图标跟着换成 file-code（图标随选中项，不是写死第一项）。
  // 面板此刻是开着的：直接点第二项，不再点 trigger（那是一次「关闭」）。
  (items[1] as HTMLLIElement).click();
  await flush();
  const after = iconTags(triggerOf(t('ql.modal.type')) as HTMLElement);
  expect(after, '切换类型后 trigger 的图标没跟着换：' + JSON.stringify(after)).toEqual(['far:file-code', 'fas:list']);
  expect(triggerText(t('ql.modal.type'))).toBe(t('ql.modal.type.exe'));
  w.unmount();
});

// 2026-10-16（2026-10-16-quick-launch-terminal-icons 规格 §7.1-11 / 索引 K3 / RF2 RF5）：
// [终端] 的每一项与收起态 trigger 带**取自本机 exe 的真实图标** —— 主进程 ql-terminal-icons.ts 补的
// TerminalInfo.icon（PNG data URL）经 QuickLaunchModal 的 terminalOptions.imageUrl 进 Dropdown（规格 §6.4）。
// 这里只钉「接线」这一环，四件事：
//   1) 列表形状不变：四项的文字与 t('ql.term.*') 逐字相同（不重排、不加字；图标不混进 textContent）；
//   2) 每一项的第一个元素是 <img class="option-image">，src = 该项夹具的 icon（图标在文字之前，且逐项对得上）；
//   3) trigger 的第一个子节点是 <img class="select-image">，src = 当前选中项（默认第一项 = powershell，索引 K31(3)）；
//   4) 点第二项（cmd）→ trigger 的 src 换成 cmd 的（图标随选中项走，不写死第一项）。
// 图标盒子的尺寸 / alt="" 口径在 src/components/Dropdown.test.ts 与 src/style.css（索引 K9 / K22），本用例不重复钉。
it('terminal_options_and_trigger_carry_the_real_terminal_icons', async () => {
  mockLms();
  const w = mountModal({ open: true, id: null, entry: null });
  await flush();

  const termLabel = t('ql.modal.terminal');
  const dd = dropdownOf(termLabel) as HTMLElement;
  // 面板只点一次：openOptionLabels / pickOption 各自都会点 trigger，连着用第二次点的是「关闭」
  (dd.querySelector('.select-trigger') as HTMLButtonElement).click();
  await flush();
  const items = [...dd.querySelectorAll('ul.dropdown-panel li')];
  // 文字一字不改、顺序 = 主进程返回序（RF2：图标只是装饰，不动列表形状）
  expect(items.map((li) => (li.textContent ?? '').trim()), '面板选项的文案或顺序变了')
    .toEqual([t('ql.term.powershell'), t('ql.term.cmd'), t('ql.term.pwsh'), t('ql.term.wsl')]);
  // 逐项对应：第 n 项的 img src = 第 n 项的 icon（不是「渲染出了某个图标」就算过）
  for (let i = 0; i < items.length; i++) {
    const first = items[i].firstElementChild;
    expect((first?.tagName ?? '').toLowerCase(), '选项 ' + i + ' 的图标不在文字之前').toBe('img');
    expect(String(first?.className), '选项 ' + i + ' 的 img 类名不对').toBe('option-image');
    expect(first?.getAttribute('src'), '选项 ' + i + ' 的 img src 与该项夹具不一致').toBe(TERMS[i].icon);
  }

  // 收起态：trigger 的第一个子节点 = 当前选中项（默认第一项 = powershell）的 img，.select-label / .select-caret 顺序不变
  const trig = triggerOf(termLabel) as HTMLElement;
  const kids = [...trig.children].map((el) => el.tagName.toLowerCase() === 'img'
    ? 'img:' + String(el.className) : String(el.className));
  expect(kids, 'trigger 子节点顺序不对：' + JSON.stringify(kids)).toEqual(['img:select-image', 'select-label', 'select-caret']);
  expect(trig.querySelector('img')?.getAttribute('src'), 'trigger 的 img 不是当前选中项的图标').toBe(TERMS[0].icon);

  // 面板此刻是开着的：直接点第二项（cmd），不再点 trigger（那是一次「关闭」）
  (items[1] as HTMLLIElement).click();
  await flush();
  expect(triggerOf(termLabel)!.querySelector('img')?.getAttribute('src'), '换选后 trigger 的图标没跟着换')
    .toBe(TERMS[1].icon);
  expect(triggerText(termLabel), '换选后 trigger 的文字变了').toBe(t('ql.term.cmd'));
  w.unmount();
});

// 2026-10-16（规格 §7.1-12 / §8-Q5 / 索引 K5 / RF1）：某一项取不到图标（主进程不带 icon 字段）
// → 那一项退回今天的样子：没有 <img>、文字照常；其余三项照常带图标。不报错、不把整个下拉空掉。
// 选中项没有图标时 trigger 也不带 img（同一口径的另一半：图标随选中项有则有、无则无）。
it('terminal_option_without_icon_renders_no_img', async () => {
  const TERMS_CMD_HAS_NO_ICON: TerminalInfo[] = TERMS.map((info) =>
    info.id === 'cmd' ? { id: info.id, path: info.path } : info);
  mockLms({ terminals: TERMS_CMD_HAS_NO_ICON });
  const w = mountModal({ open: true, id: null, entry: null });
  await flush();

  const termLabel = t('ql.modal.terminal');
  const dd = dropdownOf(termLabel) as HTMLElement;
  (dd.querySelector('.select-trigger') as HTMLButtonElement).click();
  await flush();
  const items = [...dd.querySelectorAll('ul.dropdown-panel li')];
  expect(items.length, '少一个图标就把选项条数带变了').toBe(4);
  expect(items.map((li) => (li.textContent ?? '').trim()), '不带图标的那一项文字变了')
    .toEqual([t('ql.term.powershell'), t('ql.term.cmd'), t('ql.term.pwsh'), t('ql.term.wsl')]);
  const srcs = items.map((li) => li.querySelector('img')?.getAttribute('src') ?? null);
  expect(srcs, '不带 icon 的那一项不该渲染 img，其余三项照常').toEqual([TERMS[0].icon, null, TERMS[2].icon, TERMS[3].icon]);

  // 当前选中项（第一项）有图标 → trigger 照常带；换选到不带图标的那一项 → trigger 退回纯文字（Q5）
  expect(triggerOf(termLabel)!.querySelector('img')?.getAttribute('src'), '第一项有图标时 trigger 该带上它').toBe(TERMS[0].icon);
  (items[1] as HTMLLIElement).click();
  await flush();
  const trig = triggerOf(termLabel) as HTMLElement;
  expect(trig.querySelector('img'), '选中项没有图标却渲染了 img').toBeNull();
  expect(triggerText(termLabel), '缺图标的那一项文字不照常').toBe(t('ql.term.cmd'));
  w.unmount();
});

// 2026-10-16（用户直接改）：[名字] 输入框缩短、[类型] 下拉加宽 —— 定宽 140px → 180px。
// 取值依据（无头 Chromium 实测，取证台 .temp/ql-type-icon-probe/；markup 取真实组件导出的 outerHTML）：
//   520px 弹窗里 trigger 可用内容区 = clientWidth − .btn 的 padding 0 14px（28px）；
//   最大需求（en「Command line」）= 图标 17.5（FA v7 的 .svg-inline--fa width:1.25em @14px）+ gap 8
//              + 文本 90.1 + gap 8 + ▼ 15.8 = 139.3px
//   140px → 可用 111px：trigger 标签与面板选项「Command line」都被省略号截断（实测 61.4/90.1、131/132）；
//   180px → 可用 151px：都不截（trigger 余量 11.7px、选项余量 32px）。
//   同一次实测：名字输入框 248.7px → 208.7px（缩短 40px）。
// 钉的是 CSS 契约（注入真实 style.css + 本组件 scoped 原文，同 :68 的 injectRealCss 手法）。
it('type_field_is_widened_to_180px', async () => {
  injectRealCss();
  mockLms();
  const w = mountModal({ open: true, id: null, entry: null });
  await flush();

  const typeField = dropdownOf(t('ql.modal.type')) as HTMLElement;
  expect(typeField.classList.contains('type-field')).toBe(true);
  expect(getComputedStyle(typeField).width, '[类型] 定宽不是 180px').toBe('180px');
  w.unmount();
});
// 2026-10-16：图标是 trigger 的第三个 flex 子节点，而 .select-trigger 是 space-between（style.css:319）——
// 不处理的话短标签被推到中间（zh「命令行」实测：图标贴左、文字居中）。style.css 的
// 「.select-trigger .select-icon + .select-label, .select-trigger .select-image + .select-label { flex: 1 1 auto }」
// 把剩余宽度只给**紧跟图标**的标签（min-width:0 仍在 → 吸收宽度后照样能收缩 + ellipsis）。
// 这里钉的是这条 CSS 契约：[类型]（FontAwesome icon）与 [终端]（真实图标 imageUrl）两个带图标的下拉，
// 图标后的 .select-label 都 flexGrow=1。[终端] 现在也带图标（2026-10-16-quick-launch-terminal-icons 规格 §6.4）；
// 不传图标的下拉由 src/components/Dropdown.test.ts 的 options_without_icon_render_no_icon_and_the_trigger_keeps_only_the_caret
// 钉住（规格 §6.6-2 / 索引 K12：那一半在任务 3 已搬过去，且按索引 K21 注入了真实 CSS 才有牙）。
it('trigger_labels_after_an_icon_absorb_the_free_space', async () => {
  injectRealCss();
  mockLms();
  const w = mountModal({ open: true, id: null, entry: null });
  await flush();

  const typeLabel = (triggerOf(t('ql.modal.type')) as HTMLElement).querySelector('.select-label') as HTMLElement;
  expect(getComputedStyle(typeLabel).flexGrow, '图标后的 .select-label 没有吸收剩余宽度').toBe('1');
  const termLabel = (triggerOf(t('ql.modal.terminal')) as HTMLElement).querySelector('.select-label') as HTMLElement;
  expect(getComputedStyle(termLabel).flexGrow, '[终端] 现在带真实图标，它的 .select-label 也该吸收剩余宽度').toBe('1');
  w.unmount();
});

  // 2026-10-13（用户反馈：[类型] 切到「可执行程序」时弹窗变窄）：弹窗高度固定，以「命令行」态为准。
  // 261px 的构成（票 #15 重推；无头 Chromium 实测取证 .temp/ql-modal-palette-row/：真组件挂载导出四态 markup
  // + 真 src/style.css + 本组件 <style scoped> 原文 + FA 自生成 CSS + 真 Chromium 1400×900：
  // 命令行态 .modal-box = 260.7（zh / en 同高）、可执行程序态 = 218.0（自然内容高 209.3，被地板盖住））。
  // 票 #12 审查轮登记：那个探针目录在本机已被清掉（.temp 不进仓）→ 这组数当下不可复核，重测口径就是上面那句；
  // 本轮真应用侧另有一份独立读数是 .modal-box 高 = **261.0**（CDP 量得，见票 #12 评论），与这个定高值对得上。
  //   .card 上下边框 2 + .modal-head 32
  //   + .modal-body（padding 16×2 + .flag-grid margin-top 12 + 4 行控件 32 + 32 + 37.3 + 32 + 3 行距 × 6 = 151.3）
  //   + .modal-actions 32 = 261.3 → 取整向上 261（实测 260.7，0.6px 是网格行高的亚像素）
  // 口径与 2026-10-13 / 15 / 18 三次一致：定高值来自**实测**，不是猜数；两态各数一遍 controlCells；两态同一个值。
  // 落点 = min-height（用户 2026-10-13 决定）：两种类型的常态高度严格一致；
  // 保存失败 / 空名的报错文案出现时允许自然长高一行，不出滚动条、不顶掉输入框。
  // 票 #15 之后两态格数不再相同（命令行 4 / 可执行程序 3）：这一条门因此改成钉「4 / 3 + 同一个定高」，
  // **没有**放宽 —— 原来钉的是「3 / 3 + 同一个定高」，两态各数一遍这条手法一字未改。
  it('modal_height_is_fixed_to_the_shell_form_height_in_both_types', async () => {
    injectRealCss();
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    const style = () => getComputedStyle(box() as Element);
    // 定高值 = 命令行态实测高度（写在 <style scoped> 的 .modal-box 上）
    expect(style().minHeight, '弹窗未定高到命令行态实测的 261px').toBe('261px');
    // 不用 height 钉死：报错文案（顶部的主进程文案 / 名字·命令·路径的字段级提示）出现时弹窗自然长高（用户决定 A）
    expect(style().height, '用 height 钉死会把报错文案下方的输入框顶出可视区并出滚动条').not.toMatch(/^\d/);
    // 小窗口兜底不变：max-height 仍在（定高之后它是唯一的收缩门）。
    // 不断具体值：happy-dom 会把 85vh 按自己的视口换算成 px（本环境 768 → 652.8px），断字面量等于把用例绑到测试环境的视口高。
    expect(style().maxHeight, 'max-height 兜底被去掉：窗口很矮时弹窗不再收缩').not.toBe('');

    // 定高数字的依据 = 命令行态的 4 行控件（票 #15 加了 [配色] 一行）。行数变了 261 就是旧数字，必须同步改（防陈旧门）
    const grid = document.querySelector('.modal-box .flag-grid') as HTMLElement;
    // 控件格 = 网格第二列里的纵向容器：.name-cell（名字 + 空名报错）、.dropdown（终端下拉）、
    // .field-cell（命令 / 路径 + 各自的报错，2026-10-13 把报错挪到输入框下方时引入）。
    // .row-cell 现在是这些容器的子节点、不再是网格直接子节点，故不在这里数。
    const controlCells = [...grid.children].filter((el) =>
      el.classList.contains('field-cell') || el.classList.contains('dropdown') || el.classList.contains('name-cell'));
    expect(controlCells.length, '命令行态的表单行数变了，261px 的推导要重算（名字 / 终端+管理员 / 配色 / 命令）').toBe(4);

    // 切到可执行程序：同一个 .modal-box、同一个定高值（不得按类型给 .modal-box 再加一条高度规则）
    await pickOption(dropdownOf(t('ql.modal.type'))!, t('ql.modal.type.exe'));
    expect(labelByText(t('ql.modal.terminal'))).toBeNull(); // 表单确实已切到 exe 形态
    expect(style().minHeight, '切到可执行程序后定高值变了（弹窗又会变窄）').toBe('261px');
    expect(style().height).not.toMatch(/^\d/);

    // 任务 8（规格 §6.2 / §8-K8 / E6）+ 票 #15：可执行程序态是 3 个控件格（名字 / 管理员 / 程序路径）——
    // [配色] 一行**不渲染**（exe 没有终端，因而没有配色），所以它不进入这一态的计数，也不影响同一个定高：
    // 261 对它是地板（实测内容高 209.3 < 261），对命令行态是内容高本身。
    // 计数器一字不改（只数网格直接子节点里的 .field-cell / .dropdown / .name-cell）：
    // 开关所在的控件格用的就是 .field-cell，所以它天然被数到。
    const exeCells = [...grid.children].filter((el) =>
      el.classList.contains('field-cell') || el.classList.contains('dropdown') || el.classList.contains('name-cell'));
    expect(exeCells.length, '可执行程序态的表单行数不是 3（[配色] 一行漏进来了？），261px 的推导要重算').toBe(3);
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

  // 2026-10-19（用户报告）：本弹窗的删除确认里，长名字没有按 [启动参数模板] 卡删除确认的处理走
  // —— 那边（TemplateModal.test.ts:366-389）按视觉宽度预算截断 + hover 显示完整名字。
  // 三条用例与那一份逐条对齐：拉丁长名截断 + tooltip、CJK 同一视觉预算、预算内不截且无 tooltip。
  it('delete_confirm_dialog_truncates_long_name_and_tooltips_the_full_name', async () => {
    const LONG_NAME = 'abcdefgabcdefgabcdefgabcdefgabcdefg'; // 30 拉丁（视觉宽 30）
    mockLms();
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: SHELL_ENTRY });
    await flush();

    await setInput(inputOf(t('ql.modal.name'))!, LONG_NAME);
    (document.querySelector('.btn-delete') as HTMLButtonElement).click();
    await flush();

    const confirm = document.querySelector('.confirm-box');
    expect(confirm).not.toBeNull();
    expect(confirm!.textContent).not.toContain(LONG_NAME); // 完整长名不出现（截断了）
    const msg = document.querySelector('.confirm-msg') as HTMLElement;
    expect(msg.textContent).toContain('abcdefgabcdefgab…」吗？'); // 前 16 视觉宽 + …(U+2026)，后接固定后缀

    // 截断名独立成可 hover 片段（ConfirmDialog 的 tipName/tipFull），自绘 .tpl-tip 只显示完整名字
    const span = document.querySelector('.confirm-msg__name') as HTMLElement;
    expect(span).not.toBeNull();
    expect(span.textContent).toBe('abcdefgabcdefgab…');
    expect(span.getAttribute('data-tooltip')).toBe(LONG_NAME);
    span.dispatchEvent(new MouseEvent('mouseenter'));
    await flush();
    expect(document.querySelector('.tpl-tip')?.textContent).toBe(LONG_NAME); // hover 显示完整名字
    w.unmount();
  });

  // 同一视觉宽度预算的另一半：CJK=2/拉丁=1 —— 8 字 = 16 不截（grace 到 18），9 字起截到 8 字 + …
  it('delete_confirm_dialog_truncates_cjk_name_at_the_same_visual_budget', async () => {
    mockLms();
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: SHELL_ENTRY });
    await flush();

    await setInput(inputOf(t('ql.modal.name'))!, '日常推理用的启动项名称'); // 11 汉字（视觉宽 22）
    (document.querySelector('.btn-delete') as HTMLButtonElement).click();
    await flush();
    const msg = document.querySelector('.confirm-msg') as HTMLElement;
    expect(msg.textContent).toContain('确定删除启动项「日常推理用的启动…」吗？'); // 截到 8 字（=16 视觉宽）
    expect(document.querySelector('.tpl-tip') === null).toBe(true); // 未 hover → 没有浮层
    const span = document.querySelector('.confirm-msg__name') as HTMLElement;
    expect(span.getAttribute('data-tooltip')).toBe('日常推理用的启动项名称');
    w.unmount();
  });

  // 预算内 = 原样、无 .confirm-msg__name 片段、无 tooltip（与模板卡同一「未截断不传」口径）
  it('delete_confirm_dialog_keeps_within_budget_name_whole_without_tooltip', async () => {
    const OK_NAME = '日常推理启动项名'; // 8 汉字（视觉宽 16 ≤ 预算 + grace）
    mockLms();
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: SHELL_ENTRY });
    await flush();

    await setInput(inputOf(t('ql.modal.name'))!, OK_NAME);
    (document.querySelector('.btn-delete') as HTMLButtonElement).click();
    await flush();

    const confirm = document.querySelector('.confirm-box');
    expect(confirm!.textContent).toContain(t('ql.modal.delete.message', { name: OK_NAME })); // 整名原样
    expect(document.querySelector('.confirm-msg__name')).toBeNull(); // 未截断 → 无片段、无 tooltip
    w.unmount();
  });

  // ---------- 任务 8（规格 §6.2 / §8-K5 / K7 / K8）：两态的「管理员」开关 ----------
  // E1（§8-K5）：控件 = role="switch" + aria-checked 的切换开关（不是原生 checkbox），默认关。
  it('admin_switch_defaults_off_and_is_a_role_switch', async () => {
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    const found = [...document.querySelectorAll('.modal-box .bool-switch')];
    expect(found.length, '命令行态的开关不止一个').toBe(1);
    const sw = found[0] as HTMLElement;
    expect(sw.getAttribute('role'), '开关不是 role=switch（K5：不用原生 checkbox）').toBe('switch');
    expect(sw.getAttribute('aria-checked'), '默认必须是关').toBe('false');
    expect(sw.classList.contains('bool-switch--on'), '默认态却带上了开启类').toBe(false);
    expect(sw.querySelector('.bool-switch__knob'), '开关没有旋钮（样式段没照抄全）').not.toBe(null);
    // G6：标签与 aria-label 都走 t()，取值来自词典键 ql.modal.admin
    expect(labelByText(t('ql.modal.admin')), '没有「管理员」标签').not.toBe(null);
    expect(sw.getAttribute('aria-label')).toBe(t('ql.modal.admin'));
    w.unmount();
  });

  // E2（用户澄清原话「[终端] 那一行分为两列，左列是 [终端] 和它的下拉，右边是 [管理员] 开关」/ §8-K8）：
  // 同一行内下拉在前、开关在后，且**不新增网格行**（网格仍是 3 对「标签 + 控件格」）。
  it('admin_switch_sits_in_the_right_segment_of_the_terminal_row', async () => {
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    const grid = document.querySelector('.modal-box .flag-grid') as HTMLElement;
    // 票 #15：命令行态的标签 3 → 4（名字 / 终端 / 配色 / 命令）：这一行的标签正是新增的那一个
    expect([...grid.children].filter((el) => el.tagName === 'LABEL').length, '命令行态的标签行数变了').toBe(4);
    expect([...grid.children].some((el) => el.classList.contains('switch-cell')), '开关自己成了网格的一行').toBe(false);

    const cell = controlOf(t('ql.modal.terminal')) as HTMLElement;
    expect(cell, '终端标签没有相邻控件格').not.toBe(null);
    expect(cell.classList.contains('field-cell'), '终端那一行的控件格不是 .field-cell').toBe(true);
    const row = cell.querySelector('.row-cell') as HTMLElement;
    expect(row, '终端那一行没有 .row-cell 行容器').not.toBe(null);
    expect(row.parentElement, '.row-cell 不在控件格内部').toBe(cell);

    const dd = row.querySelector('.dropdown') as HTMLElement;
    const sw = row.querySelector('.switch-cell') as HTMLElement;
    expect(dd, '终端下拉不在这一行的行容器里').not.toBe(null);
    expect(sw, '开关不在这一行的行容器里').not.toBe(null);
    const kids = [...row.children];
    expect(kids.indexOf(sw), '开关不在下拉之后（= 视觉右侧）').toBeGreaterThan(kids.indexOf(dd));
    expect(kids.indexOf(sw), '开关不是这一行的最后一段').toBe(kids.length - 1);
    // 命令那一格不带开关：开关属于终端行，不属于命令行
    expect((controlOf(t('ql.modal.cmd')) as HTMLElement).querySelector('.switch-cell')).toBe(null);
    w.unmount();
  });

  // E3（用户原话「[程序路径] 上方添加 [管理员权限] checkbox」）：exe 态的开关行在「程序路径」那一行之前。
  it('admin_switch_row_is_above_the_program_path_row_in_exe_type', async () => {
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();
    await pickOption(dropdownOf(t('ql.modal.type'))!, t('ql.modal.type.exe'));

    const grid = document.querySelector('.modal-box .flag-grid') as HTMLElement;
    const kids = [...grid.children];
    const adminLabel = labelByText(t('ql.modal.admin')) as HTMLElement;
    const exeLabel = labelByText(t('ql.modal.exe')) as HTMLElement;
    expect(adminLabel, '可执行程序态没有「管理员」标签').not.toBe(null);
    expect(kids.indexOf(adminLabel), '「管理员」不是网格的一行（不是标签直接子节点）').toBeGreaterThanOrEqual(0);
    expect(kids.indexOf(adminLabel), '「管理员」行不在「程序路径」行之前').toBeLessThan(kids.indexOf(exeLabel));

    const cell = adminLabel.nextElementSibling as HTMLElement;
    expect(cell.classList.contains('field-cell'), '「管理员」的控件格不是 .field-cell').toBe(true);
    const row = cell.querySelector('.row-cell') as HTMLElement;
    expect(row, '「管理员」行没有 .row-cell 行容器').not.toBe(null);
    const sw = row.querySelector('.switch-cell .bool-switch') as HTMLElement;
    expect(sw, '「管理员」行里没有开关').not.toBe(null);
    expect(sw.getAttribute('role')).toBe('switch');
    expect(sw.getAttribute('aria-checked'), 'exe 态的开关默认不是关').toBe('false');
    // 「程序路径」那一格不带开关（开关只在它上面那一行），且整个弹窗只有一个开关
    expect((controlOf(t('ql.modal.exe')) as HTMLElement).querySelector('.switch-cell')).toBe(null);
    expect(document.querySelectorAll('.modal-box .bool-switch').length, '两态的开关同时存在').toBe(1);
    w.unmount();
  });

  // E4（规格 §4-1）：编辑态按条目的 admin: true 回填（两态都回填）；缺字段 = 关。
  it('edit_mode_reflects_admin_true_from_the_entry', async () => {
    mockLms();
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: { ...SHELL_ENTRY, admin: true } });
    await flush();
    let sw = document.querySelector('.modal-box .bool-switch') as HTMLElement;
    expect(sw.getAttribute('aria-checked'), '命令行态没按条目的 admin:true 回填').toBe('true');
    expect(sw.classList.contains('bool-switch--on'), '回填 true 却没有开启态样式').toBe(true);
    w.unmount();

    const w2 = mountModal({ open: true, id: 'qlb2c3d4e5', entry: { name: '记事本', type: 'exe', exe: 'D:\\Tools\\notepad.exe', admin: true } });
    await flush();
    sw = document.querySelector('.modal-box .bool-switch') as HTMLElement;
    expect(sw.getAttribute('aria-checked'), '可执行程序态没按条目的 admin:true 回填').toBe('true');
    w2.unmount();

    // 缺字段（旧配置 / 旧夹具）= 关：与主进程 normalizeEntry「只有字面量 true 算真」同一口径
    const w3 = mountModal({ open: true, id: 'qlc3d4e5f6', entry: { name: 'webui', type: 'shell', shell: 'pwsh', cmd: 'python -m webui' } });
    await flush();
    sw = document.querySelector('.modal-box .bool-switch') as HTMLElement;
    expect(sw.getAttribute('aria-checked'), '条目没有 admin 字段时开关不是关').toBe('false');
    w3.unmount();
  });

  // E5（规格 §4-1 / 任务 1 C4）：开关打开后保存，payload 带**真布尔** admin: true（两态都带）。
  // 交 'true' / 1 就是缺陷：主进程按 e.admin === true 分流（任务 7 的 admin_falsy_uses_the_plain_local_pty），
  // 配置层把非布尔规整成 false（任务 1 的 normalizeEntry）。
  it('save_payload_carries_admin_true_when_toggled', async () => {
    let sent: { id: unknown; entry: QuickLaunchEntry } | null = null;
    mockLms({ save: (id, entry) => { sent = { id, entry }; return Promise.resolve('qlnew0001'); } });
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();
    await setInput(inputOf(t('ql.modal.name'))!, '提权项');
    await setInput(inputOf(t('ql.modal.cmd'))!, 'ping -n 1 127.0.0.1');
    (document.querySelector('.modal-box .bool-switch') as HTMLButtonElement).click();
    await flush();
    const sw = document.querySelector('.modal-box .bool-switch') as HTMLElement;
    expect(sw.getAttribute('aria-checked'), '点一下之后开关没开').toBe('true');
    expect(sw.classList.contains('bool-switch--on'), '点一下之后没有开启态样式').toBe(true);
    saveBtn().click();
    await flush();
    expect(sent).not.toBeNull();
    expect(typeof sent!.entry.admin, 'payload 的 admin 不是真布尔').toBe('boolean');
    expect(sent!.entry.admin).toBe(true);
    // 票 #15：同一组断言里 shell 带 terminal_palette（没动色块 = 缺省档），exe 那条不带（§5.3-6）
    expect(sent!.entry).toEqual({ name: '提权项', type: 'shell', shell: 'powershell', cmd: 'ping -n 1 127.0.0.1', admin: true, terminal_palette: 'paper' });
    w.unmount();

    // 可执行程序态：同一个 formAdmin，payload 同样带 admin: true
    sent = null;
    mockLms({ pick: 'D:\\Tools\\notepad.exe', save: (id, entry) => { sent = { id, entry }; return Promise.resolve('qlnew0002'); } });
    const w2 = mountModal({ open: true, id: null, entry: null });
    await flush();
    await pickOption(dropdownOf(t('ql.modal.type'))!, t('ql.modal.type.exe'));
    await setInput(inputOf(t('ql.modal.name'))!, '记事本');
    (controlOf(t('ql.modal.exe'))!.querySelector('button') as HTMLButtonElement).click();
    await flush();
    (document.querySelector('.modal-box .bool-switch') as HTMLButtonElement).click();
    await flush();
    saveBtn().click();
    await flush();
    expect(sent!.entry.admin).toBe(true);
    expect(sent!.entry).toEqual({ name: '记事本', type: 'exe', exe: ['D:\\Tools\\notepad.exe'], admin: true });
    w2.unmount();
  });

  // F4 / 索引 K6 / 规格 §5（非目标）：卡片列表行**不加**提权标记 —— 开关只在弹窗里。
  it('card_list_row_shows_no_admin_marker', async () => {
    const store: QuickLaunchList = { items: { a: { ...SHELL_ENTRY, admin: true } }, invalid: [] };
    (window as any).lms = {
      invoke: (cmd: string, ...args: unknown[]): Promise<unknown> => {
        if (cmd === 'ql_list') return Promise.resolve(JSON.parse(JSON.stringify(store)));
        return Promise.resolve(null);
      },
    };
    const w = mount(QuickLaunch, { attachTo: document.body, props: { states: {} } });
    await flush();
    const rows = w.findAll('.tpl-row');
    expect(rows.length, '卡片没有渲染出列表行').toBe(1);
    const html = rows[0].element.outerHTML;
    expect(html, '列表行里出现了开关').not.toContain('bool-switch');
    expect(html, '列表行里出现了「管理员」标记').not.toContain(t('ql.modal.admin'));
    expect(rows[0].text(), '列表行文本里出现了「管理员」').not.toContain(t('ql.modal.admin'));
    w.unmount();
  });

  // ===== 票 #15（spec #12 / issue #15）：条目编辑弹窗里的 [配色] 一行 =====
  // 形状：这一行是 .flag-grid 的一对「标签 + 控件格」，控件格 = .palette-cell（与 .cmd-cell / .exe-cell 同一族），
  // 里面一行 .row-cell：六个 .palette-swatch 按钮（底色 + 四格 ANSI 微条，颜色只从 src/modules/term-palettes.ts 取）
  // + 当前档一句话说明（.palette-hint）。位置 = [终端]+[管理员] 那一行之后、命令那一行之前；exe 态整行不渲染。
  // 只有点击才改表单（随 ql_save 整条落盘）；hover 只把预览冒给上层（有无页签由 App 判），本弹窗 hover 期间零写调用。
  const paletteCellEl = (): HTMLElement | null => document.querySelector('.modal-box .palette-cell');
  const swatchEls = (): HTMLElement[] =>
    [...document.querySelectorAll('.modal-box .palette-cell .palette-swatch')] as HTMLElement[];
  const swatchOf = (id: string): HTMLElement | null =>
    swatchEls().find((el) => el.getAttribute('data-palette') === id) ?? null;
  const hintEl = (): HTMLElement | null => document.querySelector('.modal-box .palette-hint');
  const PAL_IDS: TermPaletteId[] = [...TERM_PALETTE_IDS];
  // 测试侧走动态 key 是安全的：key-coverage.test.ts 只扫源码里的字面量 t() 调用点（测试文件本就不在它的范围内）。
  // 组件侧必须是六个字面量 —— 那里改成拼接，那条覆盖门就会红，所以测试不必跟着抄字面量。
  const palName = (id: string): string => t('ql.palette.' + id);
  const palHint = (id: string): string => t('ql.palette.' + id + '.hint');
  const hoverIn = (el: HTMLElement): Promise<void> => { el.dispatchEvent(new MouseEvent('mouseenter')); return flush(); };
  const hoverOut = (el: HTMLElement): Promise<void> => { el.dispatchEvent(new MouseEvent('mouseleave')); return flush(); };
  // 「不落盘」的判据 = 两条写通道都没动：ql_save（整条，弹窗唯一的落盘口）与 ql_set_palette（窄通道，弹窗不许走）
  const writeCalls = (): Calls => calls.filter((c) => c.cmd === 'ql_save' || c.cmd === 'ql_set_palette');

  // 验收 1：六色块渲染 —— 顺序 = TERM_PALETTE_IDS、每个色块的底色 + 四格 ANSI 全部取自颜色表那一行，
  // 位置钉在 [终端]+[管理员] 之后、命令之前，并带当前档一句话说明。
  it('palette_row_renders_six_swatches_after_the_terminal_row_with_colors_from_the_table', async () => {
    injectRealCss();
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    const grid = document.querySelector('.modal-box .flag-grid') as HTMLElement;
    const kids = [...grid.children];
    const paletteLabel = labelByText(t('ql.modal.palette')) as HTMLElement;
    const termCell = controlOf(t('ql.modal.terminal')) as HTMLElement;
    const cmdLabel = labelByText(t('ql.modal.cmd')) as HTMLElement;
    expect(paletteLabel, '弹窗里没有「配色」标签').not.toBe(null);
    expect(termCell, '终端那一行的控件格取不到').not.toBe(null);
    expect(kids.indexOf(paletteLabel), '「配色」标签不是 .flag-grid 的直接子节点（不是网格的一行）').toBeGreaterThanOrEqual(0);
    expect(kids.indexOf(paletteLabel), '「配色」行不在 [终端]+[管理员] 那一行之后').toBeGreaterThan(kids.indexOf(termCell));
    expect(kids.indexOf(paletteLabel), '「配色」行不在「命令」那一行之前').toBeLessThan(kids.indexOf(cmdLabel));
    // 控件格是标签的相邻兄弟（controlOf 的既有前提），且用 .field-cell 那一族（报错 / 纵向容器的口径不变）
    expect(controlOf(t('ql.modal.palette')), '「配色」标签没有相邻控件格').toBe(paletteCellEl());
    expect((paletteCellEl() as HTMLElement).classList.contains('field-cell'), '配色那一格不是 .field-cell').toBe(true);

    const sw = swatchEls();
    expect(sw.map((el) => el.getAttribute('data-palette')), '色块不是六档，或顺序不是 TERM_PALETTE_IDS').toEqual(PAL_IDS);
    for (const id of PAL_IDS) {
      const el = swatchOf(id) as HTMLElement;
      const swatchBox = el.querySelector('.term-palette-swatch') as HTMLElement;
      expect(swatchBox, '色块 ' + id + ' 里没有 .term-palette-swatch（票 #14 的色块盒子在 style.css，别再造一份）').not.toBe(null);
      expect(swatchBox.style.background, '色块 ' + id + ' 的底色不是表里的 theme.background')
        .toBe(TERM_PALETTES[id].theme.background);
      const cells = [...el.querySelectorAll('.term-palette-cell')] as HTMLElement[];
      expect(cells.length, '色块 ' + id + ' 的 ANSI 微条不是四格').toBe(4);
      expect(cells.map((c) => c.style.background), '色块 ' + id + ' 的四格不是表里那四个槽')
        .toEqual([TERM_PALETTES[id].theme.foreground, TERM_PALETTES[id].theme.red,
          TERM_PALETTES[id].theme.green, TERM_PALETTES[id].theme.magenta]);
    }

    // 当前档说明：没动过 = 表里的默认档（termPaletteOf 的回落，与页签那条同一张嘴）
    const hint = hintEl() as HTMLElement;
    expect(hint, '配色行里没有当前档说明').not.toBe(null);
    expect(hint.textContent, '当前档说明不是默认档那一档的档名 + 说明')
      .toContain(palName(TERM_PALETTE_DEFAULT) + palHint(TERM_PALETTE_DEFAULT));
    w.unmount();
  });

  // 验收 2：选中态 —— 当前档那颗有色标类 + aria-current，其余五颗没有；说明里带着这一档的档名与说明。
  it('current_palette_is_marked_on_its_swatch_and_in_the_hint', async () => {
    mockLms();
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: { ...SHELL_ENTRY, terminal_palette: 'warm-paper' } });
    await flush();

    const cur = swatchOf('warm-paper') as HTMLElement;
    expect(cur, '暖纸那颗色块不在').not.toBe(null);
    expect(cur.classList.contains('is-current'), '当前档的色块没有选中态样式类').toBe(true);
    expect(cur.getAttribute('aria-current'), '当前档的色块没有 aria-current（与票 #14 的浮层同一口径）').toBe('true');
    for (const id of PAL_IDS.filter((x) => x !== 'warm-paper')) {
      const el = swatchOf(id) as HTMLElement;
      expect(el.classList.contains('is-current'), '非当前档 ' + id + ' 却带选中态样式类').toBe(false);
      expect(el.getAttribute('aria-current'), '非当前档 ' + id + ' 却带 aria-current').toBeNull();
    }
    const hint = hintEl() as HTMLElement;
    expect(hint.textContent, '说明里没有当前档的档名').toContain(palName('warm-paper'));
    expect(hint.textContent, '说明里没有当前档那一档的说明').toContain(palHint('warm-paper'));
    w.unmount();
  });

  // 验收 3：点击色块 → 选中态当场挪过去，payload 带 terminal_palette（shell 态总是显式写这一键，与 admin 同一口径）。
  it('clicking_a_swatch_moves_the_marker_and_writes_terminal_palette_into_the_shell_payload', async () => {
    let sent: { id: unknown; entry: QuickLaunchEntry } | null = null;
    mockLms({ save: (id, entry) => { sent = { id, entry }; return Promise.resolve('qlnew0001'); } });
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    await setInput(inputOf(t('ql.modal.name'))!, '暖纸项');
    await setInput(inputOf(t('ql.modal.cmd'))!, 'ping -n 1 127.0.0.1');
    (swatchOf('warm-paper') as HTMLElement).click();
    await flush();
    expect((swatchOf('warm-paper') as HTMLElement).classList.contains('is-current'), '点击之后选中态没挪过去').toBe(true);
    expect(swatchOf(TERM_PALETTE_DEFAULT)!.classList.contains('is-current'), '点击之后旧档还挂着选中态').toBe(false);
    saveBtn().click();
    await flush();

    expect(writeCalls().length, '保存没走 ql_save 整条（弹窗这票不走窄通道）').toBe(1);
    expect(calls.filter((c) => c.cmd === 'ql_set_palette').length, '弹窗里改配色却走了窄通道 ql_set_palette').toBe(0);
    expect(sent, '没发出 ql_save').not.toBeNull();
    expect(sent!.entry.terminal_palette, 'payload 里没有 terminal_palette').toBe('warm-paper');
    expect(sent!.entry).toEqual({
      name: '暖纸项', type: 'shell', shell: 'powershell', cmd: 'ping -n 1 127.0.0.1', admin: false, terminal_palette: 'warm-paper',
    });
    w.unmount();

    // 一次都没点 = 表里的默认档，照样显式写（主进程 normalizeEntry 对 shell 条目总是归一出这一键）
    sent = null;
    mockLms({ save: (id, entry) => { sent = { id, entry }; return Promise.resolve('qlnew0002'); } });
    const w2 = mountModal({ open: true, id: null, entry: null });
    await flush();
    await setInput(inputOf(t('ql.modal.name'))!, '默认档项');
    await setInput(inputOf(t('ql.modal.cmd'))!, 'dir');
    saveBtn().click();
    await flush();
    expect(sent!.entry.terminal_palette, '没点色块时没写默认档').toBe(TERM_PALETTE_DEFAULT);
    w2.unmount();
  });

  // 验收 4：exe 态 —— 整行不渲染（标签、控件格、色块、说明都没有），payload 不带 terminal_palette；
  // 切回 shell 态这一行回来且选过的档还在（表单态不因类型切换丢档）。
  it('exe_type_renders_no_palette_row_and_omits_terminal_palette_from_the_payload', async () => {
    let sent: { id: unknown; entry: QuickLaunchEntry } | null = null;
    mockLms({ pick: 'D:\\Tools\\notepad.exe', save: (id, entry) => { sent = { id, entry }; return Promise.resolve('qlyyyyyyyy'); } });
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    // shell 态先选一档，再切到 exe：这一行必须整行消失
    (swatchOf('campbell') as HTMLElement).click();
    await flush();
    await pickOption(dropdownOf(t('ql.modal.type'))!, t('ql.modal.type.exe'));
    expect(labelByText(t('ql.modal.palette')), 'exe 态仍渲染「配色」标签').toBe(null);
    expect(paletteCellEl(), 'exe 态仍渲染配色那一格').toBe(null);
    expect(swatchEls().length, 'exe 态仍渲染色块').toBe(0);
    expect(hintEl(), 'exe 态仍渲染当前档说明').toBe(null);

    await setInput(inputOf(t('ql.modal.name'))!, '记事本');
    (controlOf(t('ql.modal.exe'))!.querySelector('button') as HTMLButtonElement).click();
    await flush();
    saveBtn().click();
    await flush();
    expect(sent, '没发出 ql_save').not.toBeNull();
    expect('terminal_palette' in sent!.entry, 'exe 的 payload 带了 terminal_palette（exe 没有终端，因而没有配色）').toBe(false);
    expect(sent!.entry).toEqual({ name: '记事本', type: 'exe', exe: ['D:\\Tools\\notepad.exe'], admin: false });

    // 切回命令行态：这一行回来，刚选的那一档没丢
    await pickOption(dropdownOf(t('ql.modal.type'))!, t('ql.modal.type.shell'));
    expect(swatchEls().length, '切回命令行态之后色块没了').toBe(6);
    expect((swatchOf('campbell') as HTMLElement).classList.contains('is-current'), '切回命令行态之后丢了选过的档').toBe(true);
    w.unmount();
  });

  // 验收 5：fill() 回填 —— 条目上的 terminal_palette 决定选中态与说明；保存时原样带回去（不改色块也带）。
  // 缺这一键的旧夹具 = 表里的默认档（与主进程 termPaletteOr 的回落同一口径，不判非法）。
  it('fill_refills_terminal_palette_from_the_entry', async () => {
    let sent: { id: unknown; entry: QuickLaunchEntry } | null = null;
    mockLms({ save: (id, entry) => { sent = { id, entry }; return Promise.resolve('qla1b2c3d4'); } });
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: { ...SHELL_ENTRY, terminal_palette: 'campbell' } });
    await flush();
    expect((swatchOf('campbell') as HTMLElement).classList.contains('is-current'), '没按条目的 terminal_palette 回填选中态').toBe(true);
    expect(hintEl()!.textContent, '没按条目的 terminal_palette 回填说明').toContain(palHint('campbell'));
    saveBtn().click();
    await flush();
    expect(sent!.entry.terminal_palette, '没动色块就没回填 / 没带这一键').toBe('campbell');
    w.unmount();

    // 缺字段（旧配置 / 旧夹具）= 默认档：与 admin 那条「缺字段 = 关」同一手法，不崩也不空着
    sent = null;
    mockLms({ save: (id, entry) => { sent = { id, entry }; return Promise.resolve('qlb2c3d4e5'); } });
    const w2 = mountModal({ open: true, id: 'qlb2c3d4e5', entry: { name: 'webui', type: 'shell', shell: 'pwsh', cmd: 'python -m webui' } });
    await flush();
    expect(swatchOf(TERM_PALETTE_DEFAULT)!.classList.contains('is-current'), '缺 terminal_palette 时没落到默认档').toBe(true);
    saveBtn().click();
    await flush();
    expect(sent!.entry.terminal_palette, '缺字段时没写默认档').toBe(TERM_PALETTE_DEFAULT);
    w2.unmount();
  });

  // 验收 6（hover 口径）：hover 色块 → 只冒预览事件给上层（有无页签由 App 判），说明换成被 hover 那一档；
  // 本弹窗一次写调用都不发、选中态不动；移开 → 冒 null（上层还原）、说明回到当前档。
  // 新建态（id = null）没有对应页签 → 不冒预览，只换说明（AC「无页签则只显说明」在弹窗这一侧的那一半）。
  it('hovering_a_swatch_previews_without_writing_and_restores_the_hint', async () => {
    mockLms();
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: { ...SHELL_ENTRY, terminal_palette: 'paper' } });
    await flush();

    const campbell = swatchOf('campbell') as HTMLElement;
    await hoverIn(campbell);
    expect(w.emitted('paletteHover'), 'hover 没有冒预览事件给上层（App 走已有链路换 theme）').toEqual([['qla1b2c3d4', 'campbell']]);
    expect(hintEl()!.textContent, 'hover 时说明没换成被 hover 那一档').toContain(palName('campbell') + palHint('campbell'));
    expect(writeCalls().length, 'hover 就落盘了（只有保存才写）').toBe(0);
    expect(calls.filter((c) => c.cmd === 'ql_set_palette').length, 'hover 走了窄通道').toBe(0);
    // hover 不动选中态（预览不是选中）
    expect(swatchOf('paper')!.classList.contains('is-current'), 'hover 把选中态搬走了').toBe(true);
    expect(campbell.classList.contains('is-current'), 'hover 的色块被当成当前档').toBe(false);

    await hoverOut(campbell);
    expect(w.emitted('paletteHover')!.at(-1), '移开色块没有冒 null 让上层还原').toEqual(['qla1b2c3d4', null]);
    expect(hintEl()!.textContent, '移开之后说明没回到当前档').toContain(palName('paper') + palHint('paper'));
    expect(writeCalls().length, '移开时补了一次写调用').toBe(0);
    w.unmount();

    // 新建态没有页签：不冒预览（App 那边没有可换 theme 的画布），但说明照常换
    const w2 = mountModal({ open: true, id: null, entry: null });
    await flush();
    await hoverIn(swatchOf('charcoal') as HTMLElement);
    expect(w2.emitted('paletteHover'), '新建态（id = null）却冒了预览').toBeUndefined();
    expect(hintEl()!.textContent, '新建态 hover 没换成被 hover 那一档的说明').toContain(palHint('charcoal'));
    w2.unmount();
  });

  // 审查轮（标准轴顺手发现的小缺陷）：预览只在指针停在色块上那几秒存在。用 [x] / 背板关窗时指针可能还压在
  // 色块上、mouseleave 不一定发得到 → close() 必须把预览一并撤掉，否则身后那条页签停在预览那一档直到下次落盘。
  it('closing_the_modal_while_a_swatch_is_hovered_withdraws_the_preview', async () => {
    mockLms();
    const w = mountModal({ open: true, id: 'qla1b2c3d4', entry: { ...SHELL_ENTRY, terminal_palette: 'paper' } });
    await flush();
    await hoverIn(swatchOf('campbell') as HTMLElement);
    expect(w.emitted('paletteHover')!.at(-1)).toEqual(['qla1b2c3d4', 'campbell']);
    (document.querySelector('.modal-close') as HTMLButtonElement).click();
    await flush();
    expect(w.emitted('paletteHover')!.at(-1), '关窗没撤 hover 预览：身后页签会停在预览那一档').toEqual(['qla1b2c3d4', null]);
    w.unmount();
  });

  // 负向门（与 card_list_row_shows_no_admin_marker 同款口径）：配色只在弹窗里，列表行不出现这一行的任何文案
  it('card_list_row_shows_no_palette_texts', async () => {
    const store: QuickLaunchList = {
      items: { a: { ...SHELL_ENTRY, terminal_palette: 'warm-paper' } }, invalid: [],
    };
    (window as any).lms = {
      invoke: (cmd: string, ...args: unknown[]): Promise<unknown> => {
        if (cmd === 'ql_list') return Promise.resolve(JSON.parse(JSON.stringify(store)));
        return Promise.resolve(null);
      },
    };
    const w = mount(QuickLaunch, { attachTo: document.body, props: { states: {} } });
    await flush();
    const rows = w.findAll('.tpl-row');
    expect(rows.length, '卡片没有渲染出列表行').toBe(1);
    const rowEl = rows[0].element as HTMLElement;
    const text = rows[0].text();
    // 形状这一半走选择器而不是 outerHTML 子串：本卡的模板里带着取证注释（QuickLaunch.vue:213-214 那句里
    // 就有「配色」二字），Vue 在测试构建里保留模板注释 → 拿 HTML 子串当判据会假红（管理员那条门用词没撞上而已）
    expect(rowEl.querySelector('.palette-cell, .palette-swatch, .term-palette-swatch, .term-palette-cell, .palette-hint'),
      '列表行里出现了配色控件').toBe(null);
    expect(text, '列表行文本里出现了「配色」').not.toContain(t('ql.modal.palette'));
    for (const id of PAL_IDS) {
      expect(text, '列表行文本里出现了档名「' + id + '」').not.toContain(palName(id));
      expect(text, '列表行文本里出现了说明「' + id + '」').not.toContain(palHint(id));
    }
    w.unmount();
  });

  // 结构性门（TerminalTabView.test.ts:266-268 同一口径，不给弹窗开特例）：配色只能从颜色表取，
  // 组件的 script / template 里不得出现 hex 字面量。<style scoped> 那一段只动外壳配色（#fff / #C7CCD4 是既有的），
  // 不在本门范围内 —— 本门扫的是「能画出色块」的那两段。
  it('palette_colors_come_from_the_table_not_from_hex_in_the_component', async () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'modules', 'QuickLaunchModal.vue'), 'utf8');
    const head = src.split('<style scoped>')[0];
    expect(head, 'QuickLaunchModal 的 script / template 里出现了 hex —— 色块一律从 src/modules/term-palettes.ts 取')
      .not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(head, '色块没有从 TERM_PALETTES 取色').toContain('TERM_PALETTES[');
    // 命名口径：本仓一律 palette，不留 termTheme / TERM_THEME_* 那批过期名字（原型留档在 .scratch 里）
    expect(head, '出现了过期的 termTheme / TERM_THEME 命名').not.toMatch(/termTheme|TERM_THEME/);
  });
});

// ---- 2026-10-13（用户反馈 + 截图）：打开 [终端] 下拉时，面板不得把 .modal-body 撑出滚动条、也不得被 .modal-box 裁掉。
// 机制 = 面板是视口浮层（position:fixed + 内联坐标来自触发按钮矩形），组件级断言在 Dropdown.test.ts 的
// 'Dropdown panel is a viewport float' 里钉；本用例只钉弹窗这一侧的三件事：
//   a) 面板浮出表单网格（面板底缘 > .flag-grid 底缘）—— 当年把面板塞回流程里，就是把 .modal-body 顶出滚动条的那条线；
//   b) 弹窗自身不滚动（.modal-box overflow-y: hidden）= 「塞回流程」必然被裁切的前提没有被拆掉；
//   c) 定高门（261px）与 .modal-body 的滚动容器没有被拆掉来「绕过」滚动条。
// 夹具矩形 = **票 #15 之后**命令行态的实测几何（探针 .temp/ql-modal-palette-row/measure.json，真 Chromium；
// 票 #12 审查轮登记：该目录本机已未留档，这组数是当时的实测，重测口径见上面 261px 那段注释）：
//   .modal-box y 291.3 / 高 260.7；.flag-grid y 352 / 高 151.3 → 底缘 503.3；终端那一格 390..422 → 触发按钮 32 高）。
// 锚点从「弹窗底缘」换到「网格底缘」的原因写清楚：定高从 218 涨到 261（涨了 43）之后，触发按钮下缘到弹窗底缘
// 有 130.0px ≥ 面板 116px，面板不再越过弹窗底缘 —— 那条断言在新几何下成了永真式，换锚点而不是删掉它。
// （原像素事实的取证：.temp/ql-dropdown-float/measure.html，同 .temp/ql-modal-fixed-height/ 的手法。）
describe('QuickLaunchModal terminal dropdown floats out of the modal', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  function stubRect(el: HTMLElement, left: number, width: number, top: number, height: number): void {
    (el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
      ({ left, right: left + width, top, bottom: top + height, width, height, x: left, y: top }) as DOMRect;
  }

  it('terminal_dropdown_panel_floats_out_of_the_modal_box', async () => {
    injectRealCss();
    mockLms();
    const w = mountModal({ open: true, id: null, entry: null });
    await flush();

    const dd = dropdownOf(t('ql.modal.terminal')) as HTMLElement;
    expect(dd, '终端下拉不存在').not.toBe(null);
    // 夹具矩形 = 票 #15 之后的实测几何：弹窗 520 宽、顶 291.3、定高 261 → 底缘 552.3；
    // .flag-grid 顶 352 / 高 151.3 → 底缘 503.3；终端那一格 390..422 → 触发按钮顶 390 / 高 32（--h-control）
    const GRID_TOP = 352, GRID_H = 151.3;
    stubRect(box() as HTMLElement, 252, 520, 291, 261);
    const gridEl = document.querySelector('.modal-box .flag-grid') as HTMLElement;
    stubRect(gridEl, 268, 486.7, GRID_TOP, GRID_H);
    const trigger = dd.querySelector('.select-trigger') as HTMLElement;
    stubRect(trigger, 300, 418, 390, 32);
    (trigger as HTMLButtonElement).click();
    await flush();

    const panel = dd.querySelector('ul.dropdown-panel') as HTMLElement;
    expect(panel, '终端下拉面板未渲染').not.toBe(null);
    expect(getComputedStyle(panel).position, '面板不是视口浮层：会被 .modal-box 裁切并撑高 .modal-body').toBe('fixed');
    expect(panel.style.top, '面板顶 = 触发按钮下缘 + 2px').toBe('424px');
    // 面板 max-height 116px → 底缘 540 > 网格底缘 503.3：超出表单网格 36.7px，即「浮到表单之外」。
    // 面板必须走视口浮层，否则要么被下面那条 overflow 裁切、要么把 .modal-body 顶出滚动条（票 #10 的两种坏法）。
    expect(424 + 116, '面板没有浮出表单网格之外（又被塞回流程里了？）').toBeGreaterThan(GRID_TOP + GRID_H);
    // 「塞回流程就会被裁切」的前提仍在：弹窗自己不滚动
    expect(getComputedStyle(box() as Element).overflowY, '.modal-box 的 overflow 兜底被拆 = 这条门失去意义').toBe('hidden');

    // 不是靠拆掉定高 / 拆掉 .modal-body 的滚动容器来「绕过」滚动条的
    expect(getComputedStyle(box() as Element).minHeight).toBe('261px');
    expect(getComputedStyle(document.querySelector('.modal-body') as Element).overflowY, '.modal-body 不再是滚动容器 = 定高兜底被拆').toBe('auto');
    w.unmount();
  });
});
