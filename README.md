# LMS 启动器 (lms_launcher)

Windows 桌面版 llama-server 图形化启动器, 基于 llama.cpp, 无需命令行, 选择模板后一键启动本地大模型推理服务

主要功能:

- 记住 llama.cpp 安装位置
- 常用启动参数保存为模板, 覆盖模型文件、端口、GPU 层数、量化、采样等 40+ 参数
- 一键启动与停止服务, 多页签实时日志
- 系统托盘运行, 关闭窗口仅隐藏, 服务继续运行

## 下载安装

前往 [Releases](https://github.com/Gelomen/lms_launcher/releases) 页面下载 `.zip` 压缩包, 解压后直接运行 `lms_launcher.exe` 即可

## 编译

环境要求为 `Windows` 和 `Node.js`

1. 安装依赖:

```bash
npm install
```

2. 开发模式, 热重载并自动打开应用窗口:

```bash
npm run dev
```

3. 构建前端与主进程:

```bash
npm run build
```

4. 打包 `portable` 版 `.exe`, 也可以使用仓库根目录的 `build.bat` 一键完成清理、构建与打包:

```bash
npx electron-builder
```

产物为 `dist-release/win-unpacked/lms_launcher.exe`

5. 运行测试:

```bash
npm test
```

## 使用方式

1. 首次启动:运行 `lms_launcher.exe`, 在左上角的 `llama.cpp` 安装目录卡片中点文件夹图标, 选择包含 `llama-server.exe` 的目录, 校验通过后自动保存

2. 创建模板:在右侧启动参数模板中新建模板, 至少填写模型文件 `-m`, 枚举参数从下拉选择, 文件参数在弹窗中直接选文件, 完成后保存

3. 启动服务:在左下启动控制中下拉选择模板, 点击启动按钮, 完整启动命令会记入日志, 运行中按钮变为红色停止, 点击后优雅停止, 3 秒无响应则强制结束进程

4. 查看日志:底部日志面板分启动器与 `llama-server` 两个页签, 可分别清空

5. 退出:托盘右键退出并确认后停止服务并退出应用, 窗口右上角的关闭按钮仅隐藏到托盘, 服务继续运行

### 配置文件

所有数据以 `YAML` 格式保存在 `.exe` 所在目录, 可手动编辑:

- lms_launcher.yaml:应用设置, 包含 `llama.cpp` 安装目录
- llama_params.yaml:参数到命令行 `flag` 的映射表, 首次启动自动生成
- llama_launch_configs.yaml:参数模板, 保存第一个模板时生成
