# 任务 14 简报 · 打包硬门 + 真机验收 + 文档记录

完成判据以 check 表为准：docs/superpowers/checks/2026-10-10-quick-launch-card/task-14-build-acceptance.md（A1-A3 / B1-B4 / C1 / D1-D2 / E1-E10 / F1-F3 / G1-G2 / H1-H3 / I）。
规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §7.2 / §12 硬门 / §13。计划：docs/superpowers/plans/2026-10-10-quick-launch-card.md §任务 14。

## 起点（我已实测）

- HEAD = `d17b5cc`，工作区干净。全量基线：`npm test → 47 files / 800 passed`，exit 0。任务 1-13 全部验收并提交。
- **A2 已定（不是待决）**：`build.bat:70-90` 明确 `echo [build] Building win-unpacked only (no portable archive)`，两次 `call npx electron-builder --config electron-builder.yml --win dir`（`:83`/`:90`），`:104` 还会清掉旧的 `*-portable.exe` 残留。依据 commit `ef23ac6`（用户明确不要 portable exe）。**验收对象 = `dist-release\win-unpacked\lms_launcher.exe`**，`dist-release` 下没有 `*-portable.exe` 属预期。
- **A3 已实测**：`electron-builder.yml` 全文 31 行，`:12` `asar: true`，**当前没有任何 `asarUnpack`**。`build.bat:59` 已把 `ELECTRON_BUILDER_CACHE` 指到 `.cache\electron-builder`（默认 `%LOCALAPPDATA%` 在本机 Access denied）。
- `dist-release\win-unpacked\` 已存在（上一次构建的产物），本次构建会覆盖它。
- **本环境起不了 GUI**（索引 K33，我实测）：`node_modules\electron\dist\electron.exe --version` 与 `electron.exe .` 都立即退出，退出码 `-2147483645 = 0x80000003 STATUS_BREAKPOINT`。打包产物也是 Electron，同样起不来。

## 本任务你能做的 / 不能做的（按 K33 划线）

**必须做完（自动化/文件级）**：A1-A3、B1、C1、D1、D2、F1-F3、G1-G2、E10（文档如实标注）。
**做不了、不得假装做过**：E1-E9（要打开 GUI 窗口操作）。把它们写成 `☐（原因 + 去处：用户真机验收；索引 K33）`，J 段对应行写「未执行（本环境无 GUI）」。I 段的延期项按 **K36** 写成普通项目符号 + `☐（原因 + 去处）`，不要用 `- [ ]`（`tick-census.mjs:16` 把它算裸勾）。

## 配置门与打包门（逐字）

- **B1/C1**：`electron-builder.yml` 只加这一段（放在 `asar: true` 之后，注释说明依据规格 §7.2）：
`yaml
asarUnpack:
  - "**/node_modules/@lydell/**"
```
- **D1**：跑 `build.bat`（可能要几分钟，含 177MB 复制与 Defender 扫描；`build.bat:80` 有说明）。预期成功退出、产出 `dist-release\win-unpacked\lms_launcher.exe`、无 `*-portable.exe`。**失败重试逻辑在 `build.bat:83-95`（失败会再试一次）**，别改脚本。
- **D2**：列 `dist-release\win-unpacked\resources\app.asar.unpacked\node_modules\@lydell\node-pty-win32-x64\prebuilds\win32-x64`，确认 `conpty.node`、`conpty\conpty.dll`（以及该目录里实际存在的其它文件，逐个列出真实名字，不要照抄预期）。
- **这条门的「牙」（必须取证，否则等于没验）**：
  1. 加 `asarUnpack` **之前**先取证：`npx asar list dist-release\win-unpacked\resources\app.asar | Select-String lydell` 能看到 `.node`/`.dll` 在 asar **里面**，且 `app.asar.unpacked` 不存在或不含这些文件；
  2. 加之后重新构建，同一命令显示这些路径已改出现在 `app.asar.unpacked` 下（asar 内仍列出的话如实记录，说明 electron-builder 的语义，不要粉饰）；
  3. 顺带确认主进程加载原生模块的路径解析没变（`src-main/quick-launch.ts` 或 `src-main/pty-manager.ts` 里 `require` 的写法是包名解析，不是硬编码 asar 路径——读代码确认并在 J 段写清）。

## 文档门 F1-F3（只写事实与验收结果）

- **F1**：规格「状态」行写明：自动化门结果（`npm test` 计数、打包门 D1/D2 结论）、**真机 E1-E9 未验收（本环境无 GUI，待用户真机）**、**WSL 未验收（本机无发行版）**。
- **F2**：规格 §13 的 5 条未验证项**不得**改成「已解决」。
- **F3**：计划 任务 14 步骤 2/3 与规格 §7.2 / §12-1 里的「portable exe」措辞改为「win-unpacked 产物」，注明依据 `ef23ac6`。
- **B4**：`build.bat` 不改。

## 边界（越界即打回）

- 只改 `electron-builder.yml`（一段）+ 规格 + 计划 + check 表 J 段。**`src/**`、`src-main/**`、`build.bat`、词典一字不动。**
- 不 `git add`、不 commit（K5）。不跑 `npm run dev`。
- 不新增 i18n 键。

## 门（真实输出填进 check 表 J 段；A-I 的勾留给我，K25）

- G1 `npm test` → 全绿（`47 files / 800 passed` 之上不减）
- G2 `git diff --name-only` → 只含 B1-B3（+ check 表 J 段属文档）
- `npx tsc -p tsconfig.main.json --noEmit` → exit 0（顺手确认没碰主进程）
- 打包门的「牙」按上面三条取证，逐条贴命令与真实输出。

报告写到 .superpowers/sdd/2026-10-10-quick-launch-card/task-14-report.md（含：加 asarUnpack 前后的 asar/unpacked 对比、D2 真实文件清单、构建耗时、E1-E9 未执行的如实说明、疑虑清单）。不派子代理。
回传给我（简短）：状态一行 + D1/D2/G1/G2 真实结果 + 前后对比取证 + 疑虑（若有）。