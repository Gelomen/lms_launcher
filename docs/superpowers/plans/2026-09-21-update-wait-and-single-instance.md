# 实现计划：修复更新等待条件与单实例锁失效

> 对应规格：`docs/superpowers/specs/2026-09-21-update-wait-and-single-instance.md`
> 流程：轻量 SDD —— 本计划 → 实现 → 探针验证 → 独立代码审查 → 用户真机验收
> 探针产物统一放 `.temp/probe-wait/`（AGENTS.md 约定：临时调试文件进 `.temp/`）

## 任务 1：ps1 等待条件按安装目录路径过滤（+ 诊断日志）

文件：`scripts/lms-launcher-update.ps1`（第 1 步 57-66 行 + 头注释第 3 行同步）

**探针（端到端，跑真实脚本）**：`.temp/probe-wait/run-wait-probe.ps1`

- 现场：`InstallDir = D:\AI\LMS-Launcher`（真实安装目录），另有一个同名实例来自
  `dist-release\win-unpacked`（路径不同）在运行；
- 传**一个非 zip 的假包**（`.temp/probe-wait/fake.zip`，纯文本），于是脚本必然走到
  「等待 → 解压（失败）」路径，**不会覆盖安装目录任何文件**（`ExtractToDirectory` 抛异常 → catch → 清理 tmp）；
- 判定：日志出现「等待…超时」= FAIL（复现缺陷）；出现「解压更新包到临时目录」= PASS（等待已通过）；
- 探针结束恢复 `lms_launcher_update.log`（记录原内容后还原，避免污染用户应用日志回显与 verify-relaunch C5）。

**变更**：
1. 计算 `$targetExe = Join-Path ($InstallDir.TrimEnd('\\')) 'lms_launcher.exe'`；
2. 枚举 `Get-Process -Name 'lms_launcher'` 后逐进程取 `Path`（`try/catch` 包裹），
   `-ieq $targetExe` → 「本安装目录」集合，其余 → 「其他实例」集合；
3. 其他实例首次出现时记 `[INFO]`（含 PID 与路径，声明不影响本次更新）；
4. 等待本目录集合清空；超时日志追加残留进程详情（PID + 启动时间），日志文案改为
   「等待安装目录内的 lms_launcher.exe 退出超时（60s），中止更新」；
5. 头注释第 3 行同步为新语义。

**验证**：探针 PASS；PS 5.1 + pwsh 7 语法解析通过；编码保持 UTF-8 BOM + LF。

## 任务 2：单实例锁失败路径改 app.exit(0)

文件：`src-main/main.ts:27-36`

**变更**：`app.quit()` → `app.exit(0)`，注释说明「`app.quit()` 会被 `win.on('close')` 的
隐藏到托盘 `preventDefault()` 取消，实测第二实例存活 ≥60s 且带可见窗口」。

**探针**：`.temp/probe-wait/run-single-instance-probe.ps1`
- 前置：杀掉所有现存 lms_launcher 实例（含用户托盘中那个；build 也需要它们释放文件锁）；
- 步骤：`npm run build` → 启动实例 1（持锁，应存活）→ 启动实例 2（同 exe）→ 记录它是否退出与退出时延；
- 修复前实测（打包产物 8 轮）：8/8 均在 ~2.3s 退出，**未复现常驻侧** —— 常驻分支受时序影响
  （第二实例是否在 `app.quit()` 被处理前已完成窗口创建），现场以「不持锁却常驻 ≥27 分钟的实例 A」
  为间接实证，详见规格 §缺陷 2「证据强度」；
- 收尾：杀掉实例 1（探针不留残留进程）。

**验证**：探针 8/8 PASS（修复后 ~0.26s 退出，且不再经过窗口 close 流程）。

## 任务 3：verify-relaunch.ps1 C1 按安装目录路径过滤

文件：`scripts/verify-relaunch.ps1:49`
**变更**：`Get-Process -Name 'lms_launcher' | Select-Object -First 1` → 按 `-InstallDir` 路径过滤后取主进程；
无匹配时报 `[FAIL] C1`（与现语义一致）。C2 依赖同一 `$main`，自动受益。

## 任务 4：验收

1. 探针 1（等待条件）PASS；
2. 探针 2（单实例）PASS；
3. `vitest` 全量绿色 + `build` 通过；
4. 独立子代理代码审查（对三项改动的增量）；
5. 交付用户真机 E2E：重新 build 打包 → 覆盖 ps1 到安装目录 → 走一次完整更新。

## 不做

见规格 §明确不做。（不重试、不强杀、不隐藏窗口、不改 `run_update` 时序。）

## 验收结果（2026-09-21 执行记录）

| 验收项 | 结果 |
|------|------|
| 探针 1 · 等待条件（真实脚本端到端，假包不覆盖任何文件） | 修复前 **60.93s 超时中止**（与原样复现真机现场）→ 修复后 **0.27s 越过等待步骤**，并正确记下「其他位置 3 个实例不影响本次更新」 |
| 探针 2 · 单实例锁（真实打包产物，8 轮） | 修复后 **8/8 立即退出（~0.26s）**；修复前 8/8 立即退出但耗时 **~2.4s**（走完「创建窗口 → 关闭窗口」的优雅退出流程）；常驻侧未复现，见规格证据强度 |
| 单元测试 | `npm test` 31 文件 / **495 用例全绿**（与基线一致；期间一次 316 的读数是 vitest 内部 EBUSY 瞬时锁，与改动无关） |
| 构建 | `npm run build` + `electron-builder --win portable` 通过，产物 `dist-release\lms-launcher-0.3.2-rc.1-portable.exe` |
| 产物核对 | `win-unpacked\lms-launcher-update.ps1` 与仓库源文件逐字节一致（BOM 保留）；`app.asar` 内 `dist-main\main.js` 含 `app.exit(0)` 修复 |
| 残留进程 | 探针每轮自行清理，收尾无 lms_launcher 残留 |
| 独立代码审查 | 子代理只读审查（见会话记录） |

> 注：`edit` 工具会剥掉文件 BOM，本次两个 ps1 改动后均已手动恢复为 **UTF-8 with BOM + LF**
> （PS 5.1 缺 BOM 会按 ANSI 解码中文）。后续如需再编辑 ps1，务必复查 BOM。
