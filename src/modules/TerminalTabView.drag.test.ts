// @vitest-environment happy-dom
// 真 xterm（本文件**不打桩** @xterm/xterm）+ 一个按实测形状写死的伪控制台模型 —— #35「按住应用顶部边框拖高度，
// 画布不停自动填充重复文本（几乎每一行成对重复）」那组门。
//
// 为什么这样搭（同 TerminalTabView.resize.test.ts / .clear.test.ts 的口径）：#35 的账全在**缓冲与重绘落点**上 ——
// 谁盖了哪一段、同一条内容出现几遍，打桩套件的假终端一个都读不出来。FitAddon 反过来必须打桩（happy-dom 无布局）。
//
// 取证台实测（.temp/fs-clip/bench7.mjs：真 node-pty + 真 pwsh，跑完 ls 之后一格一行连续 resize，
// 读数 .temp/fs-clip/raw7-drag.chunks.json）：
//   ① 换一次行列它就回**一整轮**重绘 = ESC[?25l ESC[H <它手里此刻 newRows 行，行间 ESC[K CRLF> ESC[cursorRow;34H ESC[?25h；
//      它自己不存历史，一轮 750~1650B；
//   ② 窗口**变小 = 从顶上掉行**（贴底，与 xterm 换行列同向）；**变大 = 在底下补空行**（贴顶，与 xterm 反向 ——
//      C_拖大_13 末尾 CUP = ESC[12;34H，新出来的第 13 行就是空行）。
// 于是这条不变式是全部账本：**xterm 缓冲的最后 rows 行 == 伪控制台手里那一屏**（rows = 最近报给它的就是那个行数）。
// 它断一次，那一轮的重绘就把同一批内容在缓冲里留下两份 ⇒ 同一条内容两遍；#33 的钉 + 按方向分流的换序在拖窗口时
// 每一轮踩一次 ⇒ 一路滚雪球。（字节落点是缓冲底缘 ybase，不是视口顶 ydisp：探针实测 ydisp 挪到 14 时
// ESC[H 那一整屏仍画在 baseY=20 那一段上 —— 所以踩断不变式的是「行数在错误的一拍变化」，不是视口停在哪。）
// 下面第一格钉不变式本身（一格一格慢拖），第二格钉用户看得见的那条症状（快速拖一趟 = 不得有任何一行出现两遍），
// 第三格钉「一轮在途不收新尺寸」那条口径。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { Terminal } from '@xterm/xterm';
import TerminalTabView from './TerminalTabView.vue';
import { applyLangLocal } from '../i18n';
import type { TermPaletteId } from '../../src-main/term-palettes';

const COL = 120;
const ROWS0 = 27;
const PROMPT = 'PS C:\\Users\\Gelomen>';
// 每一行内容全局唯一 —— 于是「同一条内容出现两遍」就是可数的账
const OUT = Array.from({ length: 40 }, (_, i) => 'LINE-' + String(i + 1).padStart(2, '0'));

// —— 有脚本的 FitAddon：proposed 由用例逐格改，fit() 走真 term.resize（真 FitAddon 就是这么接线的）
const scripted = { proposed: { cols: COL, rows: ROWS0 }, term: null as Terminal | null };
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    activate(term: Terminal): void { scripted.term = term; }
    dispose(): void { /* noop */ }
    proposeDimensions(): { cols: number; rows: number } { return { ...scripted.proposed }; }
    fit(): void { scripted.term?.resize(scripted.proposed.cols, scripted.proposed.rows); }
  },
}));

vi.mock('../ipc', () => ({ invoke: () => Promise.resolve('') }));

// 假 ResizeObserver：抓住回调，用例里手动「盒子尺寸变了」（鼠标按着边框拖 = 每帧一发）
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

// xterm.write 的解析在稍后的宏任务里跑（组件交出的 sink 不带写回调）→ 写完 / 换完行列都要等一轮定时器
const settle = (ms = 40): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 伪控制台（ConPTY 的 pseudoconsole 模式）手里那一屏：只按 ①② 写死，不懂任何生产代码。 */
class PseudoConsole {
  private win: string[];
  private rows: number;
  /** 播种 = 起页签那一刻的镜像：它手里那一屏正是 xterm 当时视口显示的那几行（它不存历史，只有窗口）。 */
  constructor(rows: number, window: string[]) {
    this.rows = rows;
    this.win = window.slice(-rows);
    while (this.win.length < rows) this.win.unshift('');
  }
  window(): string[] { return this.win.slice(); }
  /** 尺寸没变也要回的那一整轮（真机上换行列之后必然有；夹具播种完补一次，把首帧那轮的账收掉）。 */
  repaint(): string { return this.round(); }
  private round(): string {
    const s = '\x1b[?25l\x1b[H' + this.win.map((line) => line + '\x1b[K').join('\r\n');
    const cursorRow = this.win.reduce((acc, l, i) => (l.trim() === '' ? acc : i + 1), 0) || 1;
    return s + ('\x1b[' + cursorRow + ';34H\x1b[?25h');
  }
  /** 组件把新尺寸报过来 → 它换行列并回一整轮重绘（变小从顶上掉行、变大在底下补空行）。 */
  resize(cols: number, rows: number): string {
    if (cols !== COL) throw new Error('夹具不处理列数变化');
    if (rows === this.rows) return '';
    this.rows = rows;
    if (this.win.length > rows) this.win = this.win.slice(this.win.length - rows);
    while (this.win.length < rows) this.win.push('');
    return this.round();
  }
}

/**
 * 起页签 → 首帧 120×27 → 自动命令 ls 的 40 行落地（历史进滚动缓冲、视口贴在底部）→ 按当时的视口播种伪控制台。
 * 之后每次「盒子变了」的用例只改 scripted.proposed + fireResize()，伪控制台的回包由这里自动喂回 xterm。
 */
async function startedWithLs(): Promise<{ w: VueWrapper; sink: (d: string) => void; term: Terminal; pty: PseudoConsole; reported: number[] }> {
  let pty: PseudoConsole | null = null;
  let sinkRef: ((d: string) => void) | null = null;
  const reported: number[] = [];
  const w = mount(TerminalTabView, {
    props: {
      id: 'ql:demo',
      label: 'Demo',
      fullLabel: 'Demo · PowerShell 7 (pwsh)',
      running: true,
      stopping: false,
      restartDisabled: false,
      palette: 'paper' as TermPaletteId,
      register: (_id: string, cb: (d: string) => void) => { sinkRef = cb; },
      unregister: () => { /* noop */ },
      onInput: () => { /* noop */ },
      onResize: (_id: string, cols: number, rows: number) => {
        reported.push(rows);
        if (!pty) return;                       // 建页签那次首帧上报：那一刻还没有「它手里那一屏」可对照
        const bytes = pty.resize(cols, rows);
        // 真机上这轮字节要几毫秒才回来（不是同一拍）：这里照先后延迟喂，「一轮在途」那段窗口才是真的。
        if (bytes) setTimeout(() => sinkRef!(bytes), 8);
      },
    },
    attachTo: document.body,
  });
  await flushPromises();
  if (!sinkRef) throw new Error('组件未在挂载时 register 输出 sink');
  if (!scripted.term) throw new Error('FitAddon 没被 activate，拿不到终端实例');
  const sink = sinkRef as (d: string) => void;
  sink('\x1b[?25l\x1b[2J\x1b[m\x1b[H' + PROMPT + ' ls\x1b[?25h');
  await settle();
  sink(OUT.map((l) => l + '\x1b[K\r\n').join('') + '\x1b[H' + PROMPT);
  await settle();
  const term = scripted.term;
  pty = new PseudoConsole(term.rows, viewportLines(term));
  sink(pty.repaint());   // 真机：换完行列它必然回一整轮。补上这一轮，首帧上报那条在途的账才会在静默一拍后收尾
  await settle(120);
  return { w, sink, term, pty, reported };
}

function bufferLines(t: Terminal): string[] {
  const b = t.buffer.active;
  return Array.from({ length: b.length }, (_, i) => b.getLine(i)?.translateToString(true).trimEnd() ?? '');
}
/** xterm 视口当下显示的那几行（播种伪控制台用 = 起页签那一刻它就是镜像）。 */
function viewportLines(t: Terminal): string[] {
  const b = t.buffer.active;
  return Array.from({ length: t.rows }, (_, i) => b.getLine(b.viewportY + i)?.translateToString(true).trimEnd() ?? '');
}
/** 缓冲的**最后 rows 行** = 伪控制台换完行列之后那一屏应当落的位置。 */
function lastRowsLines(t: Terminal, rows: number): string[] {
  const b = t.buffer.active;
  const start = Math.max(0, b.length - rows);
  return Array.from({ length: b.length - start }, (_, i) => b.getLine(start + i)?.translateToString(true).trimEnd() ?? '');
}
/** 不变式的读数：缓冲最后 rows 行与那一屏逐行比，交回对不上的行号。 */
function mirrorDrift(t: Terminal, pty: PseudoConsole, rows: number): number[] {
  const buf = lastRowsLines(t, rows);
  const win = pty.window();
  const n = Math.max(buf.length, win.length);
  const drift: number[] = [];
  for (let i = 0; i < n; i++) if ((buf[i] ?? '') !== (win[i] ?? '')) drift.push(i);
  return drift;
}
/** 同一条非空内容多出现了几次（夹具里每一行本来就全局唯一） */
function duplicateLines(lines: string[]): string[] {
  const seen = new Map<string, number>();
  for (const l of lines) if (l.trim() !== '') seen.set(l, (seen.get(l) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([l, n]) => l + ' \u00d7' + n);
}

beforeEach(() => {
  applyLangLocal('zh');
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  setProtoBox(1150, 700);
  scripted.proposed = { cols: COL, rows: ROWS0 };
  scripted.term = null;
  observers.length = 0;
});
afterEach(() => {
  globalThis.ResizeObserver = realResizeObserver;
  document.body.innerHTML = '';
});

describe('#35 · 拖窗口高度 = 一串换行列：一次只让一轮整屏重绘落在一个坐标框里', () => {
  it('every_resize_round_keeps_the_buffer_bottom_equal_to_the_pseudoconsole_window', async () => {
    // 不变式门：一格一格慢拖（每格之间够一轮落地），每一格之后「缓冲最后 rows 行 == 它手里那一屏」都得成立。
    const { w, term, pty } = await startedWithLs();
    expect(term.rows, '夹具：起页签按 120×27 排版').toBe(ROWS0);
    expect(mirrorDrift(term, pty, ROWS0), '夹具：起页签那一刻镜像就该在位').toEqual([]);

    for (const rows of [22, 17, 12, 8, 14, 21, 27]) {
      scripted.proposed = { cols: COL, rows };
      fireResize();
      await settle(140);
      expect(term.rows, '第 ' + rows + ' 行档没追平盒子').toBe(rows);
      const drift = mirrorDrift(term, pty, rows);
      expect(drift, '换到 ' + rows + ' 行之后，缓冲最后 ' + rows + ' 行不再是伪控制台那一屏（对不上的是第 ' + drift.join(',') + ' 行）').toEqual([]);
    }
    const dups = duplicateLines(bufferLines(term));
    expect(dups, '镜像在位却仍重复：' + dups.slice(0, 4).join(' / ')).toEqual([]);
    await settle(20);   // 拆终端前先让一拍宏任务（ledger 里那条真 xterm 硬口径）
    w.unmount();
  });

  it('dragging_the_height_up_and_down_leaves_every_line_exactly_once_in_the_buffer', async () => {
    // 用户看得见的那条：按住顶部边框上下拖一趟（每 15ms 一格 = 一轮还没落地下一格就到了），
    // 画布里不得出现「同一行两遍」，且最后必须追平盒子、下缘仍是最后一条有内容的行。
    const { w, term, pty, reported } = await startedWithLs();
    // 按住边框往下拖 15 格（26→12）再往上拖 15 格（13→27）：每格只隔 15ms，比一轮重绘落地还快
    const steps = [...Array.from({ length: ROWS0 - 12 }, (_, i) => ROWS0 - 1 - i), ...Array.from({ length: ROWS0 - 12 }, (_, i) => 12 + 1 + i)];
    for (const rows of steps) {
      scripted.proposed = { cols: COL, rows };
      fireResize();
      await settle(15);
    }
    await settle(500);   // 松手：链子把剩下的格子追平
    expect(term.rows, '拖完没追平最终行数').toBe(ROWS0);
    expect(reported[reported.length - 1], '报给 PTY 的最后一次尺寸不是盒子当下那一档').toBe(ROWS0);
    expect(mirrorDrift(term, pty, ROWS0), '拖一趟之后镜像对不上（下一轮重绘就要重复一条）').toEqual([]);
    const dups = duplicateLines(bufferLines(term));
    expect(dups, '拖一次高度就把同一条内容画了两遍（重绘落在旧的坐标框里漂移）：' + dups.slice(0, 6).join(' / ')).toEqual([]);
    const b = term.buffer.active;
    const lastVisible = b.getLine(b.viewportY + term.rows - 1)?.translateToString(true).trimEnd() ?? '';
    expect(lastVisible.trim(), '画布下缘不是有内容的行（#33 那条钉被这一串换行列冲掉了）').not.toBe('');
    await settle(20);
    w.unmount();
  });

  it('a_scroll_by_the_user_while_a_round_is_in_flight_does_not_move_the_repaint_landing', async () => {
    // 一只手按着边框拖、另一只手在画布上滚轮 = 一轮在途时视口被人挪走。这一轮结束要把**他那一行**还回去
    // （口径 C：贴底只借这一轮的时长），所以轮内在途时用户挪到哪一行必须由 onScroll 记进这一轮的账 ——
    // 少了那条记账，轮末只会按「我们自己钉的」重钉画布下缘，他翻的历史被悄悄换掉。
    // 同时这一格钉住不变式没被这一挪踩断（字节落点归缓冲底缘，与视口停在哪无关）。
    const { w, term, pty } = await startedWithLs();
    scripted.proposed = { cols: COL, rows: 40 };   // 变大 = 它在底下补 13 行空行 ⇒ 这一屏里「最后一条有内容的行」远在 baseY 之上，轮末那条钉的落点也在 baseY 之上
    fireResize();                          // 换行列 + 报尺寸在这一拍；那轮重绘在路上（夹具延迟 8ms 喂）
    await settle(4);
    term.scrollLines(-3);                  // 用户在这一轮里自己划上去（只划上去几行 = 比那条钉的落点更靠下）
    const mine = term.buffer.active.viewportY;
    expect(mine, '夹具：划上去没生效').toBeLessThan(term.buffer.active.baseY);
    await settle(140);                     // 那一段字节落在这一刻
    const drift = mirrorDrift(term, pty, 40);
    expect(drift, '用户在轮内翻了历史，这一轮的链子却把镜像挪了位（对不上的是第 ' + drift.join(',') + ' 行）').toEqual([]);
    const dups = duplicateLines(bufferLines(term));
    expect(dups, '一轮在途时用户翻了历史，那轮重绘就把同一条内容留下两遍：' + dups.slice(0, 4).join(' / ')).toEqual([]);
    expect(term.buffer.active.viewportY, '轮末没把用户那一行原样还回去').toBe(mine);
    await settle(20);
    w.unmount();
  });

  it('a_second_box_change_while_the_reported_round_has_not_landed_is_chased_not_reported', async () => {
    // 口径 B：一轮在途（尺寸已报、那轮整屏重绘未落地）= 此刻的坐标框已经不新鲜，新尺寸既不收、也不换 xterm 行列 ——
    // 否则两轮重绘落在同一个旧框里，第二轮把第一轮的落点顶下去一行 ⇒ 每条内容两遍（#35 用户贴的就是这个形状）。
    // 这一格的第一拍是合法的：那一刻没有在途的一轮。真正要钉的是后面两拍。
    const { w, term, reported } = await startedWithLs();
    expect(term.buffer.active.baseY, '夹具：没有滚动缓冲就走不到这一支').toBeGreaterThan(0);
    const from = reported.length;
    scripted.proposed = { cols: COL, rows: 33 };
    fireResize();
    scripted.proposed = { cols: COL, rows: 44 };
    fireResize();
    scripted.proposed = { cols: COL, rows: 55 };
    fireResize();
    expect(reported.slice(from), '一轮在途却连着报了新尺寸').toEqual([33]);
    expect(term.rows, '一轮在途却换了 xterm 行列 = 下一轮重绘会落在半途的旧坐标框里').toBe(33);
    await settle(160);                  // 33 那一轮的重绘落地 + 静默一拍 = 收尾
    expect(reported.slice(from), '收尾之后没按盒子当下的尺寸追下一轮').toEqual([33, 55]);
    expect(term.rows, '追的那一轮没换行列').toBe(55);
    await settle(160);
    await settle(20);
    w.unmount();
  });
});
