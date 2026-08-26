# 下拉 / 行名截断按视觉宽度预算（CJK=2 / 拉丁=1）

日期: 2026-08-26 · 状态: 已批准（用户当日需求：中文省略"刚刚好"，英文被砍得过多——如 Qwen3.8-…；要求中文情况下不变、英文显示更多）· 前置: 任务 16/19（下拉阈值 8）、20/21（模板行名 15）

## 背景 / 根因

现行三处截断均按**字符个数**：n.length > TRUNC_AT → 前 N 字 + …(U+2026)。
中文字形宽 ≈ 2 个拉丁字母宽，同一"8 字"预算下中文视觉宽度 ≈ 16em、英文只有 8em——英文被超额省略（实测 Qwen3.8-27B-Ridge 显示为 Qwen3.8-…）。

## 规格

1. 宽度定义：CJK / 全角字符宽 = 2，其余（拉丁字母 / 数字 / 半角标点）= 1。CJK 范围：\u4e00-\u9fff（汉字）、\uf900-\ufaff（康熙部首）、\u3000-\u303f（CJK 标点）、\uff00-\uffef（全角形式）。
2. 预算定义：truncateByWidth(s, budget) —— 从左到右累加宽度，**累计恰好等于 budget 时不截断**（与原"中文 N 字不变"契约对齐）；第 k+1 个字符使累计 > budget → 取前 k 字 + …。
3. 三处预算：

| 位置 | 原阈值（字符数） | 新预算（宽度） | 中文等效 | 英文/拉丁等效 |
|---|---|---|---|---|
| LaunchBar 配置下拉（trigger + 面板行） | >8 字 → 前 8 字+… | **16** | ≤8 字不截断（同现状） | ≤16 字符不截断；超则前 15~16 字符+… |
| TemplateModal options 选项 | >8 字 → 前 8 字+… | **16** | 同上 | 同上 |
| TemplateModule 模板列表行名 | >15 字 → 前 15 字+… | **30** | ≤15 字不截断（同现状） | ≤30 字符不截断；超则前 29~30 字符+… |

4. tooltip 契约不变：仅"被截断"时携带完整值（tip/data-tooltip）；短名无省略号、无 tooltip。
5. value / yaml 保存契约不变：value 仍为原始串，截断仅展示层。
6. CSS 双保险不变（nowrap + overflow:hidden）。

## 实现

- 新工具 src/util/truncate.ts：charWidth(c)、visualWidth(s)、truncateByWidth(s, budget)（纯函数、无依赖）。
- 三组件把 n.length > TRUNC_AT ? n.slice(0, TRUNC_AT) + '…' : n 改为 truncateByWidth(n, BUDGET)。

## 验收

1. util 单元测试：中文 8/15 字边界不截断、超 1 字截断；英文 16/30 字符边界；中英混合按实际宽度。
2. 组件测试：
   - LaunchBar：LONG（29 中文字）→ 前 8 字+…（原契约不变，中文无感）；新增 17 字符英文 → 前 16 字符+…（原为 8）。
   - TemplateModal：同 LaunchBar 契约。
   - TemplateModule：29 中文字行 → 前 15 字+…（不变）；新增 31 字符英文 → 前 30 字符+…。
## 追加（当日第二轮）：超预算 ≤2 宽度 → 不手动加 …，交给 CSS 自动省略

用户复报：Qwen3.8-27B-Ridge（宽 17）只超预算 1 宽度，却手动砍成 Qwen3.8-27B-Ridg…；CSS text-overflow 按实际像素算、余量更大，视觉上行内还能再放 1 字符。

规则修订：width ≤ budget → 原样（不变）；budget < width ≤ budget+GRACE（GRACE=2）→ **全量渲染、不手动 +…**，是否出 … 交给 CSS 自动省略（.select-trigger .select-label / .tpl-row__id 已有 overflow:hidden + text-overflow:ellipsis + nowrap 双保险，不会换行撑高——任务 19 的老问题不回退）；width > budget+GRACE → 手动预算截断 + …（不变）。

实现：truncateByWidth(s, budget, grace=2) —— width ≤ b+g 原样返回，否则按 b 手动截断。中文显示不变（8 字恰 16 不截；9 字起全部交 CSS，与现状一致）。验收追加：17 宽英文 → 全量无省略号、无 tooltip；更宽长串仍手动截断。npx vitest run + build EXIT=0。
3. npx vitest run 全绿 + vite build EXIT=0。
4. GUI 目检：中文选项/行与之前视觉一致；英文下拉行 Qwen3.8-27B-Ridge 显示前 ~15~16 字符 + …，不再过早省略；hover tooltip 完整名。
