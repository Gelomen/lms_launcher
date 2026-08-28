# LMS 启动器 (lms_launcher)

Windows 桌面版 **llama-server** (llama.cpp) 图形化启动器。Electron + Vue 3 + TypeScript,无需命令行——选个模板,点一下按钮即可启动本地大模型推理服务。

## 目的

llama-server 启动需要拼装大量命令行参数(模型、GPU 层数、端口、采样参数……)。本工具把这套流程封装成图形界面:

- 记住 llama.cpp 安装位置
- 把常用参数组合保存为「模板」
- 一键启动 / 停止服务,实时查看日志

## 功能

| 模块 | 说明 |
|------|------|
| 安装目录 | 选择 llama.cpp 安装目录,自动校验 llama-server.exe 是否存在,结果持久化保存 |
| 参数模板 | 新建 / 编辑 / 删除启动参数模板;覆盖模型文件、端口、GPU 层数、量化缓存、采样参数等 40+ 参数,枚举下拉、布尔开关、文件选择按参数类型自动呈现 |
| 启动控制 | 配置下拉 + 单按钮:未运行显绿色 [启动],运行中显红色 [停止];启动失败自动恢复可启动状态 |
| 日志面板 | 双页签(启动器 / llama-server),逐行实时刷新,可分别清空 |
| 系统托盘 | 关闭窗口 = 隐藏到托盘(服务继续运行);双击托盘图标唤回窗口;托盘菜单 [退出] 二次确认后停止服务并退出 |
| 其他 | 单实例锁(禁止多开)、无边框窗口 + 自绘标题栏、参数校验与缺失提示 |

## 下载

前往 [Releases](https://github.com/Gelomen/lms_launcher/releases) 页面下载, 解压后运行 lms_launcher.exe

## 编译步骤

环境要求:Windows + Node.js。

1. **安装依赖**

```bash
npm install
```

2. **开发模式**(热重载,自动打开应用窗口)

```bash
npm run dev
```

3. **构建前端 + 主进程**

```bash
npm run build
```

产物:dist/(渲染端)、dist-main/(主进程)。

4. **打包 portable exe**

```bash
npx electron-builder
```

产物:dist-release/lms-launcher-1.0.0-portable.exe(免安装,解压即用)。

5. **运行测试**

```bash
npm test
```

## 使用方式

1. **首次启动**:运行 lms_launcher.exe → 左上 [llama.cpp 安装目录] 卡片,点文件夹图标选择包含 llama-server.exe 的目录,校验通过后自动保存。

2. **创建模板**:右侧 [启动参数模板] → [新建模板];至少填写模型文件 m;枚举参数(端口、量化等级、加载模式等)从下拉选择,文件参数可在弹窗内直接选文件;完成后保存。

3. **启动服务**:左下 [启动控制] → 下拉选择模板 → 点绿色 [启动];完整启动命令会记入日志。运行中按钮变红 [停止],点击后优雅停止(3 秒无响应则强杀)。

4. **查看日志**:底部日志面板分 [启动器] 与 [llama-server] 两个页签,可分别 [清空]。

5. **退出**:托盘右键 [退出] → 确认对话框 → 停止服务并退出。窗口 [×] 按钮仅隐藏到托盘,服务继续运行。

### 配置文件

所有数据以 YAML 存于 exe 所在目录(portable 解压目录):

| 文件 | 内容 |
|------|------|
| lms_launcher.yaml | 应用设置(llama.cpp 安装目录) |
| llama_params.yaml | 参数到命令行 flag 的映射表(首次启动自动生成) |
| llama_launch_configs.yaml | 参数模板(保存第一个模板时生成) |

可手动编辑,flag 映射遵循 llama-server 官方参数格式。