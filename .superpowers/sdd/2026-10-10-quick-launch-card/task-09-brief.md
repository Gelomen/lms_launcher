# 任务 9 简报 · `TerminalTabView.vue`（xterm 交互终端页签）

计划：docs/superpowers/plans/2026-10-10-quick-launch-card.md §任务 9（:315-356）
规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §9（终端视图，尤其 §9.3 键盘/尺寸）、§11、§12.5
check 表：docs/superpowers/checks/2026-10-10-quick-launch-card/task-09-terminal-tab-view.md（A1-A4、B1-B2、C1-C2、D1-D4、**E1-E10**、F1-F7、G1-G4、H/I、J 全部照表执行）
索引：docs/superpowers/checks/2026-10-10-quick-launch-card/00-index.md 的 K 组，尤其 **K11(2)**（主进程按 80×24 兜底建 PTY → 首帧必须上报尺寸）、**K21(1)(2)(3)**、**K22(3)**

## 已实测的落点与既有模式（照抄，别自己找）

- 依赖已装：`node_modules/@xterm/` 下有 `xterm`（**5.5.0**）、`addon-fit`、`addon-search`、`addon-web-links`。F5：不升 6.x。
- **测试文件第一行必须是 `// @vitest-environment happy-dom`**：`vitest.config.ts:7` 的默认环境是 `'node'`，:10 的注释写明组件测试用文件级声明；现成样板见 `src/modules/LogTabView.test.ts:1`。
- mock 的写法照 `LogTabView.test.ts:10-11`（`vi.mock('../ipc', …)`）。本任务**必须**同时 mock `@xterm/xterm` 与三个 addon（B2/G8、F6：xterm 真实渲染不在单测范围）。
- 外壳与尺寸链复用：`src/style.css:184 .log-panel`、`:194 .log-view`（`:197` 用 `font-family: var(--font-mono)`），`:29` 定义了 `--font-mono`。
- 查找工具条的既有 markup 模式照 `src/modules/LogTabView.vue:142-162`：`.log-search` 一组、`.icon-btn` 按钮、`:aria-label` + `:data-tooltip` 成对、计数用 `.log-search-count`。
- 渲染端 IPC：`src/ipc.ts:48 invoke<T>(cmd, ...args)`、`:116-121 onQlData/onQlExit`。**本组件不订阅 `onQlData`**：终端数据经 props 的 `register(id, sink)` 交出去、由上层（任务 13）接线。

## i18n：键已在任务 8 落地（`e919b25`），直接用，不要再加键

- 可用：`ql.terminal.clear` / `ql.terminal.searchPlaceholder` / `ql.terminal.searchPrev` / `ql.terminal.searchNext` / `ql.terminal.count`、`ql.btn.closeTab`、`ql.tab.closeBlocked`。
- **K21(3) 硬约束**：`ql.terminal.count` 的占位符名是 `{cur}` 与 `{total}`（词典 zh/en 注释里写了契约），调用点必须照抄，否则 `key-coverage.test.ts:44` 会红。
- **K21(2)**：查找框的「清空」按钮**复用既有 `log.search.clear`**（`dict.ts:135` zh / `:478` en），**不新建 `ql.terminal.searchClear`**。上/下按钮的 `aria-label` 用 `ql.terminal.searchPrev|Next`（与既有 `log.search.prevMatch/nextMatch` 的分工一致）。
- **K21(1)**：`key-coverage.test.ts:39-41` 的 `KEY_CALL` **连注释一起扫** —— 源码/组件注释里不得出现 `t('字面量key')` 形态的举例。

## 接口口径（A4 已定，不得改）

- props 逐字按 C1：`{ id, label, fullLabel, closable, closeDisabled, register, unregister, onInput, onResize }`；emits 只有 `close: [id]`（C2）。
- **不含 `configId` prop**（规格 §9.3 的 `configId` 字段不实现）。需要 configId 处一律 `id.slice(QL_TAB_PREFIX.length)`（`QL_TAB_PREFIX = 'ql:'`，由任务 10 导出）反解；**不新增 `configIdFromTabId` 之类的 API**（F7）。本任务里如果暂时用不到 configId，就不要提前造这个反解。

## 必须钉住的十条行为（E1-E10）

E1 挂载 `register(id, sink)` / 卸载 `unregister(id)`；E2 sink 收到数据 → `term.write`；E3 `term.onData` → `onInput(id, data)`，模拟 `'\x03'` 必须原样送达（**R5**）；E4 `offsetWidth === 0` 时不 `fit` / 不 `onResize`，恢复宽度后调用（**R2**）；E5 `Ctrl+Shift+C` 走复制**不**送终端、`Ctrl+C` **不**被拦截（用 `attachCustomKeyEventHandler` 捕获到的处理器直接断返回值）；E6 `closeDisabled` 时 `[x]` 禁用 + tooltip `ql.tab.closeBlocked`；E7 `Ctrl+Shift+V` / 右键粘贴走 `clipboard_read`；E8 工具条（清空 `term.clear()` + 查找框 + 上/下 + 计数）；**E9 首帧 `fit()` 成功后必须 `onResize(id, cols, rows)`**（主进程不带尺寸、按 80×24 兜底建 PTY，不上报就永远按 80×24 排版，K11(2)）；E10 链接点击 → `invoke('open_external', uri)`。

## 一处已知的可疑点（照实现写，别自己改口径）

F1 逐字要求 `Terminal({ scrollback: 5000, fontSize: 13, fontFamily: 'var(--font-mono)' })`。`fontFamily` 会被 xterm 拼进 canvas 的字体测量串，CSS 变量在那里**很可能不解析**（真实效果待真机）。**按 F1 原样实现**；若你判断它不生效，把它作为疑虑写进报告并给出依据（例如 xterm 源码里 `fontFamily` 的用法），**不要**自行换成具体字体串或加回退——那属偏离口径，需主代理先改表。

## 流程与门

- TDD：D1 先写 6+ 条失败测试（含 E7-E10）→ D2 红 → D3 实现 → D4 绿。把命令与真实输出填进 J 段（A-I 段不要改，H 段不要执行）。
- 回归门：G1 定向；G2 `npx vitest run src/modules/LogTabView.test.ts`（静态页签不受影响）；G3 `npx vitest run src-main/i18n src/i18n.test.ts`（无新增硬编码文案、无缺键）；G4 `git diff --name-only` 只含 B1-B2 两份新文件。
- 范围：只创建这两份文件。不碰 `LogPanel.vue` / `log-tabs.ts` / `style.css`（那是任务 10）、不碰 App（任务 13）。若外壳样式确实需要新 CSS 类，**先停下报告**，不要顺手加。
- 按 K5：不 `git add`、不 commit。报告写到 .superpowers/sdd/2026-10-10-quick-launch-card/task-09-report.md（含每条 E 的落点、mock 的边界、E9 首帧时序怎么保证、疑虑）。不派子代理。