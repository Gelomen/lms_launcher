# 任务 5 报告：IPC 接线

## 状态：DONE_WITH_CONCERNS

提交 c29f1e2（feat: IPC 接线——11 个命令 + log-line/process-exit/tray-exit-request 事件 + preload 桥），父提交 84940e4。

## 实现内容

1. **src-main/main.ts 重写**：逐字采用简报代码——AppState（单例 ProcessState）、dataDir()（isPackaged → exe 同级目录；dev → cwd）、yamlPaths()、emitLog/mainWin 日志端、createWindow（preload 改为 './preload.js'，loadFile 用 __dirname join）。11 个 ipcMain.handle：get_app_config / save_llama_dir / validate_dir / get_params / get_configs / save_config / delete_config / get_state / start_server / stop_server / exit_app。
2. **与简报的唯一偏差（按补充上下文第 1 条）**：ps.onExit 接线为 (code, error) => { if (error) emitLog(error, "sys"); ...send("process-exit", { code }) }——PROC 启动失败在日志区 sys 流可见，事件契约不变。
3. **src-main/preload.ts 重写**：contextBridge 完整桥（invoke + onLogLine/onProcessExit/onTrayExitRequest 三个返回清理函数的订阅）。
4. **src/ipc.ts 新建**：渲染端封装（window.lms 类型声明、invoke<T>、四个订阅包装、isMissing/isValidation 前缀判定）。
5. **tsconfig.main.json**：加 "exclude": ["src-main/**/*.test.ts"]。
6. **App.vue**：按简报临时改为 probe 变体，验证后还原为骨架（与 HEAD 相同，故未出现在 diff 中——commit 只含 4 个文件）。

## 验证证据

### tsc --noEmit（步骤 4）

命令：npx tsc -p tsconfig.main.json --noEmit
输出：TSC_OK（无任何 TS error，main + preload + config/build/process 全部通过检查）。

### IPC probe（步骤 5）——无头环境下完成的等价验证

本机为无头环境（无可用显示器），无法可视化点按钮。等价验证方式：probe 函数用 onMounted 自动触发 + ELECTRON_ENABLE_LOGGING=1 让 Chromium console 输出落到 stderr，从日志捕获渲染端 console。分三轮：

- **第 1 轮**（npm run dev 完整链路，vite + tsc + electron）：四个 invoke 全部走通真实 IPC 通道——
  - app_config = [object Object]（经 IPC 结构化克隆成功）
  - params = [object Object]（cwd/ 下自动生成 llama_params.yaml 并返回默认模板）
  - configs = MISSING: llama_launch_configs.yaml 不存在（新建第一个模板后自动生成）（错误透传到渲染端，且主进程 handler throw 的完整 Error 栈打印到 main console——分类前缀保留）
  - state = [object Object]
- **第 3 轮**（JSON.stringify 抓具体值）：app_config = {"llama_dir":""}——与简报预期 {llama_dir: ""} 完全一致。configs/state 与第 1 轮结论一致。

注意（见「自审发现」第 1 条）：第 3 轮的 params 调用抛 VALIDATION，原因是第 1 轮自动生成的 llama_params.yaml 残留——这是 config 层既有 bug，非本任务接线问题（详见下节）。

验证后已清理：杀掉 electron/vite 进程，删除自动生成 yaml 与临时 probe 文件。

### 全量回归（步骤 6）

命令：npx vitest run
输出：3 test files passed, 19 tests passed（build.test 6 / config.test 9 / process.test 4）。

## 修改文件

- src-main/main.ts（重写，+IPC 层）
- src-main/preload.ts（重写，完整桥）
- src/ipc.ts（新建）
- tsconfig.main.json（加 exclude）
- src/App.vue（临时 probe → 还原为骨架，与 HEAD 相同，无 diff）

## 自审发现

1. **【重要】既有 bug：defaultParams 写盘后 paramsLoad 拒绝重读**。第 1 轮 probe 自动生成的 llama_params.yaml 含下划线 key（spec_type、load_mode、chat_template_file、reasoning_format、reasoning_effort、spec_draft_n_max、presence_penalty、repeat_penalty、top_p、top_k、min_p 等，共 16 个）。config.ts 的 validateParamKey 要求 /^[a-z0-9]+$/（纯字母数字），而 paramsLoad「已存在 → 只校验 key」会拒绝这些 key：VALIDATION: 参数 key "spec_type" 不是小写字母开头的字母数字串。即**首次启动自动生成的文件，第二次打开 app 必炸 get_params**。这是 fb81655（config 层）的既有缺陷——defaultParams 模板与其自家校验器自相矛盾。本任务范围内不应擅自修改 config.ts（超出 IPC 接线契约，且 19/19 现有测试未覆盖此交互），已作为独立问题上报：修复二选一——(a) validateParamKey 放宽为允许下划线 /^[a-z][a-z0-9_]*$/；(b) defaultParams key 去掉下划线。建议 (a)（key 是用户可读 id，下划线自然）。修复需加测试：paramsLoad 重读 defaultParams() dump 结果不抛错。**本任务已删除验证时残留的 llama_params.yaml**，工作树干净——但任何后续手动启动 dev 都会重新触发（首次生成 OK，二次必炸）。
2. **probe 无法点按钮**：无头环境限制，已用 onMounted + ELECTRON_ENABLE_LOGGING 等价完成（上节），任务 8/10 人工验收时按简报预期值复核 console。
3. **dist-main/*.test.js 残留**：npx tsc -p tsconfig.main.json（非 --noEmit）构建产物里仍有 test.js——本次 exclude 只影响源码 include 集，之前 dist-main 里的旧测试产物是历史残留；build 脚本同样受 exclude 影响，后续构建不会再产出新 test.js。可选清理项，不阻塞。
4. **npm manage-package-manager-versions 警告**：环境问题，按计划忽略。

## 疑虑

- 发现 1 是唯一实质疑虑（严重度：高——会阻断任务 6 前端 get_params 接线的首次/二次启动流程）。本任务验证未受其影响（probe 在生成当轮读盘成功），但任何「重启 app」都会触发。
- probe 步骤按上述等价方式完成并留档，若计划要求严格的可视化按钮点击验收，可标注为任务 8/10 人工复核项。

## 报告路径

D:/AI/Workspace/lms_launch/.worktrees/lms-launch-v1/.superpowers/sdd/task-5-report.md
## 既有 bug 修复（config.ts validateParamKey）

**问题**：defaultParams() 模板含 16 个下划线 key，paramsLoad 重读时逐 key 调 validateParamKey，其正则只接受小写字母+数字 → 二次打开 app 必抛 VALIDATION。

**修复**：validateParamKey 正则放宽为允许下划线（/^[a-z0-9_]+$/）。validateConfigId 规则不变。

### RED 证据（修复前，9/10 FAIL）

命令：npx vitest run src-main/config.test.ts
结果：1 failed | 9 passed (10) — params_reread_after_default_write_succeeds 抛出 VALIDATION: 参数 key "spec_type" 不是小写字母开头的字母数字串

### GREEN 证据（修复后，10/10 PASS）

命令：npx vitest run src-main/config.test.ts
结果：10 passed (10)

### 全套件 20/20

命令：npx vitest run
结果：build.test 6 / config.test 10 / process.test 4 = 20 passed (20)

### 改动摘要

- src-main/config.ts L96：validateParamKey 正则从 /^[a-z0-9]+$/ 改为 /^[a-z0-9_]+$/
- src-main/config.test.ts L84-93：新增回归测试 params_reread_after_default_write_succeeds——paramsLoad 首次写入 defaultParams 模板，二次重读不抛 VALIDATION，key 数 = 26

### fix 提交

SHA: c413152 | Title: fix: validateParamKey 允许下划线（defaultParams 重读不再抛 VALIDATION）+ 回归测试
