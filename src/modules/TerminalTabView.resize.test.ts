// @vitest-environment happy-dom
// 真 xterm（本文件**不打桩** @xterm/xterm）+ 有脚本的 FitAddon —— #33「[全屏] 后输出被裁减」那组门。
// 2026-10-26 #35 改过一轮：#33 当时定的「行数变大先报尺寸、重绘落地后才换 xterm 行列」已被取代，两个方向现在是同一支
// （xterm 先换行列 + 立刻报尺寸 + 建页签时开 windowsPty）。为什么改、取证读数逐条写在 TerminalTabView.vue 尺寸那段，
// 机制本身的门在 TerminalTabView.drag.test.ts，口径的取舍在 ADR 0006。本文件留的是这条链上 #33 要的那三样**结果**：
// 历史活着、画布下缘是最后一条还有内容的行、resize 不抢用户自己翻历史的位置。
//
// 为什么这里要用真 xterm（同 TerminalTabView.search.test.ts 的口径）：#33 的账全在**缓冲**上 ——
// baseY / viewportY / cursorY / resize / scrollToLine 谁动了哪一段，打桩套件的假终端一个都读不出来。
// FitAddon 反过来必须打桩：happy-dom 无布局，真 FitAddon 恒给不出尺寸（本仓 .log-view 的尺寸链靠真 CSS）。
//
// 取证台实测（真 ConPTY + 真 pwsh，.temp/fs-clip/；bench7 = 跑完 ls 之后一格一行连续 resize）：
//   换一次行列它就回**一整轮**重绘 = ESC[?25l ESC[H <它手里此刻 newRows 行，行间 ESC[K CRLF> ESC[cursorRow;34H ESC[?25h；
//   窗口**变小 = 从顶上掉行**（贴底）、**变大 = 在底下补空行**（贴顶），它自己不存历史；
//   把历史拉进视口之后再让位 = 那轮重绘把历史原地盖成空行（raw2-real2：buffer 37→43 = 10 行尾段 + 33 行空，
//   再点 [恢复] → 只剩 10 行）。现在这一格由构造参数 windowsPty.backend='conpty' 兜住：xterm 改在缓冲**底下**补行
//   （@xterm/xterm 5.5.0 common/buffer/Buffer.ts:180-183），于是「先换行列」不再吃历史。
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
 * @param painted 它手里那一屏 = 报尺寸那一刻**视口显示的那几行**（口径 C 换行列之前视口已贴回缓冲底部 = 它的镜像）
 * @param totalRows 换行列之后的行数 → 多出来的行全是空行（读数：变大 = 在底下补空行）
 * @param cursorRow 光标所在的屏内行号（1 起）
 */
function conptyRepaint(painted: string[], totalRows: number, cursorRow: number, cursorCol = 5): string {
  let s = '\x1b[?25l\x1b[H';
  for (let i = 0; i < totalRows; i++) s += (painted[i] ?? '') + '\x1b[K\r\n';
  return s + ('\x1b[' + cursorRow + ';' + cursorCol + 'H\x1b[?25h');
}

/** 视口当下显示的那几行 = 换完行列之后它应当重画的那一段（落点）。 */
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

/**
 * 起页签 → 首帧按 rows 排版 → ls 的 41 行落地（历史进滚动缓冲）。
 * 末尾那次长 settle 是新口径带出来的：首帧那一次上报立起一轮整屏重绘（口径 B），而本夹具的 onResize 是个 spy、
 * 不会回那轮字节 → 这一轮只能等上限（ROUND_REPAINT_CAP_MS=250ms）到点才收尾。不收尾，用例里第一次 fireResize
 * 就被这一轮挡在门外（口径 B），后面每一格的账全对不上。真机上那轮重绘几毫秒就回，等的是静默一拍（60ms）。
 */
async function startedWithHistory(rows: number): Promise<{ w: VueWrapper; sink: (d: string) => void; term: Terminal; onResize: ReturnType<typeof vi.fn> }> {
  scripted.proposed = { cols: 175, rows };
  const ctx = await mountReal();
  await settle();
  ctx.sink(initialOutput());
  await settle(320);
  return ctx;
}

/** 缓冲里全部非空行（#35 的症状读数：同一条内容出现两遍） */
function bufferLines(t: Terminal): string[] {
  const b = t.buffer.active;
  return Array.from({ length: b.length }, (_, i) => b.getLine(i)?.translateToString(true).trimEnd() ?? '');
}
function duplicateLines(lines: string[]): string[] {
  const seen = new Map<string, number>();
  for (const l of lines) if (l.trim() !== '') seen.set(l, (seen.get(l) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([l, n]) => l + ' \u00d7' + n);
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

describe('#33 / #35 · 让位：两个方向同一支（xterm 先换行列、尺寸立刻报），一轮整屏重绘落在一个坐标框里', () => {
  it('grow_fits_at_once_and_reports_the_size_and_the_history_stays_put', async () => {
    const { w, term, onResize } = await startedWithHistory(10);
    const before = term.buffer.active.baseY;
    expect(before, '夹具没备好：10 行视口 + 41 行输出，历史应当已进滚动缓冲').toBeGreaterThan(0);

    scripted.proposed = { cols: 175, rows: 30 };
    fireResize();
    // 口径 A：换行列和报尺寸都在这一拍发生，不再按方向分流。
    expect(onResize, '尺寸没在换行列之后立刻报给 PTY').toHaveBeenCalledWith('ql:demo', 175, 30);
    expect(term.rows, '行数变大还在等重绘 = #33 那套换序，已被 #35 取代（ADR 0006）').toBe(30);
    // 历史活着靠的是构造参数 windowsPty（Buffer.ts:180-183：变大 = 在缓冲底下补空行），不是靠换序。
    expect(term.buffer.active.baseY, 'xterm 先长却动了 baseY = 历史被拉进视口，那轮重绘就要把它盖成空行').toBe(before);
    expect(term.buffer.active.getLine(0)?.translateToString(true), '输出头部被让位吃掉了').toBe(CONTENT[0]);
    expect(term.buffer.active.viewportY, '口径 C：换行列之前视口必须先贴回缓冲底部（= 伪控制台那一屏的镜像）').toBe(term.buffer.active.baseY);
    await settle(20);
    w.unmount();
  });

  it('head_of_the_output_survives_the_grow_and_the_last_content_line_is_pinned_to_the_bottom_of_the_canvas', async () => {
    const { w, sink, term, onResize } = await startedWithHistory(10);
    scripted.proposed = { cols: 175, rows: 30 };
    fireResize();
    sink(conptyRepaint(visibleLines(term), 30, 10));   // 报完尺寸它就回那一整轮（真机几毫秒）
    await settle(120);

    const b = term.buffer.active;
    // 历史活着：缓冲第一行仍是 ls 的第一行
    expect(b.getLine(0)?.translateToString(true), '让位把输出头部吃掉了').toBe(CONTENT[0]);
    expect(duplicateLines(bufferLines(term)), '整屏重绘落在旧的坐标框里 = 同一条内容画两遍（#35 的症状）').toEqual([]);
    expect(onResize.mock.calls.filter((c: unknown[]) => c[1] === 175 && c[2] === 30).length, '同一档尺寸在一轮里报了两遍').toBe(1);

    const visible = visibleLines(term);
    const blank = visible.filter((l) => l.trim() === '').length;
    // 画布下缘正是「最后一条还有内容的行」（这里就是提示符那一行），而不是 ConPTY 手里没有的空行
    expect(visible[visible.length - 1], '画布底缘不是最后一条有内容的行').toBe(PROMPT);
    // 画布上的内容比换行列之前多（不是「同样 10 行 + 下面一片空」）
    expect(visible.length - blank, '全屏后画布上的内容没变多').toBeGreaterThan(10);
    // 上缘不能为了把空行压下去而翻出一条空白（#34 那一截空白就是这条钉自己造出来的）
    expect(visible[0].trim(), '钉到画布下缘时在画布上缘造出了空行').not.toBe('');
    await settle(20);
    w.unmount();
  });

  it('a_round_ends_at_the_cap_when_no_repaint_ever_comes_and_the_viewport_is_handed_back', async () => {
    // 上限（250ms）现在的语义是「这一轮的收尾」，不是「换行列」：重绘不会来（进程已退出那类）也得收尾，
    // 否则视口一直钉在镜像上 = 画布下缘停在伪控制台补出来的空行里，#33 那条钉永远不落地。
    const { w, term } = await startedWithHistory(10);
    scripted.proposed = { cols: 175, rows: 30 };
    fireResize();
    expect(term.rows, '换行列不再等这一轮重绘').toBe(30);
    let b = term.buffer.active;
    expect(b.viewportY, '夹具：这一轮在途时视口钉在镜像（缓冲底部）上').toBe(b.baseY);
    expect(b.getLine(b.baseY + term.rows - 1)?.translateToString(true).trimEnd(), '夹具：此刻画布下缘是伪控制台补出来的空行').toBe('');
    await settle(340);                     // > ROUND_REPAINT_CAP_MS
    b = term.buffer.active;
    expect(term.rows, '尺寸不能卡在旧那一档').toBe(30);
    expect(b.viewportY, '重绘不会来时这一轮也要收尾：把视口从镜像上还给画布').toBeLessThan(b.baseY);
    expect(b.getLine(b.viewportY + term.rows - 1)?.translateToString(true).trimEnd(), '收尾后画布下缘仍是最后一条有内容的行').toBe(PROMPT);
    await settle(20);
    w.unmount();
  });

  it('a_bigger_box_while_a_round_is_in_flight_is_chased_after_that_round_ends', async () => {
    // 口径 B 的另一半：在途不收；上限到点收尾，然后按盒子**当下**的尺寸追一轮，而不是停在半途那一档。
    const { w, term, onResize } = await startedWithHistory(10);
    scripted.proposed = { cols: 175, rows: 30 };
    fireResize();
    scripted.proposed = { cols: 175, rows: 44 };
    fireResize();
    expect(term.rows, '一轮在途却换了 xterm 行列').toBe(30);
    expect(onResize.mock.calls.map((c: unknown[]) => c[2]), '一轮在途却报了新尺寸').toEqual([10, 30]);
    await settle(340);
    expect(term.rows, '收尾后没按盒子当下的尺寸追这一格').toBe(44);
    expect(onResize).toHaveBeenLastCalledWith('ql:demo', 175, 44);
    await settle(340);
    await settle(20);
    w.unmount();
  });

  it('shrink_fits_immediately_so_the_repaint_lands_only_on_the_viewport', async () => {
    const { w, sink, term, onResize } = await startedWithHistory(10);
    scripted.proposed = { cols: 175, rows: 30 };
    fireResize();
    sink(conptyRepaint(visibleLines(term), 30, 10));
    await settle(120);
    expect(term.rows).toBe(30);

    // [恢复] = 行数变小：同一支（先换行列再报尺寸）。xterm 先缩 = 历史进滚动缓冲，
    // 它丢掉顶上行之后重复的那几条尾巴由换行列时「光标以下的空行」那一支顺手消掉。
    scripted.proposed = { cols: 175, rows: 10 };
    fireResize();
    expect(term.rows, '行数变小也换了次序 = 让重绘盖掉旧视口的上沿').toBe(10);
    expect(onResize).toHaveBeenLastCalledWith('ql:demo', 175, 10);
    sink(conptyRepaint(visibleLines(term), 10, 10));
    await settle(120);
    const b = term.buffer.active;
    expect(b.getLine(0)?.translateToString(true), '恢复这一步把历史吃掉了').toBe(CONTENT[0]);
    expect(b.baseY, '恢复后历史应当滚得上去（baseY > 0）').toBeGreaterThan(0);
    expect(duplicateLines(bufferLines(term)), '变小这一轮把同一条内容留下了两遍').toEqual([]);
    await settle(20);
    w.unmount();
  });

  it('first_frame_fits_at_once_because_there_is_nothing_to_lose_yet', async () => {
    scripted.proposed = { cols: 175, rows: 30 };
    const { w, term, onResize } = await mountReal();
    // 建页签那一刻缓冲还是空的（80×24 兜底 → 真实尺寸）：这一格照旧立即 fit，F8 / K23(3) 的门不变
    expect(term.rows, '首帧不该等任何一轮（此刻重绘盖不到任何历史）').toBe(30);
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith('ql:demo', 175, 30);
    // 拆之前先让一拍：xterm 5.5.0 的 Viewport 构造里挂了一个「异步再同步一次」的裸 setTimeout
    // （node_modules/@xterm/xterm/src/browser/Viewport.ts:84），它到点读 renderService.dimensions。
    // 真机上页签不可能在同一拍里起又拆；测试要是不让一拍就 unmount，那一拍会落在 dispose 之后 ——
    // 渲染层此时已被拆（_renderer 空）→ 抛「Cannot read properties of undefined (reading 'dimensions')」，
    // 被 vitest 记成一整份文件的未捕获异常（实测：只有这一格会，其余几格拆之前都等过宏任务）。
    await settle(60);
    w.unmount();
  });
});

describe('#33 · 钉住的那一屏什么时候松手', () => {
  it('the_next_output_keeps_the_newest_line_at_the_bottom_of_the_canvas', async () => {
    // #33 那条钉不是只在让位那一刻成立一次：新输出到了要跟着走（流式页签得看见新东西），
    // 且下缘仍是「最后一条还有内容的行」——只 scrollToBottom 的话，让位时补在缓冲底下的那几行空行又回到下缘里，
    // 新输出看着像落在画布中间。
    const { w, sink, term } = await startedWithHistory(10);
    scripted.proposed = { cols: 175, rows: 30 };
    fireResize();
    sink(conptyRepaint(visibleLines(term), 30, 10));
    await settle(120);
    const pinned = term.buffer.active.viewportY;
    expect(pinned, '夹具：让位后应已钉到「最后一条有内容的行」那一屏').toBeLessThan(term.buffer.active.baseY);

    sink('NEW-OUT\x1b[K\r\n' + PROMPT);
    await settle(120);
    const b = term.buffer.active;
    expect(b.viewportY, '有了新输出还钉在旧那一屏 = 流式页签看不见新东西').toBeGreaterThan(pinned);
    expect(b.getLine(b.viewportY + term.rows - 1)?.translateToString(true), '新输出之后画布下缘不是最新那条内容行').toBe(PROMPT);
    expect(visibleLines(term)[0].trim(), '跟着新输出重钉时在画布上缘造出了空行').not.toBe('');
    void pinned;
    await settle(20);
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
    await settle(20);
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
    await settle(20);
    w.unmount();
  });
});
