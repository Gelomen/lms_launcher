<!-- LMS_LAUNCHER_START -->

# LMS_LAUNCHER

## 目录

- 当前项目使用 `using-superpowers` skill 驱动
- `docs/` 目录存放项目文档, superpowers 生成的 `spec` 和 `plan` 文档放在这里
- `.superpowers/` 目录存放 superpowers 实现时的 SDD / TDD 文档（SDD 一律指 Specification-Driven Development, 见下文「术语」）
- `docs/superpowers/checks/` 存放 plan 的逐任务 check 表（路径与命名见下文「check 表」一节）
- `.temp/` 目录存放功能的验证/实现过程的临时 文档, 代码 和 脚本 文件

# 工作流

对 `src/`、`src-main/`、`configs/`、`scripts/` 的任何行为或界面改动, 不能自行判定某次改动 "太小"

## 顺序: 每道都是硬门, 未完成不得进入下一步

1. 询问用户选「先产出 spec + plan 文档」还是「直接实现/修改」, 不要自己往下走
2. 若走文档路线: 产出两份文档并 commit, 此时代码一行都不改:
   - `docs/superpowers/specs/YYYY-MM-DD-<feature-slug>.md`
   - `docs/superpowers/plans/YYYY-MM-DD-<feature-slug>.md`
3. 文档 commit 后停下, 等用户说「开始实现」, 不要自己往下走
4. 如果已经先改了代码才想起这条链, 立刻停下报告「代码已改、文档缺失」, 并问用户选「补文档」还是「回退重做」, 不要默认继续, 也不要事后补文档当作没发生
5. 当用户说 「开始实现任务1」, 那就在启动实现任务2之前停下, 依此类推, 不要擅自启动下个任务

## Plan

- plan 里的 `- [ ]` 只记 "做没做" , 不记 "怎么验、验到哪算过"
- 由实现任务的子代理做 `- [ ]` 打勾操作
- 执行记录: 留白表, 命令 + 真实输出摘要, 实现时填写

### 生成时必须取证

- 对照 spec 与 plan: 两处不一致时不要留 "二选一" , 先查 `git log` 与现有代码找依据, 能定就定并登记, 定不了才留待决并问用户
- 工具链与现状要实测: 哪份 lockfile 在生效、打包产物真实布局、依赖是否已装

### 自检

- 每张核对表所有 `|` 行的列数与该表表头一致
- 验收打勾完整性: 已提交任务不得有裸 `- [ ]` 或 `☐`

## 硬规则 / 红线

1. 不得顺手扩范围, spec 的「非目标」一节是边界
2. 主代理不亲自写实现代码, 只做编排、验收、提交
3. 子代理不 `git add`、不 commit, 改动留工作区等验收
4. 验收不接受子代理自述 "完成" , 由主代理启动子代理进行审核
5. 不得并行派单: 一次一个子代理, 按 plan 任务编号串行
6. 偏离 spec 必须先改 spec / plan, 再改代码
7. 代码领先 spec 不是进步, spec 落后于代码就是缺陷

<!-- LMS_LAUNCHER_END -->
