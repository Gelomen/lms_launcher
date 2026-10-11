# 任务 6 简报 · IPC 接线（12 通道 + 2 事件）

你是「快捷启动卡片」14 个任务中**任务 6** 的实现者。本任务把已交付的三层（配置层 / 探测层 / 进程管理层）接到 Electron IPC 上。

**完成判据（逐行执行 A→I，J 段填真实命令与输出）**：
`docs/superpowers/checks/2026-10-10-quick-launch-card/task-06-ipc-wiring.md`
（H 段与 I 段留空不勾：按已定口径 K5，提交由主代理在验收后执行。）

**三份输入都要读**（不要自己找上下文）：
- 规格 §8（IPC 契约，逐字）：`docs/superpowers/specs/2026-10-10-quick-launch-card-design.md` :196-220
- 计划 §任务 6：`docs/superpowers/plans/2026-10-10-quick-launch-card.md` :260-279
- 该任务 check 表（同上）

---

## 1. 前置已交付（已提交，可直接 import，勿重复定义）

- `src-main/quick-launch-config.ts`（任务 3）：`:12 TerminalId`、`:14 QuickLaunchEntry`、`:16 QuickLaunchList`、`:121 qlLoad(path)`、`:138 qlSave(path, id|null, entry, available): string`、`:159 qlDelete(path, id)`、`:167 validateQuickLaunchName(name)`
- `src-main/quick-launch-terminals.ts`（任务 4）：`:17 TerminalInfo`、`:107 detectTerminals(): TerminalInfo[]`
- `src-main/quick-launch.ts`（任务 5）：`:170 QlDeps`、`:219 QuickLaunchManager 构造(deps, terminalAvailable)`、`:232 start(configId, entry) → { tabId }`、`:297 write`、`:304 resize`、`:311 stop`、`:320 stopAll(timeoutSecs)`、`:349 states()`
  - 接口事实（任务 5 实测，接线时必须知道）：`start()` 不带尺寸 → 主进程按 **80×24 兜底**建 PTY，尺寸只能由渲染端 `ql_resize` 校正（索引 K11(2)，渲染端侧的断言在任务 9/13 表里）；`states()` **不区分 shell/exe**（规格 §8 的返回类型本来没有 kind）；`start()` 只拿到 entry，**「配置存在」这一层校验不在进程管理层** → `ql_start` 必须自己先查 `qlLoad` 并用 `err.ql.notFound`（该 key 已在任务 5 的 `QL_ERR` 里备好，占位符 `{id}`）。

## 2. 本任务要用的既有代码（已取证，照抄模式，不要自造）

- `src-main/main.ts:59` `const ps = new ProcessState();` —— 单例写法参照；`:82 configDir() = join(dataDir(), configs)`、`:83-86 yamlPaths()`（**quick_launch.yaml 的路径 = `join(configDir(), String 常量)`**，见规格 §5.1 :54，不要塞进 `yamlPaths()` 的三元组，除非你确认没有别处依赖它的长度）
- `src-main/main.ts:119` `function emitLog(line: string, stream: StreamName, echoTabs?: string[]): void` —— `onSysLine` 走它（E4：不新建通道）
- `src-main/main.ts:234-465` 现有 25 个 `ipcMain.handle(name, ...)` 的写法（参数校验、返回类型标注）
- 错误前缀写法：`src-main/main.ts:311` `throw new Error(VALIDATION: + t(err.launch.noDir))` —— 前缀 + `t()`，前缀只用 `MISSING:/VALIDATION:/YAML:/STATE:/PROC:` 五种（索引 G7）
- 对话框：`src-main/main.ts:339-353`（`dialog.showOpenDialog` + `options.filters = [{ name: t(...), extensions: [...] }]`）→ `ql_pick_exe` 用 `.exe` 过滤；**取消 → 返回 `null`，不抛错**（E5）
- 窗口取用：`src-main/main.ts:458-463` 的 `mainWin()` 写法（发事件用 `win.webContents.send(...)`）
- `src-main/preload.ts:4` 是**通用** `invoke(cmd, ...args)` 透传，**没有按通道白名单**；`:5-9` 的 `onLogLine` 是 listener + removeListener 模式 → 你只需照它加 `onQlData` / `onQlExit` 两个订阅（E3：重复订阅不叠加）
- `src/ipc.ts:14-31` `declare global { interface Window { lms: {...} } }` 要补两个类型；`:45 invoke<T>(cmd, ...args)` 是既有封装
- 测试侧：`src/App.test.ts:31-37` 用 `vi.mock(./ipc)` 捕获回调（`logHandlers.push(fn)`）——你的 D1 用例与 D6a 都要用这种「捕获再驱动」的写法；`src/App.test.ts:922` 记了一个坑：`./i18n` 必须延迟 import，否则在 `vi.mock` 注册前绑定真实 ipc

## 3. 已定口径（必须遵守）

- **K3**：包管理器 npm；本任务不装依赖。
- **K8**：主进程错误消息走 `t()`；`err.ql.*` 词典在任务 8 才落地 → 现在**不要**写 `t(err.ql.xxx)` 字面量（`key-coverage.test.ts:39-45` 只认字面量调用），沿用任务 3/5 的 `QL_ERR` 常量映射写法；可复用的既有键见任务 8 表 D 段注。
- **K11(4)**：exe 类型的错误前缀由**生产侧适配器自带**（见 K13），`quick-launch.ts` 不包前缀。
- **K12(1)**：check 表 B2/E2 已更正——通道在 `main.ts` 用 `ipcMain.handle` 注册，preload 只加两个事件订阅，`src/ipc.ts` 补类型。
- **K12(2)**：D6 已拆成 **D6a 自动化形状门**（本任务必须过：`vi.mock(electron)` 捕获 `ipcMain.handle` 注册的处理器，直接调用 `ql_list` / `ql_terminals` / `ql_save` / `ql_start` / `ql_states` / `ql_stop` / `ql_write` / `ql_resize` / `ql_delete` / `ql_pick_exe` / `clipboard_read` / `clipboard_write`，断返回形状与规格 §8 逐字一致）+ **D6b 真机冒烟**（`npm run dev` 后台起 → 等 ~15s → 采 stdout/stderr → 结束进程；DevTools 逐条手测推到任务 14，不要为了它卡住）。
- **K13（新裁定，重要）**：`QlDeps.spawnExe` 的生产实现 = **每个配置一个新 `ProcessState` 实例**（`src-main/process.ts:7`），调 `launch(exe, [], configId)`（:27）。**不得复用 `main.ts:59` 的 `ps` 单例**（只持一个 child + `runningConfigId`，会与 llama-server 撞车）。适配器**必须** `takePipes()`（:62）后把 stdout/stderr 两路 `.resume()` 丢弃（规格 §7.3 的意图是「无终端、输出丢弃」；不消费则管道写满会阻塞子进程）。错误前缀由 `ProcessState` 自带（:28 `STATE:`、:46 `PROC:`）。`src-main/process.ts` 一行都不许改（B4/G4/F3）。
- **K10-3**：`ql_terminals` 最坏情况 = 3 次 `spawnSync` × 3s ≈ **9s**（典型 ~90ms）。所以：该通道**必须**是异步的（handler 里 `await` 一个把 `detectTerminals()` 包起来的调用，别在主进程同步阻塞），且**不要**加缓存（规格 §6.1 明确不缓存）。
- 通道名/参数/返回**逐字**照规格 §8（F1）；**不加规格外的通道**（F4，例如不要 `ql_restart`）。

## 4. 步骤门（对应 check 表 D 段）

1. D1：先在 `src/App.test.ts` 追加失败用例（计划 :269-273 逐字：断 `typeof mod.onQlData === function` / `typeof mod.onQlExit === function`）。既有用例一行都不改（B4）。
2. D2：`npx vitest run src/App.test.ts` → FAIL（贴输出）。
3. D3：实现 `main.ts`（`ql` 单例 + 12 通道 + 2 事件适配）、`preload.ts`（两个订阅）、`src/ipc.ts`（封装 + 类型）。
4. D4：`npx vitest run src/App.test.ts` → PASS；**并新增 D6a 的形状测试**（放哪由你定，但必须是仓库里可重复运行的测试，不是临时脚本）。
5. D5：`npx tsc -p tsconfig.main.json --noEmit` → 无错。
6. D6b：`npm run dev` 冒烟（后台起停，采输出）。**注意**：`npm run dev` 会开窗口，起不来时先看是不是端口被占；不要把它当失败判据，只要主进程无异常、无 `No handler registered` 即可。
7. G 段全部命令跑完（含 `npx vitest run src-main/i18n src/i18n.test.ts` 与 `git diff --name-only` 只含 B1-B4 + 你的 D6a 测试文件）。

## 5. 边界（越界即不勾）

- 只碰：`src-main/main.ts`、`src-main/preload.ts`、`src/ipc.ts`、`src/App.test.ts`（+ 新建 `src-main/ipc-ql.test.ts` 作为 D6a 形状门，check 表 B5 已授权；不要塞进 `src/App.test.ts`）。
- 不改：`src-main/process.ts` / `process.test.ts`、任务 3/4/5 的四个文件、`package.json` / lock。
- 不做任务 7 的事（`exit_app` 里 `await ql.stopAll(3)` 属任务 7）；不做渲染端 UI（任务 9-13）。
- 不要 `git add`、不要 commit、不要派子代理。

## 6. 交付

- 完整报告写到 `.superpowers/sdd/2026-10-10-quick-launch-card/task-06-report.md`：含 D1-D6b 每条命令与真实输出、C1-C12 ↔ 实现位置对应表、E1-E5 对应测试、K13 适配器的实现说明、自审、疑虑。
- 回传给我：状态一行（DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED）+ 测试小结一行 + 疑虑（若有）。不要贴长报告。
