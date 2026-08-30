# 目录卡片校验结果写入 LMS Launcher 日志区 + 文案微调 设计

**日期：** 2026-08-31
**状态：** 已批准（用户对话中批准：日志行「带目录路径」文案）

## 1. 背景

目录卡片（模块 1）校验通过/失败时只在卡片内显示状态行（✓/✗），LMS Launcher 日志区无对应记录，
无法追溯「何时、对哪个目录做过校验」。上一轮已把**启动时**的检测写入日志区
（规格 2026-08-31-startup-llama-check-design.md），本规格补齐**用户手动校验**路径，并顺带统一两处文案。

## 2. 范围

1. 卡片校验出结果（✓ 或 ✗，目录非空时）→ 同一条 sys 日志行写入 LMS Launcher 日志区（launcher 桶）。
2. 文案调整（用户指定）：
   - 启动检测 dir_missing 行：「安装目录不存在：」→「**llama.cpp 安装目录不存在**：」
   - 卡片成功状态行：「✓ llama-server.exe 已找到（已保存）」→「✓ **llama-server.exe 已找到**」（去掉「（已保存）」）

不改变任何交互行为：校验仍在选择目录后自动触发；保存仍在校验通过后进行；卡片状态槽位布局不变。
零 IPC 改动、零主进程新通道（仅 src-main/llama-check.ts 文案常量变化，渲染端 App/DirModule 事件桥接）。

## 3. 行为

### 3.1 目录卡片校验 → 日志行

DirModule 在 validate() 判定出 ok/fail（目录非空）后 emit('validated', { ok, dir })；
App 监听该事件，经现有 appendSys 通道（sys 流，[lms_launcher] 前缀规则不变）写入：

- 成功：[lms_launcher] 目录校验 · llama-server.exe 已找到：<dir>
- 失败：[lms_launcher] 目录校验 · 未找到 llama-server.exe：<dir>

规则：
- 保存失败不阻止校验日志行（卡片 error 行已覆盖保存失败场景）。
- 目录为空的校验（status 置 null 的分支）不发日志行。
- 日志行不带任何括号文字（沿用启动检测规格约定）。

### 3.2 启动检测文案

src-main/llama-check.ts installCheckMessage 的 dir_missing 分支：
[lms_launcher] 启动检测 · llama.cpp 安装目录不存在：<dir>
其余三分支（unset/exe_missing/ok）不变。

## 4. 测试

- src-main/llama-check.test.ts：更新 dir_missing 断言为「llama.cpp 安装目录不存在」。
- src/App.test.ts：挂载 App，向 DirModule 派发生命周期（或 stub validate_dir 成功/失败后触发 pickDir 路径），
  断言 launcher 桶出现对应「目录校验」行（含目录路径，不含括号）。
- 全量 npm test 回归。

## 5. 不做的事

- 不改卡片状态行颜色/图标/槽位。
- 不把保存结果（已保存/保存失败）单独写日志。
- 不改 llama-server 日志桶。
