# 日志查找功能设计（2026-09-05）

## 背景
日志区（LogPanel 多 tab + LogTabView 单 tab 视图）当前只有自动滚动与清空日志。
需要像编辑器一样的查找体验：输入关键词即时高亮全部匹配、显示数量、按钮在匹配间跳转。

## 范围
仅渲染端 LogTabView + 全局样式 + 新增纯函数工具；App / LogPanel / 主进程零改动。

## 布局
日志工具行（自动滚动复选框与 [清空日志] 同一行）末尾追加，顺序固定：
[清空日志按钮] [查找输入框] [计数] [↑按钮] [↓按钮]
- 输入框：复用 .input 盒型（32px 高、圆角、control-border 边框），宽约 170px，placeholder「查找…」。
- 计数：12px 辅助文字（.label 色），文案 当前/总数；0 匹配（含空查询）时显示 0 / 0（2026-09-05 用户追加）。
- ↑↓ 按钮：icon-only，沿用 .icon-btn--noborder + data-tooltip；
  icon 用 FontAwesome regular：far circle-up（上一个）、far circle-down（下一个），free-regular 库既有（FA7 命名；regular 库无 arrow-up/down，arrow-alt-circle-* 为 FA6 旧名）。

## 行为
1. 输入即查：input 事件直接重算（500 行上限内同步计算足够快，无防抖）。
   关键词 trim 后为空 → 无高亮、计数 0 / 0、↑↓ 禁用。
2. 匹配：对每行 line 原文做不区分大小写的子串匹配（indexOfIgnoreCase 循环），
   记录每个匹配的行号与行内区间；同一行多次出现 = 多个匹配。
3. 高亮：模板渲染时把每行切分为 [普通 / 链接 / 高亮 / 高亮-当前] 四类段，
   与既有 linkify 分段合并（落在链接内的匹配也高亮；链接的 Ctrl+点击行为不变）。
4. 计数：当前匹配序号 / 总数（1-based）。
5. 跳转：↑ = 上一个、↓ = 下一个，循环（首的前一个 = 尾）。
   跳转动作：设当前序号 → 滚动 log-view 使该匹配行进入视野中部（scrollIntoView block:'center'）→ 关闭自动滚动。
   关闭自动滚动的理由：否则下一批日志到达立即贴底，刚跳到的位置瞬间失效。
6. 新日志到达：匹配列表按行内容重算；当前序号越界时回落到最后一个匹配（不报错）。
7. 清空日志：不清查找状态（关键词保留，匹配重算为 0 即可）。
8. 每个 tab 的查找状态自持于各 LogTabView 实例（与 autoScroll 同模式），切 tab 互不影响。

## 样式（src/style.css，新增 CSS 变量与类）
- --log-mark: #E9D5FF（普通匹配底：比主题紫 #8B5CF6 更浅的淡紫）
- --log-mark-current: #C4B5FD（当前匹配底：深一档，区分跳转位置）
- .log-view .ln-mark { background: var(--log-mark); border-radius: 2px; }
- .log-view .ln-mark--current { background: var(--log-mark-current); border-radius: 2px; }
- 工具行内查找相关控件间距 8px；计数与按钮 nowrap、flex-shrink:0。

## 纯函数（src/util/log-search.ts，TDD）
- findMatches(line: string, query: string): Array<[start, end]> —— 单行内全部匹配区间，
  大小写不敏感，非重叠（命中后从 end 继续），空 query 返回 []。
- splitLineForSearch(line: string, query: string, current: MarkRange | null): RenderSeg[]
  —— 把一行切成 { text, inLink, url?, mark, current } 段（mark 与 current 互斥，current 优先）；
  与 linkify 分段在绝对偏移上合并切分（链接内的匹配同样高亮且保留链接属性）；无 query 时 = linkify 映射。
- escapeRegExp 不需要（用 indexOf 而非正则）。

## 组件测试（LogTabView.test.ts 追加）
- 输入关键词后，匹配文本渲染 .ln-mark 且行整体文本不变（高亮不改变文本内容）。
- 计数文案 = 当前/总数；0 匹配 = 0 / 0，↑↓ 禁用。
- ↓ 循环：2 个匹配时从 1 跳到 2、再到 1（wrap）；↑ 反向。
- 跳转后 autoScroll 被取消勾选。
- 空输入：无 .ln-mark、计数复位、按钮禁用。
- 匹配数缩减（新日志/行变化）后当前序号越界 → 回落到最后一个匹配（规格 §行为 6 的测试锚定）。
- 链接内匹配：https://… URL 中关键词被高亮且 .ln-link 仍保留。

## 验证
- npx vitest run 全绿（实际基线 289 + 新增 18 = 307+；Windows 默认 threads pool 偶发 EBUSY 文件锁时改 --pool=forks 重跑）。
- npm run build（vite + tsc 双编译）通过。

## 不做（YAGNI）
- 正则/整词/区分大小写切换开关；快捷键（Ctrl+F）; 匹配闪烁动画；跨 tab 全局查找。
