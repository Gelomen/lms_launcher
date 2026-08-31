# 日志链接 Ctrl+左键打开（Windows Terminal 式）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [x]`）语法来跟踪进度。

**目标：** 日志面板行内的 http/https 链接高亮为主题紫 + 下划线，Ctrl+鼠标左键点击在默认浏览器打开（Windows Terminal 式）；普通左键无任何行为。

**架构：** 渲染端新增纯函数 `linkify`（src/util/linkify.ts）把日志行切分为「文本段 + 链接段」；LogTabView 按段渲染，链接段 `<span.ln-link>` 绑定 `@click.ctrl` → IPC `open_external` → 主进程协议白名单校验后 `shell.openExternal`。主进程新增 1 个 IPC handler，preload 不改（invoke 通用转发）。

**技术栈：** Electron 28（ipcMain / shell）、Vue 3 SFC、Vitest（node + happy-dom）、vitest 全量回归 `npm test`、主进程编译 `tsc -p tsconfig.main.json`。

**规格：** docs/superpowers/specs/2026-08-31-log-link-ctrl-click-design.md（已批准，已实现 3c077d0）

---

## 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `src/util/linkify.ts` | 创建 | 纯函数：日志行 → 段序列（文本段 + http(s) 链接段，尾部标点剥离） |
| `src/util/linkify.test.ts` | 创建 | linkify 单测（规格 §5.1 全部用例） |
| `src-main/main.ts` | 修改 | 新增 `open_external` IPC handler（协议白名单 + shell.openExternal，失败静默） |
| `src/modules/LogTabView.vue` | 修改 | 行渲染改为按 linkify 段输出；链接段 `@click.ctrl` 触发 invoke |
| `src/modules/LogTabView.test.ts` | 创建 | 组件测试：.ln-link 渲染 + Ctrl+点击 / 普通点击行为（规格 §5.2） |
| `src/style.css` | 修改 | `.log-view .ln-link` 主题紫 + 下划线 + pointer，置于 ln-* 规则之后 |

不改：`src-main/preload.ts`（invoke 是通用转发，规格 §3.3）、`App.vue`、`LogPanel.vue`（分桶/tab 逻辑不动，规格 §6）。

---

### 任务 1：linkify 纯函数（TDD）

**文件：**
- 测试：`src/util/linkify.test.ts`（创建）
- 创建：`src/util/linkify.ts`

- [x] **步骤 1：编写失败的测试**

创建 `src/util/linkify.test.ts`：

```ts
// @vitest-environment node
// 日志行链接识别（规格 2026-08-31-log-link-ctrl-click-design §3.1）：
// http(s) 链接切分为独立段；尾部标点剥离（Windows Terminal 同款）；非 http 协议不识别。
import { describe, it, expect } from 'vitest';
import { linkify } from './linkify';

describe('linkify', () => {
  it('line_without_link_returns_single_text_segment_unchanged', () => {
    expect(linkify('server ready, listening on :8080')).toEqual([{ text: 'server ready, listening on :8080', isLink: false }]);
    expect(linkify('')).toEqual([{ text: '', isLink: false }]);
  });

  it('single_link_yields_text_link_text_segments_reassembling_line', () => {
    expect(linkify('see http://a/b?q=1 for docs'))
      .toEqual([
        { text: 'see ', isLink: false },
        { text: 'http://a/b?q=1', isLink: true, url: 'http://a/b?q=1' },
        { text: ' for docs', isLink: false },
      ]);
  });

  it('multiple_links_in_one_line', () => {
    expect(linkify('a http://x/1 b https://y/2 c'))
      .toEqual([
        { text: 'a ', isLink: false },
        { text: 'http://x/1', isLink: true, url: 'http://x/1' },
        { text: ' b ', isLink: false },
        { text: 'https://y/2', isLink: true, url: 'https://y/2' },
        { text: ' c', isLink: false },
      ]);
  });

  it('trailing_punctuation_is_stripped_from_url', () => {
    // Windows Terminal 同款：句点/括号不算 URL 一部分
    expect(linkify('visit https://example.com/path. done')).toEqual([
      { text: 'visit ', isLink: false },
      { text: 'https://example.com/path', isLink: true, url: 'https://example.com/path' },
      { text: '. done', isLink: false },
    ]);
    expect(linkify('(see http://a/b/c)')).toEqual([
      { text: '(see ', isLink: false },
      { text: 'http://a/b/c', isLink: true, url: 'http://a/b/c' },
      { text: ')', isLink: false },
    ]);
  });

  it('quotes_do_not_become_part_of_url', () => {
    expect(linkify('"http://a/b"')).toEqual([
      { text: '"', isLink: false },
      { text: 'http://a/b', isLink: true, url: 'http://a/b' },
      { text: '"', isLink: false },
    ]);
  });

  it('non_http_protocols_are_not_recognized', () => {
    expect(linkify('ftp://mirror/x.tar.gz')).toEqual([{ text: 'ftp://mirror/x.tar.gz', isLink: false }]);
    expect(linkify('file:///C:/x.txt')).toEqual([{ text: 'file:///C:/x.txt', isLink: false }]);
    // https? 前缀必须后跟 ://（裸 "http" 字样不识别）
    expect(linkify('http is a protocol')).toEqual([{ text: 'http is a protocol', isLink: false }]);
  });
});
```

- [x] **步骤 2：运行测试验证失败**

运行：`npx vitest run src/util/linkify.test.ts`
预期：FAIL —— 无法解析模块 `./linkify`（文件不存在）。

- [x] **步骤 3：编写最小实现**

创建 `src/util/linkify.ts`：

```ts
// 日志行链接识别（规格 2026-08-31-log-link-ctrl-click-design §3.1）：
// 纯函数，无 DOM/无副作用。把一行文本切分为「文本段 + 链接段」交替序列，
// 拼接所有段还原原行。只识别 http/https；尾部标点剥离（Windows Terminal 同款）。
export interface LinkSeg { text: string; isLink: boolean; url?: string }

const URL_RE = /https?:\/\/[^\s"'<>]+/g;
const TRAIL_PUNCT = '.,;:!?)]}>';

export function linkify(line: string): LinkSeg[] {
  // 快速路径：绝大多数日志行不含 http，零正则开销
  if (!line.includes('http')) return [{ text: line, isLink: false }];
  const segs: LinkSeg[] = [];
  let last = 0;
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(line)) !== null) {
    const start = m.index;
    let url = m[0];
    // 尾部标点逐个剥掉（URL 不以这些字符收尾）；剥回的部分归入后随文本段
    while (url.length > 0 && TRAIL_PUNCT.includes(url[url.length - 1])) {
      url = url.slice(0, -1);
    }
    if (start > last) segs.push({ text: line.slice(last, start), isLink: false });
    if (url.length > 0) segs.push({ text: url, isLink: true, url });
    last = start + url.length;
  }
  if (last < line.length) segs.push({ text: line.slice(last), isLink: false });
  return segs;
}
```

- [x] **步骤 4：运行测试验证通过**

运行：`npx vitest run src/util/linkify.test.ts`
预期：PASS（6 个用例全绿）。

- [x] **步骤 5：Commit**

```bash
git add src/util/linkify.ts src/util/linkify.test.ts
git commit -m "feat: add linkify pure function for log-line http(s) link segmentation"
```

---

### 任务 2：主进程 open_external IPC

**文件：**
- 修改：`src-main/main.ts`（import 增加 `shell`；IPC 命令区新增 handler）

- [x] **步骤 1：修改 main.ts**

第 1 行 import 增加 `shell`：

```ts
import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } from 'electron';
```

在 `stop_server` handler（`src-main/main.ts` 约 212 行 `ipcMain.handle('stop_server', ...)` 之后、`exit_app` 之前）插入：

```ts
// open_external（规格 2026-08-31-log-link-ctrl-click-design §3.3）：渲染端日志链接 Ctrl+点击 → 默认浏览器。
// 协议白名单：仅 http/https 放行（防御 file:// 等，尽管 linkify 只会产出 http/https）；
// shell.openExternal 失败（默认浏览器不存在等极端情况）静默忽略——无 UI 后果，不写日志避免噪音。
ipcMain.handle('open_external', async (_e, url: string): Promise<void> => {
  if (typeof url !== 'string' || !(url.startsWith('http://') || url.startsWith('https://'))) return;
  try {
    await shell.openExternal(url);
  } catch {
    // 静默（规格 §4）
  }
});
```

- [x] **步骤 2：编译验证**

运行：`npx tsc -p tsconfig.main.json --noEmit`
预期：exit 0，无错误。

- [x] **步骤 3：全量回归**

运行：`npm test`
预期：全部 PASS（与改前同数，本任务不加新测试文件）。

- [x] **步骤 4：Commit**

```bash
git add src-main/main.ts
git commit -m "feat: add open_external IPC (http/https whitelist) for log link ctrl+click"
```

---

### 任务 3：LogTabView 链接段渲染 + Ctrl+点击（TDD）

**文件：**
- 测试：`src/modules/LogTabView.test.ts`（创建）
- 修改：`src/modules/LogTabView.vue`
- 修改：`src/style.css`（ln-link 规则）

- [x] **步骤 1：编写失败的测试**

创建 `src/modules/LogTabView.test.ts`：

```ts
// @vitest-environment happy-dom
// 组件级测试：LogTabView —— 日志行链接识别与 Ctrl+左键打开（规格 2026-08-31-log-link-ctrl-click-design §3.2/§5.2）：
// 含 http(s) 的行渲染 .ln-link（文本 = URL）；无链接行无 .ln-link；
// Ctrl+点击 → invoke('open_external', url)；普通左键不触发任何 IPC。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import LogTabView from './LogTabView.vue';

const invoke = vi.fn().mockResolvedValue(undefined);
vi.mock('../ipc', () => ({
  invoke: (cmd: string, ...args: unknown[]) => invoke(cmd, ...args),
}));

interface E { line: string; stream: 'sys' | 'out' | 'err' }

function mountTab(lines: E[]): ReturnType<typeof mount> {
  return mount(LogTabView, { props: { id: 't', lines } });
}

describe('LogTabView 链接渲染', () => {
  beforeEach(() => { invoke.mockClear(); });

  it('link_line_renders_ln_link_span_with_url_text', () => {
    const w = mountTab([{ line: 'docs at https://example.com/guide end', stream: 'out' }]);
    const link = w.find('.ln-link');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe('https://example.com/guide');
    expect(link.attributes('title')).toBe('https://example.com/guide');
    // 行整体文本不变（段拼接还原原行）
    expect(w.find('.log-view').text()).toBe('docs at https://example.com/guide end');
    w.unmount();
  });

  it('line_without_link_renders_no_ln_link', () => {
    const w = mountTab([{ line: '0.01.000.000 I srv  init done', stream: 'err' }]);
    expect(w.find('.ln-link').exists()).toBe(false);
    w.unmount();
  });
});

describe('LogTabView Ctrl+点击', () => {
  beforeEach(() => { invoke.mockClear(); });

  it('ctrl_click_invokes_open_external_with_url', async () => {
    const w = mountTab([{ line: 'open http://llama.com/x.html now', stream: 'out' }]);
    await w.find('.ln-link').trigger('click', { ctrlKey: true });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('open_external', 'http://llama.com/x.html');
    w.unmount();
  });

  it('plain_click_does_not_invoke_any_ipc', async () => {
    const w = mountTab([{ line: 'open http://llama.com/x.html now', stream: 'out' }]);
    await w.find('.ln-link').trigger('click');
    expect(invoke).not.toHaveBeenCalled();
    w.unmount();
  });
});
```

- [x] **步骤 2：运行测试验证失败**

运行：`npx vitest run src/modules/LogTabView.test.ts`
预期：FAIL —— `w.find('.ln-link').exists()` 为 false（当前行是整段裸文本）。

- [x] **步骤 3：修改 LogTabView.vue**

`src/modules/LogTabView.vue` 的 `<script setup>` 顶部 import 增加：

```ts
import { invoke } from '../ipc';
import { linkify } from '../util/linkify';
```

在 `onClear` 函数后增加：

```ts
// 日志链接 Ctrl+左键打开（规格 2026-08-31-log-link-ctrl-click-design §3.2）：
// invoke 的 reject（协议被主进程拒绝等）静默——主进程已白名单校验，无 UI 后果。
function onLink(url: string): void {
  void invoke('open_external', url).catch(() => {});
}
```

模板中行渲染（原 `<p v-for=...>{{ e.line }}</p>` 一行）替换为：

```html
      <template v-if="lines.length === 0"><p class="ln-dim">（暂无日志）</p></template>
      <p v-for="(e, i) in lines" :key="i" :class="cls(e)" style="margin: 0;">
        <template v-for="(seg, j) in linkify(e.line)" :key="j">
          <span v-if="seg.isLink" class="ln-link" :title="seg.url" @click.ctrl="onLink(seg.url!)">{{ seg.text }}</span>
          <template v-else>{{ seg.text }}</template>
        </template>
      </p>
```

注意：`<p>` 内嵌套 `<template>` 在 Vue 3 模板中合法（编译为 fragment）；`word-break: break-all` 作用在 `p` 上对 span 内容同样生效（继承），长 URL 仍会折行。

- [x] **步骤 4：修改 style.css**

在 `src/style.css` 中 `.log-view .ln-dim { color: var(--log-dim); }`（约 200 行）之后插入：

```css
/* 日志链接（规格 2026-08-31-log-link-ctrl-click-design §3.2）：主题紫 + 下划线，覆盖所在行 error/warn 色 */
.log-view .ln-link { color: var(--primary); text-decoration: underline; cursor: pointer; }
```

- [x] **步骤 5：运行测试验证通过**

运行：`npx vitest run src/modules/LogTabView.test.ts`
预期：PASS（4 个用例全绿）。

- [x] **步骤 6：全量回归**

运行：`npm test`
预期：全部 PASS。

- [x] **步骤 7：Commit**

```bash
git add src/modules/LogTabView.vue src/modules/LogTabView.test.ts src/style.css
git commit -m "feat: highlight log-line http(s) links; ctrl+click opens in default browser"
```

---

### 任务 4：构建 + 真实运行验证

**文件：** 无新增改动（验证任务）

- [x] **步骤 1：全量构建**

运行：`npm run build`
预期：vite build 与 `tsc -p tsconfig.main.json` 均成功（exit 0）。

- [x] **步骤 2：真实运行验证（dev）**

运行：`npm run dev`（后台）。等窗口出现后：
1. 日志区若存在含 http(s) 的日志行，链接显示为主题紫 + 下划线；
2. Ctrl+左键点击链接 → 默认浏览器打开该 URL；普通左键点击无任何反应。
3. 若当前无含链接的日志行（llama-server 常规输出通常不含 URL），以任务 1/3 的测试 + 构建通过为证据，并在报告中说明。

验证完成后终止 dev 进程。

- [x] **步骤 3：规格状态更新 + Commit**

`docs/superpowers/specs/2026-08-31-log-link-ctrl-click-design.md` 第 4 行 `状态：待实现` 改为 `状态：已实现（<commit 短哈希>）`，并 commit：

```bash
git add docs/superpowers/specs/2026-08-31-log-link-ctrl-click-design.md
git commit -m "docs: mark log-link ctrl+click spec as implemented"
```

---

## 自检记录

- 规格覆盖：§3.1 → 任务 1；§3.2 渲染/着色/点击 → 任务 3；§3.3 IPC → 任务 2；§4 错误处理（白名单拒绝 + 静默）→ 任务 2 handler + 任务 3 onLink catch；§5.1 测试 → 任务 1；§5.2 测试 → 任务 3；§5.3 全量回归 → 任务 3 步骤 6；§6 YAGNI 约束（不改 preload/App/LogPanel）→ 文件结构表明确排除。
- 类型一致性：`LinkSeg { text, isLink, url? }` 在任务 1 定义、任务 3 模板消费；`invoke(cmd, ...args)` 与 src/ipc.ts 现有签名一致；`open_external` 命令名任务 2/3 一致。
- 占位符扫描：无。
- 风险备注：VTU2 `trigger('click', { ctrlKey: true })` 会把 ctrlKey 写入事件对象，Vue `@click.ctrl` 修饰符读 `event.ctrlKey`，happy-dom 下兼容；若运行失败（任务 3 步骤 5），改用手工构造 MouseEvent 并设 `ctrlKey: true` 后 dispatch，断言不变。
