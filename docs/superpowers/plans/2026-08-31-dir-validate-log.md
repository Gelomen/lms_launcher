# 目录卡片校验结果写入 LMS Launcher 日志区 + 文案微调 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。

**目标：** 卡片校验出 ✓/✗ 时同步写一条「目录校验」sys 行到 LMS Launcher 日志区；启动检测 dir_missing 文案改为「llama.cpp 安装目录不存在」；卡片成功行去掉「（已保存）」。

**架构：** DirModule emit('validated', {ok, dir}) → App onDirValidated → appendSys；src-main/llama-check.ts 一处文案常量调整。零 IPC。

**规格：** docs/superpowers/specs/2026-08-31-dir-validate-log-design.md（已批准）。

**测试命令：** npx vitest run src/App.test.ts src-main/llama-check.test.ts；全量 npm test。

---

### 任务 1：llama-check 文案更新（TDD）

**文件：** 修改 src-main/llama-check.test.ts、src-main/llama-check.ts

- [ ] 步骤 1：更新 dir_missing 测试断言为「[lms_launcher] 启动检测 · llama.cpp 安装目录不存在：<dir>」，跑测试确认失败
- [ ] 步骤 2：更新 installCheckMessage 的 dir_missing 文案，测试通过

### 任务 2：卡片校验结果 emit + App 日志行（TDD）

**文件：** 修改 src/modules/DirModule.vue、src/App.vue、src/App.test.ts

- [ ] 步骤 1：App.test.ts 新增测试：stub validate_dir 返回 true/false，mount 后走 pickDir 路径，断言 launcher 桶出现「[lms_launcher] 目录校验 · …：<dir>」行（含目录、不含括号）
- [ ] 步骤 2：跑测试确认失败
- [ ] 步骤 3：DirModule.vue validate() 判定后 emit('validated', { ok, dir: dir.value.trim() })（仅目录非空分支）
- [ ] 步骤 4：App.vue <DirModule @validated="onDirValidated" /> + onDirValidated → appendSys（成功/失败两条文案）
- [ ] 步骤 5：DirModule 卡片成功行改「✓ llama-server.exe 已找到」
- [ ] 步骤 6：全量 npm test 通过 + npx tsc -p tsconfig.main.json

### 任务 3：收尾

- [ ] 更新 .superpowers/sdd/progress.md
- [ ] git commit
