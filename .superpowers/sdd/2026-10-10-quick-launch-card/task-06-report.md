# 任务 6 实现报告 · IPC 接线（12 通道 + 2 事件）

> 状态：**DONE_WITH_CONCERNS**（功能与门全过；两条疑虑需主代理裁决，见 §9）
> 起点 HEAD = `8ac9fa9`，工作区开始时干净；结束时只含 B1-B5 五个文件（未 add、未 commit，按 K5）。
> check 表：`docs/superpowers/checks/2026-10-10-quick-launch-card/task-06-ipc-wiring.md`（J 段已填真实命令与输出；H/I 段按 K5 留空）

---

## 1. 起点核对（A 段）

| # | 检查项 | 实测 | 结论 |
|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` → 无输出；`git log --oneline -3` → HEAD = `8ac9fa9 docs: 任务 6 表补 B5…` | ✓ |
| A2 | 既有事件订阅模式 | `src-main/preload.ts:5-9` `onLogLine` = `const listener = …; ipcRenderer.on(…); return () => ipcRenderer.removeListener(…)` | 照抄，见 `preload.ts:62-71` |
| A3 | `emitLog` 现有签名 | `main.ts:119-122`（改动前行号）`emitLog(line, stream: 'sys'|'out'|'err', echoTabs?)` | `onSysLine` 走它，见 `main.ts:1066` |

前置三层（任务 3/4/5）的导出签名与简报一致，逐字复用，未重复定义。

## 2. 改动范围（B 段）与范围门

| # | 文件 | 实际改动 |
|---|---|---|
| B1 | `src-main/main.ts` | 新增 import（`:17-21`）+ 快捷启动段 `:983-1124`：`ql` 单例（`:1062`）、K13 适配器（`:1032`）、12 个 `ipcMain.handle`（`:1074-1123`） |
| B2 | `src-main/preload.ts` | 只加两个事件订阅 `:61-71`（`onQlData` / `onQlExit`）。**未**逐个登记通道（`:4` 是通用 `invoke` 透传，索引 K12(1)） |
| B3 | `src/ipc.ts` | `declare global` 补两个类型 `:30-31`；两个封装 `:116-122` |
| B4 | `src/App.test.ts` | 追加 1 条用例 `:1091-1100`；`vi.mock('./ipc')` 工厂补两个键 `:52-53`（+ 捕获数组 `:31-34`）。**既有用例一行未改** |
| B5 | `src-main/ipc-ql.test.ts` | 新建，16 条用例 = D6a 形状门 |

范围门（G3）实测：

```
$ git diff --name-only
src-main/main.ts
src-main/preload.ts
src/App.test.ts
src/ipc.ts
$ git status --porcelain
 M src-main/main.ts
 M src-main/preload.ts
 M src/App.test.ts
 M src/ipc.ts
?? src-main/ipc-ql.test.ts
```

`src-main/process.ts` / `process.test.ts`、任务 3/4/5 的四个文件、`package.json` / lock 均未出现在 diff 里（F3 / G4）。

## 3. D 段步骤门 · 命令与真实输出

### D1 先写失败测试

`src/App.test.ts:1091-1100`（前两条断言逐字照计划 :269-273；第三条走 `vi.importActual` 断**未 mock 的真实模块**——本文件顶部的 `vi.mock('./ipc')` 会接管 `./ipc`，只断 mock 里的键就成了自证）。

### D2 验证失败

```
$ npx vitest run src/App.test.ts
 ❯ src/App.test.ts (48 tests | 1 failed) 1044ms
   × 快捷启动 IPC 封装（任务 6） > ipc 模块导出终端相关封装 20ms
     → [vitest] No "onQlData" export is defined on the "./ipc" mock. Did you forget to return it from "vi.mock"? …
 Test Files  1 failed (1)
      Tests  1 failed | 47 passed (48)
```

### D3 实现

见 §2 的 B1-B3；关键实现见 §5（C 段对应表）与 §7（K13 适配器）。

### D4 单测转绿

```
$ npx vitest run src/App.test.ts
 ✓ src/App.test.ts (48 tests) 1119ms
 Test Files  1 passed (1)
      Tests  48 passed (48)
```

### D5 类型门

```
$ npx tsc -p tsconfig.main.json --noEmit
（无输出）EXITCODE=0
```

### D6a 自动化形状门（索引 K12(2)）

`src-main/ipc-ql.test.ts`：`vi.mock('electron')` 捕获 `ipcMain.handle` 注册的处理器 + `contextBridge.exposeInMainWorld` 暴露的 preload API，然后**直接调用**处理器。

```
$ npx vitest run src-main/ipc-ql.test.ts
 ✓ src-main/ipc-ql.test.ts (16 tests) 1901ms
   ✓ C5-C9 + C12 … shell 配置：{ tabId: "ql:<id>" }；ql_states 形状；write/resize 返回 undefined；stop 幂等；两个事件载荷逐字 402ms
   ✓ C5-C9 + C12 … exe 配置：{ tabId: null }；每配置一个新 ProcessState，且不动 llama-server 的 ps 单例（索引 K13） 607ms
 Test Files  1 passed (1)
      Tests  16 passed (16)
```

逐通道实测摘要（同一次运行）：

| 通道 | 直调结果 |
|---|---|
| `ql_list`（空文件） | `{ items: {}, invalid: [] }`（不抛 MISSING，规格 §5.2） |
| `ql_save(null, {name:'形状门 cmd',type:'shell',shell:'cmd',cmd:'echo HI',exe:'ignored.exe'})` | 返回 `'qlmv3rehxw0f64'`（`/^ql[0-9a-z]+$/`）；再 `ql_list` → 条目只含 `{name,type,shell,cmd}`（exe 字段被规整掉，规格 §5.3-6） |
| `ql_save(null, {name:'  '})` | reject `/^VALIDATION:/`（`err.ql.nameRequired`） |
| `ql_delete('qlshapedel')` | `undefined`；再删 → reject `/^VALIDATION:/`（`err.ql.notFound`，不是 MISSING） |
| `ql_terminals` | `handler.constructor.name === 'AsyncFunction'`；返回值是 Promise；元素键恰为 `['id','path']`；id ∈ 四个终端；两次调用 `a !== b`（不缓存）；本机含 `cmd`（规格 §6.3 基线） |
| `ql_start('qlnope')` | reject `/^VALIDATION:/`（`err.ql.notFound`，占位符 `{id}`） |
| `ql_start('qlshape01')`（真 cmd.exe） | `{ tabId: 'ql:qlshape01' }`；`ql_states` → `{ qlshape01: { running: true, stopping: false } }` |
| 事件 | `ql-data` 载荷键恰为 `['data','tabId']`、`tabId === 'ql:qlshape01'`；`ql-exit` 载荷键恰为 `['code','configId']`、`code` 为 number |
| `ql_write` / `ql_resize` | `undefined` |
| `ql_stop` | `undefined`；`ql_states` → `{}`；再 stop 一次不抛错（幂等） |
| `ql_start`（两个 exe 配置，真 `notepad.exe`） | 两次都 `{ tabId: null }`；`ql_states` 同时含两条；**既有 `get_state` 仍返回 `{running:false,stopping:false,configId:null}`** → 未复用 `main.ts:59` 的 `ps` 单例（K13） |
| `ql_start`（`no-such-exe-zzz.exe`） | `{ tabId: null }`（启动失败是异步 `child.on('error')`），日志通道出现 `PROC: no-such-exe-zzz.exe … 启动失败: spawn … ENOENT`（前缀由 `ProcessState` 自带，K11(4)；E4 复用既有日志通道） |
| `ql_pick_exe` | 取消 → `null`（不抛错，E5），且 `options.filters[0].extensions === ['exe']`；选中 → `'D:\\Tools\\LM Studio.exe'` |
| `clipboard_read` / `clipboard_write` | read → `string`；write → `undefined` 且随后读得到写入值 |
| preload 订阅 | `onQlData` / `onQlExit` 已暴露；订阅 → 计数 1；清理 → 计数 0 且不再收到；再订阅两次 → 2，各清理 → 0（E3） |

测试里两处**踩坑记录**（留给后续任务）：

1. `ipcMain.handle` 的**同步**处理器（`ql_delete` / `ql_write` …）直接调用会**同步 throw**，真 IPC 里才变成 reject → 测试用 `invokeRejects()`（`async` 包装）归一，否则 `expect(invoke(…)).rejects` 会在 `expect` 之前抛出。
2. `x as T(cb)` 这种「as 后紧跟调用括号」的写法在 esbuild 下解析成了别的东西（返回值变成 boolean），必须写成 `const f = x as unknown as T; f(cb)`。

### D6b 真机冒烟（`npm run dev`）

```
$ npm run dev            # 后台起，~25s 后采输出，进程随 concurrently -k 退出
[dev:vite]   VITE v6.4.3  ready in 663 ms
[dev:vite]   ➜ Local: http://localhost:1420/
[dev:electron] Connected!            # wait-port 命中，tsc 编译通过，electron . 已启动
[dev:electron] dist-main/main.js:86
[dev:electron] if (!electron_1.app.requestSingleInstanceLock()) {
[dev:electron] TypeError: Cannot read properties of undefined (reading 'requestSingleInstanceLock')
[dev:electron] Node.js v18.18.2
[dev:electron] npm run dev:electron exited with code 1
```

根因取证（与本任务改动无关）：

```
$ Get-ChildItem env: | ? Name -like "*ELECTRON*"
ELECTRON_RUN_AS_NODE=1
$ npx electron .temp/electron-probe.js        # 探针：require('electron') 拿到的是什么
PROBE typeof app: undefined
PROBE keys: 0,1,2,3,4,5,6,7,8,9,10,11        # ← 字符串（node_modules/electron/index.js 的 stub 导出）
$ Remove-Item Env:ELECTRON_RUN_AS_NODE; npx electron .temp/electron-probe.js
EXITCODE=-2147483645                          # 0x80000003 = STATUS_BREAKPOINT
```

- 本 shell 继承了 `ELECTRON_RUN_AS_NODE=1`，Electron 以「纯 Node」模式跑，`require('electron')` 返回 npm stub（一个字符串），所以 `app` 是 undefined —— 崩在 `main.js:86`，即 `main.ts` 的**第一句**，与本次改动无关。
- 去掉该变量后 Electron 以 **STATUS_BREAKPOINT** 退出，正是规格 §9.5 / §13.2 已记录的「本 harness 起不了 Electron GUI」。
- 有信息量的部分：崩溃点在 `main.js:86`，说明**模块图全部加载成功**（含新增的 `quick-launch*` 三个模块与 `@lydell/node-pty` 原生绑定；另单独验证 `node -e "require('@lydell/node-pty')"` → `spawn` 是 function）。全程**没有 `No handler registered`**。
- 结论：D6b 在本环境只能做到「起停 + 采输出 + 排除接线类错误」；DevTools 逐条手测按索引 K12(2) 推到任务 14。探针留在 `.temp/electron-probe.js`（`.temp/` 已被 gitignore）。

### G 段回归门

```
$ npx vitest run src/App.test.ts src-main/ipc-ql.test.ts src-main/quick-launch.test.ts \
    src-main/quick-launch-config.test.ts src-main/quick-launch-terminals.test.ts src-main/process.test.ts
 ✓ src-main/quick-launch-terminals.test.ts (9 tests)
 ✓ src-main/quick-launch-config.test.ts (19 tests)
 ✓ src-main/quick-launch.test.ts (17 tests)
 ✓ src/App.test.ts (48 tests)
 ✓ src-main/ipc-ql.test.ts (16 tests)
 ✓ src-main/process.test.ts (5 tests) 6335ms
 Test Files  6 passed (6)
      Tests  114 passed (114)

$ npx vitest run src-main/i18n src/i18n.test.ts      # V4 / i18n 硬门（key-coverage + no-hardcoded）
 ✓ src-main/i18n/index.test.ts (3 tests)
 ✓ src-main/i18n/no-hardcoded.test.ts (2 tests)
 ✓ src-main/i18n/key-coverage.test.ts (2 tests)
 ✓ src-main/i18n/dict.test.ts (11 tests)
 ✓ src/i18n.test.ts (4 tests)
 Test Files  5 passed (5)
      Tests  22 passed (22)

$ npx tsc -p tsconfig.main.json --noEmit
TSC_EXITCODE=0

# 额外（不在本任务门内，为给主代理多一层证据）
$ npx vitest run
 Test Files  44 passed (44)
      Tests  731 passed (731)
```

## 4. 通道与事件的逐字对照（规格 §8:199-219）

见下表 §5。

## 5. C1-C12 ↔ 实现位置对应表

| # | 通道 / 事件 | 规格 §8 逐字 | 实现位置（改后真实行号） | 形状断言所在用例 |
|---|---|---|---|---|
| C1 | `ql_list` | — → `QuickLaunchList` | `main.ts:1074` `(): QuickLaunchList => qlLoad(qlYamlPath())` | 「ql_list：缺失文件 → `{items:{},invalid:[]}`」+「ql_save … 再 `ql_list`」 |
| C2 | `ql_save` | `id: string \| null, entry` → `string`（最终 id） | `main.ts:1076-1079`（含 §5.3-4 的 `available` 实测） | 「ql_save(id=null, entry) → 最终 id」 |
| C3 | `ql_delete` | `id` → `void`；不存在 → `VALIDATION:` | `main.ts:1081-1083`（`qlDelete` 自带 `err.ql.notFound`） | 「ql_delete → undefined；再删同 id → VALIDATION:」 |
| C4 | `ql_terminals` | — → `TerminalInfo[]` | `main.ts:1085` + `detectTerminalsAsync()`（`:1018-1020`） | 「handler 是 async 函数」「返回 TerminalInfo[] … 不缓存」 |
| C5 | `ql_start` | `id` → `{ tabId: string \| null }` | `main.ts:1087-1097`（先查「配置存在」→ `err.ql.notFound`） | 「ql_start 未知 id」「shell 配置」「exe 配置」 |
| C6 | `ql_stop` | `id` → `void`（幂等） | `main.ts:1099-1101` | 「stop 幂等」断言（连停两次） |
| C7 | `ql_write` | `id, data: string` → `void` | `main.ts:1102-1104` | 「write/resize 返回 undefined」 |
| C8 | `ql_resize` | `id, cols, rows` → `void` | `main.ts:1105-1107` | 同上 |
| C9 | `ql_states` | — → `Record<string,{running;stopping}>` | `main.ts:1108` | 「ql_states 形状」两处断言 |
| C10 | `ql_pick_exe` | — → `string \| null`（`.exe` 过滤） | `main.ts:1110-1119`（照 `:343-355` 的 `open_file_dialog` 模式） | 「取消对话框 → null，且过滤器是 .exe」「选中 → 返回路径」 |
| C11 | `clipboard_read` / `clipboard_write` | — → `string` / `text: string` → `void` | `main.ts:1121-1123`（Electron `clipboard`，import 在 `:1`） | 「C11 · clipboard_read / clipboard_write」 |
| C12 | 事件 `ql-data` = `{tabId,data}`；`ql-exit` = `{configId,code}` | 规格 §8:218-219 | `main.ts:1064-1065`（`ql` 的 `onData` / `onExit` → `mainWin()?.webContents.send`）；渲染侧订阅 `preload.ts:62-71` + `src/ipc.ts:116-122` | 「两个事件载荷逐字」（断载荷键集合恰为 `['data','tabId']` / `['code','configId']`） |

**没有规格外通道**（F4）：用例「没有规格外的 `ql_*` 通道」把已注册的 `ql_*` 集合与 §8 的 11 个 `ql_*` 逐字比对。

## 6. E1-E5 ↔ 测试对应

| # | 断言 | 落点 | 钉住它的测试 |
|---|---|---|---|
| E1 | `src/ipc.ts` 导出 `onQlData` / `onQlExit` | `src/ipc.ts:116-122` | `src/App.test.ts:1091-1100`（计划逐字 + `vi.importActual` 断真实模块） |
| E2 | 12 个通道全在 `main.ts` 注册；`window.lms` 类型补两项 | `main.ts:1074-1123`；`src/ipc.ts:30-31` | `ipc-ql.test.ts`「12 个通道全部注册」；类型项由 D5 的 `tsc` 与 D6a 的 `contextBridge` 捕获共同钉 |
| E3 | 事件订阅用 removeListener 清理、重复订阅不叠加 | `preload.ts:62-71`（照 `:5-9`） | `ipc-ql.test.ts`「E3 · preload 的两个事件订阅」：计数 1 → 清理 → 0 且不再收到；再订阅两次 → 2 → 各清理 → 0 |
| E4 | `onSysLine` 不新建通道，复用既有日志通道 | `main.ts:1066` `onSysLine: (_configId, line) => emitLog('[lms_launcher] ' + line, 'sys')`；适配器另把 `PROC` 文本送 `emitLog(error,'sys')`（`:1050`） | 「exe 启动失败 … 经既有日志通道反馈」断 `log-line` 事件里出现 `/^PROC:/` 且 `stream==='sys'` |
| E5 | `ql_pick_exe` 取消 → `null`，不抛错 | `main.ts:1117` `res.canceled ? null : res.filePaths[0]`；无窗口同样 `null`（`:1112`） | 「取消对话框 → null」 |

## 7. K13 适配器（`main.ts:1021-1059`）

`QlDeps.spawnExe` 的生产实现 = **每个配置一个新 `ProcessState`**：

```ts
const p = new ProcessState();
let launchError: unknown = null;
void p.launch(exe, [], configId).catch((e) => { launchError = e; });
try {
  const { stdout, stderr } = p.takePipes();
  stdout.resume(); stderr.resume();          // 规格 §7.3「输出丢弃」：不消费则管道写满会阻塞子进程
} catch (e) { throw launchError instanceof Error ? launchError : e; }
return { onExit(cb) { p.onExit((code, error) => { if (error) emitLog(error, 'sys'); cb(code); }); },
         stopGraceful: (s) => p.stopGraceful(s), isRunning: () => p.isRunning() };
```

要点与取证：

1. **不复用 `main.ts:59` 的 `ps`**：`ProcessState` 只持一个 `child` 与 `runningConfigId`（`process.ts:9/:16`），复用会与 llama-server 撞车。测试用两个 exe 配置同时运行 + 断既有 `get_state` 仍为 `{running:false,…}` 来钉这条。
2. **`takePipes()` 可以同步调用**：`process.ts:27-59` 的 `launch` 虽是 `async`，但函数体内没有 `await`，`spawn` 与 `state='running'` 在调用返回前已完成 → 适配器随后同步取管道不会撞 `STATE: err.proc.noChild`。`spawn` 的 ENOENT 是异步 `child.on('error')`（`process.ts:37-47`），走 `onExit(-1, 'PROC: …')` → 日志区。
3. **`.resume()` 两路**：`process.ts:33` 的 `stdio` 是 `["ignore","pipe","pipe"]`，本期不可改（G4），所以必须排空丢弃，否则管道写满阻塞子进程（索引 K13 的原文）。
4. **错误前缀不自造**（K11(4)）：`STATE:` / `PROC:` 由 `ProcessState` 自带（`:28` / `:46`）；适配器只在 `takePipes()` 失败时优先抛 `launch` 的原始错误，避免把 `STATE:` 换成 `err.proc.noChild` 这种误导。
5. **`configId` 的来路**：`QlDeps.spawnExe(exe)` 的签名里没有 configId（任务 5 的 C4 逐字），而 K13 要求 `launch(exe, [], configId)`。解法是一个**只覆盖一次 `start()`** 的槽 `qlStartContext`（`main.ts:1011`）：`ql_start` 在调用 `ql.start()` 前写入、`finally` 清空。可行性取证：`QuickLaunchManager.start()` 的 exe 分支在调用 `deps.spawnExe` 之前没有任何 `await`（`quick-launch.ts:272-276`），所以 `spawnExe` 与 `ql_start` 在同一个同步 tick 内。同一个槽同时承载「本次启动的可用终端集合」，理由见下条。

### 与 K10-3 的配合：`terminalAvailable` 不阻塞主进程

`QuickLaunchManager` 的 `terminalAvailable(id)` 是**构造期注入的同步回调**（`quick-launch.ts:219`）。若让它直接调 `detectTerminals()`，每次 `ql_start` 都会在事件循环里同步阻塞最坏 ≈9s（索引 K10-3 的预算）。因此：

- `ql_start` 先 `await detectTerminalsAsync()`（`main.ts:1018-1020`：`setImmediate` 让出一拍再跑探测），把集合放进 `qlStartContext`；
- 构造期回调只读集合：`(id) => qlStartContext?.available.has(id) ?? false`（`main.ts:1070`）。

诚实说明：`detectTerminals()` 内部是 `spawnSync`（规格 §6.1 钉死），所以「异步」只保证 handler 不在 IPC 派发帧里同步跑、让排队事件先被处理，**并不能**把 9s 的同步段变成并发。真正不阻塞需要 worker，属规格 §2 非目标（G10），未做。

### 其它两处实现决定

- **`quick_launch.yaml` 的路径**：`qlYamlPath() = join(configDir(), 'quick_launch.yaml')`（`main.ts:1000`），**没有**塞进 `yamlPaths()` 的三元组——该函数在 `main.ts` 里被多处按位置解构（`const [p]` / `const [, , p]`），加第四项会让所有解构错位。规格 §5.1:54 的路径不变。
- **K8（错误消息走 `t()` 但不写字面量 key）**：`QL_IPC_ERR`（`main.ts:987-989`）与 `QL_IPC_LABEL`（`:994-996`）都是常量映射，`key-coverage.test.ts:39-41` 的 `KEY_CALL` 不匹配 → 门绿（V4 实测）。前缀只用 G7 五种，本段自己产生的只有 `VALIDATION:`。

## 8. 自审（逐条对照 F / G / K）

| 约束 | 自查 |
|---|---|
| F1 通道名逐字 | 用例把已注册 `ql_*` 集合与 §8 逐字比对；`clipboard_read` / `clipboard_write` 名字也按 §8 原样（无 `ql_` 前缀） |
| F2 错误消息走 `t()`、前缀五种 | 唯一自造错误是 `VALIDATION: + t(QL_IPC_ERR.notFound,{id})`；其余前缀来自被调层（`YAML:` / `VALIDATION:` / `STATE:` / `PROC:`） |
| F3 / G4 不改 `process.ts` | 不在 diff 里；`process.test.ts` 5 条仍 PASS |
| F4 不加规格外通道 | 见上；无 `ql_restart` |
| G3 不传 `encoding` | 本任务不碰 pty；`grep -n encoding src-main/quick-launch.ts` 仍无命中（未改该文件） |
| G5 非 PTY 子进程 `windowsHide` | 本任务没有新增 spawn；exe 走 `ProcessState`（`process.ts:32-36` 未显式写，Node ≥12 默认 `true`，索引 K13 已裁定） |
| G6 文案走 `t()` | 主进程新增文案只有错误消息与对话框名，均经 `t()`；`no-hardcoded` 绿 |
| G7 前缀 | 测试断言一律 `/^` 锚定 |
| G10 不扩范围 | 未做参数编辑 / 工作目录 / 多发行版 WSL / 排序 / 录制回放 / 命令历史 / 日志落盘；未做任务 7 的 `exit_app`（`main.ts:371-375` 原样）；未做渲染端 UI |
| K5 不 add / 不 commit | `git status` 见 §2，改动留在工作区 |
| K8 | 见 §7 末段 |
| K10-3 | `ql_terminals` 是 async handler、无缓存（用例断 `a !== b` 与 `AsyncFunction`）；`ql_save` / `ql_start` 同样每次实测 |
| K11(2) | 按索引 K12(3)：发尺寸的是渲染端（任务 9/13），本任务不代渲染端发 `ql_resize`；`ql_start` 后主进程按 80×24 兜底（任务 5 已实现），未额外改动 |
| K11(4)/K13 | 见 §7 |
| K12(1) | 通道只在 `main.ts` 注册；`preload.ts` 只加两个订阅；`src/ipc.ts` 补类型 |
| K12(2) | D6a 自动化形状门已跑；D6b 只做起停采输出（环境限制见 §3） |

**自审里我主动挑出的三点**

1. `ql_start` 里 `qlLoad` 只取 `items[id]`：`invalid` 里的坏条目会被当作「不存在」→ `err.ql.notFound`。规格 §7.5 只说「配置存在」，坏条目本就不可启动；渲染端会在 `ql_list` 的 `invalid` 里看到它（任务 11 的 `ql.invalid`）。
2. `ql_write` / `ql_resize` 对 exe 配置会抛 `STATE: err.proc.noChild`（来自 `quick-launch.ts:299/:306`）。exe 类型没有页签，渲染端不会调它；若要更友好需要在任务 9/13 侧防住，不在本任务改语义。
3. `PROC` 文本里 exe 出现两次（`PROC: no-such-exe-zzz.exe no-such-exe-zzz.exe 启动失败: …`）——`process.ts:41/:46` 把 `{exe}` 拼进前缀，而词典 `err.proc.spawnFail` 的取值里也有 `{exe}`。属既有行为（G4 不许改），只登记不处理。

## 9. 疑虑（需要主代理裁决）

1. **`app.dialog.filterExe` 在主进程词典里没有键（唯一会影响真机观感的点）**。规格 §8 要求 `ql_pick_exe` 用 `.exe` 过滤对话框，而对话框的过滤器名是**主进程**渲染的；任务 8 表 C9 的 `ql.dialog.filterExe` 落在**渲染端**词典（`src/i18n.ts`），表 B2 只往 `src-main/i18n/dict.ts` 加 `err.ql.*`。我按主进程既有命名空间取 `app.dialog.filterExe`（与 `app.dialog.filterModel` / `filterJinja` 同组，`dict.ts:281-282/:561-562`），并用常量映射传 key 以保持 key-coverage 绿。代价：**词典落地前对话框里过滤器名显示原始 key**（D6a 日志里可见 `[i18n] missing key: app.dialog.filterExe (lang=zh)`）。建议：任务 8 往 `src-main/i18n/dict.ts` 补 `app.dialog.filterExe`（中英），并在该表 D 段加一行；或者裁定改用别的既有键。
2. **`ql_save` / `ql_start` 也各带一次终端探测**（最坏 ≈9s）。规格 §5.3-4 要求保存时「终端可用」、§7.5 要求启动前「终端仍可用」，而判定手段只有 `detectTerminals()`（不缓存，规格 §6.1）。我按 K10-3 的口径把它们做成 async。若主代理认为「启动按钮等 9s」不可接受，需要新口径（例如按 id 的单终端探测，或允许极短 TTL 缓存）——那会改到任务 4 的 C 段签名，不在本任务擅自扩。
3. **D6b 在本环境只能做到「起停 + 采输出」**：`ELECTRON_RUN_AS_NODE=1` 使 `require('electron')` 返回 stub（`app` undefined，崩在 `main.js:86`，即 `main.ts` 第一句）；去掉后是 STATUS_BREAKPOINT（规格 §13.2 已记录）。没有 `No handler registered`，模块图（含 node-pty 原生绑定）加载成功。真正的 DevTools 逐条手测按索引 K12(2) 在任务 14 做。
4. **`src/App.test.ts` 的 `vi.mock('./ipc')` 工厂补了两个键**（`:52-53`）。原因：该文件顶部的 mock 会接管 `./ipc`，计划逐字的那条用例在补键之前必然红（D2 的报错就是 `No "onQlData" export is defined on the "./ipc" mock`），补之后才绿；同时我把「断真实模块」的 `vi.importActual` 加进同一条用例，避免只断 mock 里的键变成自证。既有用例一行未改；两个捕获数组留给任务 13 驱动。若主代理认为这属于「改既有测试基础设施」，请指出，我按裁决调整。

---

## 10. 修复轮 1（任务 6 任务审查：重要 #1 / 重要 #2 + 已批准的 Minor #1/#2/#3/#8）

> 起点 HEAD = `6e4b085`（工作区含本任务五个文件，未提交）。本轮只动 `src-main/main.ts` 与 `src-main/ipc-ql.test.ts`；
> 仍未 `git add` / commit（K5）。口径依据：索引 K15(2)（exe 不探测）、K13（`launch(exe, [], configId)`）、K10-3、G7、K8。
> check 表对应行：`task-06-ipc-wiring.md` 的 **J-2 段**（A-I 段未动）。

### 10.1 逐条改动（前 → 后；「后」的行号是改后真实行号）

**重要 #1 · exe 配置不再付一次终端探测（索引 K15(2)）**

前（`main.ts:1076-1079` / `:1087-1090`）：

```ts
ipcMain.handle('ql_save', async (_e, id: string | null, entry: QuickLaunchEntry): Promise<string> => {
  const available = (await detectTerminalsAsync()).map((t) => t.id);
  return qlSave(qlYamlPath(), id, entry, available);
});
…
  const available = new Set((await detectTerminalsAsync()).map((t) => t.id));
```

后（`main.ts:1097-1100` / `:1119-1121`）：

```ts
  const available = entry?.type === 'shell' ? (await detectTerminalsAsync()).map((info) => info.id) : [];
…
  const available = entry.type === 'shell'
    ? new Set((await detectTerminalsAsync()).map((info) => info.id))
    : new Set<TerminalId>();
```

取证（审查者已钉，本轮复核）：`quick-launch-config.ts:104-107` 只在 `e.type === 'shell'` 分支读 `available`；
`quick-launch.ts:238` 的 `isTerminalAvailable` 同样只在 shell 分支被调。exe 分支传 `[]` / 空集合不改变任何校验语义。

**重要 #2 · `qlStartContext` 的不变量改由代码强制（槽本身保留）**

前（`main.ts:1068` / `:1070`）：

```ts
    spawnExe: (exe) => spawnExeProcess(exe, qlStartContext?.configId ?? null),
  },
  (id) => qlStartContext?.available.has(id) ?? false,
```

后（`main.ts:1016-1029` 新增守卫；`:1086` / `:1088` 改走守卫）：

```ts
export function qlStartContextOrThrow(seam: string): { configId: string; available: Set<TerminalId> } {
  if (!qlStartContext) {
    throw new Error('STATE: ql_start context is missing at ' + seam + ' (called outside ql_start)');
  }
  return qlStartContext;
}
…
    spawnExe: (exe) => spawnExeProcess(exe, qlStartContextOrThrow('spawnExe').configId),
  },
  (id) => qlStartContextOrThrow('terminalAvailable').available.has(id),
```

两处决定（请主代理复核）：

1. **守卫消息不走 `t()`**：这是「接线内部不变量被破坏」的程序员断言，正常路径永不到达；`err.ql.*` 的键由任务 8 逐字界定（K8/K9），不在本任务擅自加词典键。前缀用 G7 的 `STATE:`；`no-hardcoded` 只查汉字，消息为 ASCII → 门绿。
2. **为此给 `main.ts` 加了一个导出**（原先该文件零导出）。理由：槽的「设置→消费→清空」在 `ql_start` 里同一个同步窗口内完成（`quick-launch.ts:236-276` 在调用两个回调前无 await），所以**从测试内部无法把槽造空**——不导出就没有任何用例能钉这条守卫，反向自检也做不了。导出仅为测试接缝，生产路径除 `ql_start` 外无调用方。若主代理认为入口文件不该有导出，可改为「测试里断源码不含 `?? null`」的源形状断言，我按裁决换。

**Minor #1 · `launchError` 是死代码 → 删除，注释改成事实**

前（`main.ts:1038-1046`）：`let launchError` + `try { takePipes() } catch (e) { throw launchError instanceof Error ? launchError : e; }`
后（`main.ts:1060-1064`）：

```ts
  const p = new ProcessState();
  void p.launch(exe, [], configId).catch(() => { /* 见上：真机上到不了；只为不产生 unhandled rejection */ });
  const { stdout, stderr } = p.takePipes();
  stdout.resume();
  stderr.resume();
```

注释（`:1047-1053`）改为：`launch()` 体内无 await → 返回时已 spawn、`state='running'`（`process.ts:32-58`）；ENOENT 走 `child.on('error')` → `onExit(-1,'PROC: …')`（`:37-47`），promise 不 reject；新建实例的 `state` 必为 `'ready'`，`:28` 的 `STATE:` 分支到不了。

**Minor #2 · `ql_start` 的「配置存在」不走原型链**

前（`main.ts:1088-1089`）：`const entry = qlLoad(qlYamlPath()).items[id]; if (!entry) throw …`
后（`main.ts:1112-1115`）：

```ts
  const items = qlLoad(qlYamlPath()).items;
  if (!Object.prototype.hasOwnProperty.call(items, id)) {
    throw new Error('VALIDATION: ' + t(QL_IPC_ERR.notFound, { id }));
  }
  const entry = items[id];
```

与配置层同一口径（`quick-launch-config.ts:161` 用 `hasOwnProperty`）。

**Minor #3 · 遮蔽 i18n 的 `t`**：两处 `.map((t) => t.id)` → `.map((info) => info.id)`（`main.ts:1098` / `:1120`）。

**Minor #8 · 失败路径的孤儿子进程**：`ipc-ql.test.ts` 的 `afterAll` 先对 8 个已知 id（`qlshape01-04` / `qlfixexe01` / `qlfixsh01` / `qlconc01-02`）逐个 `await handlerOf('ql_stop')(undefined, id)`（吞异常），再还原 `process.cwd` / 删临时目录。

### 10.2 新增用例（`src-main/ipc-ql.test.ts`，16 → 23 条）

| 组 | 钉什么 |
|---|---|
| 修复轮 1 · 重要 #1（2 条） | `ql_save` / `ql_start` 对 **exe** 配置：`detectTerminals` 调用次数**不变**；对 **shell** 配置：恰好 +1（对照组，防「把探测整个删掉」蒙对） |
| 修复轮 1 · Minor #2（3 条） | `ql_start('constructor'\|'toString'\|'__proto__')` → `/^VALIDATION:/` 且消息含 `err.ql.notFound`、**不含** `err.ql.typeInvalid` |
| 修复轮 1 · 重要 #2（2 条） | ① 守卫存在且槽为 null 时 `toThrow(/^STATE:/)`；② 两个 exe 配置并发 `ql_start`：拦 `ProcessState.prototype.launch` 记第三参数 → `['qlconc01','qlconc02']` 不串、`args=[]`（K13 逐字）、每次 `ctxOk=true`（槽非空且属于本次）、`get_state` 不被污染 |

计数机制：`vi.mock('./quick-launch-terminals')` 用 `importOriginal` 拿到真实现，只包一层 `cap.termProbes += 1` 的壳（探测语义不变），`afterAll` 打印总数。

### 10.3 命令与真实输出

```text
# 1) 先红（只加用例，实现未改）
$ npx vitest run src-main/ipc-ql.test.ts
 ❯ src-main/ipc-ql.test.ts (23 tests | 7 failed)
   → 保存 exe 配置不得调用 detectTerminals: expected 15 to be 14
   → 启动 exe 配置不得调用 detectTerminals: expected 16 to be 15
   → expected 'VALIDATION: err.ql.typeInvalid' to contain 'err.ql.notFound'   （× 3 条原型链用例）
   → 重要 #2 的守卫必须存在（改回 ?? 默认值 就退回静默降级）: expected 'undefined' to be 'function'
   → expected [ false, false ] to deeply equal [ true, true ]
 Test Files  1 failed (1)
      Tests  7 failed | 16 passed (23)

# 2) 改 main.ts 后
$ npx vitest run src-main/ipc-ql.test.ts
[ipc-ql] detectTerminals 真实调用次数 = 9
 ✓ src-main/ipc-ql.test.ts (23 tests) 1913ms
 Test Files  1 passed (1)
      Tests  23 passed (23)

# 3) 定向 + 回归
$ npx vitest run src-main/ipc-ql.test.ts src/App.test.ts src-main/quick-launch.test.ts \
    src-main/quick-launch-config.test.ts src-main/quick-launch-terminals.test.ts src-main/process.test.ts
 ✓ src-main/quick-launch-terminals.test.ts (9 tests) 165ms
 ✓ src-main/quick-launch-config.test.ts (19 tests) 170ms
 ✓ src-main/quick-launch.test.ts (17 tests) 262ms
 ✓ src/App.test.ts (48 tests) 1059ms
 ✓ src-main/ipc-ql.test.ts (23 tests) 1914ms
 ✓ src-main/process.test.ts (5 tests) 6323ms
 Test Files  6 passed (6)
      Tests  121 passed (121)

# 4) 类型门 / i18n 硬门
$ npx tsc -p tsconfig.main.json --noEmit
TSC_EXITCODE=0
$ npx vitest run src-main/i18n src/i18n.test.ts
 Test Files  5 passed (5)
      Tests  22 passed (22)
```

### 10.4 反向自检（两次还原后全绿）

```text
A) 临时去掉重要 #1 的 `entry.type === 'shell'` 守卫（exe 也探测）：
$ npx vitest run src-main/ipc-ql.test.ts
[ipc-ql] detectTerminals 真实调用次数 = 20
      Tests  3 failed | 20 passed (23)
   × 修复轮 1 · 重要 #1 … ql_save：exe 条目不调 detectTerminals → expected 15 to be 14
   × 修复轮 1 · 重要 #1 … ql_start：exe 配置不调 detectTerminals → expected 16 to be 15
   × （并发用例的 ql_states 断言连带红：上一条在 stop 之前抛出，qlfixexe01 未停 → 属级联，非新缺陷）
→ 还原（Copy-Item .temp/main.ts.fixed）：hash 741C8B2D… 一致

B) 临时删掉 `qlStartContextOrThrow`、两处回到 `?? null` / `?? false`：
$ npx vitest run src-main/ipc-ql.test.ts
      Tests  2 failed | 21 passed (23)
   × main.ts 导出守卫：… → expected 'undefined' to be 'function'
   × 两个 exe 配置并发 ql_start：… → expected [ false, false ] to deeply equal [ true, true ]
→ 还原：`Tests 23 passed (23)`，随后 §10.3 的 3) 4) 重跑全绿
```

探测次数的算术（重要 #1 的证据）：修复后本文件 9 次；去掉守卫的同一次运行 20 次——其中两条新用例在断言处提前失败，少跑 2 次 shell 对照，完整对照 = 22。差 13 = 本文件 7 次 exe `ql_save`（`:218/:292/:293/:314/:332/:408/:409`）+ 6 次 exe `ql_start`（`:295/:298/:315/:346/:411`×2）。原 16 用例的 D6a 里对应「7 次省掉」（4 次 exe 保存 + 3 次 exe 启动），与审查者给的数一致。

### 10.5 本轮的范围与遗留

- 只改 `src-main/main.ts`（+ 注释）与 `src-main/ipc-ql.test.ts`；`process.ts` / `process.test.ts` / 任务 3-5 的四个文件 / `package.json` / lock / `src/ipc.ts` / `src-main/preload.ts` 本轮**未再动**（`git status` 仍只有 B1-B5 五项）。
- 审查列的其余次要项（常量映射 key 无测试钉、`not.toBe` 断言、`AsyncFunction` 形状断言、exe 的 cwd、`ql_write/ql_resize` 对 exe 抛错、`App.test.ts` 的 mock 工厂、测试文件不在类型门）按指示未动。
- 新增疑虑 1 条：`main.ts` 为钉住重要 #2 的守卫多了一个导出（见 10.1 决定 2），请主代理裁决是否接受这种测试接缝。
