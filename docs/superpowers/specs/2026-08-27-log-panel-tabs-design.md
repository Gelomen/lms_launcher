# 日志区标签页化（LMS Launcher / llama-server）设计

日期：2026-08-27　状态：已批准（用户选择方案 A，并指定顺序：先 LMS Launcher、后 llama-server）

## 目标

把单一日志列表改为浏览器/文件夹式多标签页：每个应用占一个标签页，用户通过切换标签页查看不同应用的日志。首个版本两个标签页：

1. **LMS Launcher** —— 本应用自产的 sys 事件（启动配置摘要、停止指令、启停失败、进程退出、PROC 报错）
2. **llama-server** —— llama-server 子进程的 stdout/stderr 原始输出

后续新增卡片功能启动新应用时，在主进程给它声明一个 source + 在 tab 注册表加一行条目即可，前端自动多出一个标签页。

## 基线状态说明

本规格基于工作区中用户手动编辑的现行版本：LogPanel 已去掉「日志」标题（仅保留"自动滚动"勾选框，位于视图左上方），.log-view 已加公共灰外框（border + border-radius + 8px padding）。实现不得回退这两处。

## 数据层（App.vue）

- logLines: LogEntry[] → 按来源分桶：Record<TabId, LogEntry[]>，TabId = 'launcher' | 'llama-server'。每桶独立 500 行上限、独立裁剪（互不挤占）。
- **路由判据**：收到任意日志行（IPC 或本地 appendSys），stream='sys' → launcher 桶；否则（out/err）→ llama-server 桶。
- sys 行的来源有两处：App 本地 appendSys（启停失败、进程退出），以及主进程经 IPC 发的 sys 行（启动配置摘要、PROC 报错、停止指令）。两者都按 stream 判据统一归 launcher，无歧义。
- tab 注册表为**有序数组** { id: TabId; label: string }[]：
  [{ id: 'launcher', label: 'LMS Launcher' }, { id: 'llama-server', label: 'llama-server' }]。
  顺序即显示顺序；新增应用 = 追加条目 + 主进程侧新源。

## IPC / preload

- "log-line" payload **不变**——仍为 { line, stream }。分桶完全由渲染端按 stream 判据完成，IPC 与 preload **零改动**。
- ipc.ts onLogLine 回调类型不变。
- （早期设想中"payload 加 source 字段"已废弃：sys 行没有 source 字段，防御性默认值会产生路由歧义；stream 判据更简单且覆盖全部现有路径。将来新增应用需要时再扩展 payload。）

## UI 层（LogPanel.vue）

- 日志区顶部一条**标签条**：文件夹/浏览器式 tab，激活态高亮 + 圆角顶边；点按切换。本期不支持关闭标签页（无关闭语义）。
- 每个 tab 一个独立滚动视图 + **独立自动滚动状态**（checkbox 状态、暂停/恢复判定各自独立）。
- 全部视图**常驻 DOM**（v-show 切换显隐）：每个 tab 的滚动位置与"暂停自动滚动"状态切走再切回原样保留。
- 既有五档着色启发式（ln-dim / ln-ok / ln-warn / ln-err / glog 前缀识别）按行规则不变，作用于所在 tab。
- 「暂无日志」占位符随各 tab 独立出现。

## 测试（TDD）

1. LogPanel.test.ts 扩展：双 tab 渲染与顺序；点按切换激活；各自 500 行裁剪互不影响；自动滚动状态互不串扰。
2. App.test.ts 同步更新：sys 行只进 launcher 桶；out/err 只进 llama-server 桶；既有行为（裁剪上限、启停 state 机）不回退。

## 验证

1. npm run dev：启动 llama-server，确认 LMS Launcher tab 显示系统事件、llama-server tab 显示 glog 输出与着色；切走再切回滚动位置/自动滚动态保留。
2. npm test 全绿。

## 不动的部分

- 五档着色启发式规则本身不变。
- process.ts 进程状态机、stopGraceful 不变。
- 主进程 sys 行的文案与触发时机不变（仅渲染端路由到新桶）。