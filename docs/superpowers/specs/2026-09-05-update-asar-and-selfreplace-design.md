# 更新器修复：全量覆盖更新 + update.exe 两阶段自更新

日期：2026-09-05 · 状态：实现中

## 问题

实测暴露（前序已修：argv 错位、StreamZip 构造）：

1. **只替换两个 exe，真实代码层不更新**：Electron 便携版的真实应用代码在 `resources/app.asar`
   （`app.getVersion()`、主进程逻辑均从此读取），exe 只是外壳。update.exe 只拷两个 exe，
   导致更新后 exe 已是新版而 asar 仍是旧版（0.1.0），UI 显示 v0.1.0、运行旧代码。
2. **update.exe 自更新永远失败**：运行中映像被 Windows 锁定，`copy(…, update.exe)` 恒失败（WARN），
   新版 update.exe 逻辑无法上线。

## 用户要求（2026-09-05）

> 解压更新 = 将 zip 内**所有文件**按原目录结构**覆盖**当前应用目录，不是只取两个 exe 和 app.asar。

## 设计

### A. 全量覆盖（updater-core.ts）

- 解包：`extractEntry(zip, null, tmpDir)` —— node-stream-zip `extract(null, dir)` 提取**全部条目**
  并保持相对目录结构（已验证：lms_launcher.exe / update.exe / resources/app.asar … 共 75 文件落位正确）。
- 校验：zip 必须含 lms_launcher.exe（validateRelease 不变）；解包后确认 tmp 内主 exe 存在；
  `listDirFiles(tmp)` 结果为空 → 失败。
- 覆盖：遍历 tmp 内所有文件（相对路径），逐一 `copy(src, installDir/rel)`（覆盖写入），
  目标父目录不存在则创建。
- 任何失败路径不破坏可运行性：tmp 提取成功前不动安装目录；逐文件覆盖中断时新旧混排仍可用
  （Electron 外壳通用 + asar 自洽，本次事故现场已实测可启动）。

### B. update.exe 两阶段自更新

- 覆盖到 `update.exe` 时：直接 copy 若失败（运行中映像被锁）→ 拷贝为 `update.exe.new`（staging），
  并调用 `ops.scheduleSelfReplace(staged)`（可选 op，注入保持可测）。
- 主入口实现 scheduleSelfReplace：detached spawn `cmd.exe /c timeout /t 3 >nul & move /y "staged" "update.exe"`。
  当前 update.exe 随后退出 → 3 秒后 move 生效（映像已释放，新版上线）。
- 开始阶段先清理残留 `update.exe.new`（上次 move 未完成）；move 竞争失败静默，下轮自愈。

## 验证计划

1. TDD：updater-core 单测（全量覆盖顺序 / asar 落位 / staging 降级 / 空解包 / 缺主 exe）。
2. 全量 vitest + 两套 tsconfig 类型检查。
3. 端到端：运行新 update.exe（zip 在盘）→ 断言：
   - `resources/app.asar` 变为新版（package.json version = 0.2.0-rc.1）
   - `update.exe.new` 出现 → 3 秒后 cmd move 完成
   - 应用自动重启 → UI 显示 0.2.0-rc.1
