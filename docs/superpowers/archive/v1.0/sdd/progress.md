# SDD 进度账本 — lms_launch v1（Electron 版）

分支：lms-launch-v1 · 计划：docs/superpowers/plans/2026-08-21-lms-launch-v1-electron.md

> Electron 版从 BASE 重新起算。任务 4 经两轮修复后复审 APPROVED；任务 5 probe 撞出既有 bug（validateParamKey），已修复+回归测试。

| 任务 | 状态 | 提交区间 | 审查 |
|---|---|---|---|
| 1 Electron 骨架 + Vitest 基础设施 | complete | c4e3d6f..495e696 | clean (✅ spec; 0 critical/important) |
| 2 config.ts（TDD，9 测试） | complete | 495e696..fb81655 | clean (✅ spec; 0 critical/important) |
| 3 build.ts（TDD，6 测试） | complete | fb81655..da51a3a | clean (✅ spec; 0 critical/important) |
| 4 process.ts（TDD，4 测试） | complete | da51a3a..84940e4 | APPROVED after fixes (0dbc617 error回调, 84940e4 TS2367/exited标志) |
| 5 IPC 接线 + config bug 修复 | complete | 84940e4..c413152 | APPROVED (1 important→任务6承接, minors) |
| 6 style.css + App.vue 布局骨架 | complete | c413152..0a54312 | APPROVED (0 critical/important; 2 minor: 列宽1:1:1, CSS注释排版) |
| 7 模块1+2（Dir + Templates） | complete | 0a54312..4cdd180 | APPROVED after fix (4cdd180 id校验对齐validateConfigId + 尾行换行) |
| 8 模块3+4（LaunchBar + LogPanel） | complete | 4cdd180..b280ff8 | APPROVED after 2 fixes (6def8ea App接线落地, b280ff8 configsReloadKey→ref) |
| 9 托盘 | complete | b280ff8..210b547 | APPROVED (1 important: icon路径打包态→任务10移交; 2 minors) |
| 10 验收 + release | auto-part complete / 人工验收中 | b280ff8..9097c26 | APPROVED (exe 67.6MB, icon打包态, dist-main清理) |

## 待承接事项（传给后续任务的分派）

- **[任务8 强制] invoke 错误形态约定**：invoke reject 的值是带 .message 的 Error 对象，直接 String(err) 得 [object Object]——LaunchBar/LogPanel 所有 catch 必须走 src/ipc.ts 已就位的 errMsg(e)，再 isMissing/isValidation 判 MISSING:/VALIDATION: 前缀。
- **[Minor, 不阻塞] TemplateModal placeholder**：id 输入示例 "小写字母，如 qwen_daily" 含下划线，与新校验规则（无下划线）自相矛盾——任务 8 接线时顺手改掉（一行），或留最终分诊。
- **[Minor, 不阻塞] dist-main/*.test.js 历史残留**：exclude 生效后不再产出，旧产物仍在包里——release 前清理一次即可。
- **[Minor] start_server 'data' 监听器**：当前每次 launch 都是新 child 新流，安全；若后续改动引入 child 复用需防重复挂。

## 任务 10 人工验收清单（GUI 冒烟，headless 会话未执行——任务 8/9 移交）
- **托盘 icon 打包态路径**（I-1，审查任务9）：join(__dirname,'..','src-main','icon.ico') 在 exe 产物 out/main/ 下解析不到 src-main/——需把 icon 拷入构建资源或改 app.isPackaged 分支；开发态正常、isEmpty() 兜底不崩但托盘无图标。**验收项**：打包后托盘图标可见。
- **M（不阻塞）**：main.ts window-all-closed 因 close=preventDefault+hide 成为死代码（建议注释）；App.vue invoke('exit_app') 无 catch（风险≈0）。

- 新建模板 → LaunchBar 下拉出现新配置（验证 configsReloadKey ref 响应式链路）。
- （任务 9 补）托盘菜单「启动 lms_launch」show+focus / 「退出」确认 → 优雅停止后退出；关闭窗口 = 隐藏到托盘而非退出。
## 次要发现备忘（供最终整分支审查分诊）

- [任务1] ELECTRON_MIRROR 未持久化：干净环境 npm install 需 env var ELECTRON_MIRROR=https://cdn.npmmirror.com/binaries/electron/（另 npm install-scripts allowlist 拦 electron postinstall），否则二进制缺失。建议后续加 .npmrc（electron_mirror=）或在验收环节确认——控制者决策项。
- [任务2] config.ts 错误文案与简报差「解析」二字 + 文件末尾缺换行——纯 cosmetic。
- [任务3] （计划强制）prepareLaunch 校验顺序：非法 id + exe 缺失时先报 VALIDATION 而非 MISSING；（计划强制）build.test.ts prepare_launch 测试未用 try/finally 保护 rm(dir)。均简报既定，记录防混淆。
- [任务4] timeoutSecs=0 时 SIGTERM 后直接进 taskkill 未给 close 一拍（Rust 语义一致+测试覆盖）；error 路径 exitCode=null 与 onExitCb(-1) 不一致——上报以 onExitCb 为准（已在 main.ts 接线处理）。
## 控制协议（监控规则，2026-08-25 起生效）

- **每 5 分钟定时确认**：派发任何子代理后，控制者立即运行阻塞式看门狗循环——每 5 min 检查一次 (a) 磁盘产出（git log 新提交对比基线 / 文件落盘）(b) list_agents 状态。
- **实现者零产出升级**：超过 10 min（2 次检查）仍无磁盘产出且状态 running → 立即 interrupt + 重派新实现者（复用 task-N-brief.md + 标准派发提示词），重置基线继续看门狗。同一任务最多 3 个执行者轮换。
- **审查者零响应升级**：超过 10 min 未出报告 → interrupt + 重派（同材料、严格边界提示词）。
- **子代理完成 = 自动推进**：完成通知到达后，控制者按 SDD 走核实（git log / diff --name-only / build+tsc+vitest）→ 审查/复审 → 入账本 → 下一任务，无需用户参与。
- **磁盘为准红线**：任何子代理的汇报（SHA、验证结果）都以控制者亲跑的 git/build 输出核实后才采信——本会话已三次拦截虚假 SHA/未落盘实现（任务6、8）。