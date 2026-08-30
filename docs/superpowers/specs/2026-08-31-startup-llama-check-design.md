# 应用启动时检测 llama.cpp 安装目录设计

日期：2026-08-31
状态：已批准（方案 A：主进程启动检测，复用 emitLog 通道）

## 1. 需求

应用启动（app whenReady）时自动检测已保存的 llama.cpp 安装目录，
并把检测结果写入 LMS Launcher 日志区（LMS Launcher 页签，stream=sys）：

1. 检测已持久化的 llama_dir（lms_launcher.yaml）是否配置
2. 检测该目录下 llama-server.exe 是否存在
3. 日志行不带任何括号文字

## 2. 方案（方案 A）

### 2.1 检测函数（纯函数，可单测）

src-main 内新增：

```ts
export type LlamaInstallStatus = 'unset' | 'dir_missing' | 'exe_missing' | 'ok';
export function checkLlamaInstall(dir: string): LlamaInstallStatus
```

判定（trim 后）：
- dir 为空 → unset（未配置）
- 目录不存在（statSync(dir, { throwIfNoEntry: false }) 为 null 或 isDirectory() 为 false）→ dir_missing
- 目录存在但 llama-server.exe 不存在 → exe_missing
- 否则 → ok

纯函数：只做 fs 判定，不写日志、不读 yaml。

### 2.2 日志行文案（全部不带括号文字）

| status | 行 |
|--------|----|
| unset | [lms_launcher] 启动检测 · 未配置 llama.cpp 安装目录 |
| dir_missing | [lms_launcher] 启动检测 · 安装目录不存在：<dir> |
| exe_missing | [lms_launcher] 启动检测 · 目录中未找到 llama-server.exe：<dir> |
| ok | [lms_launcher] 启动检测 · llama-server.exe 已找到：<dir> |

（<dir> 为原始保存值，原样展示，不转义不截断。）

### 2.3 触发时机与通道

- src-main/main.ts：app.whenReady() 内 createWindow() 之后调用 detectLlamaInstall()：
  读 appConfigLoad 的 llama_dir → checkLlamaInstall → emitLog(对应行, 'sys')。
- 不新增 IPC 命令、不新增事件、不改 preload、不改渲染端。
- 时序（2026-08-31 修复）：webContents.send 是即发即弃——渲染端未就绪（页面未加载完、
  App onMounted 尚未订阅 log-line）时发出的消息会被直接丢弃而非按通道缓存
  （dev 模式 loadURL 冷加载必丢；loadFile 快加载可侥幸收到）。
  detectLlamaInstall 因此改为：页面仍在加载时把 emitLog 挂到该窗口的
  did-finish-load 再发（此时渲染端已 mount 并订阅），已加载完则立即发。
- 检测为同步 existsSync/statSync（微秒级），直接内联，无异步处理。
- 纯新增：不影响 start_server 的 prepareLaunch 校验，不影响目录卡片（用户已批注：仅日志）。

## 3. 错误处理

- appConfigLoad 本身已是宽松加载（缺失/坏 yaml → {llama_dir: ''}），不会抛错；
  checkLlamaInstall 自身不抛：statSync 用 throwIfNoEntry:false 处理不存在路径，
  existsSync 对非法路径返回 false。detectLlamaInstall 无需额外 try/catch。

## 4. 测试（src-main 单测，vitest）

checkLlamaInstall 四分支：
- 空串 / 空白 → unset
- 不存在的临时路径 → dir_missing
- 空临时目录（无 llama-server.exe）→ exe_missing
- 临时目录 + 写入 llama-server.exe 桩 → ok

文案生成若独立为 checkMessage(dir, status) 一并覆盖四条行文本（含无括号断言）。

## 5. 非目标

- 不刷新目录卡片状态行（用户批注：仅日志）
- 不做定时复检 / 目录变更监听
- 不新增 IPC 或渲染端改动
