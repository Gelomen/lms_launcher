# 日志区标签页化 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把单一日志列表改为浏览器/文件夹式多标签页——tab1「LMS Launcher」（sys 事件）、tab2「llama-server」（子进程 out/err），各 tab 独立滚动视图与自动滚动状态，为后续新应用卡片预留"加一行条目即多一个 tab"的扩展位。

**架构：** 渲染端按 stream 判据分桶（sys→launcher，out/err→llama-server），每桶独立 500 行裁剪；tab 注册表为有序数组（id+label）作为单一真源；视图抽成独立组件 LogTabView（每 tab 一个实例，自持自动滚动状态），LogPanel 只做标签条 + 激活切换。IPC / preload 零改动（规格 2026-08-27-log-panel-tabs-design.md）。

**技术栈：** Vue 3 SFC + TS、Vitest + @vue/test-utils (happy-dom)、CSS 变量主题（src/style.css --* 系列）。

**规格：** `docs/superpowers/specs/2026-08-27-log-panel-tabs-design.md`

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/modules/log-tabs.ts` | 新建 | tab 注册表：LogTabId 类型 + LOG_TABS 有序数组（单一真源，App 与 LogPanel 共用） |
| `src/modules/LogTabView.vue` | 新建 | 单个 tab 的日志视图：行着色、自动滚动（checkbox 暂停/恢复）、占位符——原 LogPanel 视图逻辑整体迁入 |
| `src/modules/LogPanel.vue` | 重构 | 标签条 + 激活状态 + v-for/v-show 挂载 N 个 LogTabView；不再持有行数据外的任何视图状态 |
| `src/App.vue` | 修改 | logLines 单数组 → per-tab 分桶 Record（stream 判据路由），每桶独立 500 行裁剪 |
| `src/style.css` | 修改 | .tab-bar / .log-tab / .log-pane 样式；保留用户已加的 .log-view 外框（border/radius/padding） |
| `src/App.test.ts` | 修改 | onLogLine mock 改为捕获回调；新增路由分桶 + 独立裁剪测试 |
| `src/modules/LogPanel.test.ts` | 重写挂载方式 | 原五档着色断言保留（经新组件树触达）；新增 tab 渲染/顺序/切换、自动滚动互不串扰测试 |

**不动：** 主进程全部文件、preload.ts、ipc.ts、process.ts。

---

### 任务 1：提交基线（用户手改的 LogPanel 标题移除 + .log-view 外框）

工作区现有未提交改动属本功能的视觉基线，先独立成一处 commit（用户已确认并入本轮，单独提交保持历史清晰）。

- [ ] **步骤 1：确认 diff 只含两处**

运行：`git status --short && git diff --stat`
预期：恰好 `src/modules/LogPanel.vue`、`src/style.css` 两个文件（LogPanel 去掉 <h3>日志</h3>；.log-view 加 border/border-radius/padding:8px）。若出现其他改动，停下来核对，勿盲目提交。

- [ ] **步骤 2：Commit**

```bash
git add src/modules/LogPanel.vue src/style.css
git commit -m "ui: 日志区去标题、log-view 加公共灰外框"
```

---

### 任务 2：tab 注册表 + App 分桶路由（TDD）

**文件：**
- 创建：`src/modules/log-tabs.ts`
- 修改：`src/App.vue`（logLines → logBuckets；appendLine 按 stream 路由；模板 :lines → :buckets）
- 测试：`src/App.test.ts`

- [ ] **步骤 1：写失败的测试**（加到 `src/App.test.ts`）

先改 mock：`onLogLine` 从 no-op 改为捕获回调（现有 mock 块）：

```ts
// 现有：  onLogLine: () => () => {},
// 改为：
const logHandlers: Array<(e: { line: string; stream: 'sys' | 'out' | 'err' }) => void> = [];
// mock 对象内：
onLogLine: (fn: (e: { line: string; stream: 'sys' | 'out' | 'err' }) => void) => { logHandlers.push(fn); return () => {} },
```

新增测试块（追加在文件末尾）：

```ts
describe('log routing to tabs', () => {
  it('sys line lands in the launcher tab, out/err land in the llama-server tab', async () => {
    const { w } = mountApp();
    await flush(); // get_state + onLogLine handler registered
    logHandlers.at(-1)!({ line: '[lms_launcher] 启动配置 · c1', stream: 'sys' });
    logHandlers.at(-1)!({ line: '0.02.5 I srv  llama_server: hello', stream: 'err' });
    await flush();
    const launcher = w.find('.log-pane[data-tab-id="launcher"]').text();
    const server = w.find('.log-pane[data-tab-id="llama-server"]').text();
    expect(launcher).toContain('[lms_launcher] 启动配置 · c1');
    expect(launcher).not.toContain('llama_server: hello');
    expect(server).toContain('llama_server: hello');
    expect(server).not.toContain('启动配置');
  });

  it('each tab trims to 500 lines independently (no cross-bucket squeezing)', async () => {
    const { w } = mountApp();
    await flush();
    const h = logHandlers.at(-1)!;
    for (let i = 0; i < 501; i++) { h({ line: 'sys' + i, stream: 'sys' }); h({ line: 'out' + i, stream: 'out' }); }
    await flush();
    const launcherLines = w.find('.log-pane[data-tab-id="launcher"]').findAll('p');
    const serverLines = w.find('.log-pane[data-tab-id="llama-server"]').findAll('p');
    expect(launcherLines.length).toBe(500);
    expect(serverLines.length).toBe(500);
    // 各自保留最新 500：第 1 行是 index=1（index=0 被裁掉）
    expect(launcherLines[0].text()).toBe('sys1');
    expect(serverLines[0].text()).toBe('out1');
  });
});
```

- [ ] **步骤 2：运行确认失败**

运行：`npm test -- App.test.ts`
预期：FAIL——新测试找不到 `data-tab-id`（当前无分桶/无 tab），现有全部测试仍 PASS。

- [ ] **步骤 3：创建 `src/modules/log-tabs.ts`**

```ts
// 日志 tab 注册表 —— id 与显示顺序的单一真源（App 分桶 / LogPanel 标签条共用）。
// 新增应用 = 追加一行条目 + 渲染端路由（见 docs/superpowers/specs/2026-08-27-log-panel-tabs-design.md）。
export type LogTabId = 'launcher' | 'llama-server';

export interface LogTab { id: LogTabId; label: string }

// 顺序即 UI 左右顺序：LMS Launcher 在前，llama-server 在后（用户指定）。
export const LOG_TABS: ReadonlyArray<LogTab> = [
  { id: 'launcher', label: 'LMS Launcher' },
  { id: 'llama-server', label: 'llama-server' },
];
```

- [ ] **步骤 4：修改 `src/App.vue`**

(1) import：

```ts
import LogPanel from './modules/LogPanel.vue';
import { LOG_TABS, type LogTabId } from './modules/log-tabs';
```

(2) 替换第 26-49 行的 logLines/appendLine/appendSys 段：

```ts
const MAX_LINES = 500; // 全仓唯一裁剪处——LaunchBar/LogPanel 不重复实现
// 日志按 tab 分桶（stream 判据路由：sys → launcher；out/err → llama-server）。每桶独立裁剪，互不挤占。
const logBuckets = ref<Record<LogTabId, LogEntry[]>>({ launcher: [], 'llama-server': [] });

function bucketOf(stream: LogEntry['stream']): LogTabId {
  return stream === 'sys' ? 'launcher' : 'llama-server';
}

function appendLine(e: LogEntry): void {
  const id = bucketOf(e.stream);
  logBuckets.value[id].push(e);
  if (logBuckets.value[id].length > MAX_LINES) {
    logBuckets.value[id].splice(0, logBuckets.value[id].length - MAX_LINES); // 裁最旧，仅本桶
  }
}

// sys 行统一 [lms_launcher] 前缀（主进程已发的不重复加）→ launcher 桶
function appendSys(line: string): void {
  appendLine({ line: line.startsWith('[lms_launcher]') ? line : '[lms_launcher] ' + line, stream: 'sys' });
}
```

注意：原 `onLogLine((e) => appendLine(e))` 订阅行不变（路由在 appendLine 内完成）。

(3) 模板：`<LogPanel :lines="logLines" />` → `<LogPanel :buckets="logBuckets" />`

- [ ] **步骤 5：让 LogPanel 编译通过并跑测试**

此刻 LogPanel.vue 的 props 还是 `{ lines }`，需临时最小适配以过构建（任务 3 步骤 4 会彻底重构；此步只改 props + 渲染一行）：
`src/modules/LogPanel.vue` 的 script 顶部改为：

```ts
const props = defineProps<{ buckets: Record<'launcher' | 'llama-server', Array<{ line: string; stream: 'sys' | 'out' | 'err' }>> }>();
// TODO(任务3): 替换为 log-tabs 类型与 LogTabView 结构
const lines = computed(() => props.buckets['llama-server']);
```

并 `import { computed } from 'vue';`。同时 `src/modules/LogPanel.test.ts` 现有 rowClass 辅助的 props 改为 `{ buckets: { launcher: [], 'llama-server': lines } }`（断言主体不动——着色仍经 llama-server 桶触达）。

运行：`npm test`
预期：**现有全部测试 PASS**、新增 2 个路由测试 FAIL（data-tab-id 还不存在，等任务 3 点亮）——TDD 红灯保持期，commit 消息注明 WIP。

- [ ] **步骤 6：Commit（WIP）**

```bash
git add src/modules/log-tabs.ts src/App.vue src/App.test.ts src/modules/LogPanel.vue src/modules/LogPanel.test.ts
git commit -m "feat(log): 日志按 stream 分桶路由（sys→launcher，out/err→llama-server），WIP 待 tab UI"
```

---

### 任务 3：LogTabView 视图组件抽取 + tab UI（TDD）

**文件：**
- 创建：`src/modules/LogTabView.vue`（原 LogPanel 视图逻辑整体迁入）
- 修改：`src/modules/LogPanel.vue`（委托给 LogTabView ×2；占位符随 pane 走）、`src/style.css`
- 测试：`src/modules/LogPanel.test.ts`（新增自动滚动隔离断言；着色断言迁移到 pane 选择器）

- [ ] **步骤 1：写失败的测试**（LogPanel.test.ts 头部辅助 + 新 describe）

现有 `rowClass(lines)` 辅助改为经指定桶：

```ts
function rowClass(tab: 'launcher' | 'llama-server', lines: E[]): string[] {
  const buckets = { launcher: [], 'llama-server': [] } as Record<'launcher' | 'llama-server', E[]>;
  buckets[tab] = lines;
  const wrapper = mount(LogPanel, { props: { buckets } });
  const cls = wrapper.findAll('.log-pane[data-tab-id="' + tab + '"] p').map((p) => p.classes().join(' '));
  wrapper.unmount();
  return cls;
}
```

现有五档着色断言全部改为 `rowClass('llama-server', [...])`；sys 行那条改 `rowClass('launcher', [...])`（断言值不变）。

新增 describe：

```ts
describe('LogPanel tab 隔离', () => {
  it('autoScroll state is per-tab (pausing one tab does not affect the other)', async () => {
    const buckets: Record<string, E[]> = { launcher: [], 'llama-server': [] };
    const w = mount(LogPanel, { props: { buckets } });
    // 两个 pane 各有一个自动滚动 checkbox
    const boxes = w.findAll('input[type="checkbox"]');
    expect(boxes.length).toBe(2);
    await boxes[0].setChecked(false);   // 暂停 launcher
    expect(boxes[1].element.checked as boolean | undefined).toBe(true); // llama-server 仍开
    // 再点恢复，仅本 tab 状态变化（互不串扰）
    await boxes[0].setChecked(true);
    expect(boxes[1].element.checked as boolean | undefined).toBe(true);
    w.unmount();
  });
});
```

- [ ] **步骤 2：运行确认失败**

运行：`npm test -- LogPanel.test.ts`
预期：隔离测试 FAIL（当前单组件只有一个 checkbox，`boxes.length` = 1）；五档着色迁移后 PASS。

- [ ] **步骤 3：创建 `src/modules/LogTabView.vue`**——把现 LogPanel 的视图部分原样迁入（cls() 正则逐字复制，含 `{2,}` 与 `[iwe]` 转义，不得改写）：

```vue
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

// 单个 tab 的日志视图（§4.4）：白底 Solarized Light、等宽 13px、自动滚动可关。
// 自动滚动状态由本组件自持——每个 tab 一个实例，切走再切回各自保留。
const props = defineProps<{ id: string; lines: Array<{ line: string; stream: 'sys' | 'out' | 'err' }> }>();

type Entry = { line: string; stream: 'sys' | 'out' | 'err' };

// 自动滚动：默认开；用户滚离底部暂停，滚回底部恢复
const autoScroll = ref(true);
const view = ref<HTMLElement | null>(null);

// §4.4 五档着色（纯内容启发式，stream 不作颜色依据）——原 LogPanel cls() 原文迁移：
function cls(e: Entry): string {
  if (e.stream === 'sys') return 'ln-dim';
  const low = e.line.toLowerCase();
  // glog 前缀：0.02.489.298 I srv（数字 + ≥2 组点分小数 + 空格 + 单字母级别）
  const lvl = low.match(/^\s*\d+(?:[.:]\d+){2,}\s+([iwe])\b/)?.[1] ?? null;
  if (lvl === 'e' || low.includes('error') || low.includes('fatal')) return 'ln-err';
  if (lvl === 'w' || low.includes('warn')) return 'ln-warn'; // warning/warn 均含该子串
  if (low.includes('server ready') || low.includes('listening')) return 'ln-ok';
  return '';
}

// 仅当用户在底部附近才滚，避免读日志时跳回；nextTick 等 DOM 更新后再读 scrollHeight
watch((): number => props.lines.length, () => {
  if (!autoScroll.value) return;
  void nextTick(() => {
    const el = view.value;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) el.scrollTop = el.scrollHeight;
  });
});

function onScroll(): void {
  const el = view.value;
  if (!el) return;
  autoScroll.value = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
}
// DOM 事件随组件销毁失效；无定时器 / IPC 订阅需清理。
</script>
<template>
  <div class="log-pane" :data-tab-id="id">
    <div style="display: flex; justify-content: flex-end; align-items: center;">
      <label style="display: flex; gap: 4px; align-items: center;" class="label">
        <input type="checkbox" v-model="autoScroll" style="margin: 0;" />
        <span>自动滚动</span>
      </label>
    </div>
    <div ref="view" class="log-view" @scroll="onScroll">
      <template v-if="lines.length === 0"><p class="ln-dim">（暂无日志）</p></template>
      <p v-for="(e, i) in lines" :key="i" :class="cls(e)" style="margin: 0;">{{ e.line }}</p>
    </div>
  </div>
</template>
```

- [ ] **步骤 4：重构 `src/modules/LogPanel.vue`**（替换任务 2 的临时适配版为最终结构）：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import LogTabView from './LogTabView.vue';
import { LOG_TABS, type LogTabId } from './log-tabs';

// 标签条 + 激活切换；行数据由 App 分桶后按 tab 下发，视图状态全在 LogTabView 实例内。
const props = defineProps<{ buckets: Record<LogTabId, Array<{ line: string; stream: 'sys' | 'out' | 'err' }>> }>();

// 默认激活第一个 tab（LMS Launcher）——用户指定顺序的第 1 位。
const active = ref<LogTabId>(LOG_TABS[0].id);
</script>
<template>
  <section class="log-panel">
    <nav class="tab-bar" role="tablist">
      <button v-for="t in LOG_TABS" :key="t.id" type="button" role="tab"
        class="log-tab" :class="{ active: t.id === active }"
        :aria-selected="t.id === active ? 'true' : 'false'" @click="active = t.id">{{ t.label }}</button>
    </nav>
    <LogTabView v-for="t in LOG_TABS" :key="t.id" v-show="t.id === active"
      :id="t.id" :lines="buckets[t.id]" />
  </section>
</template>
```

测试锚点为 `data-tab-id`（LogTabView 根节点），aria 属性仅供无障碍，不参与测试。

- [ ] **步骤 5：style.css——tab 条样式**（追加在 .log-view 着色段后）：

```css
/* ---- 日志 tab 条（文件夹/浏览器式；激活高亮 = 主色蓝文字 + 加粗，hover 与下拉选项同灰）---- */
.tab-bar { display: flex; gap: 4px; padding-bottom: 6px; }
.log-tab {
  height: 26px; padding: 0 12px; font-size: var(--fs-label); color: var(--muted);
  background: transparent; border: 1px solid var(--border); border-radius: var(--radius-btn);
  cursor: pointer; font-family: var(--font-ui);
}
.log-tab:hover { background: #F6F7F8; }   /* 与 .dropdown-panel .option:hover / btn:hover 一致 */
.log-tab.active { color: var(--accent); font-weight: 600; border-color: var(--control-border); }
/* pane 高度链：.log-panel flex column → .log-pane(flex:1) → .log-view(flex:1)，中间层必须 min-height:0 */
.log-pane { display: flex; flex-direction: column; flex: 1; min-height: 0; }
```

原 .log-view 规则（含用户已加的 border/border-radius/padding:8px）不动。

- [ ] **步骤 6：跑测试**

运行：`npm test -- LogPanel.test.ts App.test.ts`
预期：LogPanel 新隔离测试 PASS、五档着色全 PASS；App 路由 2 测此时 data-tab-id 已存在 → 也应全 PASS。若路由仍 FAIL，检查 App 模板 v-for 与 buckets key 是否对齐。

- [ ] **步骤 7：Commit**

```bash
git add src/modules/LogTabView.vue src/modules/LogPanel.vue src/modules/LogPanel.test.ts src/style.css
git commit -m "feat(log): 日志区 tab UI——标签条 + 每 tab 独立 LogTabView（独立自动滚动状态）"
```

---

### 任务 4：全量验证

- [ ] **步骤 1：全测试**

运行：`npm test`
预期：全绿。重点确认现有 App 启停 state 机测试、Dropdown/Template/ConfirmDialog 测试无回归。

- [ ] **步骤 2：typecheck / build**

运行：`npx vue-tsc --noEmit`（package.json 无此 script 时改跑 `npm run build`，成功即过）

- [ ] **步骤 3：手动验证（规格验证节）**

运行：`npm run dev`（Electron 窗口起 llama-server）
逐项肉眼确认：
1. tab1「LMS Launcher」：启动配置摘要、停止指令已发送、进程退出 code=N 都出现在此 tab（ln-dim 灰）。
2. tab2「llama-server」：glog I/W/E 输出着色正确（W 橙 / E 红 / ready 绿），stream=err 的普通行不红。
3. 点第二个 tab 切走/切回：各自滚动位置保留；在 launcher 里关自动滚动态位不影响 llama-server。
4. 占位符：空 tab 显示（暂无日志）。

- [ ] **步骤 4：收尾 commit（如有验证微调）**

```bash
git add -A; git commit -m "chore(log): tab 化验证微调"   # 无实际改动则跳过
```

---

## 自检记录

1. **规格覆盖度**：数据分桶（任务2）✓ / 路由判据 sys→launcher、out/err→llama-server ✓ / tab 注册表有序数组（LMS Launcher 在前，用户指定顺序）✓ / 标签条 UI + 激活高亮（任务3 步骤4-5）✓ / 每 tab 独立自动滚动状态（LogTabView 自持，步骤3）✓ / 常驻 DOM v-show（步骤4）✓ / 五档着色不动（原样迁入 LogTabView）✓ / 占位符随 pane ✓ / IPC / preload / ipc.ts 零改动（有意未列任何主进程任务）✓ / 基线不破坏用户手改（任务1 先提交）✓。
2. **占位符扫描**：无 TODO/待定 遗留——任务2 步骤5 的临时适配由任务3 步骤4 整体替换，两处均给出完整代码。
3. **类型一致性**：LogTabId 唯一来源 log-tabs.ts；App / LogPanel / LogTabView / LogPanel.test 使用同名 'launcher' | 'llama-server' 字面量一致；buckets key 与 data-tab-id 值同构。
