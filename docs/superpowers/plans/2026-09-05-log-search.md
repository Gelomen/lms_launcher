# 日志查找功能 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 日志区每个 tab 提供「输入即查 + 高亮 + 计数 + 上/下一个跳转」的查找体验（规格 docs/superpowers/specs/2026-09-05-log-search-design.md）。

**架构：** 新增纯函数模块 src/util/log-search.ts（单行匹配区间 + 渲染分段，与 linkify 合并切分）；LogTabView 组件内自持查找状态（query / currentIdx，computed 匹配列表），模板对每行按分段渲染高亮 span；样式新增淡紫高亮变量与工具行控件样式。App / LogPanel / 主进程零改动。

**技术栈：** Vue 3 script setup + TS、@vue/test-utils + happy-dom（vitest）、@fortawesome/free-regular-svg-icons（faCircleUp/faCircleDown，已确认存在）。

---

### 任务 1：log-search 纯函数（TDD）

**文件：**
- 创建：src/util/log-search.ts
- 测试：src/util/log-search.test.ts

- [ ] **步骤 1.1：编写失败的测试**

创建 src/util/log-search.test.ts（全文）：

```ts
// 日志查找纯函数测试（规格 2026-09-05-log-search-design §纯函数）：
// findMatches 单行区间（大小写不敏感、非重叠、空 query 空数组）；
// splitLineForSearch 分段（文本还原、链接内高亮、当前匹配标记、无 query 时 = linkify 映射）。
import { describe, it, expect } from 'vitest';
import { findMatches, splitLineForSearch } from './log-search';

describe('findMatches', () => {
  it('single_match_returns_range', () => {
    expect(findMatches('hello error world', 'error')).toEqual([{ start: 6, end: 11 }]);
  });
  it('case_insensitive', () => {
    expect(findMatches('Error: fatal ERROR', 'error')).toEqual([{ start: 0, end: 5 }, { start: 14, end: 19 }]);
  });
  it('repeated_non_overlapping', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([{ start: 0, end: 2 }, { start: 2, end: 4 }]);
  });
  it('no_match_and_empty_query_return_empty', () => {
    expect(findMatches('abc', 'z')).toEqual([]);
    expect(findMatches('abc', '')).toEqual([]);
  });
  it('query_with_spaces_matches_literally', () => {
    expect(findMatches('a b c', 'a b')).toEqual([{ start: 0, end: 3 }]);
  });
});

describe('splitLineForSearch', () => {
  it('no_query_segments_equal_linkify_mapping', () => {
    const segs = splitLineForSearch('open https://x.com/a now', '', null);
    expect(segs.map(s => s.text).join('')).toBe('open https://x.com/a now');
    expect(segs.find(s => s.inLink)?.url).toBe('https://x.com/a');
    expect(segs.every(s => !s.mark && !s.current)).toBe(true);
  });
  it('marks_split_plain_text_and_text_reconstructs_line', () => {
    const segs = splitLineForSearch('hello error world', 'error', null);
    expect(segs.map(s => s.text).join('')).toBe('hello error world');
    expect(segs.filter(s => s.mark)).toEqual([{ text: 'error', inLink: false, mark: true, current: false }]);
  });
  it('match_inside_link_segment_keeps_link_and_marks', () => {
    const line = 'see https://docs.example.com/err guide';
    const segs = splitLineForSearch(line, 'docs', null);
    expect(segs.map(s => s.text).join('')).toBe(line);
    const marked = segs.find(s => s.mark && s.inLink);
    expect(marked?.text).toBe('docs');
    expect(marked?.url).toBe('https://docs.example.com/err');
    // 未命中部分仍是可点击链接段
    expect(segs.filter(s => s.inLink).every(s => s.url === 'https://docs.example.com/err')).toBe(true);
  });
  it('current_range_flagged_current_not_plain_mark', () => {
    const segs = splitLineForSearch('Error: one Error two', 'error', { start: 0, end: 5 });
    const current = segs.find(s => s.current);
    expect(current).toEqual({ text: 'Error', inLink: false, mark: false, current: true });
    expect(segs.filter(s => s.mark && !s.current).map(s => s.text)).toEqual(['Error']);
  });
  it('match_straddling_link_boundary_splits_into_two_parts', () => {
    // 查询词横跨 文本→链接 边界：边界两侧各出半段高亮（可接受降级，文本还原优先）
    const line = 'ab https://x.com cd';
    const segs = splitLineForSearch(line, 'b h', null);
    expect(segs.map(s => s.text).join('')).toBe(line);
    expect(segs.filter(s => s.mark).map(s => s.text)).toEqual(['b ', ' h']);
  });
});
```

- [ ] **步骤 1.2：运行测试验证失败**

运行：`npx vitest run src/util/log-search.test.ts`
预期：FAIL（Cannot find module './log-search'）

- [ ] **步骤 1.3：编写实现**

创建 src/util/log-search.ts（全文）：

```ts
// 日志查找纯函数（规格 2026-09-05-log-search-design）：
// findMatches —— 单行内全部匹配区间（大小写不敏感、非重叠）；
// splitLineForSearch —— 一行切分为渲染段：先按 linkify 分段，再在绝对偏移上
// 与匹配区间求交切分高亮（链接内的匹配同样高亮且保留链接属性）。
import { linkify } from './linkify';

export interface MarkRange { start: number; end: number }

export interface RenderSeg {
  text: string;
  inLink: boolean;   // 是否位于链接内（保留 Ctrl+Click 行为）
  url?: string;      // inLink 时的链接地址
  mark: boolean;     // 普通匹配高亮
  current: boolean;  // 当前匹配高亮（深一档紫）
}

// 单行匹配区间：命中后从 end 继续（非重叠）；空 query → []。
export function findMatches(line: string, query: string): MarkRange[] {
  const out: MarkRange[] = [];
  if (query.length === 0) return out;
  const low = line.toLowerCase();
  const q = query.toLowerCase();
  let idx = low.indexOf(q);
  while (idx !== -1) {
    out.push({ start: idx, end: idx + q.length });
    idx = low.indexOf(q, idx + q.length);
  }
  return out;
}

// linkify 分段拼接还原原行且按序连续 → 用前缀长度累计即可还原每段绝对偏移。
function splitLineForSearch(line: string, query: string, current: MarkRange | null): RenderSeg[] {
  const linkSegs = linkify(line);
  const ranges = query.length > 0 ? findMatches(line, query) : [];
  // 链接段绝对区间（[start,end) + url）
  const linkIntervals: Array<{ start: number; end: number; url: string }> = [];
  let off = 0;
  for (const s of linkSegs) {
    if (s.isLink) linkIntervals.push({ start: off, end: off + s.text.length, url: s.url! });
    off += s.text.length;
  }
  // 原子切割点：0/len + 每个链接边界 + 每个匹配边界
  const cuts = new Set<number>([0, line.length]);
  for (const li of linkIntervals) { cuts.add(li.start); cuts.add(li.end); }
  for (const r of ranges) { cuts.add(r.start); cuts.add(r.end); }
  if (current) { cuts.add(current.start); cuts.add(current.end); }
  const sorted = [...cuts].sort((a, b) => a - b);
  const segs: RenderSeg[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const s = sorted[i];
    const e = sorted[i + 1];
    const mid = (s + e) / 2;
    const link = linkIntervals.find(li => mid >= li.start && mid < li.end) ?? null;
    const mark = ranges.some(r => s >= r.start && e <= r.end);
    const cur = current !== null && s >= current.start && e <= current.end;
    segs.push({ text: line.slice(s, e), inLink: link !== null, url: link?.url, mark, current: cur });
  }
  // 合并相邻同属性段（保持 DOM 精简）
  const merged: RenderSeg[] = [];
  for (const seg of segs) {
    const last = merged[merged.length - 1];
    if (last && last.inLink === seg.inLink && last.mark === seg.mark && last.current === seg.current) {
      last.text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

export { splitLineForSearch };
```

注：export 写法改为顶部 `export function splitLineForSearch`，删掉文件末尾的 `export { splitLineForSearch }` 行（上面代码块为完整性展示，落地时二选一，保持函数体内无重复声明）。

- [ ] **步骤 1.4：运行测试验证通过**

运行：`npx vitest run src/util/log-search.test.ts`
预期：PASS（11 个用例全绿）

- [ ] **步骤 1.5：Commit**

```bash
git add src/util/log-search.ts src/util/log-search.test.ts
git -c user.name='lms' -c user.email='lms@local' commit -m 'feat: 日志查找纯函数（findMatches + splitLineForSearch）'
```

---

### 任务 2：LogTabView 组件集成 + 样式 + 组件测试（TDD）

**文件：**
- 修改：src/modules/LogTabView.vue
- 修改：src/style.css
- 测试：src/modules/LogTabView.test.ts（追加 describe 块，不改既有块）

- [ ] **步骤 2.1：追加组件测试**

在 src/modules/LogTabView.test.ts 文件末尾追加（import 行已有 mount/vi 等，无需改）：

```ts

describe('LogTabView 日志查找（规格 2026-09-05-log-search-design）', () => {
  const lines: E[] = [
    { line: 'boot ok', stream: 'out' },
    { line: 'Error: disk full', stream: 'err' },
    { line: 'error retrying now', stream: 'out' },
  ];

  it('typing_query_highlights_all_matches_and_shows_count', async () => {
    const w = mountTab([...lines]);
    const input = w.find('.log-search-input');
    await input.setValue('error');
    expect(w.findAll('.ln-mark').length).toBe(2);           // 两行各一处
    expect(w.find('.log-search-count').text()).toBe('0 / 2'); // 尚未跳转
    // 高亮不改变行文本内容
    expect(w.find('.log-view').text()).toContain('Error: disk full');
    w.unmount();
  });

  it('zero_matches_shows_0_and_disables_nav_buttons', async () => {
    const w = mountTab([...lines]);
    await w.find('.log-search-input').setValue('nope');
    expect(w.findAll('.ln-mark').length).toBe(0);
    expect(w.find('.log-search-count').text()).toBe('0');
    expect(w.find('.btn-search-prev').attributes('disabled')).toBeDefined();
    expect(w.find('.btn-search-next').attributes('disabled')).toBeDefined();
    w.unmount();
  });

  it('next_button_walks_matches_and_wraps', async () => {
    const w = mountTab([...lines]);
    await w.find('.log-search-input').setValue('error');
    const next = w.find('.btn-search-next');
    await next.trigger('click');
    expect(w.find('.log-search-count').text()).toBe('1 / 2');
    expect(w.find('.ln-mark--current').exists()).toBe(true);
    await next.trigger('click');
    expect(w.find('.log-search-count').text()).toBe('2 / 2');
    await next.trigger('click'); // 回绕到第 1 个
    expect(w.find('.log-search-count').text()).toBe('1 / 2');
    // 当前高亮落在行 2（0-based）
    const currentLine = w.find('.ln-mark--current').element.closest('p');
    expect((currentLine as HTMLElement).textContent).toContain('Error: disk full');
    w.unmount();
  });

  it('prev_button_from_no_current_jumps_to_last_match', async () => {
    const w = mountTab([...lines]);
    await w.find('.log-search-input').setValue('error');
    await w.find('.btn-search-prev').trigger('click');
    expect(w.find('.log-search-count').text()).toBe('2 / 2');
    const currentLine = w.find('.ln-mark--current').element.closest('p');
    expect((currentLine as HTMLElement).textContent).toContain('error retrying now');
    w.unmount();
  });

  it('jumping_disables_auto_scroll', async () => {
    const w = mountTab([...lines]);
    await w.find('.log-search-input').setValue('error');
    expect(w.find('input[type="checkbox"]').element.checked).toBe(true); // 默认勾选
    await w.find('.btn-search-next').trigger('click');
    expect(w.find('input[type="checkbox"]').element.checked).toBe(false);
    w.unmount();
  });

  it('clearing_query_removes_highlights_and_resets_count', async () => {
    const w = mountTab([...lines]);
    await w.find('.log-search-input').setValue('error');
    await w.find('.btn-search-next').trigger('click');
    await w.find('.log-search-input').setValue('');
    expect(w.findAll('.ln-mark, .ln-mark--current').length).toBe(0);
    expect(w.find('.log-search-count').text()).toBe('0');
    expect(w.find('.btn-search-prev').attributes('disabled')).toBeDefined();
    w.unmount();
  });

  it('match_inside_url_is_highlighted_and_link_preserved', async () => {
    const w = mountTab([{ line: 'see https://docs.example.com/err guide', stream: 'out' }]);
    await w.find('.log-search-input').setValue('docs');
    const link = w.find('.ln-link');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe('https://docs.example.com/err'); // 文本完整
    expect(link.find('.ln-mark').exists()).toBe(true);        // 内部高亮段
    expect(link.find('.ln-mark').text()).toBe('docs');
    w.unmount();
  });
});
```

- [ ] **步骤 2.2：运行测试验证失败**

运行：`npx vitest run src/modules/LogTabView.test.ts`
预期：新增 7 用例 FAIL（.log-search-input 不存在）；既有 4 用例 PASS

- [ ] **步骤 2.3：修改 src/modules/LogTabView.vue**

script 部分改动（在既有 import 区追加两行 import；在 onClear 之后插入查找状态块；cls 函数不动）：

import 区追加：

```ts
import { computed, nextTick, ref, watch } from 'vue';   // 原行 import { nextTick, ref, watch } from 'vue'; 替换为含 computed
import { faCircleDown, faCircleUp, faTrashCan } from '@fortawesome/free-regular-svg-icons';
import { splitLineForSearch, type MarkRange, type RenderSeg } from '../util/log-search';
```

library.add 行改为：

```ts
library.add(faTrashCan, faCircleUp, faCircleDown);
```

在 `function onLink(url: string): void {...}` 之后插入：

```ts
// ---- 日志查找（规格 2026-09-05-log-search-design）----
// 状态自持于本实例（与 autoScroll 同模式）：切 tab 互不影响；清空日志不清查找状态。
const query = ref('');
// 扁平匹配列表：第 n 个匹配 = { 行号, 行内区间 }；currentIdx = -1 表示尚未跳转。
interface Hit { line: number; range: MarkRange }
const matches = computed<Hit[]>(() => {
  const q = query.value.trim();
  const out: Hit[] = [];
  if (!q) return out;
  props.lines.forEach((e, i) => {
    for (const r of findMatches(e.line, q)) out.push({ line: i, range: r });
  });
  return out;
});
const currentIdx = ref(-1);
// 匹配列表变化（输入变化 / 新日志到达）：当前序号越界时回落到最后一个匹配（规格 §行为 6）。
watch(matches, (ms) => {
  if (currentIdx.value >= ms.length) currentIdx.value = ms.length > 0 ? ms.length - 1 : -1;
});
const countText = computed(() =>
  matches.value.length === 0 ? '0' : `${Math.max(currentIdx.value + 1, 0)} / ${matches.value.length}`);
const navDisabled = computed(() => matches.value.length === 0);
// 每行渲染分段（模板逐行调用）：链接/高亮/当前高亮 三类属性合并切分。
function segsOf(e: Entry, i: number): RenderSeg[] {
  const cur = currentIdx.value >= 0 && matches.value[currentIdx.value]?.line === i
    ? matches.value[currentIdx.value].range
    : null;
  return splitLineForSearch(e.line, query.value.trim(), cur);
}
// 上/下一个跳转：循环（无当前时 ↓=第 1 个、↑=最后一个）；跳转同时关闭自动滚动——
// 否则下一批日志到达立即贴底，刚跳到的位置瞬间失效（规格 §行为 5）。
function jump(delta: 1 | -1): void {
  const n = matches.value.length;
  if (n === 0) return;
  const cur = currentIdx.value;
  currentIdx.value = cur < 0 ? (delta === 1 ? 0 : n - 1) : (cur + delta + n) % n;
  autoScroll.value = false;
  // 滚到当前匹配：等 .ln-mark--current 渲染后 scrollIntoView 视野中部（happy-dom 无该方法 → 可选链守卫）。
  void nextTick(() => {
    const el = view.value?.querySelector<HTMLElement>('.ln-mark--current');
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  });
}
function goPrev(): void { jump(-1); }
function goNext(): void { jump(1); }
```

同时 import 区补充 `import { findMatches, splitLineForSearch, type MarkRange, type RenderSeg } from '../util/log-search';`（上面合并为一条 import，落地时与 faCircle 行分开书写即可）。

template 部分改动——工具行（原 div 内清空按钮之后）追加：

```html
      <!-- [日志查找]（2026-09-05）：输入即查 + 计数 + 上/下一个（far circle-up/down，regular 优先） -->
      <input type="text" class="input log-search-input" v-model="query"
        placeholder="查找…" aria-label="日志查找" />
      <span class="label log-search-count">{{ countText }}</span>
      <button type="button" class="icon-btn icon-btn--noborder btn-search-prev"
        aria-label="上一个匹配" data-tooltip="上一个" :disabled="navDisabled" @click="goPrev">
        <FontAwesomeIcon :icon="['far', 'circle-up']" />
      </button>
      <button type="button" class="icon-btn icon-btn--noborder btn-search-next"
        aria-label="下一个匹配" data-tooltip="下一个" :disabled="navDisabled" @click="goNext">
        <FontAwesomeIcon :icon="['far', 'circle-down']" />
      </button>
```

行渲染（替换原 log-view 内 p 模板的两层 v-for 为三层）：

```html
      <p v-for="(e, i) in lines" :key="i" :class="cls(e)" style="margin: 0;">
        <template v-for="(seg, j) in segsOf(e, i)" :key="j">
          <span v-if="seg.inLink" class="ln-link tip-up"
            :class="{ 'ln-mark': seg.mark && !seg.current, 'ln-mark--current': seg.current }"
            data-tooltip="Ctrl + Click 打开链接" @click.ctrl="onLink(seg.url!)">{{ seg.text }}</span>
          <span v-else-if="seg.current" class="ln-mark--current">{{ seg.text }}</span>
          <span v-else-if="seg.mark" class="ln-mark">{{ seg.text }}</span>
          <template v-else>{{ seg.text }}</template>
        </template>
      </p>
```

- [ ] **步骤 2.4：修改 src/style.css**

:root 变量区（--primary-hover 行之后）追加：

```css
  --log-mark: #E9D5FF;              /* 查找匹配高亮底：比主题紫 #8B5CF6 浅的淡紫 */
  --log-mark-current: #C4B5FD;      /* 当前匹配高亮底：深一档（与 update-pill--busy 同档） */
```

日志面板样式区（.log-view .ln-link 行之后）追加：

```css
/* 日志查找高亮（规格 2026-09-05-log-search）：淡紫底 2px 圆角；当前匹配深一档 */
.log-view .ln-mark { background: var(--log-mark); border-radius: 2px; }
.log-view .ln-mark--current { background: var(--log-mark-current); border-radius: 2px; }
/* 查找工具行控件：输入框定宽不伸缩；计数右对齐定宽防数字变化抖动 */
.log-search-input { width: 170px; flex: none; margin-left: 8px; }
.log-search-count { min-width: 44px; margin-left: 8px; text-align: right; white-space: nowrap; }
.icon-btn--noborder.btn-search-prev, .icon-btn--noborder.btn-search-next { margin-left: 4px; }
/* 查找按钮禁用态（icon-btn 既有样式无禁用分支） */
.icon-btn:disabled { color: #C7CCD4; cursor: not-allowed; }
.icon-btn:disabled:hover { background: transparent; color: #C7CCD4; }
```

- [ ] **步骤 2.5：运行测试验证通过**

运行：`npx vitest run src/modules/LogTabView.test.ts`
预期：PASS（既有 4 + 新增 7 全绿）

- [ ] **步骤 2.6：Commit**

```bash
git add src/modules/LogTabView.vue src/style.css src/modules/LogTabView.test.ts
git -c user.name='lms' -c user.email='lms@local' commit -m 'feat: 日志查找（输入即查 + 高亮 + 计数 + 上/下一个循环跳转）'
```

---

### 任务 3：全量验证与收尾

- [ ] **步骤 3.1：全量测试**

运行：`npx vitest run`
预期：全绿（既有 276 + 任务 1 新增 11 + 任务 2 新增 7 = 294）

- [ ] **步骤 3.2：构建**

运行：`npm run build`
预期：vite build + tsc 均 exit 0

- [ ] **步骤 3.3：更新 SDD 进度账本**

在 .superpowers/sdd/progress.md 末尾追加本特性一段（任务状态 + 验证结果）。

- [ ] **步骤 3.4：收尾（finishing-a-development-branch）**

向用户提供合并选项（本地 fast-forward master / 保留分支 / 丢弃），由用户决定；不自行 push。
