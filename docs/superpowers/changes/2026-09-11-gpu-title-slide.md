# 变更：GPU 卡片切卡时标题行跟随滑动层

日期：2026-09-11
状态：已实施（npm test 353 全绿；npm run build 通过；待用户真机目检动画）
关联规格：`docs/superpowers/specs/2026-09-09-gpu-card-design.md` §5.1/§5.2

## 背景与用户诉求

用户报告：GPU 信息卡片切换显卡播放滑动动画时，四格数据跟着左右滑动，
但顶部的显卡标题（当前卡名）没有跟着滑动——标题在点击瞬间直接跳到新卡名，
与四格内容的滑动不同步。

用户指定：标题要跟四格一起滑动。

## 根因

- spec §5.1 原始版式把标题行定稿为「始终显示当前卡名，点击立即切换，
  不跟随层滑动」，模板实现照此：`.gpu-title-row` 放在 `.gpu-stage` 内、
  两张滑动层（`.gpu-layer`）**之外**，绑定 `gpus[index].name`。
- `.gpu-layer` 是 absolute + translateX 滑动（槽位不变量：settle 后当前卡在
  0 层），四格随层移动；而层外的标题行绑定 index，点击即 `index.value = target`
  立即换名 → 标题瞬切、四格滑动，两者不同步。
- 这是 spec 定稿行为，非回归——用户本次改需求：标题跟随层滑动。

## 方案

标题行移入滑动层内（每层一份标题，跟随该层四格一起 translateX）：

- `src/modules/GpuModule.vue`：
  - 删除 `.gpu-stage` 下、滑动层外的舞台级 `.gpu-title-row`；
  - 有数据分支：`.gpu-layer` 内 `.gpu-grid` 之前加
    `<div class="gpu-title-row"><span class="gpu-title">{{ cur(l.cardIndex)!.name }}</span></div>`；
  - 首帧占位分支：同样加 `.gpu-title-row` 显示 "…"（与四格 "…" 一致）；
  - JS 逻辑零改动：index / 圆点仍是点击立即切（圆点是舞台级指示器，维持原行为）；
    槽位不变量不变（settle 后当前卡恒在 0 层，其标题即当前卡名）。
- 动画时序沿用既有机制：点击瞬间目标层 no-anim 定位到 ±(100%+96px) 屏外
  （含其标题），下一帧滑动帧 400ms ease-out 滑入——标题与四格同层同 transform，
  全程同步滑动，裁切仍由 `.card--gpu`（overflow:hidden）承担。
- CSS 零改动：`.gpu-title-row`/`.gpu-title` 样式不变（margin-bottom 8px、
  nowrap + ellipsis 在层内宽度 = 层宽，行为一致）。

改动量：GpuModule.vue 模板 2 处 + 注释 1 处；GpuModule.test.ts 4 处断言
（动画期间目标卡标题改读目标层 1 层：新增 layerTitle 辅助）；spec §5.1/§5.2
同步。JS 逻辑零改动。

## 测试

- 既有断言不受影响：首帧占位 "…"（现读层 0 的标题）、数据到达后当前卡标题
  （settle 后当前卡在 0 层，find 命中）、圆点/模运算绕回。
- 修正 3 处动画期间断言：点击后、settle 前目标卡标题在**目标层（1 层）**，
  改用 layerTitle(w, 1) 读取（2 卡 ›、3 卡回绕 ›、快速连续点击）。
- npm test 353 全绿；npm run build 通过。

## 验收

- [x] npm test 通过（353）
- [x] npm run build 通过
- [ ] 用户真机 npm run dev 目检：切卡时标题与四格同步左右滑动，动画结束标题停在当前卡名

## 不做的事

- 圆点仍是舞台级、点击立即切（指示器语义，非滑动内容）——用户未要求改
- 不动槽位不变量 / settle 时序 / 裁切容器（均为既有定稿）
