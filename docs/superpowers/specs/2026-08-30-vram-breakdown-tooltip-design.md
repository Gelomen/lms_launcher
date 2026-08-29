# 模板弹窗 VRAM 明细悬停弹窗 (VRAM Breakdown Tooltip) 设计

日期:2026-08-30
状态:已批准(用户批注定稿)

## 1. 目标

在模板弹窗底栏「预测显存占用」指示（22.0 / 24.0 GB）右侧追加一个
circle-info 信息图标;鼠标悬停时弹出一个小弹窗,把当前配置相关的各参数与
预计占用显存逐行列出,让用户看清「占用是怎么算出来的」。

## 2. 触发图标

- 位置:底栏 .vram-indicator 内「GB」单位之后,形如「22.0 / 24.0 GB ⓘ」。
- 图标:FontAwesome free-solid circle-info,经 library.add + byPrefixAndName
  模式取用（与 xmark / floppy-disk 同模式）,约 13px、--muted 色。
- 载体:<span>（非按钮）——纯 hover 提示,无可点击行为;aria-label 保留。
- hover:mouseenter / mouseleave 控制弹窗显隐,无可点击行为。

## 3. 悬停小弹窗

### 3.1 样式

与「编辑」按钮 tooltip 同一视觉语言:深灰底 #374151 白字、--fs-label 12px、
圆角 6px、z-index:30、pointer-events:none。区别:内容是多行列表,不能用
::after 单行文本——做成自绘浮层 div(.vram-tip),沿用 .tpl-tip / .dd-tip
的 position:fixed 浮于视口方案（避开 .modal-overlay / 底栏裁剪）。

### 3.2 定位

JS 读图标 getBoundingClientRect() 取坐标;默认挂图标上方居中
（translateX(-50%) translateY(-100%)）;顶部放不下（top < 8px）翻转到图标下方。

### 3.3 内容与行排布（每行一项）

估算成功档——按 vram.ts 公式顺序 6 行,每行「参数标注 + 预计 GB（一位小数,
与底栏同口径）」;占用为 0 的行不显示（fixed 除外,恒显）:

| 行 | 参数标注 | 字节字段 |
|---|---|---|
| 1 | 模型文件（-m） | modelBytes |
| 2 | 视觉投影（--mmproj） | mmprojBytes |
| 3 | KV 缓存（-c/-ctk/-ctv/-ngl） | kvBytes |
| 4 | batch 缓冲（-b/-ub） | batchBytes |
| 5 | draft 缓存（--spec-draft-n-max） | draftBytes |
| 6 | GPU 固定开销约 2GB | fixedBytes |

第 6 行是说明性文案「GPU 固定开销约 2GB」（用户定稿的最后一行）。
5 项数据 + 1 项说明 = 6 行。

降级档——单行原因文案（与底栏 vramTooltip 同源）:

- 未填 -m:「填写模型文件（-m）后自动估算」
- 未配置显卡显存:「未配置显卡显存，点击 VRAM 按钮设置」
- 估算失败（ok:false）:reason 原文（如「GGUF: 非 GGUF 文件」）
- IPC 失败:「IPC 调用失败」

## 4. IPC 契约（向后兼容扩展）

vram_estimate 成功返回值追加分项（GiB,= EstimateResult 各字段除以 2 的 30 次方）:

{ ok: true, usedGb, parts: { model, mmproj, kv, batch, draft, fixed } }

- ok:false 形状不变（{ ok: false, reason }）,不新增字段。
- usedGb 字段保留——底栏指示仍用它,不受影响。

## 5. 动态更新

- 明细行数据 = 最近一次 vram_estimate 调用的 parts;未触发估算（未填 -m）
  显示降级文案。参数一改（9 键 watch,已有 150ms 防抖）重估,行随之更新。
- 悬停期间参数变化,弹窗内容实时更新（行由 computed 派生,不缓存快照）。

## 6. 测试

- TemplateModal 组件测试（vitest happy-dom）:
  - 底栏 .vram-indicator 内含 circle-info svg;
  - mouseenter 图标后 .vram-tip 出现;mock 分项返回后 0 项隐藏
    （未填 -b/-ub/draft、无 mmproj → 模型 + KV + GPU 固定 3 行）;
  - 估算成功时末行文案 = 'GPU 固定开销约 2GB';
  - 未填 -m → 单行「填写模型文件（-m）后自动估算」;
  - 未配置 vramTotalGb → 单行「未配置显卡显存，点击 VRAM 按钮设置」;
  - 估算失败 → 单行 reason;mouseleave 后浮层消失。

## 7. 不改动

- vram.ts 公式、EstimateResult 字段、底栏指示逻辑（数字/颜色/防抖 watch 不动）;
- llama_params.yaml 参数表、模板数据结构、启动命令拼装;
- 明细不做独立组件（内嵌 TemplateModal,与「编辑」tooltip 同为轻量浮层）。