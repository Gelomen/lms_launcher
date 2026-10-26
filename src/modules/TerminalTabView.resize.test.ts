// @vitest-environment happy-dom
// 真 xterm（本文件**不打桩** @xterm/xterm）+ 有脚本的 FitAddon —— #33「[全屏] 后输出被裁减」那组门。
//
// 为什么这里要用真 xterm（同 TerminalTabView.search.test.ts 的口径）：#33 的账全在**缓冲**上 ——
// baseY / viewportY / cursorY / resize / scrollToLine 谁动了哪一段，打桩套件的假终端一个都读不出来。
// FitAddon 反过来必须打桩：happy-dom 无布局，真 FitAddon 恒给不出尺寸（本仓 .log-view 的尺寸链靠真 CSS）。
//
// 一次性取证台的实测（真 ConPTY + 真 pwsh，.temp/fs-clip/）：
//   生产次序（fit 先换 xterm 行列，ql_resize 后到）：让位那轮 ConPTY 的整屏重绘把 xterm 刚拉进视口的历史
//     原地清空 —— buffer 37 → 43（10 行尾段 + 33 行空），再点 [恢复] → buffer 只剩 10 行；
//   换序（先报尺寸、重绘落地后再换 xterm 行列）：buffer 60、baseY 仍是 17 —— 历史活着。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { Terminal } from '@xterm/xterm';
import TerminalTabView from './TerminalTabView.vue';
import { applyLangLocal } from '../i18n';
import type { TermPaletteId } from '../../src-main/term-palettes';

// —— 有脚本的 FitAddon：proposeDimensions 交回用例给的那一档；fit() 走真 term.resize（真 FitAddon 就是这么接线的）
const scripted = { proposed: { cols: 175, rows: 10 }, fitCalls: 0, term: null as Terminal | null };
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    activate(term: Terminal): void { scripted.term = term; }
    dispose(): void { /* noop */ }
    proposeDimensions(): { cols: number; rows: number } { return { ...scripted.proposed }; }
    fit(): void { scripted.fitCalls += 1; scripted.term?.resize(scripted.proposed.cols, scripted.proposed.rows); }
  },
}));

vi.mock('../ipc', () => ({ invoke: () => Promise.resolve('') }));

// 假 ResizeObserver：抓住回调，用例里手动「尺寸变了」
const observers: Array<{ cb: () => void }> = [];
class FakeResizeObserver {
  constructor(cb: () => void) { observers.push({ cb }); }
  observe(): void { /* noop */ }
  unobserve(): void { /* noop */ }
  disconnect(): void { /* noop */ }
}
const realResizeObserver = globalThis.ResizeObserver;
const fireResize = (): void => { for (const o of observers) o.cb(); };

// happy-dom 无布局：组件那道「盒为 0 就别 fit」的守卫会一路挡死，这里给个有宽高的原型级覆写
function setProtoBox(width: number, height: number): void {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => width });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => height });
}

// xterm.write 的解析在稍后的宏任务里跑（组件交出的 sink 不带写回调）→ 写完/换完行列都要等一轮定时器
const settle = (ms = 40): Promise<void> => new Promise((r) => setTimeout(r, ms));

const CONTENT = Array.from({ length: 40 }, (_, i) => 'LINE-' + String(i + 1).padStart(2, '0'));
const PROMPT = 'PS>';
/** 页签刚起、ls 跑完那一刻的画面：40 行内容 + 光标停在提示符行（不带行尾）。 */
const initialOutput = (): string => CONTENT.map((l) => l + '\x1b[K\r\n').join('') + PROMPT;

/**
 * ConPTY 换行列后发来的**整屏重绘**（逐字照取证台 raw 读数的形状，.temp/fs-clip/raw2-real2.txt）：
 * 从 home 起把新尺寸的每一行画一遍，它手里没有的行就是 ESC[K + CRLF，末尾再把光标放回去。
 * @param painted 它手里那一屏（行数 = 换行列**之前**视口的行数）
 * @param totalRows 换行列之后的行数 → 多出来的行全是空行
 * @param cursorRow 光标所在的屏内行号（1 起）
 */
function conptyRepaint(painted: string[], totalRows: number, cursorRow: number, cursorCol = 5): string {
  let s = '\x1b[?25l\x1b[H';
  for (let i = 0; i < totalRows; i++) s += (painted[i] ?? '') + '\x1b[K\r\n';
  return s + ('\x1b[' + cursorRow + ';' + cursorCol + 'H\x1b[?25h');
}

/** 换行列前它手里那一屏 = xterm 视口当前显示的行（换序时重绘正是打在这一段上）。 */
function visibleLines(term: Terminal): string[] {
  const b = term.buffer.active;
  return Array.from({ length: term.rows }, (_, i) => b.getLine(b.viewportY + i)?.translateToString(true).trimEnd() ?? '');
}

async function mountReal(over: Record<string, unknown> = {}): Promise<{ w: VueWrapper; sink: (d: string) => void; term: Terminal; onResize: ReturnType<typeof vi.fn> }> {
  let sink: ((d: string) => void) | null = null;
  const onResize = vi.fn();
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
      onInput: () => { /* noop */ },
      onResize,
      ...over,
    },
    attachTo: document.body,
  });
  await flushPromises();
  if (!sink) throw new Error('组件未在挂载时 register 输出 sink');
  if (!scripted.term) throw new Error('FitAddon 没被 activate，拿不到终端实例');
  return { w, sink: sink as (d: string) => void, term: scripted.term, onResize };
}

/** 起页签 → 首帧按 175×10 排版 → ls 的 41 行落地（历史进滚动缓冲）。 */
async function startedWithHistory(rows: number): Promise<{ w: VueWrapper; sink: (d: string) => void; term: Terminal; onResize: ReturnType<typeof vi.fn> }> {
  scripted.proposed = { cols: 175, rows };
  const ctx = await mountReal();
  await settle();
  ctx.sink(initialOutput());
  await settle();
  return ctx;
}

beforeEach(() => {
  applyLangLocal('zh');
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  setProtoBox(1150, 300);
  scripted.fitCalls = 0;
  scripted.term = null;
  observers.length = 0;
});
afterEach(() => {
  globalThis.ResizeObserver = realResizeObserver;
  document.body.innerHTML = '';
});

describe('#33 · 换行列的先后次序（行数变大 = 先报尺寸，重绘落地后再换 xterm）', () => {
  it('grow_with_history_reports_the_size_first_and_keeps_xterm_rows_until_the_repaint_lands', async () => {
    const { w, sink, term, onResize } = await startedWithHistory(10);
    const before = term.buffer.active.baseY;
    expect(before, '夹具没备好：10 行视口 + 41 行输出，历史应当已进滚动缓冲').toBeGreaterThan(0);

    scripted.proposed = { cols: 175, rows: 30 };
    fireResize();

    // 先报尺寸（= 先让 ConPTY 换行列并重绘）……
    expect(onResize, '尺寸没先报给 PTY').toHaveBeenCalledWith('ql:demo', 175, 30);
    // ……而 xterm 这一步还**没**换行列：换了，历史就被这轮重绘盖在落点里（实测 buffer 37→43）
    expect(term.rows, '重绘还没落地就先换了 xterm 的行号 = #33 的坏次序').toBe(10);
    expect(term.buffer.active.baseY, 'xterm 先长会把 baseY 拉掉，历史随之进入重绘落点').toBe(before);

    // 重绘到达 → 最后一段之后再换行列
    sink(conptyRepaint(visibleLines(term), 30, 10));
    await settle(120);
    expect(term.rows, '重绘落地后 xterm 仍没换行列').toBe(30);
    expect(onResize.mock.calls.filter((c: unknown[]) => c[1] === 175 && c[2] === 30).length, '换序不能把同一次尺寸报两遍').toBe(1);
    w.unmount();
  });

  it('head_of_the_output_survives_the_grow_and_the_last_content_line_is_pinned_to_the_bottom_of_the_canvas', async () => {
    const { w, sink, term } = await startedWithHistory(10);
    scripted.proposed = { cols: 175, rows: 30 };
    fireResize();
    sink(conptyRepaint(visibleLines(term), 30, 10));
    await settle(120);

    const b = term.buffer.active;
    // 历史活着：缓冲第一行仍是 ls 的第一行
    expect(b.getLine(0)?.translateToString(true), '让位把输出头部吃掉了').toBe(CONTENT[0]);

    const visible = Array.from({ length: term.rows }, (_, i) => b.getLine(b.viewportY + i)?.translateToString(true) ?? '');
    const blank = visible.filter((l) => l.trim() === '').length;
    // 画布下缘正是「最后一条还有内容的行」（这里就是提示符那一行），而不是 ConPTY 手里没有的空行
    expect(visible[visible.length - 1].trimEnd(), '画布底缘不是最后一条有内容的行').toBe(PROMPT);
    // 画布里的内容比换行列之前多（不是「同样 10 行 + 下面一片空」）
    expect(visible.length - blank, '全屏后画布上的内容没变多').toBeGreaterThan(10);
    // 空行落在最下面 = 只剩 ConPTY 手里没有的那几行
    expect(blank, '空行没被压到最下面').toBeLessThanOrEqual(term.rows - visible.length + blank);
    w.unmount();
  });

  it('grow_waits_at_most_the_cap_when_no_repaint_ever_comes', async () => {
    const { w, term } = await startedWithHistory(10);
    scripted.proposed = { cols: 175, rows: 30 };
    fireResize();
    expect(term.rows).toBe(10);
    await settle(340);                     // > GROW_REPAINT_CAP_MS
    expect(term.rows, '重绘不会来（进程已退出那类）时也要换行列，不能把尺寸卡在旧那一档').toBe(30);
    w.unmount();
  });

  it('shrink_fits_immediately_so_the_repaint_lands_only_on_the_viewport', async () => {
    const { w, sink, term, onResize } = await startedWithHistory(10);
    scripted.proposed = { cols: 175, rows: 30 };
    fireResize();
    sink(conptyRepaint(visibleLines(term), 30, 10));
    await settle(120);
    expect(term.rows).toBe(30);

    // [恢复] = 行数变小：现次序是对的（xterm 先缩 → 历史进滚动缓冲 → 重绘只落在视口里）
    scripted.proposed = { cols: 175, rows: 10 };
    fireResize();
    expect(term.rows, '行数变小还去等重绘 = 让重绘盖掉旧视口的上沿').toBe(10);
    expect(onResize).toHaveBeenLastCalledWith('ql:demo', 175, 10);
    const b = term.buffer.active;
    expect(b.getLine(0)?.translateToString(true), '恢复这一步把历史吃掉了').toBe(CONTENT[0]);
    expect(b.baseY, '恢复后历史应当滚得上去（baseY > 0）').toBeGreaterThan(0);
    void sink;
    w.unmount();
  });

  it('first_frame_fits_at_once_because_there_is_nothing_to_lose_yet', async () => {
    scripted.proposed = { cols: 175, rows: 30 };
    const { w, term, onResize } = await mountReal();
    // 建页签那一刻缓冲还是空的（80×24 兜底 → 真实尺寸）：这一格照旧立即 fit，F8 / K23(3) 的门不变
    expect(term.rows, '首帧不该走换序（此刻重绘盖不到任何历史）').toBe(30);
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith('ql:demo', 175, 30);
    // 拆之前先让一拍：xterm 5.5.0 的 Viewport 构造里挂了一个「异步再同步一次」的裸 setTimeout
    // （node_modules/@xterm/xterm/src/browser/Viewport.ts:84），它到点读 renderService.dimensions。
    // 真机上页签不可能在同一拍里起又拆；测试要是不让一拍就 unmount，那一拍会落在 dispose 之后 ——
    // 渲染层此时已被拆（_renderer 空）→ 抛「Cannot read properties of undefined (reading 'dimensions')」，
    // 被 vitest 记成一整份文件的未捕获异常（实测：只有这一格会，其余六格拆之前都等过宏任务）。
    await settle(60);
    w.unmount();
  });
});

describe('#33 · 钉住的那一屏什么时候松手', () => {
  it('the_next_output_returns_the_canvas_to_the_bottom', async () => {
    const { w, sink, term } = await startedWithHistory(10);
    scripted.proposed = { cols: 175, rows: 30 };
    fireResize();
    sink(conptyRepaint(visibleLines(term), 30, 10));
    await settle(120);
    const pinned = term.buffer.active.viewportY;
    expect(pinned, '夹具：让位后应已钉到光标那一行').toBeLessThan(term.buffer.active.baseY);

    sink('NEW-OUT\x1b[K\r\n' + PROMPT);
    await settle(120);
    const b = term.buffer.active;
    expect(b.viewportY, '有了新输出还钉在旧那一屏 = 流式页签看不见新东西').toBe(b.baseY);
    expect(b.getLine(b.baseY + term.rows - 1)?.translateToString(true)).toBe(PROMPT);
    void pinned;
    w.unmount();
  });

  it('the_pin_lets_go_as_soon_as_the_user_moves_the_scroll_position_himself', async () => {
    const { w, sink, term } = await startedWithHistory(10);
    scripted.proposed = { cols: 175, rows: 30 };
    fireResize();
    sink(conptyRepaint(visibleLines(term), 30, 10));
    await settle(120);
    const pinnedTo = term.buffer.active.viewportY;
    expect(pinnedTo, '夹具：让位后应已钉住').toBeLessThan(term.buffer.active.baseY);

    // 钉住之后用户自己在翻历史 —— 这一格要的是「这条钉就此交还给他」（组件里挂在 term.onScroll 上）
    term.scrollLines(-4);
    const mine = term.buffer.active.viewportY;
    expect(mine, '夹具：划上去没生效').toBeLessThan(term.buffer.active.baseY);

    sink('NEW-OUT\x1b[K\r\n' + PROMPT);
    await settle(120);
    // 真 xterm 在「不在底部」时本来就不跟着输出走，所以这里只要求：别被我们那条 scrollToBottom 拽回去
    expect(term.buffer.active.viewportY, '钉住后用户划上去看历史，下一条输出又把他拽回底部').toBe(mine);
    void pinnedTo;
    w.unmount();
  });

  it('a_user_who_had_scrolled_up_is_not_moved_by_the_grow', async () => {
    const { w, sink, term } = await startedWithHistory(10);
    term.scrollLines(-8);                       // 用户自己在翻历史
    const mine = term.buffer.active.viewportY;
    expect(mine, '夹具：划上去没生效').toBeLessThan(term.buffer.active.baseY);

    scripted.proposed = { cols: 175, rows: 30 };
    fireResize();
    sink(conptyRepaint(visibleLines(term), 30, 10));
    await settle(120);
    const b = term.buffer.active;
    const target = Math.max(0, b.baseY + b.cursorY - term.rows + 1);
    expect(b.viewportY, '用户滚上去看历史，让位却把他拽到钉住的那一屏').not.toBe(target);
    w.unmount();
  });
});
