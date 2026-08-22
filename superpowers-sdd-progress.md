# SDD 进度账本 — lms_launcher v1.1（UI 修复 + 参数选项增强）

分支：master · 基线：d8e1fc7（v1 Electron 全部完成，worktree 已合并回主仓库）· 计划：docs/superpowers/plans/2026-08-23-lms-launch-v1.1-ui-fix-and-param-options.md
规格：docs/superpowers/specs/2026-08-23-lms-launch-v1.1-ui-fix-and-param-options.md（#1–#13）

> 批次：任务 1–3 = 参数选项批（新 schema 先行）；任务 4–8 = UI 修复批；任务 9 = 全量回归 + release。
> v1 台账已归档至 docs/superpowers/archive/；执行期真实账本仍在 `.superpowers/sdd/progress.md`（gitignore）。

| 任务 | 状态 | 提交区间 | 审查 |
|---|---|---|---|
| 1 config/build schema + boolean（TDD，红→绿） | pending | — | — |
| 2 IPC open_file_dialog（main.ts + ParamMeta） | pending | — | — |
| 3 TemplateModal rows 三分支 + 选择文件按钮 + flag-grid 自适应 | pending | — | — |
| 4 attemptedSave 门控 + 去 * 号 + id「必填」文案 | pending | — | — |
| 5 无配置文案（TemplateModule/LaunchBar）+ 下拉占位规则 | pending | — | — |
| 6 DirModule 「…」按钮 + title | pending | — | — |
| 7 style.css 滚动条美化（webkit + Firefox） | pending | — | — |
| 8 全局下拉限高 3 行 + 风格一致（先目检原生） | pending | — | — |
| 9 全量回归 + release portable + 前端验收清单 | pending | — | — |
