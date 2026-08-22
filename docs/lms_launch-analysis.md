# lms_launcher 分析文档

> 来源：基于 docs/sketch.md 的需求，经头脑风暴流程（superpowers:brainstorming）梳理而成。
> 结论先行：**Electron 28 + Vue 3**（2026-08-22 由 Tauri 2 改选 Electron，原因与取舍见 §2.1 修订说明），单 exe（portable）轻量启动器；v1 只交付 llama-server 模块，扩展模块（deepseek harness / codex / GPU 状态面板）见「扩展设计」章节。

## 1. 现状与目标

### 1.1 现状（run.bat 做了什么）

当前 run.bat 是一个命令行交互脚本，流程为：

1. 扫描 Models/ 下的 .gguf 主模型（排除 mmproj），让用户输入编号选择
2. 扫描 mmproj 文件，可选（自动加 --image-min-tokens 1024）
3. 推测解码类型选择：按模型文件名是否含 "mtp" / "dspark" 给建议，--spec-type
4. 拼接固定的 COMMON 参数 + 动态参数，直接执行 llama-server.exe

它的局限：**每次启动都要重新手选一遍、参数写死在 bat 里、没有日志区、窗口关掉服务就没了、无法中途停止**。

### 1.2 目标

把 run.bat 改造成图形化工具 **lms_launcher**：

- 有 UI 界面，可配置 llama.cpp 安装目录
- 管理多套启动参数模板（保存/修改/删除/选择）
- 一键启动 / 停止 llama-server，按钮随进程状态变化
- 实时日志区（只读、可选复制、自动滚动）
- 关窗口不退出，驻留任务栏（托盘图标）
- **最终成品是单个可执行程序**，双击即用；「先发自己，以后可能给别人」
- 架构上为后续模块（deepseek harness 启动、codex 启动、GPU 状态面板）留好扩展结构

## 2. 技术选型

### 2.1 三个候选方案对比

| 维度 | Tauri 2 (Rust) | Electron (Node) | Wails (Go) |
|---|---|---|---|
| 产物体积 | 单 exe 约 5~8 MB | exe + Node/Chromium，150 MB+ | 单 exe 约 5 MB |
| 运行时依赖 | 系统 WebView2（Win10/11 自带） | 自带 Chromium | 系统 WebView2 |
| 进程/日志/托盘控制 | Rust 生态最干净（sys/unix、tauri-plugin） | Node child_process，够用但生态偏重 | Go 够用，生态小于 Tauri |
| 前端 | HTML/CSS/JS，可上 Vue/React | 同左 | 同左 |
| 杀软误报风险 | 低 | 较高（Electron 常见） | 低 |
| 适合度 | **最佳** | 过重，与「轻量」冲突 | 可行但没必要 |

**原结论：Tauri 2。** 同时满足「轻量」「单 exe」「好写 UI」三个诉求。

> **修订（2026-08-22）：改选 Electron + Node/TypeScript。** 原结论保留作评估历史；改选原因：(1) Rust 工具链在沙箱/CI 环境反复受阻（TLS、严格借用检查、4–5h 编译摩擦），Electron 侧 Node TLS 与即时编译消除了最大阻塞点；(2) Electron + electron-builder portable 仍满足「单 exe」「好写 UI」诉求，代价是体积更大与杀软误报风险略升——对内部工具可接受。前端（Vue 3 + 原生 CSS）与 §4.1–4.6 的 UI 设计、§6 错误语义完全不变。

### 2.2 前端框架：Vue 3

UI 好不好看 90% 取决于 CSS（布局/配色/圆角/字体），与框架无关；但 Vue 的响应式系统在后续模块上价值很大：

- 按钮随进程状态变色 = 数据一变界面自动更新
- GPU 利用率/温度 = 定时轮询变量，零手动 DOM 同步
- 模板弹窗的表单校验、必填红框 = v-model 声明式写法，不易出「界面与状态不同步」的 bug

后续要加模块越多，手写 DOM 同步越乱，Vue 从「可选」变成「正确项」。体积成本约 30 KB（gzip），可忽略。不引入 UI 组件库（保轻量），视觉细节用纯 CSS 手写。

### 2.3 技术栈汇总

| 层 | 选型 | 说明 |
|---|---|---|
| 外壳 | Electron 28 | 窗口、托盘、子进程管理 |
| 前端 | Vue 3 + 原生 CSS | 无组件库 |
| 后端语言 | TypeScript（主/预加载进程，strict） | yaml@2 做 YAML 读写 |
| 进程管理 | node:child_process | spawn（事件驱动管道）、SIGTERM→taskkill 强杀 |
| GPU 查询（扩展） | nvidia-smi JSON 输出 | 见扩展设计 8.4 |
| 构建 | npm（Vite + tsc + electron-builder） | 本机装 Node 即可（免 Rust 工具链） |

## 3. 总体架构

按「后续会挂多个工具模块」的前提，核心层做通用、功能层做插件化（v1 只实现 llama-server 一个模块，结构上不锁死）：

```
核心层（v1 就做成通用的）
├── 进程管理器   通用 spawn / 停止 / PID 探活 / stdout+stderr 捕获（任何 exe 都能管）
├── 配置存储     lms_launcher.yaml（应用设置）、llama_params.yaml（参数模板）、llama_launch_configs.yaml（用户配置集）
└── 日志面板     通用 stdout/stderr 转发（前端只读组件）

功能层（每个功能 = 一个「工具模块」，各自独立）
├── [v1]      llama-server 模块（模板管理 + 启动/停止 + 状态）
├── [预留]    deepseek-harness 启动模块      ← 进程管理器直接复用
├── [预留]    codex 启动模块                ← 同上
└── [预留]    GPU 状态面板                   ← 独立轮询器，不依赖其他模块
```

数据文件全部与 lms_launcher.exe 同目录（沿用 sketch 的约定）：

| 文件 | 用途 | 谁可改 |
|---|---|---|
| lms_launcher.yaml | 应用设置：llama.cpp 目录等 | 工具生成/用户手改 |
| llama_params.yaml | 参数模板（参数 key → 命令行 flag 映射 + 必填列表） | 仅手动修改，是「默认标准」 |
| llama_launch_configs.yaml | 用户保存的多套启动配置 | 工具生成/用户手改 |

## 4. UI 模块设计

主窗口单屏三区 + 底部日志区（不做多页面，最轻量）。

### 4.1 模块 1 · llama.cpp 安装目录

- 输入框 + 「浏览」按钮（系统目录选择器）
- 选定后校验：该目录下是否存在 llama-server.exe，结果绿/红小字显示在旁
- 写入 lms_launcher.yaml，下次启动自动读取
- 校验失败 → 启动按钮禁用

### 4.2 模块 2 · 启动参数模板管理

主区域：已有配置列表（来自 llama_launch_configs.yaml），每行显示 id、desc、关键参数摘要（如 m 指向的模型）。

**模板弹窗**（新建 / 编辑共用，编辑时把该配置与 llama_params.yaml 合并：有填的展示、没填的留空）：

- 顶部：id 输入框（校验：非空、仅小写字母、不含空格、全局唯一；不满足变红）、desc 输入框
- 主体：按 llama_params.yaml 定义的参数逐行显示，**参数名统一以 flag 形式展示**（如 `-m:`、`--mmproj:`），行结构为「flag: 输入框」，必填项带标记
- 保存规则：
  - 必填项（id、`-m`）为空 → 对应输入框外框变红，**不保存**
  - 其余参数留空 → 该字段**不写入** yaml（保持文件干净）
  - 通过校验 → 写入 llama_launch_configs.yaml，刷新列表
- 删除：确认后从 yaml 移除该配置

**llama_params.yaml 格式**（模板，手动维护）：

```yaml
params:                     # key → 实际命令行 flag 的映射
  m: "-m"
  mmproj: "--mmproj"
  ngl: "-ngl"
  fa: "-fa"
  np: "-np"
  c: "-c"
  reasoningEffort: "--reasoning-effort"
  port: "--port"
  # ...（把 run.bat 里 COMMON 的参数都列进来）

required:                   # 必填项
  - m
```

基于现有 run.bat 的建议初始参数集：m、mmproj、spec_type、ngl、fa、np、c、b、ub、t、tb、ctk、ctv、jinja、chat_template_file、reasoning_format、reasoning_effort、spec_draft_n_max、temp、top_p、top_k、min_p、presence_penalty、repeat_penalty、load_mode、port。

**llama_launch_configs.yaml 格式**：

```yaml
config_1:                       # 用户输入的唯一 id（小写字母，无空格）
  desc: "qwen27b 日常推理"
  m: "..\\Models\\Qwen3.8-27B-MTP.gguf"
  ngl: "999"
  reasoning_effort: "low"
```

（每个配置 = 一个顶层 key，值为扁平的参数键值对；未填的参数不出现在配置里。）

### 4.3 模块 3 · 启动控制与状态

- 启动按钮 + 旁侧下拉菜单（列出 llama_launch_configs.yaml 里所有 id），选中即当前目标配置
- 状态联动：
  - llama-server 进程存在 → 按钮变色（推荐红色系），文字变「停止」
  - 进程不存在 → 恢复默认，文字「启动」
  - 点「停止」→ 结束 llama-server 进程；点「启动」→ 按下拉选中的配置启动
- 启动即把「配置 id + 完整命令行」追加进日志区，便于排查

### 4.4 模块 4 · 日志区（界面下方）

- 只读：内容可选、可复制，不可编辑
- 自动滚动到最新输出；用户向上滚动时暂停自动滚动，回到最底部时恢复（通用日志体验，实现成本低）
- 显示 llama-server 的全部 stdout / stderr 原文，**不做解析、不改写**；其上叠加行级**关键字着色**（纯显示层，不改任何字符）：

| 内容 | 颜色（Solarized Light 浅色配色） |
|---|---|
| 普通输出 | 深灰 `#3B4252` |
| 错误（error / ERR / 异常） | 红 `#D63E0A` |
| 警告（warn / warning） | 橙 `#B27500` |
| 成功/就绪（server ready / listening） | 绿 `#557C1F` |
| 时间戳、命令回显 | 中灰 `#7A8194` |

- 日志区容器为白底 + 细边框（与其他卡片一致，**不做深色块**）；着色靠前端正则关键字启发式，个别行可能误判颜色，可接受
- 等宽字体：Cascadia Code / Consolas，13px

### 4.5 设计语言（浅色干净主题）

布局参考 **LM Studio**：上区 = 安装目录卡片 + 模板管理卡片 + 启动栏；下区 = 日志卡片（占主窗口高度约一半）。

| 元素 | 规格 |
|---|---|
| 页面底色 | `#F6F7F8` 浅灰 |
| 功能卡片 | 白底 `#FFFFFF`、圆角 `12px`、边框 `1px #E2E5E9`、无/极浅阴影；内边距 `16px`，卡片间距 `12px` |
| 主按钮（启动） | 圆角矩形 `8px`、高 `36px`、蓝底 `#3B82F6` 白字；hover 加深一档 |
| 次要按钮 | 白底、边框 `1px #D0D7DE`、深灰字 |
| 状态按钮 | 空闲 = 白底蓝框显示「启动」；运行中 = 红底 `#EF4444` 白字显示「停止」；禁用 = 灰化 `#E5E7EB` |
| 输入框/下拉 | 白底、边框 `1px #D0D7DE`、圆角 `8px`、高 `32px`；focus = 蓝边框 + 柔和蓝 ring |
| 报错态 | 边框变红 `#EF4444` + 下方 12px 红色说明文字 |
| 字号 | 标题 `16px`、正文/输入 `14px`、标签/辅助 `12px`；字体跟随系统（Segoe UI） |

### 4.6 窗口与托盘行为

- 点 ×（关闭）→ 隐藏到系统托盘，llama-server **继续运行**
- 托盘菜单：「打开 lms_launcher」「退出」
- 「退出」时若 llama-server 在跑 → 确认框；确认后先停服务再退出
- 应用自身异常崩溃时，llama-server 作为子进程会随窗口进程组退出（Windows 上显式关闭 stdout/stderr 管道并设置 CREATE_NO_WINDOW 标志，保证服务不残留；此行为列入 v1 验证项）

## 5. 数据流

**启动流**：
读 llama_launch_configs.yaml → 选中 id → 按 llama_params.yaml 的 key→flag 映射把参数值翻译成命令行 → spawn llama-server.exe（记录 PID，隐藏控制台窗口）→ stdout/stderr 管道 → 日志区

**模板存取流**：
弹窗表单 → 前端校验（id 唯一、必填非空）→ 通过后写 llama_launch_configs.yaml（读-改-写，YAML 序列化，不引入格式漂移）→ 刷新列表

**状态流**：
周期轮询 PID 存活（约 1s）→ 按钮颜色/文字切换；进程退出时日志区追加一行「[lms_launcher] llama-server 已退出 (exit code N, time)」

## 6. 错误处理

| 场景 | 处理 |
|---|---|
| 安装目录下找不到 llama-server.exe | 模块 1 红字提示，启动按钮禁用 |
| llama_params.yaml 不存在或 YAML 语法错 | 提示「参数模板缺失/损坏」，提供「写入默认模板」（仅当文件不存在时；已存在时不覆盖，提示用户手动修） |
| llama_launch_configs.yaml 损坏 | 提示 + 允许从备份恢复（v1 简化为：提示用户手动修，工具不做自动备份机制） |
| id 不合法（含大写/空格）或重复 | 弹窗输入框变红，保存被拒 |
| 必填参数（`-m`）为空 | 对应输入框变红，保存被拒 |
| llama-server 启动即退出（端口占用、模型路径错等） | 日志区原样显示其报错输出；按钮自动回「启动」 |
| llama-server 运行中崩溃 / 被外部杀掉 | PID 轮询发现消失 → 按钮回「启动」，日志区追加退出标记 |
| 停止服务 | 直接 kill 子进程（llama-server 无优雅退出需求）；若 3s 未退出则强制结束 |

> 注：UI 中所有参数（包括弹窗表单、配置列表、校验提示）一律以 flag 形式展示（`-m`、`--mmproj` …），与命令行一致，便于用户对照 llama-server 参数文档。

## 7. v1 范围（实现计划边界）

**做**：
- Electron + Vue 3 工程骨架（单 exe：electron-builder portable）
- 模块 1（安装目录 + 校验）
- 模块 2（模板弹窗、llama_params.yaml / llama_launch_configs.yaml 读写、校验、红框）
- 模块 3（启动/停止按钮 + 下拉 + 状态轮询）
- 模块 4（日志区）
- 托盘驻留 + 退出确认
- 默认 llama_params.yaml 内容（由 run.bat 参数整理）

**不做**（见扩展设计，结构已留好）：
- deepseek harness / codex 启动模块
- GPU 状态面板
- 多服务同时管理、配置文件导入导出、配置自动备份

## 8. 扩展设计（v1 之后照此实施）

### 8.1 deepseek-harness 启动模块

启动方式对齐手动操作：**在 PowerShell 中执行 `pnpm dsh web`**。

- 配置项（写入 lms_launcher.yaml）：harness 项目工作目录（即 dsh 项目根目录）
- 启动：`spawn(powershell, -NoProfile -Command "pnpm dsh web")`，工作目录设为该目录，stdout/stderr → 日志区；PATH 继承自应用启动环境，因此 pnpm/Node 需在本机 PATH 中
- 停止：比 llama-server 复杂一层——直接子进程是 powershell，其下还有 pnpm → node → web server 的进程树，必须**杀整棵进程树**（Windows 上 `taskkill /T /F <pid>`），否则 node 子进程残留
- 按钮状态：同 llama-server 的状态轮询逻辑，探活改为检测 powershell 子进程
- 通用进程管理器因此需要扩展一个能力：「带工作目录 + 通过 shell 命令启动 + 进程树级终止」，llama-server 模块继续用「直接 exe 启动」模式

### 8.2 codex 启动模块

- 配置项：用户选择系统 codex 可执行程序路径（如 `C:\Users\xxx\.codex\codex.exe`），带「浏览」按钮
- 启动：直接 spawn 该 exe（直接进程模式，与 llama-server 相同），stdout/stderr → 日志区
- 停止：直接 kill 子进程（若 codex 自身派生子进程，同样需要进程树终止，实现时按 8.1 的 `taskkill /T` 方案统一处理）
- 状态按钮 / 日志区：完全复用现有模式

### 8.3 GPU 状态面板（界面独立区块）

- 数据源：nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu --format=json，约 1s 轮询一次
- 显示项（对应需求）：GPU 利用率（%）、GPU 专用显存占用、共享 GPU 内存占用、GPU 温度
- UI：四个小卡片/仪表行，利用率超阈值变色（纯 CSS 条件类即可）
- 注意：nvidia-smi 查询需先确认本机显卡为 NVIDIA；若为 AMD/Intel 集显则改用对应工具（ROCm / 无通用 CLI，届时降级为「仅显存」或提示不支持——v1 未覆盖，届时单独分析）

### 8.4 模块扩展约定

新功能模块统一遵循：独立前端区块（不改核心）、状态走 Vue 响应式变量、进程走通用进程管理器、设置项追加到 lms_launcher.yaml 的新 key。这样每次加模块只新增代码，不修改既有模块。

## 9. 遗留问题（实现前需确认）

1. **多服务并存**：v1 只管理 llama-server 一个服务进程；以后加 harness/codex 后是否允许同时跑多个服务？倾向允许（通用进程管理器已支持），届时各模块按钮独立。
2. **端口冲突**：llama-server 默认端口 9931，若被外部进程占用，llama-server 会自行报错退出并体现在日志区——不做端口探测（保持轻量）。
3. **AMD/Intel GPU**：本机是否 NVIDIA？（影响扩展 8.3 的数据源选型。）
4. **分发**：发给别人时建议附一行「首启 Windows 可能提示未知发布者，点『仍要运行』」——v1 不做代码签名。

---

*文档生成时间：2026-07-23 · 状态：待用户审查*
