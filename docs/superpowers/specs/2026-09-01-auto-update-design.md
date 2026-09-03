# lms_launcher 自动更新设计

## 日期

2026-09-01(批准日)

## 背景

lms_launcher 是 Electron 桌面应用,当前通过 GitHub Release 分发 win-unpacked 目录(zip 解压安装,运行 lms_launcher.exe)。用户希望应用内置检查更新 + 一键更新能力。

## 目标

1. 启动时自动检查 GitHub Releases 新版本;发现新版后,顶栏版本号右侧显示**圆角、紫底白字(#8B5CF6)**的「有新版本!」按钮
2. 点击按钮 → 弹窗确认 → 下载新版 zip(显示进度)→ 启动独立 update.exe → 应用真正退出
3. update.exe 等待 lms_launcher.exe 退出后,替换文件并启动新版
4. 任何失败(下载/校验/解压/进程未退出)都**绝不影响现有可用版本**
5. 全流程日志(检查/下载/更新器,info/warning/error)都输出到 LMS Launcher 日志区

## 非目标

- 不做代码签名/公证
- 不做 SHA256 完整性校验(列为后续可选项)
- 更新器不替换 Electron 运行时 DLL(仅换 lms_launcher.exe/update.exe 两个文件);Electron 大版本升级时文档注明需整包重装

## 架构

同仓库双 Electron 产物:

- 主应用:src-main/(现有,扩展更新相关 IPC)
- 更新器:src-update/(新增,无头 Electron 应用 → update.exe,独立 appId)

发布产物:GitHub Release 资产 = win-unpacked 目录内容 + update.exe,zip 命名 lms-launcher-v{version}-win64.zip(zip 根目录即文件,与现有 win-unpacked 手动发布一致)。

## 详细设计

### A. 版本检查(主进程)

- 触发:app whenReady 后静默一次;「有新版本!」按钮点击时 re-check 后再弹窗
- 数据源:GET https://api.github.com/repos/Gelomen/lms_launcher/releases/latest(5 秒超时)
- 比较:tag_name 去 v 前缀,semver 严格大于当前 app.getVersion() 才算有新版;相等/更低/解析失败 → 无更新
- 预发布 tag(如 v0.2.0-rc.1): 2026-09-03 修复,现支持;基础版本更高时(0.1.0 → 0.2.0-rc.1)提示更新,基础版本相同时(0.2.0 → 0.2.0-rc.1)不提示
- 非 packaged(开发模式)→ 一律不可用
- 失败处理:静默(不显示按钮),但写日志 [更新] 检查失败:xxx
- 纯函数模块 src-main/update-check.ts:compareVersions(cur, latest)、parseLatestRelease(json) → 可单测

### B. 下载(主进程)

- IPC download_update:流式下载 latest 的 zip asset 到 exe 目录/lms-launcher-update.zip
- 进度:IPC 事件 update-download-progress 推送百分比 → 按钮变为「下载中 NN%」
- 失败:删半成品,恢复按钮,日志 [更新] 下载失败:xxx;用户可重试
- 日志:开始下载/完成(大小)/失败

### C. run_update(主进程)

1. spawn 安装目录的 update.exe [zipPath, installDir],{ detached: true, stdio: 'ignore' }.unref()
2. 日志:[更新] 已启动更新器,应用即将退出
3. 复用 exit_app 流程:ps.stopGraceful(3) → app.exit(0)

### D. update.exe(src-update/)

- 无 BrowserWindow/托盘/菜单/单实例锁(appId 独立,不与主应用冲突)
- 参数:update.exe <zipPath> <installDir>;缺失 → 日志 + 非 0 退出
- 流程(updater.ts 纯函数核心,可注入依赖便于测试):
  1. 轮询 lms_launcher.exe 是否仍在运行:1000ms 间隔,最多 60 次(Windows 用 tasklist /fi 按 exe 全路径匹配)
  2. 超时未退出 → ERROR 日志,退出码非 0,**不动任何文件**
  3. 已退出 → 解压 zip 到临时子目录 __update_tmp(最小解压依赖:yauzl 或 node-stream-zip),只取 lms_launcher.exe、update.exe 两项
  4. 校验:必须含 lms_launcher.exe,否则清理退出
  5. 替换:覆盖 lms_launcher.exe;update.exe 自身被锁 → 跳过并 WARN(旧版幂等服务,下轮继续)
  6. detached 启动 installDir\lms_launcher.exe → 清理 __update_tmp → 退出
- 任何异常 → 清理临时目录,ERROR 日志,非 0 退出(旧版本完好)
- 日志:追加写 installDir\lms_launcher_update.log(带时间戳),示例:
  - [INFO] 等待 lms_launcher.exe 退出(每 10 秒记一条)
  - [INFO] 检测到进程已退出,开始替换 v0.2.0
  - [INFO] 替换完成,正在启动新版
  - [ERROR] 60 秒内进程未退出,放弃更新(旧版本未改动)
  - [WARN] update.exe 自身被锁定,跳过替换(沿用旧版)

### E. update.exe 日志回显(主进程)

- whenReady:若存在 lms_launcher_update.log → 逐行 emitLog 到 LMS Launcher 日志区(前缀 [更新器])→ 删除该文件(一次性)

### F. 渲染端 UI

- App.vue:启动时 check_update;available → 版本号 span 右侧渲染按钮
- 样式(style.css):pill 圆角、bg #8B5CF6、白字、文本「有新版本!」;hover 加深;下载中变为「下载中 NN%」
- 点击 → re-check → ConfirmDialog:"发现新版本 vX,是否下载并安装?" [下载并更新] [取消]
- 下载完成 → 二次确认:"即将退出应用并开始更新,继续?" → run_update
- 失败:ConfirmDialog 报错 + 恢复按钮;日志区同步有错误行

### G. 构建与发布

- 新增 electron-builder-update.yml(update.exe 构建,输出 dist-release-update/)
- 新增 scripts/package-zip.ps1:合并 win-unpacked + update.exe → lms-launcher-v{version}-win64.zip(脚本化现手动流程,也可继续手动)
- build.bat 追加 update.exe 构建步骤

## 端到端流程

1. 启动 → 回显 update.exe 遗留日志(如有)→ check_update → 有新版 → 顶栏 [有新版本!]
2. 点击 → 确认 → download_update(进度 IPC)→ 100%
3. 二次确认 → run_update → spawn update.exe(detached)→ 主应用真退出
4. update.exe:1s 轮询 → 解压取两 exe → 覆盖 lms_launcher.exe → detached 启动新版 → 退出(全程写 lms_launcher_update.log)
5. 新版启动 → 回显 [更新器] 日志

## 边界与失败模式

| 场景 | 行为 |
|---|---|
| 断网/API 失败 | 不显示按钮;日志区 [更新] 检查失败 |
| 下载中途失败 | 删半成品,按钮恢复,日志报错,可重试 |
| 点 × 关窗(仅隐藏) | run_update 强制真正退出 |
| llama-server 运行中 | 先 stopGraceful(3),与托盘退出一致 |
| 60 秒进程未退出 | update.exe 放弃不动文件;下次启动日志可见;用户可杀进程重试 |
| update.exe 被锁 | 跳过替换(幂等),WARN |
| 用户数据 yaml | 只覆盖两个 exe,永不触碰 |
| Electron 升级 | 需整包重装(README 注明) |
| 开发版 | 不显示按钮 |

## 测试与验收

- 单元:vitest(沿用现有模式)
  - updater.ts:轮询判定、文件项过滤、校验逻辑
  - update-check.ts:compareVersions、parseLatestRelease
- 手工验收:
  1. 0.1.0 目录装 0.2.0-rc 升级包 → [有新版本!] → 走完全流程 → 版本 0.2.0 + [更新器] 回显
  2. 断网启动 → 无按钮 + 检查失败日志
  3. 更新中 kill update.exe → 旧版本完好

## 假设

- 仓库公开可读,GitHub API 匿名额度足够(60 req/h/IP)
- 资产命名 lms-launcher-v{version}-win64.zip,取 latest 中匹配项
- update.exe 与 lms_launcher.exe 同目录(README 约定)
