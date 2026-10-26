// @vitest-environment happy-dom
// 真 xterm（本文件**不打桩** @xterm/xterm）+ 写死的 ConPTY 读数 —— #34「[快捷启动] 的终端：点 [清空终端] 之后手动敲命令，画布先空一大截才出输出」那组门。
//
// 为什么这里要用真 xterm（同 resize.test.ts / search.test.ts 的口径）：#34 的账全在**缓冲的行号**上 ——
// clear() 把光标那一行抬到第 0 行、ConPTY 下一次绝对定位（CUP）落在第几行、中间空了几行，
// 打桩套件的假终端只记得「clear 被调了几次」，画不出这个形态。
//
// 一次性取证台的实测（真 node-pty + 真 pwsh，逐键敲，120×27，.temp/fs-clip/raw6-keys.chunks.json）：
//   起页签 + 自动命令 ls → 27 行的窗口顶到底，伪控制台把光标停在**窗口第 27 行**；
//   [清空终端] 只搬客户端（xterm clear()）→ 伪控制台不知道，重画输入行仍按它自己的行号发绝对定位：ESC[27;34H ×多次；
//   按一次 Ctrl+L（shell 自己清屏）→ 它的回包是 ESC[2J + 从 home 把整屏各行画一遍 + 重打提示符，
//   此后同样的逐键敲变成 ESC[1;35H、输出锚点变成 ESC[3;1H —— 两边坐标框重新同框。
// 下面的夹具照这几段读数写死（ls 的输出裁短，但行数仍足够把 27 行的窗口顶到底）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { Terminal } from '@xterm/xterm';
import TerminalTabView from './TerminalTabView.vue';
import { applyLangLocal } from '../i18n';
import type { TermPaletteId } from '../../src-main/term-palettes';

// FitAddon 打桩（happy-dom 无布局，真 FitAddon 恒给不出尺寸）：fit() 走真 term.resize，首帧把终端排成 120×27
const scripted = { proposed: { cols: 120, rows: 27 }, term: null as Terminal | null };
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    activate(term: Terminal): void { scripted.term = term; }
    dispose(): void { /* noop */ }
    proposeDimensions(): { cols: number; rows: number } { return { ...scripted.proposed }; }
    fit(): void { scripted.term?.resize(scripted.proposed.cols, scripted.proposed.rows); }
  },
}));

vi.mock('../ipc', () => ({ invoke: () => Promise.resolve('') }));

const observers: Array<{ cb: () => void }> = [];
class FakeResizeObserver {
  constructor(cb: () => void) { observers.push({ cb }); }
  observe(): void { /* noop */ }
  unobserve(): void { /* noop */ }
  disconnect(): void { /* noop */ }
}
const realResizeObserver = globalThis.ResizeObserver;

// happy-dom 无布局：组件那道「盒为 0 就别 fit」的守卫会一路挡死，这里给个有宽高的原型级覆写
function setProtoBox(width: number, height: number): void {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => width });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => height });
}

// xterm.write 的解析在稍后的宏任务里跑（组件交出的 sink 不带写回调）→ 写完就要等一轮定时器
const settle = (ms = 40): Promise<void> => new Promise((r) => setTimeout(r, ms));

const ROWS = 27;
/** 33 列的提示符 → 光标停在第 34 列（实测 CUP 正是 ESC[1;34H / ESC[27;34H 这一档） */
const PROMPT = 'PS D:\\Dev\\Projects\\lms_launcher> ';
const PROMPT_COL = 34;

/** ls 的输出（照读数裁短，形态不变；行数足够把 27 行的窗口顶到底） */
const LS_LINES = [
  '    目录:D:\\Dev\\Projects\\lms_launcher',
  '',
  'Mode                 LastWriteTime         Length Name',
  '----                 -------------         ------ ----',
  ...Array.from({ length: 30 }, (_, i) => 'd----          2026-10-18    17:44                dir-' + String(i + 1).padStart(2, '0')),
];

/** 手动那条命令的输出：同一屏要装下「命令 + 输出 + 下一次的提示符」，所以只留 ls 的头 8 行 */
const LS_SHORT = LS_LINES.slice(0, 8);

// ---- 伪控制台（ConPTY 的 pseudoconsole 那一侧）模型：逐字照上面读数写死 ----
// 它手里没有历史，只有**窗口内行号**；重画输入行就按那个行号发绝对定位。
// 除了 shell 自己清屏（Ctrl+L），没人能把它挪回窗口第 1 行 —— #34 的全部账就在这一个变量上。
let conptyRow = 1;

const conptyBoot = (): string => {
  conptyRow = 1;
  return '\x1b[?25l\x1b[2J\x1b[m\x1b[H' + PROMPT;
};

/** 命令跑完（回显 + 输出 + 再打一次提示符）：行数把窗口顶到底 → 它的行号停在最后一行 */
const conptyRunCmd = (lines: string[], echo = ''): string => {
  // echo：只有自动命令那一次要 shell 回显（实测 A 段 ESC[93mls CR LF）；逐键敲过的别再回显一遍，回车就是换行
  let s = '\x1b[?25l' + echo + '\r\n\x1b[m\r\n';
  for (const l of lines) s += l + '\r\n';
  s += '\r\n' + PROMPT.trimEnd() + '\x1b[1C\x1b[?25h';
  conptyRow = Math.min(ROWS, conptyRow + lines.length + 3);
  return s;
};

/** 逐键敲（实测 B / D 段）：PSReadLine 用绝对定位重画输入行，CUP 的行号就是 conptyRow 那一档 */
const conptyType = (text: string): string =>
  '\x1b[m\x1b[?25l\x1b[93m\x1b[' + conptyRow + ';' + PROMPT_COL + 'H' + text + '\x1b[?25h';

/** Ctrl+L（实测 C 段）：ESC[2J + 从 home 把整屏各行画一遍 + 重打提示符；它的行号归回 1 */
const conptyCtrlL = (): string => {
  conptyRow = 1;
  return '\x1b[2J\x1b[?25l\x1b[H' + '\x1b[K\r\n'.repeat(ROWS) + '\x1b[' + (PROMPT_COL - 1) + 'C\x1b[?25h'
    + '\x1b[?25l\x1b[H' + PROMPT + '\x1b[?25h';
};

async function mountReal(onInput: (id: string, data: string) => void): Promise<{ w: VueWrapper; sink: (d: string) => void; term: Terminal }> {
  let sink: ((d: string) => void) | null = null;
  const w = mount(TerminalTabView, {
    props: {
      id: 'ql:demo',
      label: 'Demo',
      fullLabel: 'Demo · PowerShell 7 (pwsh)',
      running: true,
      stopping: false,
      restartDisabled: false,
      palette: 'paper' as TermPaletteId,
      register: (_id: string, cb: (d: string) => void) => { sink = cb; },
      unregister: () => { /* noop */ },
      onInput,
      onResize: () => { /* noop */ },
    },
    attachTo: document.body,
  });
  await flushPromises();
  if (!sink) throw new Error('组件未在挂载时 register 输出 sink');
  if (!scripted.term) throw new Error('FitAddon 没被 activate，拿不到终端实例');
  return { w, sink: sink as (d: string) => void, term: scripted.term };
}

/** 起页签 → 自动命令 ls 跑完（窗口顶到底，提示符在画布下缘） */
async function startAndRunAutoLs(onInput: (id: string, data: string) => void) {
  const ctx = await mountReal(onInput);
  await settle();
  ctx.sink(conptyBoot());
  await settle();
  ctx.sink(conptyRunCmd(LS_LINES, 'ls'));
  await settle();
  return ctx;
}

/** 画布上那一屏（视口内的行，去掉行尾空白） */
function visible(term: Terminal): string[] {
  const b = term.buffer.active;
  return Array.from({ length: term.rows }, (_, i) => b.getLine(b.viewportY + i)?.translateToString(true).trimEnd() ?? '');
}

/** 画布上「第一条有内容的行」之前空了几行 —— 用户说的那一截空白就在这一处 */
function blankAboveFirstContent(lines: string[]): number {
  const first = lines.findIndex((l) => l.trim() !== '');
  return first < 0 ? lines.length : first;
}

/** 第一条有内容的行到最后一条有内容的行之间，最长的连续空白段 */
function innerBlankGap(lines: string[]): number {
  let last = -1;
  lines.forEach((l, i) => { if (l.trim() !== '') last = i; });
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first < 0) return 0;
  let best = 0;
  let cur = 0;
  for (let i = first; i <= last; i++) {
    if (lines[i].trim() === '') { cur += 1; if (cur > best) best = cur; } else cur = 0;
  }
  return best;
}

const sent: string[] = [];
const collectInput = (_id: string, data: string): void => { sent.push(data); };

beforeEach(() => {
  applyLangLocal('zh');
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  setProtoBox(1150, 300);
  scripted.term = null;
  observers.length = 0;
  sent.length = 0;
  conptyRow = 1;
});
afterEach(() => {
  globalThis.ResizeObserver = realResizeObserver;
  document.body.innerHTML = '';
});

describe('#34 · [清空终端] 是两步：客户端清缓冲 + 让 shell 自己清屏', () => {
  it('clear_then_a_typed_command_lands_on_the_prompt_line_instead_of_the_bottom_of_the_canvas', async () => {
    const { w, sink, term } = await startAndRunAutoLs(collectInput);
    const before = visible(term);
    expect(before[before.length - 1].trimEnd(), '夹具：自动命令跑完，提示符应在画布下缘').toBe(PROMPT.trimEnd());

    await w.find('.btn-term-clear').trigger('click');
    // 组件真把这一字节发往 PTY 了（打桩套件钉「调用发生」，这里钉「发的是 Ctrl+L 这一字节」）
    expect(sent.join(''), '[清空终端] 没让 shell 自己清屏 → ConPTY 的行号会留在窗口底缘').toBe('\x0c');
    sink(conptyCtrlL());              // shell 按实测形状回包：它的行号归回窗口第 1 行
    await settle();
    sink(conptyType('ls && git st'));   // 逐键敲：此刻它的绝对定位是 ESC[1;34H
    await settle();
    sink(conptyRunCmd(LS_SHORT));     // 回车 → 输出（实测锚点 ESC[3;1H）
    await settle(120);

    const after = visible(term);
    // 画布第一行就是「提示符 + 敲的命令」：两边坐标框同一档，空白没有插到前面
    const cmdIdx = after.findIndex((l) => l.includes('ls && git st'));
    expect(cmdIdx, '敲的命令不在画布上').toBe(0);
    expect(after[0].trimEnd(), '画布第一行不是提示符 + 命令那一行').toBe(PROMPT + 'ls && git st');
    expect(blankAboveFirstContent(after), '清空后再敲命令，画布上方又空出一截 = #34 复发').toBe(0);
    expect(innerBlankGap(after), '命令与它的输出之间塞进了多余空白').toBeLessThanOrEqual(2);
    const firstDir = after.findIndex((l) => l.includes('目录:'));
    expect(firstDir, '命令的输出不在画布上').toBeGreaterThan(cmdIdx);
    expect(after.join('\n')).toContain('dir-04');
    await settle(20);   // 拆终端前先让一拍宏任务（ledger 里那条真 xterm 硬口径）
    w.unmount();
  });

  it('a_client_only_clear_is_what_the_user_reported_the_blank_block_in_the_middle', async () => {
    // 负对偶：PTY 已停 → 组件不发那一字节 → 伪控制台按它自己的窗口行号（第 27 行）重画 → 中间空一截。
    // 这条同时钉住「PTY 已停就不空跑一趟 IPC」（quick-launch.ts 的 write 对没有实例的 id 抛 STATE）。
    const { w, sink, term } = await startAndRunAutoLs(collectInput);
    await w.setProps({ running: false });
    await w.find('.btn-term-clear').trigger('click');
    expect(sent.length, 'PTY 已停还往 PTY 发字节').toBe(0);
    expect(conptyRow, '夹具：没发 Ctrl+L，伪控制台仍停在窗口底缘').toBe(ROWS);

    sink(conptyType('ls && git st'));
    await settle();
    sink(conptyRunCmd(LS_SHORT));     // 输出接在窗口底缘那条命令下面
    await settle(120);

    const after = visible(term);
    // 与用户贴的画布同一形态：内容沉到画布下缘，上面空一大截（实测复放 = 缓冲 row1..25 全空）
    expect(blankAboveFirstContent(after), '只清客户端本该复现「上面空一截」，这条是上一格的门对偶').toBeGreaterThanOrEqual(10);
    expect(after[after.length - 1].trimEnd(), '画布下缘应是最新那条提示符').toBe(PROMPT.trimEnd());
    await settle(20);   // 同上：拆终端前先让一拍宏任务
    w.unmount();
  });
});
