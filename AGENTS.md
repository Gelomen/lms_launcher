<!-- LMS_LAUNCHER_START -->

# LMS_LAUNCHER

## 目录

- 当前项目使用 `using-superpowers` skill 驱动
- `docs/` 目录存放项目文档，superpowers 生成的 `spec` 和 `plan` 文档放在这里
- `.superpowers/` 目录存放 superpowers 实现时的 SDD / TDD 文档
- `.temp/` 目录存放功能的验证/实现过程的临时 文档，代码 和 脚本 文件

## 工作流：任何代码改动都走这条链

**适用范围**：对 `src/`、`src-main/`、`configs/`、`scripts/` 的任何行为或界面改动，包括你认为很小的改动

> 唯一例外：你在回复里写明「本次跳过流程」并得到我的明确同意——你不能自行判定某次改动「太小」

**顺序（每道都是硬门，未做完不得进入下一步）**

1. `grill-me`：用选择题弹窗逐项确认
2. `brainstorming` → `writing-plans`：产出两份文档并 commit，此时代码一行都不改：
   - `docs/superpowers/specs/YYYY-MM-DD-<feature-slug>.md`
   - `docs/superpowers/plans/YYYY-MM-DD-<feature-slug>.md`
3. **停下**：文档 commit 后等我说「开始实现」，不要自己往下走。
4. 实现用 `subagent-driven-development`（SDD 子代理），TDD 先写失败测试

**偏离了怎么办**：如果你已经先改了代码才想起这条链，立刻停下报告「代码已改、文档缺失」，
并问我选「补文档」还是「回退重做」；不要默认继续，也不要事后补文档当作没发生

**不算例外的借口**：改动很小 / 只是 UI / 用户已经给了参考图 / 我先看看代码再说

<!-- LMS_LAUNCHER_END -->
