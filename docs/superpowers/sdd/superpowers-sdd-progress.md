# SDD 进度账本 — lms_launcher v1.1（UI 修复 + 参数选项增强）

分支：master · 基线：d8e1fc7（v1 Electron 全部完成，worktree 已合并回主仓库）· 计划：docs/superpowers/plans/2026-08-23-lms-launch-v1.1-ui-fix-and-param-options.md
规格：docs/superpowers/specs/2026-08-23-lms-launch-v1.1-ui-fix-and-param-options.md（#1–#13）

> 批次：任务 1–3 = 参数选项批（新 schema 先行）；任务 4–8 = UI 修复批；任务 9 = 全量回归 + release。
> v1 全部 SDD 工件（旧台账、progress、任务简报/报告/审查 diff）已归档至 [archive/v1.0/](../archive/v1.0/)。
> **双账本约定**：SDD 技能规定的 git-ignored *工作*账本在 `.superpowers/sdd/`（会话恢复地图，每次批次执行自动生成、不进版本库）；本文件是受版本控制的*批次*台账（每任务 commit）。两者镜像同目录命名，各司其职。

| 任务 | 状态 | 提交区间 | 审查 |
|---|---|---|---|
| 1 config/build schema + boolean（TDD，红→绿） | done | edef36c..3cc93ed | ✅ 规格+质量通过（仅次要：trailing-newline/pre-existing；红6/绿30 控制器复跑确认） |
| 2 IPC open_file_dialog（main.ts + ParamMeta） | done | 011b2a3..d412a89 | ✅ 规格+质量通过（零发现；tsc exit 0 + vitest 30/30 控制器复跑确认） |
| 3 TemplateModal rows 三分支 + 选择文件按钮 + flag-grid 自适应 | done | fd58c52..bb2a11a | ✅ 规格+质量通过（次要：fill boolean 默认 false 会写入 yaml 字段——计划强制设计，主进程 false→skip pair 已保 #9D 语义；末审分诊） |
| 4 attemptedSave 门控 + 去 * 号 + id「必填」文案 | done | 6a13102..30ff1e0（含 #9D fixup） | ✅ 规格+质量通过（用户裁决 #9D：save() 跳过 boolean=false，yaml 只留 true——按已定需求核） |
| 5 无配置文案（TemplateModule/LaunchBar）+ 下拉占位规则 | done | 37b3aa4..40bc152 | ✅ 规格+质量通过（次要：error ref 保留为裁决口径合规 + catch 注释措辞过时，留最终分诊） |
| 6 DirModule 「…」按钮 + title | done | 91cf93b..7d72dfb | ✅ 规格+质量通过（零发现；单字符 U+2026 确认） |
| 7 style.css 滚动条美化（webkit + Firefox） | done | d9e2dce..2de9704 | ✅ 规格+质量通过（纯追加零偏差；vite build 控制器确认 CSS 可处理） |
| 8 全局下拉限高 3 行 + 风格一致（先目检原生） | done | 74f1115..6196d83（含死 CSS fixup） | ✅ 规格+质量通过（控制器裁定跳过原生目检直接走 2B；次要 disabled 面板可展开留最终分诊） |
| 9 全量回归 + release portable + 前端验收清单 | done | （回归+打包由控制器执行；report .superpowers/sdd/task-9-report.md） | ✅ 步骤1 vitest 30/30+tsc+build 绿 / 步骤2 portable exe 70.9MB（v1.0.0）/ 步骤4 defaultParams 运行态核 33键+params_options5行+params_boolean3项+params_file3段；步骤3 dev 窗口 7 项目检清单已备好待 GUI 人工过 |
| 10 修复任务 4 遗漏：必填(-m)保存 gate + preview() Ref 白屏（用户实机双 bug，TDD+CDP 现场验证） | done | （见下） | ✅ CDP RED 复现两 bug（含 TypeError 现场栈）→ RED 组件测试 → GREEN 33/33 → 现场 GREEN 验证（S1 拒保存 / S2 行渲染 + 0 异常）。根因：① save() 无早退守卫（git log -S 证明 gate 从未实现，计划 task-4 step4「保存被拒」未落地）；② preview() script body 内裸访问 paramsMeta.params——ref 不自动解包，首次真实数据即炸。附带修复 watch(immediate) TDZ |

## v1.2 增量批次（单任务小改，独立规格）

| 任务 | 状态 | 提交区间 | 审查 |
|---|---|---|---|
| 11 模板列表固定高度+内部滚动（方案 B：192px 恒定占位、超出出定制滚动条；A/B 两案用户已批 B） | done | e93de37..本提交 | ✅ RED（容器缺失 +0→1）→ GREEN（TemplateModule div 包裹 + .template-list CSS + Firefox scrollbar 追加）。vitest 38/38 PASS、npm run build EXIT=0。目检待 GUI：≥7 条模板出滚动条且卡片不撑高 |
| 12 [启动]/[停止]按钮可点击态着色（[启动]绿/[停止]红/不可点击置灰） | done | aa1e052 | ✅ 纯 CSS+模板清理，用户对话批准设计（复用 --ok #16A34A）。vitest 52/52 PASS、build EXIT=0。目检由用户在 dev 窗口自验（方案 B）。注：删除 .btn-launch.running 误导红（running 时按钮本就禁用，旧规则只制造"红色却点不动"误读） |
| 13 模板配置行卡片化（去 tr border-top 横向分隔线、增高行高≈44px、每配置独立灰边框圆角卡片；用户选行卡片化，spec 2026-08-26-template-row-cards） | done | （本提交） | ✅ TDD：RED（table=1 / .tpl-row=0）→ GREEN（.tpl-row flex 两端对齐 id/编辑 + style.css .tpl-rows/.tpl-row 公共灰 --border + --radius-btn 圆角 + gap 8px）。tooltip 选择器 tr→.tpl-row。vitest 53/53 PASS、build EXIT=0。目检待 GUI：每配置一行独立圆角灰边框卡片 |
