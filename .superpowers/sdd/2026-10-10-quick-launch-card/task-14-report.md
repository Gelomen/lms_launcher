# 任务 14 报告 · 打包硬门 + 真机验收 + 文档记录

> 执行环境：Windows 真机（本机），npm。起点 HEAD = `d17b5cc`，工作区干净（只有本任务简报未跟踪）。
> 判据表：`docs/superpowers/checks/2026-10-10-quick-launch-card/task-14-build-acceptance.md`（A-I 的勾留给主代理，K25；我只填 J 段 + I 段延期项写法）。
> 边界遵守：只改 `electron-builder.yml`（C1 那一段）+ 规格 + 计划（F3 措辞）+ 该表 J 段。**`src/**`、`src-main/**`、`build.bat`、词典一字未动**；不 `git add`、不 commit（K5）。

## 0 状态

**自动化门全部通过；真机门（E1-E9）本环境做不了，已如实写成 `☐（原因 + 去处）`。**
改动范围经 `git diff --name-only` 核对 = **代码/配置侧只有 `electron-builder.yml`（B1）**，其余三处是允许的文档（规格 B2、计划 B3、本任务 check 表 J 段）。发现两处**前提性偏差**（§2、§9.1），都不需要改 `src/**` / `src-main/**` / `build.bat`，但需要主代理登记口径。

## 1 起点核对（A1-A3）

| 项 | 实测 |
|---|---|
| A1 | `git rev-parse --short HEAD` → `d17b5cc`；`git status --porcelain` → 只有 `?? .superpowers/sdd/2026-10-10-quick-launch-card/task-14-brief.md` |
| A2 | `git log --oneline -3 -- build.bat` → `99302d7` / **`ef23ac6 build: 打包只产出 win-unpacked，不再生成 portable exe`**（2026-10-08 03:30）/ `ce1d334`。读 `build.bat:70-110`：`:70` echo「win-unpacked only」、`:83`/`:90` 两次 `call npx electron-builder --config electron-builder.yml --win dir`、`:104-107` 清旧 `*-portable.exe`。→ 验收对象 = `dist-release\win-unpacked\lms_launcher.exe`，**不改 build.bat** |
| A3 | `electron-builder.yml` 全文 31 行：`:12 asar: true`，**无** `asarUnpack`；`:28 win.target: portable` 被 `--win dir` 覆盖 |

## 2 起点取证的坑：必须先补一次「不带 asarUnpack」的构建

简报假设「旧产物里能看到 .node/.dll 在 asar 内」。**实测不成立**：

- 旧 `dist-release\win-unpacked\resources\app.asar`（LastWriteTime **2026-10-11 01:51:56**）里 **lydell 条目 = 0**；
- 打进包里的 `package.json` 的 `dependencies` **没有** `@lydell/node-pty`；
- 该依赖是任务 5 的提交 `90c9320`（**2026-10-11 19:25**）才进 `package.json` 的。

→ 旧产物早于任务 5，拿它取证等于取「没有 node-pty」的证。所以我**先跑一次不带 `asarUnpack` 的 `build.bat`** 作为真正的「前」，再改配置重跑作为「后」。

## 3 加 asarUnpack 前后的对比取证（这条门的「牙」）

### 3.1 前（不带 asarUnpack；`build.bat` exit 0，日志 `.temp\task14-build-before.log`）

用 `@electron/asar` 的 `listPackage` + `getRawHeader`：

- asar 共 **3927** 条，其中 lydell **32** 条；
- 4 个原生文件在 asar **头**里列出，但每个都带 **`"unpacked": true`**：`conpty.node`(291328)、`conpty\conpty.dll`(110152)、`conpty\OpenConsole.exe`(1062472)、`conpty_console_list.node`(134656)；
- **`app.asar.unpacked` 已经存在**，物理 **18** 个文件 = 平台包 `@lydell\node-pty\node_modules\@lydell\node-pty-win32-x64\` 整包（12 个 `lib/*.js` + `package.json` + `LICENSE` + 上面 4 个原生）；
- 外层 `@lydell\node-pty\index.js` 的头条目是 `{"offset":"11531252"}` → 字节仍在 asar 内；
- 构建日志里就有 `signing with signtool.exe path=...\resources\app.asar.unpacked\...\OpenConsole.exe`。

**结论：electron-builder 25.1.8 的「原生模块自动探测」在没有 `asarUnpack` 时已经把平台包整包解出。** check 表 D2 的基线描述（「改动前 `resources` 只有 `app.asar` + `icon.ico`，没有 `app.asar.unpacked`」）只对那份**陈旧产物**成立，对当前树的新构建不成立。

### 3.2 后（加 `asarUnpack: ["**/node_modules/@lydell/**"]`；`build.bat` exit 0，日志 `.temp\task14-build-after.log`）

- asar 仍 **3927** 条 / lydell 仍 **32** 条 —— **头里仍然列出，这是 asar 的语义**：被解包的文件在头里保留条目并标 `"unpacked": true`，字节放在 `app.asar.unpacked` 下。所以 `asar list` 前后看不出差别，差别在 `unpacked` 标志与物理目录（不粉饰）；
- **`app.asar.unpacked` 物理文件 18 → 21**：新增外层 `@lydell\node-pty\index.js`(2059)、`package.json`(755)、`LICENSE`(1091)；其头条目由 `{"offset":"11531252"}` 变为 **`{"unpacked":true}`**；
- 4 个原生文件前后都是 `"unpacked": true`（本来就被解出）。

**这条门的真实作用**：把整个 `@lydell` 作用域显式解出，不再依赖自动探测（它只按「检测到 .node」解出平台包本身，外层 wrapper 包留在 asar 内）。规格 §7.2 要求的显式配置由此满足，且换版本时行为确定。

### 3.3 主进程加载路径解析未变（「牙」第 3 条）

- `src-main/quick-launch.ts:8` = `import * as pty from '@lydell/node-pty'`（一字未改）；
- 编译产物 `dist-main\quick-launch.js:46` = `require("@lydell/node-pty")` —— **包名解析，没有任何硬编码 asar 路径**；
- `node_modules\@lydell\node-pty\index.js:1` 按 `process.platform`/`process.arch` 拼名再 `require` 平台包；
- `node-pty-win32-x64\lib\utils.js` 的 `loadNativeModule` 依次试 `../build/Release`、`../build/Debug`、`../prebuilds/<platform>-<arch>` 下的 `<name>.node`（**相对包目录**）。

→ 解包后由 Electron 的 asar 补丁把 asar 内路径映射到 `app.asar.unpacked`，代码侧不需要任何改动。

## 4 D1 打包门（真实结果）

- `build.bat` → **exit 0，一次成功，未走 `:pack_retry`**；
- 产物：`dist-release\win-unpacked\lms_launcher.exe` = **177,150,464 B**（18:28:30）；
- `(Get-ChildItem dist-release -Filter "*-portable.exe" -Recurse -Force | Measure-Object).Count` = **0**（属预期，`ef23ac6`）；
- 墙钟 ≈**9s**（日志 CreationTime 18:28:21 → LastWriteTime 18:28:30）；前置那次 ≈15s。比简报估的「几分钟」快：winCodeSign 工具缓存已预热（日志「已就绪，跳过准备」）、Defender 未触发 rcedit 锁。
- 取证陷阱：`dist-release\builder-effective-config.yaml` 的 LastWriteTime 仍是 **2026-10-11 01:51:54**（`--win dir` 不重写它），里面也没有 `asarUnpack` → **不能**用它判断本次生效配置；生效证据是 §3.2 的 asar 头与物理清单。

## 5 D2 解包检查（真实清单，逐个实测）

`dist-release\win-unpacked\resources\app.asar.unpacked\node_modules\@lydell\node-pty-win32-x64\prebuilds\win32-x64`：

| 文件 | 字节 | 说明 |
|---|---|---|
| `conpty.node` | 291328 | 要求的三个之一 ✅ |
| `conpty\conpty.dll` | 110152 | 要求的三个之一 ✅ |
| `conpty\OpenConsole.exe` | 1062472 | 要求的三个之一 ✅ |
| `conpty_console_list.node` | 134656 | 额外存在（check 表未列，实际在） |

源码目录里还有 `conpty.pdb`(6311936) 与 `conpty_console_list.pdb`(4321280)，**不在包里**：electron-builder 默认过滤 `!**/*.{...,pdb}`（见 `dist-release\builder-debug.yml` 的 `firstOrDefaultFilePatterns`）。不影响加载，但 D2 要求「逐个列出真实名字」，如实记。

## 6 回归门（真实输出）

| 门 | 命令 | 真实输出 |
|---|---|---|
| G1 | `npm test` | `Test Files 47 passed (47)` / `Tests 800 passed (800)`，`Start at 18:29:35`，`Duration 9.24s`，`TEST_EXIT=0` —— 与基线逐字相同，无减少 |
| G2 | `git diff --name-only` / `--numstat` | 四个：`electron-builder.yml`（B1，+5/−0，唯一的非文档改动）、规格（B2，+9/−4）、计划（B3，+3/−3）、本任务 check 表（J 段 + I 段延期项写法 + E 段显式未勾，+34/−24）；未跟踪只有 brief 与本报告 |
| 类型门 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出，`TSC_EXIT=0` |
| 勾普查 | `node .superpowers/sdd/2026-10-10-quick-launch-card/tick-census.mjs` | 本表：`☑=0 裸☐=19 I段 -[ ]=5 H2=未提交`，整体「通过」exit 0。19 个裸 ☐ = A1-A3 / B1-B4 / C1 / D1-D2 / E10 / F1-F3 / G1-G2 / H1-H3，等主代理验收落勾；E1-E9 已是显式未勾形态 |

## 7 真机门 E1-E9 与 E10（没做的不假装）

- **E1-E9 未执行**：要打开 GUI 做窗口操作，本环境起不了 Electron——实测 `node_modules\electron\dist\electron.exe` 立即退出，退出码 `0x80000003 STATUS_BREAKPOINT`（索引 K33）；打包产物同为 Electron，同样起不来。check 表 E 段九行写成 `☐（原因 + 去处：用户真机逐条验收）`；I 段延期项按 **K36** 写成普通项目符号 + `☐（原因 + 去处）`（不用 `- [ ]`）。
- **E10 / WSL**：本机无发行版，未跑；规格「状态」行明确写「**WSL：未验收**」。
- 因此 **R4（打包后原生模块加载）目前只做到「文件级」**：`.node`/`.dll`/`OpenConsole.exe` 确实在 `app.asar.unpacked` 下、加载路径是包名 + 相对路径，但**没有任何一次真实 dlopen 成功**的记录。真机门仍欠着。

## 8 文档门 F1-F3

- **F1**：规格「状态」行（`:4-9`）重写为只记已跑过的事实：自动化门（47 files / 800 passed、tsc exit 0）、打包门**文件级**结论（含 D2 真实清单与 `"unpacked": true` 语义）、**真机 §12 硬门 1-9 未验收**（附 `0x80000003` 原因与记录表路径）、**WSL 未验收**，并声明 §13 五条保持原样。
- **F2**：§13 的 5 条**一字未改**（`git diff --numstat` 对规格 = `9/4`，全部落在状态行与 §7.2 / §12-1 的措辞）。
- **F3**：规格 `:152-153`（§7.2）、`:298`（§12-1）、计划 `:483`（步骤 2）、`:487`（步骤 3 第 1 条）的「portable exe」→「win-unpacked 产物 `dist-release\win-unpacked\lms_launcher.exe`」，并注明依据 `ef23ac6`。复核 `grep -n portable`：spec/plan 里剩下的 `portable` 只出现在「**不生成** portable exe」这类说明句里。

## 9 疑虑清单（需要主代理处置）

1. **check 表 D2 的基线前提不成立**（本任务最重要的发现）：对当前树的新构建，**不加 `asarUnpack` 也会有 `app.asar.unpacked`**（electron-builder 25.1.8 的原生模块自动探测已解出平台包）。所以「`app.asar.unpacked` 出现即证明解包生效」在这套工具链上**不成立**；真实差别是 §3.2 的「18 → 21 个文件 + 外层 wrapper 包由 `offset` 变 `unpacked`」。建议按 AGENTS.md「后续更新」第 2 条登记进索引 **K 组**（K 组不在我的范围，我没改索引）。
2. **旧 `dist-release` 产物是陈旧的**（早于 `90c9320`，不含 node-pty）。任何「拿现成产物取证」都会取到错的证；本次已用现跑覆盖，现在 `dist-release` 是 HEAD 的构建。
3. **真机门仍欠着**：R4 的运行时部分零证据。用户真机验收时第 1 条（打包产物里开终端）必须真做一次；顺带可覆盖任务 6 D6b、任务 7 G3、任务 13 G3/G4 与 M12/M13/M15/M17/M19 的复核。
4. **I 段第 4 行仍写「F1-F2 文档更新」**，漏 F3。我没改判据清单（不扩范围），只在括号里指向 F 段 F3 行与 J 段。要不要补成「F1-F3」请主代理定。
5. **构建耗时与简报不符**（≈9-15s，不是几分钟）：不是问题，只是别按「慢」去等。
6. 本次 `npm install`（`build.bat:38`）**没有**改动 `package.json` / `package-lock.json`（`git status` 可证），K3 不受影响。

## 10 未做（按 K5）

不 `git add`、不 commit。改动留在工作区：`electron-builder.yml`（+5/−0）、规格（+9/−4）、计划（+3/−3）、本任务 check 表（J 段 + I 段延期项写法 + E 段显式未勾）。临时日志：`.temp\task14-build-before.log`、`.temp\task14-build-after.log`、`.temp\task14-npm-test.log`（`.temp/` 被 gitignore）。
