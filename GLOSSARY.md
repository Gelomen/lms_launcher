# 术语表（Glossary）

单上下文仓库，术语只放这一份（布局与消费方式见 `docs/agents/domain.md`）。
条目要求：一两句话说清边界 + 可核对的代码位置；话写不大就能验证。

## 快捷启动类型（QuickLaunchKind）

一个快捷启动条目（`QuickLaunchEntry`）的执行形态，**只有两种**，不是可扩展枚举：

- `shell` —— 在选定终端里执行一行命令。界面文案「命令行」（`src-main/i18n/dict.ts:171`）。
- `exe` —— 直接启动可执行程序（多行路径、可选管理员）。界面文案「可执行程序」（`src-main/i18n/dict.ts:172`）。

**真相源是主进程配置层**：联合类型在 `src-main/quick-launch-config.ts:13`；加载走 `qlLoad`（:121）经
`normalizeEntry`（:77）、保存经 `validateEntry`（:98）归一 —— 两个入口之外不存在第三种形态，
渲染层按字面量联合取值即可，不需要「未知类型」兜底。

**无效条目不渲染**：单条不合法时 `qlLoad` 跳过该条、把 id 收进 `QuickLaunchList.invalid`（:127），
卡片顶部只给「N 条配置无效，已跳过」的计数提示（`src/modules/QuickLaunch.vue:189`），行列表里不出现它。

**图标（2026-10-16 定版口径，票 #6 于 2026-10-19 把同一对用到列表行首）**：
`shell` → free-solid `terminal`（实心），`exe` → free-regular `file-code`（细线）。
两处必须同一对：编辑弹窗 [类型] 下拉 `src/modules/QuickLaunchModal.vue:146-148`，
列表行首图标 `src/modules/QuickLaunch.vue:137-143`。已知代价是一实心一细线
（`terminal` 没有 free-regular 变体，`file-code` 两款都有但有意取细线款）—— 用户 2026-10-16 明确接受。

回避：「脚本」「程序类型」「模式」——都不存在对应的第三种形态；要新增形态，先改主层的联合类型与校验，再谈界面。
