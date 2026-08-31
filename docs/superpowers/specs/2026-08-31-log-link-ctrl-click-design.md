# 日志链接 Ctrl+左键打开（Windows Terminal 式）— 设计规格

日期：2026-08-31
状态：已实现（3c077d0；相邻双链接拆分迭代 f62fab2）
关联模块：`src/modules/LogTabView.vue`、`src/util/linkify.ts`（新增）、`src-main/main.ts`、`src-main/preload.ts`、`src/style.css`

## 1. 目的

参考 Windows Terminal 的链接行为：日志行中出现的 http/https 链接可被识别并高亮，用户 **Ctrl + 鼠标左键** 点击时在默认浏览器打开。普通左键点击不做任何事（不导航、不选中异常）。

## 2. 范围

- 只覆盖日志面板（`LogTabView` 渲染的行）；`http(s)` 链接。
- 不做：本地文件路径、file:// 等其他协议、链接悬停 tooltip、右键菜单。
- 链接颜色 = 主题紫 `--primary`（用户指定）。

## 3. 设计

### 3.1 纯函数 `linkify`（新增 `src/util/linkify.ts`）

```ts
export interface LinkSeg { text: string; isLink: boolean; url?: string }
export function linkify(line: string): LinkSeg[]
```

- 无 http 时快速返回 `[ { text: line, isLink: false } ]`（先用 `line.includes('http')` 预过滤，绝大多数日志行零开销）。
- 正则：`/https?:\/\/[^\s"'<>]+/g`。
- 尾部标点剥离：把匹配结尾的 `.,;:!?)]}>"'` 逐个剥掉（URL 不以这些字符收尾），剥回的部分归入后随文本段——Windows Terminal 同款处理。
- 一行可含多个链接，返回段序列（文本段 + 链接段交替，顺序还原原行）。
- 相邻无空格双链接（如 `http://a/1http://b/2`）：匹配内部再出现 `http(s)://` 时在该边界截断，后半由下一轮识别为独立链接段（f62fab2 迭代，原正则的固有合并行为已修正）。
- 纯函数、无 DOM/无副作用，可单测（与 `src/util/truncate.ts` 同模式）。

### 3.2 渲染（`LogTabView.vue`）

- 每行由单个 `<p>{{ e.line }}</p>` 改为 `<p v-for>` 内按 `linkify(e.line)` 输出段：文本段裸文本，链接段 `<span class="ln-link" :title="url" @click.ctrl="onLink(url)">`。
- 普通左键不绑定任何处理——`<span>` 不是 `<a>`，天然无导航行为。
- `@click.ctrl` 调 `invoke('open_external', url)`（经现有 `src/ipc.ts` 的 `invoke` 封装）。
- 着色：`.ln-link { color: var(--primary); text-decoration: underline; cursor: pointer; }` 置于 `.log-view .ln-err/.ln-warn` 之后，链接统一紫色，覆盖所在行的 error/warn 色（视觉一致，用户指定主题紫）。
- 行级 `cls(e)`（error/warn/ok 判定）逻辑不变，仍作用于整行 `<p>`；链接段的紫色通过更高优先级的 `.ln-link` 覆盖。

### 3.3 IPC（`src-main/main.ts` + `src-main/preload.ts` + `src/ipc.ts`）

- 新增命令 `open_external`：`ipcMain.handle('open_external', (_e, url: string) => {...})`。
- 协议白名单：仅 `url.startsWith('http://') || url.startsWith('https://')` 时调用 `shell.openExternal(url)`；其他一律拒绝（防御 file:// 等，尽管 linkify 只会产出 http/https）。
- preload 的 `invoke` 白名单是通用转发（`ipcRenderer.invoke(cmd, ...)`），无需逐命令改 preload；`src/ipc.ts` 的 `invoke` 同样通用。故 preload 不改，只需在 `main.ts` 注册 handler。
- 打开失败（shell 抛错）静默忽略——无 UI 后果，不写日志（避免噪音）。

### 3.4 数据流

```
llama-server 日志行 → App 分桶 → LogTabView linkify(line) → 段渲染
  └─ 用户 Ctrl+左键 <span.ln-link> → invoke('open_external', url)
       → 主进程协议白名单校验 → shell.openExternal(url) → 默认浏览器
```

## 4. 错误处理

- 非 http(s) URL：主进程拒绝，无动作。
- `shell.openExternal` 抛错：catch 静默（默认浏览器不存在等极端情况）。
- 链接被换行/截断（`word-break: break-all`）：不影响，URL 文本完整保留在 `e.line` 字符串内，点击取的是原始 URL 而非渲染文本。

## 5. 测试

1. **`src/util/linkify.test.ts`**（新增，vitest）：
   - 无链接行 → 单文本段，原文不变；
   - 单个链接、一行多链接 → 段序列正确拼接还原原行；
   - 尾部标点剥离：`...:8080.` → url 不含句点；
   - 引号包裹：`"http://a/b"` → url 不含引号；
   - 非 http 协议（ftp://、file://）不识别。
2. **`src/modules/LogTabView.test.ts`**（新增）：
   - 含链接的行渲染出 `.ln-link` 且文本 = URL；无链接行无 `.ln-link`；
   - Ctrl+点击触发 `window.lms.invoke('open_external', url)`（mock window.lms）；普通点击不触发。
3. 全量回归 `npm test` 通过。

## 6. 不做（YAGNI）

- 不做链接 tooltip（`:title` 已提供浏览器原生提示，足够）。
- 不做右键"复制链接"菜单。
- 不改 App.vue / LogPanel.vue（分桶与 tab 逻辑不动）。
- 不改 preload.ts。
