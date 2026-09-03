# 检查更新弹窗 + update.exe 同目录 实现计划

> **面向 AI 代理的工作者:** 使用 superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans 逐任务实现此计划。

**目标:** build 后 update.exe 与 lms_launcher.exe 同目录(发布 zip 自然包含);新增 v2rayN 式「检查更新」弹窗(UpdateModal)承载 检查→下载→重启 状态机;顶栏/托盘入口统一只负责打开弹窗;重启确认复用现有退出 ConfirmDialog。

**规格:** docs/superpowers/specs/2026-09-01-update-modal-design.md(已批准)。

**约定:** 所有命令在仓库根目录执行。单测命令 npm test。产物目录: dist-release/win-unpacked(主程序)、dist-release-update/win-unpacked(内含 update-版本号.exe)。

---

## 任务 1: 构建步骤 update.exe 并入 win-unpacked + package-zip 简化

文件: 创建 scripts/copy-update-exe.js;修改 build.bat;修改 scripts/package-zip.ps1

- [ ] 步骤 1: 写 scripts/copy-update-exe.js

    const fs = require('node:fs');
    const path = require('node:path');

    // 构建后步骤(build.bat 末尾调用): 把 update 产物的 portable exe 拷为
    // dist-release/win-unpacked/update.exe, 与 lms_launcher.exe 同目录。
    const root = process.env.COPY_UPDATE_EXE_ROOT || path.join(__dirname, '..');
    const srcDir = path.join(root, 'dist-release-update', 'win-unpacked');
    const destDir = path.join(root, 'dist-release', 'win-unpacked');

    const files = fs.existsSync(srcDir)
      ? fs.readdirSync(srcDir).filter((f) => f.startsWith('update-') && f.endsWith('.exe'))
      : [];
    if (files.length !== 1) {
      console.error('[copy-update-exe] 未找到唯一 update-*.exe: ' + (files.join(', ') || '无') + ' @ ' + srcDir);
      process.exit(1);
    }
    if (!fs.existsSync(destDir)) {
      console.error('[copy-update-exe] 目标目录不存在: ' + destDir);
      process.exit(1);
    }
    fs.copyFileSync(path.join(srcDir, files[0]), path.join(destDir, 'update.exe'));
    console.log('[copy-update-exe] ' + files[0] + ' -> dist-release/win-unpacked/update.exe');

- [ ] 步骤 2: 手动验证(临时 fixture, 放 .temp/up-sim 并设置 COPY_UPDATE_EXE_ROOT 指向它)
    - 建 dist-release-update/win-unpacked, 放 update-0.2.0.exe; 运行 node scripts/copy-update-exe.js
    - 预期: 输出拷贝成功; dist-release/win-unpacked/update.exe 存在
    - 再运行一次: 仍成功(幂等覆盖)
    - 再加一个 update-0.3.0.exe; 运行: 预期报错「未找到唯一」且退出码 1
    - 清理 .temp/up-sim

- [ ] 步骤 3: build.bat 末尾追加拷贝步骤
    将 build.bat 单行末尾(即 with-update-main.js 那条命令之后)追加: && node scripts/copy-update-exe.js

- [ ] 步骤 4: 简化 scripts/package-zip.ps1
    核心改动: 不再单独查找/拷贝 update exe。改为:
    - 取 dist-release/win-unpacked 为唯一源
    - 若 win-unpacked 内无 update.exe 则 throw 提示先跑 build.bat
    - 其余(暂存目录、zip 命名、Compress-Archive)保持不变
    支持环境变量 PACKAGE_ZIP_ROOT 覆盖仓库根(便于测试)。

- [ ] 步骤 5: 验证 package-zip.ps1
    - 用 PACKAGE_ZIP_ROOT 指向 .temp/up-sim(fixture 含 update.exe 与假 lms_launcher.exe)
    - 运行 pwsh -File scripts/package-zip.ps1 -Version 0.2.0
    - 预期: 生成 lms-launcher-v0.2.0-win64.zip; zip 根目录内同时含 update.exe 与 lms_launcher.exe(用 System.IO.Compression 列条目验证)
    - 删除 fixture 中的 update.exe 再跑: 预期 throw「未找到 update.exe」
    - 清理 fixture

- [ ] 步骤 6: 提交
    git add scripts/copy-update-exe.js build.bat scripts/package-zip.ps1
    git commit -m "feat: 构建后 update.exe 并入 win-unpacked 同目录并简化 package-zip"

---

## 任务 2: UpdateModal 组件(七态渲染 + 事件)

文件: 创建 src/modules/UpdateModal.vue;修改 src/style.css;创建 src/modules/UpdateModal.test.ts

- [ ] 步骤 1: 先写测试 src/modules/UpdateModal.test.ts
    用例清单(happy-dom 环境, 仿 TemplateModal.test.ts 的 mock 风格):
    1. 初始 idle: 按钮文案「检查更新」可点; 关闭按钮存在; 无进度条
    2. checking: 按钮「检查中...」disabled
    3. available: 按钮「下载更新」; 右侧显示新版号 v0.2.0
    4. downloading(42%): 按钮「下载中 42%」disabled; 进度条 width 42%
    5. ready: 按钮「重启应用」; 右侧仍显示新版号
    6. error: 按钮「重试」; 显示错误原因文本
    7. up-to-date: 按钮「检查更新」; 显示「已是最新版本 v0.1.0」
    8. emit: 按钮点击按状态发射 action 事件(check/download/retry/restart); 关闭按钮发射 close; open=false 时不渲染

- [ ] 步骤 2: 运行测试确认失败(组件不存在)
    npm test -- src/modules/UpdateModal.test.ts

- [ ] 步骤 3: 写 src/modules/UpdateModal.vue
    - props: open(boolean), items(数组, 每行含 name/phase/version/pct/errorText);
    - emits: action(index, kind), close;
    - 视觉语言同 TemplateModal: 320px 卡片, 32px 标题栏(标题居中, 右上角 × 关闭, hover 变红), 内容区 padding 16px;
    - 每行布局(单行三段, flex): 项目名(14px) | 中段(新版号/提示, 12px 灰字, 错误时红字) | 动作按钮(.text-btn);
    - 七态按钮映射: idle=检查更新(checking=禁用) / checking=检查中...(禁用) / available=下载更新 / downloading=下载中 NN%(禁用) / ready=重启应用 / error=重试 / up-to-date=检查更新;
    - downloading 时按钮下方渲染 4px 高紫色进度条(宽度 pct%);
    - 关闭按钮 hover 红色与 TemplateModal 的 modal-close 一致。

- [ ] 步骤 4: src/style.css 增加 .text-btn 样式
    .text-btn: 高度 32px, 无边框, 白色背景, 文字色 var(--text); hover 背景 #F6F7F8; disabled 灰字; 内边距 0 10px; 字号 13px。
    (注意: 代码库中已有两处 text-btn 引用, 新增全局 .text-btn 前先 grep 确认不冲突; 若冲突则改为 .update-text-btn 并在组件中使用该名)

- [ ] 步骤 5: 运行测试确认通过
    npm test -- src/modules/UpdateModal.test.ts

- [ ] 步骤 6: 全量回归 + 提交
    npm test(应全部通过)
    git add src/modules/UpdateModal.vue src/modules/UpdateModal.test.ts src/style.css
    git commit -m "feat: 新增 UpdateModal 检查更新弹窗组件(七态状态机 UI)"

---

## 任务 3: App.vue 接线(状态机 + 入口统一 + 共用退出确认)

文件: 修改 src/App.vue;修改 src/App.test.ts

- [ ] 步骤 1: 先改 App.test.ts
    新增用例(mock ipc 模块, 沿用现有 mountApp 模式):
    1. 托盘「检查更新」事件触发 → UpdateModal 打开(断言 .update-modal 渲染, 且未直接触发 check_update 的旧 confirm 流);
    2. 顶栏「有新版本!」点击 → 打开同一 UpdateModal;
    3. 完整流程: available 态点「下载更新」→ 下载中(进度事件)→ ready → 点「重启应用」→ 弹出「退出程序」确认框 → 确认 → invoke run_update;
    4. 重启确认取消 → 不 invoke run_update, 状态仍 ready;
    5. check 失败 → error 态; 点「重试」→ 重新 invoke check_update;
    6. download 失败 reason 含「尚无更新任务」→ 回落 idle 并自动重新 check。
    删除旧的两步更新确认相关断言(updateConfirm/updateRestartConfirm 相关)。

- [ ] 步骤 2: 运行测试确认失败
    npm test -- src/App.test.ts

- [ ] 步骤 3: 改 App.vue
    - 引入 UpdateModal 组件;
    - 新增状态: updateOpen(弹窗开关), updateState(七态: phase/version/pct/errorText), exitAction('exit'|'run_update');
    - 托盘检查更新事件与顶栏「有新版本!」点击 → 均只执行 updateOpen = true;
    - 初始状态映射: 启动时静默 check_update 若 available → updateState 置 available(带 version);
    - 按钮动作处理(UpdateModal action 事件):
      check: invoke check_update → 按四态结果更新 updateState(update-available→available 带 version; up-to-date→up-to-date; error→error 带原因; dev→error「开发模式不检查更新」);
      download: invoke download_update → ok 则 ready; 失败则 error(reason); 若 reason 含「尚无更新任务」则置 idle 并自动重新 check;
      retry: 按最近失败类型重发 check 或 download;
      restart: exitAction = 'run_update'; 打开退出确认框;
    - 退出确认框(现有 ConfirmDialog)的 confirm 处理: 按 exitAction 分流 —— 'exit' → invoke exit_app; 'run_update' → invoke run_update; 关闭时复位 exitConfirm 与 exitAction;
    - 删除旧的 updateConfirm/updateRestartConfirm 两阶段流程代码与模板;
    - 顶栏 update-pill 保留, 点击改为打开弹窗; 其文案/进度显示跟随 updateState。

- [ ] 步骤 4: 运行 App 测试确认通过
    npm test -- src/App.test.ts

- [ ] 步骤 5: 全量回归 + 提交
    npm test(全部通过)
    git add src/App.vue src/App.test.ts
    git commit -m "feat: App 接入检查更新弹窗(入口统一 + 共用退出确认框 + 七态流转)"

---

## 任务 4: 验收

- [ ] 步骤 1: 单元测试全绿: npm test
- [ ] 步骤 2: npm run build 成功
- [ ] 步骤 3: 完整 build.bat(若环境允许, 耗时较长可后台跑)
    验证: dist-release/win-unpacked/update.exe 存在; dist-release/win-unpacked/lms_launcher.exe 存在
- [ ] 步骤 4: package-zip.ps1 打包验证
    lms-launcher-v0.1.0-win64.zip 根目录内含 update.exe 与 lms_launcher.exe
- [ ] 步骤 5: 提交(如有验收修正)

## 验收清单(交用户手动验证)
1. 托盘「检查更新」→ 弹出新弹窗(单行: 项目名 | 版本号 | 按钮);
2. 顶栏「有新版本!」→ 弹出同一弹窗且恢复当前状态;
3. 下载中关闭弹窗再打开 → 进度不中断、状态恢复;
4. 下载完成 → 「重启应用」→ 与退出程序相同的确认框 → 确认后启动更新程序。