# 变更：GPU 卡片切卡动画数据溢出卡片边框修复

日期：2026-09-10
状态：已实施（npm test 353 全绿；待用户真机目检动画）
关联规格：`docs/superpowers/specs/2026-09-09-gpu-card-design.md` §5.2/§5.3

## 背景与用户诉求

用户报告（附截图）：GPU 信息卡片切换显卡时，播放滑动动画的那张卡的四格数据
（利用率 / 专用 / 合计 / 共享）越过卡片右边框溢出到相邻区域，动画结束归位后才消失。

## 根因

- 切卡动画用两层绝对定位层做 ±100% translateX 滑动（§5.2 槽位不变量）：
  目标卡先 no-anim 定位到 translateX(±100%)（舞台外），下一帧再过渡滑回 0。
- 舞台容器 `.gpu-stage` 只设了 position:relative，**没有 overflow:hidden**——
  绝对定位的层滑出舞台时不会被裁切，±100% 屏外层的四格内容直接画在卡片边框之外。
- 静止态（settle 后）闲置层 visibility:hidden、当前层 x=0，所以只有动画期间可见。

## 方案（v2 修订：裁切线从内容区移到卡片边框）

v1（同日早些）：`.gpu-stage` 加 `overflow:hidden`，裁切线在内容区（卡片 16px 内边距内侧）。
用户第二轮反馈（截图标注）：要的是卡片**边框**处裁切（蓝线），不是内容区（红线）——
‹ › 也贴到卡片左右边缘。

v2：
- 裁切上移到卡片：`src/App.vue` 给 GPU 卡的 `.card` 加 `.card--gpu`；
  `src/style.css` 新增 `.card--gpu { overflow: hidden; }`（圆角继承 --radius-card，角部内容同样被裁）。
- `.gpu-stage` 的 v1 overflow 撤回（舞台不再裁切，裁切边界 = 卡片边框）。
- `.gpu-body--nav` 的 32px 让位**保留不动**：‹ › 与四格内容的位置关系维持 v1 之前的定稿，
  本次只移动裁切线（内容区边缘 → 卡片边框）。

改动量：CSS 3 处、App.vue 1 行。JS 逻辑零改动。

## 验收

- [x] npm test 通过（组件/App fixture 不含 gpu-body--nav / 裁切断言）
- [x] npm run build 通过
- [ ] 用户真机 npm run dev 目检：切卡动画全程内容裁在卡片边框内，‹ › 贴卡片左右边缘

## 不做的事

- 不改动画结构（两层滑动是 spec 定稿方案，裁切即可解决，不动 JS）
- 不动其他卡片的 .card（裁切只给 GPU 卡的 .card--gpu，零波及）
