# 服务生命周期日志双发至 llama-server 日志区设计

日期：2026-08-31
状态：待实现

## 1. 需求

LMS Launcher 日志区中「与 llama-server 服务生命周期相关」的日志行，同时发往
llama-server 日志区，在两个页签内均可见。范围由用户界定（服务生命周期相关行）：

| 行 | 产生处 |
|----|--------|
| [lms_launcher] 启动命令 · <command line> | 主进程 start_server |
| [lms_launcher] 停止指令已发送 | 主进程 stop_server |
| PROC 启动失败错误行 | 主进程 onExit error 分支 |
| [lms_launcher] 启动失败（配置缺失/校验未过/通用）· msg | 渲染端 doStart catch |
| [lms_launcher] 停止失败 · msg | 渲染端 doStop catch |
| [lms_launcher] 进程退出 code=N | 渲染端 onProcessExit |

**不进** llama-server 日志区（保持单桶）：目录校验行、启动检测行、params_default
回填失败行。

## 2. 方案（方案 A：显式目标列表，未来多标签页兼容）

### 2.1 IPC payload 扩展

log-line 事件 payload 新增可选字段 echoTabs: string[]：

```ts
{ line: string; stream: 'sys' | 'out' | 'err'; echoTabs?: string[] }
```

- 行总是先进主桶（stream 判据路由：sys → launcher；out/err → llama-server）
- echoTabs 列出的每个 tab id 各再写入一份（去重、忽略未知 id、忽略与主桶重复）
- 缺省/空 → 只进主桶（安全默认）
- 主进程不 import 渲染端 log-tabs 注册表（避免跨层依赖）；tab id 合法性由渲染端兜底
- preload.ts 与 ipc.ts 仅扩展类型（可选字段，向后兼容）

### 2.2 主进程发射点（main.ts，3 处加 echoTabs: ['llama-server']）

1. start_server 内 `emitLog("启动命令 · " + commandLine(args), "sys")`
2. stop_server 内 `emitLog('[lms_launcher] 停止指令已发送', 'sys')`
3. onExit error 分支 `emitLog(error, "sys")`

emitLog 签名：`emitLog(line: string, stream: StreamName, echoTabs?: string[])`；
其余发射点（启动检测、目录校验、params 回填失败）不加，保持单桶。

### 2.3 渲染端（App.vue，3 处本地点同样双写）

- LogEntry 接口新增 `echoTabs?: string[]`
- appendLine(e)：主桶照旧写入；e.echoTabs 每个 id（限存在于 logBuckets 的 id，
  去重、排除主桶）追加一份并各自执行 500 行独立裁剪
- doStart catch 三行启动失败、doStop catch 停止失败、onProcessExit 进程退出
  行 → 以 echoTabs: ['llama-server'] 写入
- 目录校验行（appendSys 默认路径）不带 echoTabs，保持单桶

### 2.4 未来新标签页扩展路径（本设计的兼容性约束）

新增（如 dsh）标签页时：log-tabs.ts 注册表追加条目 + App 分桶初始化 +
该服务发射点写 `echoTabs: ['dsh']`（需要双发两个服务时写两元素数组）；
**分发逻辑（appendLine）无需改动**。布尔标志方案不满足此约束（两桶外歧义），
已弃用。

### 2.5 不变项

- stream 枚举与行着色（ln-sys/ln-out/ln-err）零改动；llama-server 桶内生命周期行
  沿用普通 sys 样式，无额外前缀/着色
- 各桶独立 500 行裁剪、逐 tab 清空、LogPanel/LogTabView 组件零改动

## 3. 测试

App.test.ts 新增（log routing 相关 describe）：

1. 带 echoTabs: ['llama-server'] 的 sys 行 → 两 tab 均可见；不带 → 只进 launcher
2. doStart 失败行 / doStop 失败行 / onProcessExit 进程退出行 → 两 tab 均可见
3. 既有路由与裁剪用例（sys 单桶、out/err 单桶、各桶 500 裁剪、逐 tab 清空）保持通过

## 4. 错误处理

- echoTabs 含未知 id → 静默忽略（未来主进程与渲染端短暂版本不一致也不崩）
- 其余路径与现状一致，无新增错误面
