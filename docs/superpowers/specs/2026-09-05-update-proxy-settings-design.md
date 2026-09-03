# lms_launcher 更新代理设置（托盘「设置」弹窗）设计

## 日期

2026-09-05（批准日）

## 背景

lms_launcher 的自动更新（规格 2026-09-01-auto-update-design.md / 2026-09-01-update-modal-design.md）由主进程用 Node 内置 fetch 直接请求 GitHub Releases API 与下载 CDN。Node 的 HTTP 客户端**不读取 Windows 系统代理**（如 v2rayN 设置的 WinINET 代理），只认 HTTPS_PROXY 环境变量；未设置时即直连。从国内直连 GitHub 下载 CDN 常被限速/断流，导致应用内「检查更新」超时、「下载更新」极慢或失败，而同机浏览器走系统代理下载很快。

用户明确要求：**不自动读系统代理**，而是由用户在应用内手动配置代理地址；入口放**托盘右键菜单「检查更新」下方的「设置」**，弹窗样式与「新建模板」（TemplateModal）统一。

## 目标

1. 托盘右键菜单在「检查更新」下方新增「设置」项：唤回窗口 + 发 tray-settings-request（与检查更新/退出同款机制）
2. 新增「设置」弹窗（SettingsModal）：视觉与 TemplateModal 统一（主窗口内 Vue 弹窗），两个输入框（代理地址、端口）+ 右下角 [保存]
3. 代理配置持久化到 lms_launcher.yaml（新字段 proxy_host / proxy_port），向后兼容
4. check_update / download_update 的 fetch 在配置了代理时经 HTTP 代理（undici ProxyAgent）发起，未配置时行为与现在完全一致
5. 配置错误（代理连不上）复用现有更新失败流程（error 态 + 日志），不新增特殊分支

## 非目标

- 不自动读取 Windows 系统代理（用户已明确排除）
- 不改 update.exe 逻辑（其无网络调用）
- 不改 UpdateModal 状态机契约（仅底层 fetch 变化）
- 不做 SOCKS 代理（只支持 HTTP/HTTPS 代理，如 v2rayN 的 HTTP 端口 10808）

## 详细设计

### A. 托盘入口（src-main/main.ts）

- createTray 菜单项顺序：打开 LMS 启动器 → 检查更新 → **设置** → 退出
- 「设置」点击：win.show(); win.focus(); webContents.send('tray-settings-request', {})（与「检查更新」tray-update-request 完全同构）
- 渲染端 App.vue 订阅 tray-settings-request → settingsOpen = true

### B. SettingsModal 组件（src/modules/SettingsModal.vue，新）

- 视觉语言与 TemplateModal 完全一致：
  - 复用 .modal-overlay 全局遮罩（z-index 10）
  - 32px 标题栏：文字「设置」居中；右上角 × 按钮（hover 红底白字，@close 关弹窗）
  - 卡片宽 320px、白底 12px 圆角、内容区 padding 16px
- 表单（两行，label + input 纵排，样式复用现有 .form-row / .inp 类）：
  - 代理地址：placeholder 127.0.0.1
  - 端口：placeholder 10808，数字输入
- 语义：**两框都非空 = 启用代理；任一为空 = 不使用代理**（保存后 yaml 中对应字段清空）
- 校验（点 [保存] 时）：
  - 地址非空且端口为空 → 报错「端口不能为空（或留空禁用代理）」
  - 地址为空且端口非空 → 同上
  - 端口非空但非 1–65535 整数 → 报错「端口须为 1–65535 的数字」
  - 校验红字提示样式同 TemplateModal 的 saveError
- 右下角 [保存] 按钮：与 TemplateModal 保存按钮同款（.btn 紫色 + floppy-disk 图标）
  - 成功 → emit('saved')（App 关窗）
  - 失败（IPC 异常）→ 显示错误，保留表单
- 打开时经 get_app_config 回填 proxy_host / proxy_port

### C. 配置层（src-main/config.ts）

- AppConfig 新增可选字段：
  - proxy_host?: string
  - proxy_port?: number
- 老 yaml 无字段 → undefined（兼容，行为等同未配置）
- 新 IPC save_proxy(host: string, port: string)（端口走字符串由主进程校验，防注入）：
  - trim host；port 空串 → 两字段均 undefined
  - 校验 host 非空、port 为 1–65535 整数，否则 throw（渲染端显示错误）
  - appConfigSave 写回；emitLog 一条 sys 行（[lms_launcher] 设置 · 已保存代理 http://host:port / 已清空代理）
- 读取复用现有 get_app_config（AppConfig 类型扩展自动携带）

### D. 代理 HTTP 层（src-main/update-http.ts，新）

- 显式添加 undici 依赖（Electron 内置 Node 的全局 fetch 无法传代理，且不能改全局；undici 自带 ProxyAgent 与 fetch，与 Chromium 网络栈无关）
- 导出：
  - buildProxyUri(cfg): string | null — proxy_host/proxy_port 均有效 → http://host:port，否则 null
  - makeUpdateFetch(cfg): (url: string, init?: RequestInit) => Promise<Response>
    - buildProxyUri 为 null → 直接返回全局 fetch（零行为变化）
    - 非 null → new ProxyAgent({ uri }) + undici.fetch(url, { ...init, dispatcher: agent })
- 每次调用现读 lms_launcher.yaml（配置随时可改，无需重启应用；readFile 开销可忽略，更新操作低频）

### E. 接入更新流程（src-main/main.ts）

- check_update：const fetchFn = makeUpdateFetch(appConfigLoad(p)); res = await fetchFn(RELEASE_API_URL, {...})
- download_update：同上获取 fetchFn；流式读、进度事件、10 分钟超时、失败删半成品逻辑**全部不变**
- 失败日志行（检查/下载失败两条）在启用代理时附注（代理 http://host:port），便于排查

### F. 端到端流程

1. 托盘右键「设置」→ 窗口唤回 + 「设置」弹窗打开（回填已存值）
2. 填 127.0.0.1 / 10808 → [保存] → 写 yaml + 日志行 → 关窗
3. 顶栏「有新版本!」或托盘「检查更新」→ UpdateModal → [下载更新]
4. 主进程 makeUpdateFetch 读 yaml → 有代理 → undici ProxyAgent → 走 v2rayN 下载
5. 进度条、重启流程与现状一致

## 边界与失败模式

| 场景 | 行为 |
|---|---|
| 未配置代理 | 与现状完全一致（全局 fetch 直连） |
| 只填了地址没填端口 | 保存时前端拦截，红字提示 |
| 端口非法（0/99999/abc） | 保存时前端拦截；主进程二次校验兜底 |
| 代理端口无人监听 | undici 连接失败 → 现有 error 流程（弹窗 error 态 + [更新] 日志带代理地址） |
| 应用运行中改了 yaml 文件 | 下次 check/download 现读生效（无需重启） |
| 清空两框保存 | 清除代理（yaml 字段置空），回退直连 |

## 测试与验收

- 单元（vitest，沿用现有 mock 模式）：
  - config.test.ts（改）：proxy_host/proxy_port 写入/缺省兼容/清空
  - update-http.test.ts（新）：buildProxyUri 构造与空判；makeUpdateFetch 无代理返回全局 fetch、有代理使用 ProxyAgent（mock undici）
  - App.test.ts（改）：tray-settings-request → settingsOpen；设置保存链路（mock save_proxy）
- 手工验收：
  1. 托盘右键菜单出现「设置」（检查更新下方）
  2. 设置弹窗打开/回填/保存/关窗，lms_launcher.yaml 出现 proxy_host/proxy_port
  3. 配置 v2rayN HTTP 代理后，UpdateModal 下载速度正常
  4. 清空保存后回退直连行为
  5. npx vitest run 全绿 + npm run build 通过

## 文档

- README 自动更新章节补充：托盘「设置」弹窗用途与代理配置说明
