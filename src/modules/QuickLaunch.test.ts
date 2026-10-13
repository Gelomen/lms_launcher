// @vitest-environment happy-dom
// 组件测试：QuickLaunch 卡片（2026-10-10-quick-launch-card 任务 11）
// 判据：docs/superpowers/checks/2026-10-10-quick-launch-card/task-11-quick-launch-card.md E1-E7
// 数据流（check C1/C3/C4）：列表由卡片自己 invoke('ql_list')，运行态由 App 经 states 下发；
// 卡片不订阅 ql-data / ql-exit —— 下面的 mock 只提供 invoke，一旦引入订阅就会 TypeError（C4 的被动守卫）。
import { describe, it, expect } from 'vitest';
import { mount, flushPromises as flush } from '@vue/test-utils';
import fs from 'fs';
import path from 'path';
import QuickLaunch from './QuickLaunch.vue';
import { t, applyLangLocal } from '../i18n';
import type { QuickLaunchEntry, QuickLaunchList } from '../src-main/quick-launch-config';

type States = Record<string, { running: boolean; stopping: boolean }>;
interface SaveCall { id: unknown; entry: QuickLaunchEntry }

const SHELL: QuickLaunchEntry = { name: 'webui', type: 'shell', shell: 'pwsh', cmd: 'python -m webui' };
const entry = (name: string): QuickLaunchEntry => ({ ...SHELL, name });

// 孤立代理项检测（E3）：截断点若落在代理对中间，就会出现半个码点
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;

function mockLms(list: QuickLaunchList, opts: { newId?: string; saves?: SaveCall[] } = {}): void {
  const newId = opts.newId ?? 'qlnew0001';
  const saves = opts.saves;
  (window as any).lms = {
    invoke: (cmd: string, ...args: unknown[]) => {
      if (cmd === 'ql_list') return Promise.resolve(JSON.parse(JSON.stringify(list)));
      if (cmd === 'ql_save') {
        if (saves) saves.push({ id: args[0], entry: args[1] as QuickLaunchEntry });
        return Promise.resolve(newId); // 主进程契约：返回最终 id（main.ts:1095）
      }
      return Promise.resolve(null);
    },
  };
}

function mountCard(list: QuickLaunchList, states: States = {}, opts: { newId?: string; saves?: SaveCall[] } = {}) {
  mockLms(list, opts);
  return mount(QuickLaunch, { props: { states } });
}

type Row = { findAll: (s: string) => { attributes: (n: string) => string | undefined; trigger: (e: string) => Promise<void> }[] };
const buttonWithTip = (row: Row, tip: string) =>
  row.findAll('button').find((b) => b.attributes('data-tooltip') === tip)!;

describe('QuickLaunch card', () => {
  // E1（计划 步骤 1）：空列表 → 空态文案；F4：标题 + 新建图标按钮
  it('empty_list_renders_empty_state_text', async () => {
    const w = mountCard({ items: {}, invalid: [] });
    await flush();

    expect(w.text()).toContain(t('ql.title'));
    expect(w.text()).toContain(t('ql.empty.none'));
    expect(w.findAll('.tpl-row').length).toBe(0);

    // 新建按钮：icon-btn--sm + 文案 ql.btn.new（faFileCirclePlus 在按钮内，规格 §4）
    const newBtn = w.findAll('button').find((b) => b.attributes('data-tooltip') === t('ql.btn.new'));
    expect(newBtn).toBeDefined();
    expect(newBtn!.classes()).toEqual(expect.arrayContaining(['icon-btn', 'icon-btn--sm']));
    expect(newBtn!.attributes('aria-label')).toBe(t('ql.btn.new'));
    w.unmount();
  });

  // E2（规格 §11-1）：列表行按视觉宽度预算 30 截断，真截断才挂 data-tooltip 全名
  it('row_name_is_truncated_to_budget_30_and_long_name_carries_full_tooltip', async () => {
    const latin = 'llama-cpp-large-model-quant-config-xx'; // 35 拉丁 → 宽 35 > 30+2
    const cjk = '这是一个用来验证列表行按视觉宽度截断的很长的中文启动项名字'; // 24 汉字 → 宽 48
    const exact = 'abcdefghij1234567890abcdefghij'; // 恰 30 → 不截断、无 tooltip
    const w = mountCard({ items: { a: entry(latin), b: entry(cjk), c: entry(exact) }, invalid: [] });
    await flush();

    const labels = w.findAll('.tpl-row__id');
    expect(labels.length).toBe(3);
    // 拉丁宽 1：前 30 字符 + …(U+2026)
    expect(labels[0].text()).toBe(latin.slice(0, 30) + '…');
    expect(labels[0].attributes('data-tooltip')).toBe(latin);
    // 汉字宽 2：预算 30 → 前 15 字 + …
    expect(labels[1].text()).toBe(cjk.slice(0, 15) + '…');
    expect(labels[1].attributes('data-tooltip')).toBe(cjk);
    // 预算内（含 grace=2）：全名渲染、不挂 tooltip（与 LaunchBar.vue:93 同口径）
    expect(labels[2].text()).toBe(exact);
    expect(labels[2].attributes('data-tooltip')).toBeUndefined();
    w.unmount();
  });

  // E3（计划 步骤 1）：emoji（代理对）超长时截断不切断码点——truncateByWidth 按码点走，此用例钉桩
  it('emoji_long_name_is_not_split_at_surrogate_pair', async () => {
    const emoji = '🚀'.repeat(40); // 40 个码点，每个宽 1 → 40 > 32
    const w = mountCard({ items: { a: entry(emoji) }, invalid: [] });
    await flush();

    const label = w.findAll('.tpl-row__id')[0];
    const shown = label.text();
    expect(shown).toBe('🚀'.repeat(30) + '…');
    expect(LONE_SURROGATE.test(shown)).toBe(false);
    expect(label.attributes('data-tooltip')).toBe(emoji);
    w.unmount();
  });

  // E4（规格 §9.4）：未运行 = 紫底「启动」；运行中 = 红底「停止」；stopping = 半角三点 `...` 且禁用（索引 K30）。
  // 运行态只来自 props.states（C1），卡片自己不持进程状态。
  it('start_stop_button_three_states_by_states_prop', async () => {
    const w = mountCard(
      { items: { idle: entry('idle-item'), busy: entry('busy-item'), halting: entry('halting-item') }, invalid: [] },
      { busy: { running: true, stopping: false }, halting: { running: true, stopping: true } },
    );
    await flush();

    const rows = w.findAll('.tpl-row');
    expect(rows.length).toBe(3);
    const stateBtn = (i: number) => rows[i].findAll('.tpl-row__actions button')[2];

    // 未运行（states 里没有该 id 也算未运行）：btn-launch（紫）+ 文案「启动」，可点
    expect(stateBtn(0).classes()).toEqual(expect.arrayContaining(['btn', 'btn-launch']));
    expect(stateBtn(0).classes()).not.toContain('btn-danger');
    expect(stateBtn(0).attributes('data-tooltip')).toBe(t('ql.btn.start'));
    expect(stateBtn(0).attributes('aria-label')).toBe(t('ql.btn.start'));
    expect(stateBtn(0).attributes('disabled')).toBeUndefined();
    // 运行中：btn-danger（红）+ 文案「停止」
    expect(stateBtn(1).classes()).toEqual(expect.arrayContaining(['btn', 'btn-danger']));
    expect(stateBtn(1).classes()).not.toContain('btn-launch');
    expect(stateBtn(1).attributes('data-tooltip')).toBe(t('ql.btn.stop'));
    expect(stateBtn(1).attributes('disabled')).toBeUndefined();
    // stopping：半角三点 `...` 且禁用（与 LaunchBar.vue:129 逐字一致，索引 K30）
    expect(stateBtn(2).text()).toBe('...');
    expect(stateBtn(2).attributes('disabled')).toBeDefined();

    // 点击（check C2 的 emits）：未运行 → start(id)；运行中 → stop(id)；stopping → 不冒泡
    await stateBtn(0).trigger('click');
    await stateBtn(1).trigger('click');
    await stateBtn(2).trigger('click');
    expect(w.emitted('start')).toEqual([['idle']]);
    expect(w.emitted('stop')).toEqual([['busy']]);
    w.unmount();
  });

  // E5（索引 K28(1)）：复制的名字来自 nextCopyName；新行只在**卡片本地显示序**里紧跟源行，
  // 落盘走 ql_save(null, entry) 的追加语义（quick-launch-config.ts:137-139），没有 insert-after 通道。
  it('copy_uses_nextCopyName_and_inserts_locally_right_after_source', async () => {
    const saves: SaveCall[] = [];
    const w = mountCard({ items: { a: entry('webui'), b: entry('other') }, invalid: [] }, {}, { saves, newId: 'qlcopy01' });
    await flush();

    await buttonWithTip(w.findAll('.tpl-row')[0], t('ql.btn.copy')).trigger('click');
    await flush();

    // 落盘：id = null（新 id 由主进程生成），entry 除 name 外原样复制，name = nextCopyName → "X - copy"
    expect(saves.length).toBe(1);
    expect(saves[0].id).toBeNull();
    expect(saves[0].entry).toEqual({ name: 'webui - copy', type: 'shell', shell: 'pwsh', cmd: 'python -m webui' });
    // 本地显示序：a → 新行 → b（源行正后方），并冒泡 changed
    expect(w.findAll('.tpl-row .tpl-row__id').map((l) => l.text())).toEqual(['webui', 'webui - copy', 'other']);
    expect(w.emitted('changed')).toEqual([[]]);
    w.unmount();

    // 重名：nextCopyName 递增编号 → "webui - copy 2"（不自己拼后缀就不会滚成 copy - copy）
    const saves2: SaveCall[] = [];
    const w2 = mountCard(
      { items: { a: entry('webui'), b: entry('webui - copy') }, invalid: [] },
      {},
      { saves: saves2, newId: 'qlcopy02' },
    );
    await flush();
    await buttonWithTip(w2.findAll('.tpl-row')[0], t('ql.btn.copy')).trigger('click');
    await flush();
    expect(saves2[0].entry.name).toBe('webui - copy 2');
    expect(w2.findAll('.tpl-row .tpl-row__id').map((l) => l.text())).toEqual(['webui', 'webui - copy 2', 'webui - copy']);
    w2.unmount();
  });

  // E6（规格 §5.2）：invalid 非空 → 顶部「N 条配置无效」提示；无效 id 不渲染行。
  // 顺带钉索引 M2 / K28(2)：en 侧改成 invalid entries skipped: 后 n=1 语法成立。
  it('invalid_ids_render_count_hint', async () => {
    const w = mountCard({ items: { a: entry('ok-item') }, invalid: ['qlbad001', 'qlbad002'] });
    await flush();
    try {
      expect(w.text()).toContain(t('ql.invalid', { n: 2 }));
      expect(w.text()).toContain('2 条配置无效');
      expect(w.findAll('.tpl-row').length).toBe(1); // 无效 id 不进列表

      applyLangLocal('en');
      await flush();
      expect(w.text()).toContain('invalid entries skipped: 2');
      expect(w.findAll('.tpl-row').length).toBe(1);
    } finally {
      applyLangLocal('zh');
    }
    await flush();
    w.unmount();

    // n=1：原句 "{n} invalid entries skipped" 在单数时语法不成立（索引 M2）
    const w1 = mountCard({ items: {}, invalid: ['qlbad001'] });
    await flush();
    try {
      applyLangLocal('en');
      await flush();
      expect(w1.text()).toContain('invalid entries skipped: 1');
      expect(w1.text()).toContain(t('ql.empty.none')); // 全无效 → 列表仍是空态
    } finally {
      applyLangLocal('zh');
    }
    await flush();
    w1.unmount();
  });

  // E7（规格 §4）：每行按钮顺序 = [复制][编辑][启动/停止]
  it('row_action_buttons_order_is_copy_edit_start_stop', async () => {
    const w = mountCard({ items: { a: entry('webui') }, invalid: [] }, { a: { running: true, stopping: false } });
    await flush();

    const row = w.findAll('.tpl-row')[0];
    const btns = row.findAll('button');
    expect(btns.length).toBe(3); // 行内只有这三个（新建按钮在标题行）
    expect(btns.map((b) => b.attributes('data-tooltip'))).toEqual([t('ql.btn.copy'), t('ql.btn.edit'), t('ql.btn.stop')]);
    // 前两个复用模板卡的图标按钮类，第三个复用 LaunchBar 的状态按钮类（F1/F2）
    expect(btns[0].classes()).toEqual(expect.arrayContaining(['icon-btn', 'icon-btn--sm']));
    expect(btns[1].classes()).toEqual(expect.arrayContaining(['icon-btn', 'icon-btn--sm']));
    expect(btns[2].classes()).toEqual(expect.arrayContaining(['btn', 'btn-danger']));
    w.unmount();
  });

  // 长名不顶错位（2026-10-13 用户反馈 + 截图）：
  // 名字较长时 .tpl-row__actions 被 flex 挤压 → 三个按钮从一行折成两行（[复制][编辑] 一行、[启动] 掉到下一行）。
  // 根因：.tpl-row__actions 无样式（块级 div，min-content = 单个按钮宽 → 可被压到折行），
  // .tpl-row__id 只 min-width:0 不 grow、也没有 text-overflow → 名字按 JS 预算截断后仍可能超出行的可用像素宽。
  // CSS 契约（与 TemplateModule.test.ts:154-168 同一手法：注入真实 style.css 后读 computed style）：
  //   .tpl-row__actions → display:flex + flex-shrink:0（按钮组定宽、自身不换行，贴卡片右缘）
  //   .tpl-row__id      → flex-grow:1 + text-overflow:ellipsis（吃掉剩余空间并按像素裁剪，
  //                        与 truncate.ts:20 的 grace 口径一致：超出像素交给 CSS text-overflow）
  it('row_actions_do_not_shrink_and_label_clips_by_pixel', () => {
    if (!document.getElementById('__global-css__')) {
      const st = document.createElement('style');
      st.id = '__global-css__';
      st.textContent = fs.readFileSync(path.join(process.cwd(), 'src', 'style.css'), 'utf8');
      document.head.appendChild(st);
    }
    const row = document.createElement('div');
    row.className = 'tpl-row';
    const label = document.createElement('span');
    label.className = 'tpl-row__id';
    const actions = document.createElement('div');
    actions.className = 'tpl-row__actions';
    row.appendChild(label);
    row.appendChild(actions);
    document.body.appendChild(row);
    try {
      const a = getComputedStyle(actions);
      expect(a.display).toBe('flex');
      expect(a.flexShrink).toBe('0');
      const l = getComputedStyle(label);
      expect(l.flexGrow).toBe('1');
      expect(l.textOverflow).toBe('ellipsis');
    } finally {
      row.remove();
    }
  });

  // 卡片高度恒定（2026-10-13 用户反馈 + 截图：快捷启动配置多时卡片一路往下长，把整行 grid 都撑开）：
  // 与模板卡「方案 B」同一架构（TemplateModule.test.ts:170-188）——列表包在 .template-list 固定高度
  // 容器里，超出走容器内部滚动。类名复用模板卡那一份（与 .tpl-rows 复用同一先例，check F1），
  // 两张卡因此恒等高，grid 行高不再由条目数决定。
  it('list_wrapped_in_fixed_height_scroll_container', async () => {
    if (!document.getElementById('__global-css__')) {
      const st = document.createElement('style');
      st.id = '__global-css__';
      st.textContent = fs.readFileSync(path.join(process.cwd(), 'src', 'style.css'), 'utf8');
      document.head.appendChild(st);
    }
    const many = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`id${i}`, entry(`item-${i}`)]));
    // attachTo: document.body —— 读 computed style 必须让节点在 document 里（happy-dom 对游离节点返回空串）
    mockLms({ items: many, invalid: [] });
    const w = mount(QuickLaunch, { props: { states: {} as States }, attachTo: document.body });
    await flush();

    // 结构契约：卡片内恰一个滚动容器，全部行都在它内部（不在卡片正文里）
    expect(w.findAll('.module-quick .template-list').length).toBe(1);
    expect(w.findAll('.module-quick .template-list .tpl-row').length).toBe(6);
    // 空态文案同样在容器内（卡片高度与条目数无关，与模板卡一致）
    const empty = mountCard({ items: {}, invalid: [] });
    await flush();
    expect(empty.find('.module-quick .template-list p.label').exists()).toBe(true);
    empty.unmount();

    // CSS 契约：固定高度 + 纵向滚动（读真实 style.css 的 computed style，同上一个用例的手法）
    const cs = getComputedStyle(w.find('.module-quick .template-list').element);
    expect(cs.height).toBe('161px');
    expect(cs.overflowY).toBe('auto');
    w.unmount();
  });
});
