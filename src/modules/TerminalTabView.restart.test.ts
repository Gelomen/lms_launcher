// @vitest-environment happy-dom
// #37「[快捷启动] 终端：[停止] → [重新启动] 之后，画布上仍是重启前跑过的命令」—— 真 xterm + 写死的伪控制台读数（本文件**不打桩** @xterm/xterm）。
//
// 为什么这里要用真 xterm（同 clear.test.ts / resize.test.ts / search.test.ts 的口径）：这一拍的账全在**缓冲的行号**上 ——
// 旧会话那一屏占哪几行、新会话的 home 落在哪一行、每一趟重启在缓冲里添了哪一段。打桩套件的假终端只记得
// 「clear 被调了几次」，画不出这个形态。
//
// 取证台实测（真 @lydell/node-pty **连续两次**新建 PTY = 重启那一拍的对侧，与 spawnShell 同参 120×27；
//   .temp/restart-clear/probe1.mjs / probe2.mjs，读数跑完即弃、不入库）：
//   · 四款终端（pwsh / powershell / cmd / wsl）新建 PTY 的第一块都是同一段 **16B 纯转义序列** `ESC[?9001h ESC[?1004h`
//     （t = 310 / 46 / 40 / 45ms，与 #36 那条读数同一来源）；
//   · 第二段起是 `ESC[?25l ESC[2J ESC[m ESC[H` + 横幅 + 提示符。powershell 那一趟整趟 4 块 / 184B：16B → 173B → 21B 提示符 → 退出时 16B；
//   · **有 ESC[2J、没有 ESC[3J、没有切备用屏**：新会话只重画它自己那一屏，它既不知道、也没有能力删客户端的滚动历史。
// 客户端那一侧的库读数（@xterm/xterm 5.5.0，读源码核对）：`InputHandler.eraseInDisplay` 的 case 2 只走
//   `_resetBufferLine(j)`（j = 0..rows-1），而 `_resetBufferLine(y)` 取的是 `lines.get(**ybase** + y)`
//   ⇒ `ESC[2J` 抹的是「视口那 rows 行」，视口之上的历史**一条不动**；真删历史的是 case 3（`ESC[3J`），新会话从不发这一条。
// 再加尺寸那一拍：主进程把 PTY 重建为 80×24，App 的 fit(true) 立刻强制重报 120×27（索引 K11(2)）→ 伪控制台换完行列回一轮
//   **整屏重绘**（此刻它手里那一屏还是空的 = 一整屏 ESC[K + CRLF，落点在缓冲底缘）→ 缓冲底缘就此被顶下去一整屏。
// ⇒ 每重启一次，缓冲里就多**一段**新会话的屏（横幅 + 提示符 + 配置命令的回显），上一段既不抹也不删 = 用户贴的那一串 `PS …> ls`。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { Terminal } from '@xterm/xterm';
import TerminalTabView from './TerminalTabView.vue';
import { applyLangLocal } from '../i18n';
import type { TermPaletteId } from '../../src-main/term-palettes';

// xterm 的 reset() 会补一发**焦点报告**字节（browser/Terminal.ts:295 / :1283：开着 ESC[?1004h 时进出焦点发 ESC[I / ESC[O）——
// 它不是「清画布」主动写的，也不该由组件去拦：清画布那一拍对侧没有进程，App 的 terminalWritable（App.vue）必然把它挡在 IPC 之前。
// 「这一拍没有任何字节进 PTY」那条门因此落在 App.test.ts（清画布不发一次 ql_write）。这里只钉：除了这一发焦点报告，别的字节一条没有。
const FOCUS_REPORT = '\x1b[O';
const otherBytes = (bytes: string[]): string[] => bytes.filter((b) => b !== FOCUS_REPORT);

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

class FakeResizeObserver {
  constructor(_cb: () => void) {}
  observe(): void {} unobserve(): void {} disconnect(): void {}
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
const PROMPT = 'PS C:\\Users\\Gelomen> ';
/** powershell 新会话的横幅（probe2 逐字读数） */
const BANNER = '无法加载 PSReadline 模块。控制台在未使用 PSReadLine 的情况下运行。';

/**
 * 新会话的第一段（起页签与重启后**逐字相同** —— 对侧都是全新的伪控制台）：
 * 16B 纯转义序列 → `ESC[2J` + home + 横幅 → 提示符。没有 `ESC[3J`，也没有整屏重绘。
 */
const conptyBoot = (): string =>
  '\x1b[?9001h\x1b[?1004h'
  + '\x1b[?25l\x1b[2J\x1b[m\x1b[H' + BANNER + '\r\n'
  + '\x1b]0;C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\x07\x1b[?25h'
  + PROMPT;

/** 配置命令 ls 跑完（回显 + 输出 + 再打一次提示符）。tag 让每一趟的输出行只属于那一趟 */
const conptyRunLs = (tag: string): string => {
  const lines = [
    '    目录: C:\\Users\\Gelomen',
    '',
    'Mode                 LastWriteTime         Length Name',
    '----                 -------------         ------ ----',
    ...Array.from({ length: 20 }, (_, i) => 'd-----          2026-10-27    00:31                ' + tag + '-dir-' + String(i + 1).padStart(2, '0')),
  ];
  let s = '\x1b[?25l' + 'ls' + '\r\n\x1b[m\r\n';
  for (const l of lines) s += l + '\r\n';
  s += '\r\n' + PROMPT.trimEnd() + '\x1b[1C\x1b[?25h';
  return s;
};

/**
 * 伪控制台换完行列之后回的整屏重绘（形状照 #35 / resize.test.ts 的实测读数）：从 home 起把它的每一行画一遍，
 * 它手里没有的行就是 `ESC[K` + CRLF，末尾把光标放回第 1 行。重启那一拍 = 新 PTY（80×24）刚被重报成 120×27，
 * 此刻它手里那一屏还是空的 → 这一轮就是一整屏空行，把缓冲底缘往下顶一整屏。
 */
function conptyRepaintBlank(rows: number): string {
  let s = '\x1b[?25l\x1b[H';
  for (let i = 0; i < rows; i++) s += '\x1b[K\r\n';
  return s + '\x1b[1;1H\x1b[?25h';
}

async function mountReal(onInput: (id: string, data: string) => void): Promise<{ w: VueWrapper; sink: (d: string) => void; term: Terminal }> {
  let sink: ((d: string) => void) | null = null;
  const w = mount(TerminalTabView, {
    props: {
      id: 'ql:demo',
      label: 'Demo',
      fullLabel: 'Demo · PowerShell (powershell)',
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

/** 组件 expose 出来的那几面（App 经 terminalViews 用的就是同一份 handle）：本文件只碰 clearForRestart */
function viewHandle(w: VueWrapper): { fit: (force?: boolean) => void; focus: () => void; clearForRestart: () => void } {
  return w.vm as unknown as { fit: (force?: boolean) => void; focus: () => void; clearForRestart: () => void };
}

/** 起一趟会话 = 伪控制台发它的 boot + 配置命令 ls */
async function runSession(sink: (d: string) => void, tag: string): Promise<void> {
  sink(conptyBoot());
  await settle();
  sink(conptyRunLs(tag));
  await settle();
}

/**
 * 重启一趟 = 上一趟已停 → [重新启动] → 新 PTY：先一轮整屏重绘（尺寸那一拍，App 的 fit(true) 强制重报带出来的）
 * → 新会话的 boot → 它的配置命令。整屏重绘那一轮不喂进来，后面每一格的账都对不上（同 resize.test.ts 的夹具口径）。
 */
async function restartSession(sink: (d: string) => void, tag: string): Promise<void> {
  sink(conptyRepaintBlank(ROWS));
  await settle();
  await runSession(sink, tag);
}

/** 画布上那一屏（视口内的行，去掉行尾空白） */
function visible(term: Terminal): string[] {
  const b = term.buffer.active;
  return Array.from({ length: term.rows }, (_, i) => b.getLine(b.viewportY + i)?.translateToString(true).trimEnd() ?? '');
}

/** 整块缓冲（含视口之上的滚动历史）里非空的行 */
function bufferContent(term: Terminal): string[] {
  const b = term.buffer.active;
  const out: string[] = [];
  for (let i = 0; i < b.length; i++) {
    const t = b.getLine(i)?.translateToString(true).trimEnd() ?? '';
    if (t.trim() !== '') out.push(t);
  }
  return out;
}

const countLines = (lines: string[], prefix: string): number => lines.filter((l) => l.startsWith(prefix)).length;
/** 用户贴的那一串：一行提示符 + 一行 `ls` 回显 = 「重启前运行过的命令」 */
const promptEchoes = (lines: string[]): number => lines.filter((l) => l === PROMPT + 'ls' || l === PROMPT + ' ls').length;

const sent: string[] = [];
const collectInput = (_id: string, data: string): void => { sent.push(data); };

beforeEach(() => {
  applyLangLocal('zh');
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  setProtoBox(1150, 300);
  scripted.term = null;
  sent.length = 0;
});
afterEach(() => {
  globalThis.ResizeObserver = realResizeObserver;
  document.body.innerHTML = '';
});

describe('#37 · 机理：不清画布时，每一趟重启是怎么在缓冲里叠一段的', () => {
  it('every_restart_adds_a_whole_new_screen_below_the_previous_one', async () => {
    const { sink, term } = await mountReal(collectInput);
    await settle();
    await runSession(sink, 'A');                      // 起页签 → 配置命令 ls（20 行输出，足够把 27 行的窗口顶到底）
    expect(term.buffer.active.baseY, '这一趟没造出滚动历史，机理格白跑').toBeGreaterThan(0);

    await restartSession(sink, 'B');                  // [停止] → [重新启动]
    await restartSession(sink, 'C');

    const all = bufferContent(term);
    // 用户贴的那一串：三趟各自的「提示符 + ls」一行不落地震在缓冲里
    expect(promptEchoes(all), '缓冲里叠了几趟的命令行（机理与写死的读数不一致）').toBe(3);
    expect(countLines(all, BANNER), '缓冲里叠了几趟的横幅').toBe(3);
    // 新会话的 home 已经不在画布第一条：它落在缓冲底缘，前一趟的屏压在画布上面
    expect(bufferContent(term)[0], '新会话从画布第一条起画 = 两边还在同一个坐标框里，机理格白跑').toBe(BANNER);
    expect(visible(term)[0].trim(), '画布第一条已经是新会话的东西 = 这一趟没有叠上去').not.toBe(BANNER);
    expect(term.buffer.active.baseY, '缓冲底缘没被顶下去（整屏重绘那一轮没落地）').toBeGreaterThan(0);
  });
});

describe('#37 · 修：重新启动前客户端整块换新（缓冲 + 滚动历史一并清），对侧不用动', () => {
  it('restart_wipes_the_canvas_so_the_new_session_is_the_only_thing_left', async () => {
    const { w, sink, term } = await mountReal(collectInput);
    await settle();
    await runSession(sink, 'A');
    await runSession(sink, 'B');
    expect(promptEchoes(bufferContent(term)), '夹具没叠出两趟').toBe(2);

    // 重新启动前：App 经 expose 调这一句（App.vue doQlStart 在 invoke('ql_start') **之前**）
    viewHandle(w).clearForRestart();
    await settle();
    expect(term.buffer.active.baseY, '滚动历史没删干净').toBe(0);
    expect(bufferContent(term).length, '清完画布还剩内容').toBe(0);
    // 这一拍不往 PTY 写一个字节：对侧即将是全新的伪控制台，它的行号本来就在窗口第 1 行
    // （与 #34 的 Ctrl+L 分别是两回事：那一拍对面是同一个 shell，这一拍不是）
    expect(otherBytes(sent), '清画布这一拍往 PTY 发了焦点报告之外的字节').toEqual([]);

    await restartSession(sink, 'C');
    const all = bufferContent(term);
    expect(promptEchoes(all), '画布上还留着别的趟的命令行').toBe(1);
    expect(countLines(all, BANNER), '画布上还留着别的趟的横幅').toBe(1);
    expect(all.some((l) => l.includes('A-dir-') || l.includes('B-dir-')), '旧会话的输出还在缓冲里').toBe(false);
    // 新会话那一屏的第一行 = 缓冲的第一行 = 画布的第一行：两边同一个坐标框
    expect(all[0], '新会话没从缓冲第一行起画（坐标框还没对上）').toBe(BANNER);
  });

  it('the_clean_up_touches_the_client_only_and_the_tab_keeps_working', async () => {
    const { w, sink, term } = await mountReal(collectInput);
    await settle();
    await runSession(sink, 'A');
    viewHandle(w).clearForRestart();
    await settle();
    // ADR 0005 那条「别把清屏转义喂给 PTY」在这一拍同样成立，而且连 Ctrl+L 都不发
    expect(otherBytes(sent), '清画布这一拍往 PTY 发了焦点报告之外的字节').toEqual([]);
    expect(term.buffer.active.baseY).toBe(0);
    // 清完照常能用：下一趟的输出进得来，配置命令也还在同一颗按钮那趟里跑
    await runSession(sink, 'B');
    expect(visible(term).some((l) => l.includes('B-dir-20')), '清完之后新输出进不来').toBe(true);
    expect(promptEchoes(bufferContent(term))).toBe(1);
  });

  // 负对偶：清画布 ≠ 停进程。这一拍只碰客户端，PTY 的字节一条不发，也不动页签
  it('the_clean_up_is_not_a_stop_and_not_a_write', async () => {
    const { w, sink, term } = await mountReal(collectInput);
    await settle();
    await runSession(sink, 'A');
    viewHandle(w).clearForRestart();
    await settle();
    viewHandle(w).clearForRestart();                  // 连点两次（在途重复点）= 幂等
    await settle();
    expect(otherBytes(sent), '清画布这一拍往 PTY 发了焦点报告之外的字节').toEqual([]);
    expect(bufferContent(term).length).toBe(0);
    expect(term.rows, '清画布顺手换了行列').toBe(ROWS);
    expect(term.cols, '清画布顺手换了列').toBe(120);
  });
});
