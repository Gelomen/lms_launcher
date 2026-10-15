任务 11 简报（从 plan 逐字抽取，勿改；起点锚点已按 HEAD 4ffe34e 复核）

### 任务 11：宿主启动机制重做 —— 应用 exe 的「宿主模式」（R-19）

> 来源：用户真机 2026-10-15 18:0x-18:4x（类型 [命令行] + 管理员：UAC 点「是」后不出页签；任务 10 修掉卡死后日志给出 `handshake=exit(code=0)`）。主代理取证（spec §3-P13）：硬链接 `node.exe` 那条路**根本不进 Node 模式**——Electron 28.3.3 只认 `ELECTRON_RUN_AS_NODE` 环境变量，而提权不继承环境块（P2）、无命令行开关（P3），于是提权子进程其实是**又起了一遍应用**、不连管道、干净退 0。**先改文档再改代码**（本节与 spec §1/§3-P13/§6.4/§6.6/§6.10/§6.11/§7.1/§7.2/§8-K2/K12/K13/§9-R5/R6/R10 同一 commit）。

- [ ] **步骤 0：起点核对**：`ql-elevated.ts` 的 `HOST_EXE_NAME` / `HOST_SCRIPT_NAME` `:32-33`、`HostLauncher` `:45-54`、`resolveHostLink` `:126-156`、`createHostLauncher` `:158-188`、`hostLauncher` `:191`、`startHost` `:346-375`；`ql-pty-host.ts` 的 `main()` `:189-205` + `require.main` 块 `:207-211`；`package.json:5`（`main`）；`build.bat:108-128`；`ipc-ql.test.ts:446/491-492/523`；`ql-elevated.test.ts:137-138`（`hostScriptPath` 断言）+ `:141-177`（`resolveHostLink` 用例）+ `:329-330`（假 launcher 夹具）。
- [ ] **步骤 1：先改测试**：
  - 新文件 `src-main/ql-host-boot.test.ts`：`parseHostMode` 的位置解析（标志在首/在尾/中间夹 Chromium 开关）、缺参数 → `null`、无标志 → `null`、重复标志取第一个。
  - `ql-elevated.test.ts`：删掉 `resolveHostLink` / `hostScriptPath` 那几条（机制退场），新增「`launch` 收到 `--ql-pty-host` + 管道名 + token」「dev（`process.defaultApp`）最前面补绝对应用目录」「`hostlink=` 失败族不再存在（`startHost` 只剩 `pipe` / `launch` 两个 stage）」。
  - `ql-pty-host.test.ts`：`hostMain(['<pipe>','<tok>'])` 与既有 `runHost` 用例并存（宿主不再由 `node.exe` 执行）。
- [ ] **步骤 2：跑红**：`npx vitest run src-main/ql-host-boot.test.ts src-main/ql-elevated.test.ts src-main/ql-pty-host.test.ts`。
- [ ] **步骤 3：实现**：
  - 新 `src-main/ql-host-boot.ts`（纯函数，无依赖）+ 新 `src-main/boot.ts`（入口转发器：宿主模式 → `hostMain`；否则 `require('./main')`，**main.ts 一字不改**）。
  - `package.json`：`main` → `dist-main/boot.js`（只改这一行）。
  - `ql-elevated.ts`：删 `resolveHostLink` / `HOST_EXE_NAME` / `hostExePath` / `hostScriptPath`；`HostLauncher` 改为 `{ hostExePath(), hostParameters(pipeName, token), launch(pipeName, token), isAlive, exitCodeOf }`；`startHost` 去掉路径解析那一步（stage 只剩 `pipe` / `launch`）。
  - `ql-pty-host.ts`：加 `export function hostMain(argv: string[]): void`（= 原 `main()` body），`main()` 保留为 `hostMain(process.argv.slice(2))`；`runHost` 与帧协议一行不改。
  - `build.bat`：删掉 R-16 的硬链接块（`:108` 空行 + `:109-128`），恢复 `echo.` 在前；文件回到 111 行、纯 ASCII、全 CRLF。
- [ ] **步骤 4：跑绿 + G5 + G6 + 全量 + 本地无 UAC 门**（`lms_launcher.exe --ql-pty-host "\\.\pipe\x" tok` → 无窗口 / 退出码 3 / 留痕一行 `stage=pipe`）。
- [ ] **步骤 5：Commit（主代理）**：`fix: 提权宿主改用应用 exe 的宿主模式启动（R-19，硬链接机制退场）`

