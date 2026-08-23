# 规格 —— 「llama.cpp 安装目录」卡片下方预留校验结果行（单行共用槽位）

## 1. 需求

DirModule（模块 1）卡片在校验完成前没有校验结果文字，卡片高度较矮；一旦校验出结果（✓ …已找到 / ✗ …未找到），卡片会再高 ≈19px 并把「启动控制」卡往下挤（布局抖动）。要求：默认就给下方校验结果文字预留空间，卡片**默认高度恒定**。

## 2. 尺寸推导（CDP 实测，窗口 1006×720）

- 卡片内容（标题 32px + 输入行 32px）= **64px**，卡片总高 ≈ **104px**（padding 16×2）。
- 校验结果行 `.ok-text`/`.error-text` = 字号 12px × line-height 1.5 + margin-top 4px ≈ **22px**。
- 单行预留槽位：**height 22px**（与真实文本占位完全一致，无额外白）。
- 「保存中…」（`.label`）字号同为 12px → 与结果共用该槽位。

## 3. 改动

### 3.1 `src/modules/DirModule.vue`（模板）

把三个条件 `<p>`（ok/error/saving）替换为一个**固定高度槽位**：

```
html
<div class="dir-status">
  <p v-if="error" class="error-text">{{ error }}</p>
  <p v-else-if="status?.ok" class="ok-text">✓ {{ status.msg }}（已保存）</p>
  <p v-else-if="status && !status.ok" class="error-text">✗ {{ status.msg }}</p>
  <p v-else-if="saving" class="label">保存中…</p>
</div>
```


优先级说明（保持现有语义不变）：
- `error` 最高（config IO / 未知异常）——原来独立显示，现也进槽位第一优先；
- 其次 `status?.ok` → ✓ 行；再其次 `status && !status.ok` → ✗ 行；
- 最后 `saving` → 「保存中…」.
 注：saving 只在校验通过后短暂出现且此时必有 status，故与 error/status 行天然互斥，放最末安全。

### 3.2 `src/style.css`（新增一个规则）

```
css
.dir-status {
  height: 22px;        /* ≈1 行（12px×1.5 + margin 4px）；恒定占位 */
  margin-top: 4px;     /* 与输入行的间距，等同原 error-text margin-top */
}
.dir-status .error-text, .dir-status .ok-text { margin-top: 0; }
```


## 4. 不变项 / 边界

- 卡片**不再因校验结果出现/消失而变高**：槽位恒 22px + padding，卡片恒定 ≈126px（= 旧 104px + 22px）。
- `.stack` 两卡堆叠结构、右列模板卡、日志区零改动。
- 无 JS 逻辑改动 → 无新增测试（组件行为不变；CSS 无单测基建）。
- 验收：CDP 实机量高——初始态与校验后 `.module-dir` 卡片高度一致（≈126px）；「启动控制」卡 y 位置不再变。

## 5. 决策记录

- 用户已选「单行 + 保存中… 共用该条」：只预留 1 行，不单独给 saving 留行（更紧凑）。