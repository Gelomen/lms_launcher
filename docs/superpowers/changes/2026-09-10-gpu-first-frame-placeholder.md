# 变更：GPU 卡片首帧恢复占位（占位与数据态位置结构恒一致）

日期：2026-09-10
状态：已实施（npm test 353 全绿；npm run build 通过）
关联规格：docs/superpowers/specs/2026-09-09-gpu-card-design.md §5.1

## 背景与用户诉求

2026-09-10 曾把首帧 "…" 占位整个删掉（留空），原因是占位态尚不知卡数，
无法预知多卡数据到达后 .gpu-body--nav 的 32px 让位是否生效，占位→数据
标签/数值跳位 32px（见 2026-09-10-gpu-first-frame-no-placeholder.md）。

用户要求恢复占位：启动时 GPU 数据未到达前显示

    –            （标题行）
    利用率              专用 GPU 内存
    –                  – / –
    GPU 内存            共享 GPU 内存
    – / –              – / –

**核心约束：标题和 4 项信息占位符的位置结构必须与数据态完全一致。**

## 根因与方案（用户批注确认）

原跳位根因是 .gpu-body--nav 的 32px 让位只在 multi（数据到达后判定多卡）
时生效。用户批注定稿：**无论单卡/多卡/首帧，‹ › 按钮恒渲染，内容区恒预留
32px 让位；单卡（及无数据）时按钮禁用不可点击**——所有状态结构唯一：

| 状态 | ‹ › 按钮 | 标题 | 利用率 | 3 个内存格 | 圆点 |
|---|---|---|---|---|---|
| 首帧（无数据） | 渲染，disabled | – | – | – / – | 不渲染 |
| 单卡有数据 | 渲染，disabled | 卡名 | N % | 实际值 | 1 实心 |
| 多卡有数据 | 渲染，enabled | 卡名 | N % | 实际值 | N 点 |

- 利用率首帧为 "–"（单值形状），三个内存格为 "– / –"（与 mem(0,0) 同形，无单位）
- 对齐（用户 2026-09-10 多轮调整）：卡名恒左右居中（占位 "–" 与数据态卡名均与卡片几何中心对齐，
  内容区让位对称 32px + 16px，.gpu-title text-align:center）；四格标签与数值左对齐
  （曾改居中，用户随后改回）
- 后续同轮微调（2026-09-10）：标签「利用率」→「GPU 利用率」；四格顺序调整为
  专用 / 共享 / GPU 内存（合计）/ GPU 利用率（2×2 行优先，spec §1 同步）；
  列距 12→24px（利用率↔专用 间距加大）；‹ › 按钮图标由纯文本 ‹/›（U+2039/203A）
  改为 FontAwesome chevron-left/chevron-right（free-regular——chevron 无 fat 样式、
  优先 regular，用户 2026-09-10；项目 byPrefixAndName 惯例）且外移贴近卡片边缘
  （16px→8px）；卡片 h2「GPU 信息」删除，
  卡名行（层内标题行）上移到层顶行=原 h2 所在行（.gpu-title-row flex:0 0 auto、
  .gpu-grid flex:1 + align-content:center 四格剩余空间垂直居中），卡名仍随层滑动、仍左右居中
- 圆点仍 v-if="gpus"（卡数未知不渲染）；圆点行固定占舞台底部 20px、层内容
  在其上方垂直居中（.gpu-layer bottom:20px），圆点从无到有不推动四格位置
- 单卡机代价：内容区比原实现永久窄 64px（无按钮的 32px 空边），换取全部
  机器全部状态零跳位（用户在 A/C 方案间选 A 并批注强化）

## 改动清单

- src/modules/GpuModule.vue：
  - 模板：删 v-if="cur(l.cardIndex)" 包裹——标题行 + 四格恒渲染，
    标题 {{ cur()?.name ?? '–' }}、利用率 util()、内存格 memOf(kind)；
    按钮删 v-if="multi" 加 :disabled="!multi"（‹ 与 › 各一处）；
    .gpu-body 删 :class 条件绑定（让位改由 CSS 基类恒带）
  - script：新增 util(i)（无数据 '–'，有数据 'N %'）与
    memOf(i, 'dedicated'|'shared'|'sum')（无数据 '– / –'，有数据走原 mem()）；
    原 mem()、动画/轮播/槽位不变量零改动
- src/style.css：
  - .gpu-body 基类恒带 padding: 0 32px；删 .gpu-body--nav 条件类
  - 新增 .gpu-nav-btn:disabled（#C7CCD4 + not-allowed，与 .icon-btn:disabled 同语言）
- 测试：
  - GpuModule.test.ts：首帧用例断言标题 "–"、四格占位、按钮存在且 disabled、无圆点；
    单卡用例改断言按钮存在且 disabled
  - App.test.ts：首帧挂载契约同步（.gpu-title 文本 "–"、可见层四格占位、2 个 disabled 按钮）；
    只查可见层（两层结构：.gpu-layer:not(.gpu-layer--off)）
- 数据层 / IPC / 主进程：零改动

## 验收

- [x] npm test 通过（353 全绿）
- [x] npm run build 通过（vite + tsc）
- [ ] 用户真机 npm run dev 目检：启动首帧显示占位（位置结构与数据态一致，
  数据到达后无任何跳位）；多卡 ‹ › 可点击轮播正常；单卡机按钮灰化不可点击

## 不做的事

- 圆点首帧不占位（卡数未知，渲染一个假点会误导；圆点行 20px 高度本已恒预留，不影响四格）
- 不改 96px 屏外停靠位与 400ms 过渡（2026-09-11 定稿维持）
- 不引入 loading 动效（YAGNI）
