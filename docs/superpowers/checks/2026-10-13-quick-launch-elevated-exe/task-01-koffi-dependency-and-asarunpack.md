# 任务 1 · 引入 koffi 依赖 + 打包解包声明 — check 表

> 计划：[2026-10-13-quick-launch-elevated-exe.md](../../plans/2026-10-13-quick-launch-elevated-exe.md) §任务 1 · 规格：[2026-10-13-quick-launch-elevated-exe-design.md](../../specs/2026-10-13-quick-launch-elevated-exe-design.md) §6.8 / §3 E12-E14 · 关联审查重点 **R4**（索引 R 组）
> 前置：无（本 feature 的第一个任务）
> 现状锚点（本表生成时实测）：`electron-builder.yml:13-17`（注释 :13-15、`asarUnpack:` :16、唯一条目 :17）、`build.bat:83` / `:90`（两次 `--win dir`）、`build.bat:109`（Done 行）、`package.json`（`dependencies` 无 koffi、`allowScripts` 只有 `electron@28.3.3`）
> 索引：[00-index.md](00-index.md) 的 G1 / G6 / G7 / G8 / G9 / G11、K8

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区无已跟踪改动、HEAD 为文档提交、分支正确 | `git status --porcelain`；`git log --oneline -1`；`git rev-parse --abbrev-ref HEAD` | HEAD = `0f7c597`；分支 `feat/quick-launch`；无已跟踪文件被改 | ☑（主代理实测：HEAD = `0f7c597 docs: 快捷启动 exe 需要管理员权限时提权启动 —— spec + plan（代码一行未改）`，分支 `feat/quick-launch`。本表生成时复核 `git status --porcelain`：只有未跟踪的 `?? .superpowers/`（普查脚本）与 `?? docs/superpowers/checks/`（本表目录），**无任何已跟踪文件改动**；索引第 5 行写的「无输出」按此更正） |
| A2 | 全量基线（索引 G9 / K11：由主代理实测，子代理不重跑） | `npm test` | 改动前全绿，两个计数抄进本行 | ☑（主代理实测 2026-10-13 19:25：`Test Files 47 passed (47)` / `Tests 826 passed (826)`，exit 0 —— 规格 E18。本表另以静态核对佐证文件数：仓库 `*.test.ts` 恰 47 份 = `src-main` 22 + `src-main/i18n` 4 + `src` 2 + `src/modules` 13 + `src/components` 2 + `src/util` 4） |
| A3 | 锚点行号属实 | 读 `electron-builder.yml:13-17`、`build.bat:83` / `:90` / `:109`、`package.json` | 与本表引用一致 | ☑（本表生成时实测：`asarUnpack:` 在 `electron-builder.yml:16`，唯一条目 `- "**/node_modules/@lydell/**"` 在 :17，注释在 :13-15；`build.bat:83` 与 :90 都是 `call npx electron-builder --config electron-builder.yml --win dir`，:109 = `echo [build] Done. Output folder: dist-release\win-unpacked\`；`package.json` 的 `dependencies` 现无 koffi（10 项），`allowScripts` 现只有 `"electron@28.3.3": true`。plan 步骤 1 写「按 `build.bat:87-100` 的自动重试」，实测重试块是 :84-100（:87 是 `:pack_retry` 标签），口径一致） |
| A4 | 生效包管理器 = npm（索引 K8 / G6） | 读 `node_modules/.package-lock.json`；`lstat node_modules/@lydell`；`git log -1 -- package-lock.json` / `-- pnpm-lock.yaml` | npm 在生效、`pnpm-lock.yaml` 已落后 | ☑（主代理实测 npm 11.19.0。本表佐证：`node_modules/.package-lock.json` 存在（`lockfileVersion` 3、530 个 packages 条目）、`node_modules/@lydell` 是真实目录（`lstat.isSymbolicLink()` = false、`isDirectory()` = true）、`package-lock.json` 最近提交 `90c9320`、`pnpm-lock.yaml` 停在 `fa8f87e`。生成表的环境里 `npm -v` 因 PATH 未含 npm 报 ENOENT，不影响该结论） |
| A5 | koffi 探针事实（规格 E12 / E14）与仓库现状要分清 | 读 `.temp/uac-probe/`；`existsSync node_modules/koffi` | 探针在 `.temp/`，仓库 `node_modules` 里还没有 koffi | ☑（本表生成时实测：`.temp/uac-probe/node_modules/` 下确有 `koffi/` 与 `@koromix/koffi-win32-x64/`（含 `win32_x64/koffi.node`）；而仓库 `node_modules/koffi` 与 `node_modules/@koromix/**` **现在都不存在** → 步骤 1 是首次把 koffi 装进仓库。「added 2 packages in 7s」与平台包路径出自规格 E12/E14 的探针。另：规格开头写「`.temp/` 被 `.gitignore:5` 的 `.*\` 忽略」，实测该规则在 `.gitignore:4`（:5 是 `!.superpowers/`）） |
| A6 | 前置任务 | 读索引清单表 | 无前置 | ☑（索引第 13 行：任务 1 前置「无」，钉住 R4） |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `package.json` | `dependencies` 增加 `"koffi": "^3.3.3"`（由 `npm install --save` 写） | 只这一处；`scripts` / `devDependencies` / `allowScripts`（现只有 `electron@28.3.3`）一字不动 | ☑（主代理实测：`git diff --numstat` = `1\t0 package.json`，`git diff -U0` 只有一行 `+    "koffi": "^3.3.3",`（插在 :22）；`scripts` / `devDependencies` 未变，`allowScripts` 现值仍只有 `"electron@28.3.3": true`（Select-String 复核）) |
| B2 | `package-lock.json` | 由 `npm install` 写（`koffi` 与 `@koromix/koffi-win32-x64` 两处条目） | 不手改、不手写条目、不删无关条目 | ☑（主代理实测：`git diff --numstat` = `353\t0 package-lock.json`（**纯新增、0 删除**，未手改）；新增条目含 `node_modules/koffi` 与 `node_modules/@koromix/koffi-*` 各平台（本机只安装 win32-x64，见 J-2）) |
| B3 | `electron-builder.yml` | 替换 :13-17（注释 + `asarUnpack` 列表）为 plan 步骤 3 的逐字块 | 只这一处；`files`（:5-11）、`asar`（:12）、`electronDist`（:18）、`extraFiles`（:20-28）、`extraResources`（:29-31）、`win`（:32-34）、`portable`（:35-36）一字不动 | ☑（主代理实测：`git diff -U0 -- electron-builder.yml` 只有两处插入 —— `@@ -15,0 +16,2 @@` 两行注释、`@@ -17,0 +20,2 @@` 两条条目；`files`(:5-11) / `asar`(:12) / `electronDist`(:22) / `extraFiles` / `extraResources` / `win` / `portable` 一字未动；文件仍是 CRLF（`LF-only 混入: 0`）) |
| B4 | 其余全部文件 | 不改 | `pnpm-lock.yaml` 不改也不暂存（索引 G6 / K8）；`src-main/**`、`src/**`、`src-main/i18n/**`、`build.bat`、旧规格都不动；本 feature 的 check 表与索引属文档，另开一次 docs 提交（AGENTS.md「后续更新」第 6 条） | ☑（主代理实测：`git diff --name-only` = `electron-builder.yml`、`package-lock.json`、`package.json` 三个；`pnpm-lock.yaml` 不在 diff / status 里；`src-main/**`、`src/**`、`build.bat` 未出现) |

## C. 接口契约

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | `package.json` 的 `dependencies` 出现逐字 `"koffi": "^3.3.3"` | 规格 §6.8 / plan 步骤 1 | ☑（主代理实测：`(Get-Content package.json -Raw) -match '"koffi"'` = True；`Select-String -Pattern '"koffi"'` → `package.json:22: "koffi": "^3.3.3",` 逐字) |
| C2 | `asarUnpack` 三条逐字：`"**/node_modules/@lydell/**"`、`"**/node_modules/koffi/**"`、`"**/node_modules/@koromix/**"`；注释五行按 plan 步骤 3 逐字（保留 node-pty 的说明 + 追加 koffi 的说明） | plan 步骤 3 / 规格 §6.8 | ☑（主代理读现值核对：注释 :13-17（原三行保留 + 新增两行 koffi 说明）、`asarUnpack:` :18、三条条目 :19-21 = `@lydell/**`、`koffi/**`、`@koromix/**` 逐字（`git diff -U0` 见 J-6）) |
| C3 | 原生件真实路径 = `node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node`（`Test-Path` → `True`） | 规格 E12 / plan 步骤 1 | ☑（主代理实测：`Test-Path node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node` = **True**；`Test-Path node_modules/koffi` = True) |
| C4 | 不加 `allowScripts` 条目、不 `npm rebuild koffi`（现值只有 `"electron@28.3.3": true`，实测） | 全局约束 / 索引 G7 / 规格 E12 | ☑（主代理实测：`allowScripts` 仍只有 `"electron@28.3.3": true`（未加条目）；全程未跑 `npm rebuild koffi`) |
| C5 | 加载冒烟输出逐字 `function function 16`（x64 对齐：`uint32` 4 + 填充 4 + 指针 8 = 16；索引 K16，plan 原写 `= 8` 漏算填充、已同步更正） | plan 步骤 2（已按实测更正） | ☑（主代理实测输出 `function function 16`（`SMOKE_EXIT=0`）—— 与已更正的 C5 / 索引 K16 一致（原 `= 8` 漏算 x64 对齐填充）) |
| C6 | `pnpm-lock.yaml` 一字不动（停在 `fa8f87e`，实测） | 全局约束 / 索引 G6 / K8 | ☑（主代理实测：`git status --porcelain -- pnpm-lock.yaml` 为空；`pnpm-lock.yaml` 仍停在 `fa8f87e`（索引 K8）) |

## D. 步骤门（本任务没有可写的单测，门 = 安装 → 平台包落盘 → 加载取证 → 声明 → 类型 → 全量）

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：安装 | `npm install koffi@^3.3.3 --save` | exit 0，输出含 `added 2 packages`（或 `1 added, 1 changed`）；`package.json` 与 `package-lock.json` 出现 koffi 两条 | ☑（主代理执行 `npm install koffi@^3.3.3 --save` → `EXIT=0`；输出尾部见 J-1（含 `npm warn install-scripts … koffi@3.3.3 (install: node ./cnoke.cjs -P . -D src/koffi --prebuild --release)` 未被 allowScripts 覆盖 = 脚本未执行）；`package.json:22` 与 `package-lock.json` 出现 koffi 条目) |
| D2 | 步骤 1 后半：平台包落盘 | `Test-Path node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node` | `True`。`False` → 停下报告，不改 `allowScripts`、不 `npm rebuild koffi`（规格 §9-R5） | ☑（主代理实测 `Test-Path …koffi.node` = **True**（J-2）→ 未触发「停下报告」分支) |
| D3 | 步骤 2：加载冒烟（证明 `install` 脚本被拦下不影响可用） | `node --input-type=module -e "import koffi from 'koffi'; const k=koffi.load('shell32.dll'); console.log(typeof koffi.load, typeof k.func, koffi.sizeof(koffi.struct('T',{a:'uint32',b:'void *'})))"` | `function function 16`（索引 K16）；任何 `Cannot find module 'koffi'` 或 dlopen 类错误 = 本任务不通过 | ☑（主代理实测 `function function 16`、`SMOKE_EXIT=0`；顺带取 `koffi.sizeof(SHELLEXECUTEINFOW)` = **112**（`SIZEOF_EXIT=0`，与规格 E13 逐字一致）→ 见 J-3) |
| D4 | 步骤 3：`asarUnpack` 两条 | — | 见 C2（只改 :13-17） | ☑（见 B3 / C2（只改 :15-21 这一段）) |
| D5 | 步骤 4：类型门 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出、exit 0（此时还没有代码 import koffi，这条只证明没弄坏既有编译） | ☑（主代理实测 `npx tsc -p tsconfig.main.json --noEmit` → 无输出、`TSC_EXIT=0`) |
| D6 | 步骤 5：全量回归 | `npm test` | 与基线逐字相同：`Test Files 47 passed (47)` / `Tests 826 passed (826)`（本任务不加用例） | ☑（主代理实测 `npm test` → `Test Files 47 passed (47)` / `Tests 826 passed (826)`、`TEST_EXIT=0` —— 与基线（规格 E18）逐字相同，本任务未增删用例) |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | koffi 的 `install` 脚本被 `allowScripts` 拦下未执行仍可用 —— 不得为此加 `allowScripts`、不得 `npm rebuild koffi` 试运气 | 规格 E12 / §9-R5 / 索引 G7 | ☑（koffi 的 install 脚本确实没跑（J-1 的 `install-scripts` 警告点名 `koffi@3.3.3`），但 D3 的 `koffi.load('shell32.dll')` 与 `koffi.struct/sizeof` 全部可用 → 「不执行 install 脚本也可用」成立（规格 E12）。未加 `allowScripts`、未 `npm rebuild`) |
| E2 | 原生件在**可选平台包**里、不在入口包里：`asarUnpack` 必须同时有 `koffi` 与 `@koromix` 两条（只写 `koffi` 一条 → 真机第 5 步必失败） | 规格 E12 / §6.8 / 索引 R4 | ☑（两条都在：`electron-builder.yml:20` = `**/node_modules/koffi/**`、:21 = `**/node_modules/@koromix/**`；原生件确实只在 `@koromix/koffi-win32-x64/win32_x64/koffi.node`（C3）→ 只写 koffi 一条会漏掉真正的 .node) |
| E3 | 打包只产出 `dist-release\win-unpacked\`（`--win dir`），不产出 portable exe —— 真机门就在 `win-unpacked\lms_launcher.exe` 上跑 | 规格 E14 / `build.bat:83` / `:90` / `:109`（实测） | ☑（本任务未碰 `build.bat`（不在 diff 里）；:83 / :90 仍是 `--win dir`、:109 仍是 Done 行 → 真机门仍在 `dist-release\win-unpacked\lms_launcher.exe` 上跑（任务 4）) |
| E4 | 本任务不新增用例：全量计数必须与基线逐字相同（47 / 826），任何减少都不算过 | 全局约束 / 索引 G9 / K11 | ☑（`npm test` = 47 / 826，与基线逐字（J-5）；`git diff --name-only` 不含任何 `*.test.ts`) |
| E5 | 平台包缺失（D2 = `False`）时停下报告，不用「改打包配置 / 换包管理器」绕过 | 规格 §9-R5 / plan 步骤 1 | ☑（未触发：D2 = True，平台包正常落盘 → 无需「停下报告」，也没有用改打包配置 / 换包管理器绕过（J-2）) |

## F. 本任务相关的硬约束（索引 G 组子集）

| # | 约束 | 索引 | ✓ |
|---|---|---|---|
| F1 | 改动文件只有 `package.json`、`package-lock.json`、`electron-builder.yml` | G1 | ☑（`git diff --name-only` 恰三个文件（J-6）) |
| F2 | 包管理器 = npm；只改 `package-lock.json`，`pnpm-lock.yaml` 不改也不暂存 | G6 / K8 | ☑（用 npm 安装；`pnpm-lock.yaml` 未改、未暂存（C6 / B4）) |
| F3 | 不加 `allowScripts`、不 `npm rebuild`；可用性由 D3 的加载冒烟取证 | G7 | ☑（未加 `allowScripts`、未 `npm rebuild`；可用性由 D3 冒烟取证（C5 / E1）) |
| F4 | 命令口径：定向 `npx vitest run <路径>`、全量 `npm test`、类型 `npx tsc -p tsconfig.main.json --noEmit` | G8 | ☑（本任务用到的命令逐字：`npm install …`、`npx tsc -p tsconfig.main.json --noEmit`、`npm test`（J-1..J-5）) |
| F5 | 基线 = 47 / 826；本任务末尾计数不得有任何变化 | G9 | ☑（计数与基线逐字相同：47 / 826（J-5）) |
| F6 | 不扩范围：不碰 `process.ts` / `main.ts` / i18n / 渲染端（规格 §5 非目标） | G11 | ☑（`src-main/**`、`src/**`、i18n、渲染端都不在 diff 里（J-6）) |
| F7 | 子代理不 `git add`、不 commit（H 段归主代理） | G10 | ☑（本任务由主代理内联执行（索引 K14）；暂存与提交在落勾之后由主代理按 H 段执行) |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出，exit 0 | ☑（`TSC_EXIT=0`、无输出（J-4）) |
| G2 | `npm test` | `Test Files 47 passed (47)` / `Tests 826 passed (826)`，exit 0（= 基线逐字） | ☑（`Test Files 47 passed (47)` / `Tests 826 passed (826)`、`TEST_EXIT=0`（J-5）) |
| G3 | i18n 三门（`dict.test.ts` / `key-coverage.test.ts` / `no-hardcoded.test.ts`）在 G2 里绿 | 全绿（本任务不碰文案与调用点） | ☑（i18n 三份在全量里全绿（J-5 无 FAIL 行）；本任务未碰文案与调用点) |
| G4 | `git diff --name-only` | 恰为 `package.json`、`package-lock.json`、`electron-builder.yml`；不含 `pnpm-lock.yaml`、不含 `src-main/**` | ☑（`git diff --name-only` = 三个文件；不含 `pnpm-lock.yaml`、不含 `src-main/**`（J-6）) |

## H. 提交门（**由主代理在验收通过后执行**；子代理不 `git add`、不 commit —— 索引 G10）

| # | 项 | 命令 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 = 三个文件（plan 步骤 6 逐字） | `git add package.json package-lock.json electron-builder.yml` | ☑（主代理执行：`git add package.json package-lock.json electron-builder.yml`（check 表与索引另开 docs 提交，AGENTS.md「后续更新」第 6 条）) |
| H2 | commit message 逐字（plan 步骤 6） | `git commit -m "build: 引入 koffi FFI 依赖并声明 asarUnpack（快捷启动提权，规格 §6.8）"` | ☑（主代理执行：`build: 引入 koffi FFI 依赖并声明 asarUnpack（快捷启动提权，规格 §6.8）`（紧接本表落勾与普查通过之后）) |
| H3 | 勾完整性门：本表 `裸☐=0` 且 `I段 -[ ]=0`，退出码 0 | `node .superpowers/sdd/2026-10-13-quick-launch-elevated-exe/tick-census.mjs` | ☑（见 J-7：普查输出本表 `☑=42 裸☐=0 I段 -[ ]=0`、退出码 0) |
| H4 | `pnpm-lock.yaml` 不 `git add`（plan 步骤 6 下一字） | `git status --porcelain` 里不出现 `pnpm-lock.yaml` | ☑（主代理实测：`git status --porcelain` 在暂存后不含 `pnpm-lock.yaml`（J-6 的 diff 范围同样证明）) |

## I. 完成判据

- [x] B1-B4 / C1-C6 / D1-D6 / E1-E5 / F1-F7 / G1-G4 全部成立并落勾
- [x] J 段有真实命令与真实输出（含 D1 / D2 / D3 的原始输出；J 段空 = 该任务未完成）
- [x] H1-H4 由主代理在验收通过后执行（本表与索引的 docs 提交另开一次，AGENTS.md「后续更新」第 6 条）

## J. 执行记录（命令 + 真实输出摘要）

| 命令 / 动作 | 真实输出摘要 | 判定 |
|---|---|---|
| J-1（主代理）`npm install koffi@^3.3.3 --save` | `EXIT=0`。输出尾部：`npm warn install-scripts 4 packages have install scripts not yet covered by allowScripts: … koffi@3.3.3 (install: node ./cnoke.cjs -P . -D src/koffi --prebuild --release)`（= koffi 的 install 脚本未执行）；`package.json 出现 koffi: True`、`入口包 node_modules/koffi: True`、`allowScripts 现值: "electron@28.3.3": true`（未新增条目）、`pnpm-lock.yaml 被改? False` | D1 / C1 / C4 / F2 成立；install 脚本被拦下这一事实同时是 E1 的前提 |
| J-2（主代理）`Test-Path node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node` + `npm ls koffi @koromix/koffi-win32-x64 --depth=1` | `True`；`npm ls` → ``-- koffi@3.3.3` 与 `  `-- @koromix/koffi-win32-x64@3.3.3`，`LS_EXIT=0` | D2 / C3 / E2 / E5 成立（平台包真实存在，未触发「停下报告」） |
| J-3（主代理）加载冒烟 + `koffi.sizeof` | `function function 16` `SMOKE_EXIT=0`；`sizeof SHELLEXECUTEINFOW = 112` `SIZEOF_EXIT=0` | D3 / C5 成立（**16 而非 8** → 索引 K16，plan 与 C5/D3 已同步更正）；112 与规格 E13 逐字一致，为任务 2 的 `cbSize` 定值 |
| J-4（主代理）`npx tsc -p tsconfig.main.json --noEmit` | 无输出，`TSC_EXIT=0` | D5 / G1 成立 |
| J-5（主代理）`npm test` | `Test Files 47 passed (47)`、`Tests 826 passed (826)`、`Duration 8.81s`、`TEST_EXIT=0`；无 FAIL 行 | D6 / E4 / F5 / G2 / G3 成立，与基线逐字相同 |
| J-6（主代理）范围核对 `git diff --name-only` / `--numstat` / `-U0` | `electron-builder.yml 4\t0`、`package-lock.json 353\t0`、`package.json 1\t0`；`-U0` 显示 electron-builder 只在 `@@ -15,0 +16,2@@` 与 `@@ -17,0 +20,2@@` 插入；package.json 只在 `@@ -21,0 +22@@` 加一行；无删除行 | B1-B4 / C2 / C6 / E3 / F1 / F6 / G4 / H4 成立 |
| J-7（主代理）`node .superpowers/sdd/2026-10-13-quick-launch-elevated-exe/tick-census.mjs` 实测：`task-01-koffi-dependency-and-asarunpack.md ☑= 42 裸☐= 0 I段 -[ ]=0 H2=已提交`，脚本末行 `通过：已提交的任务表没有裸 ☐ / - [ ]`，`CENSUS_EXIT=0`（其余三张表 `H2=未提交`，属未开工，不计违规） H3 |
