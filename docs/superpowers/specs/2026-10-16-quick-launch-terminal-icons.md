# 快捷启动弹窗 [终端] 下拉的真实图标 设计规格

> 规格即真相源（AGENTS.md「术语」SDD）。实现、验收、偏离处理都以本文为准；代码领先规格不算进步。
> 用户原话（逐字）：「[快捷启动] 卡片 [新建/编辑启动项] 的 [命令行] 类型, [终端] 下拉菜单的每一项, 都获取对应的图标, 显示在每一项的前面」
> 前置规格：`docs/superpowers/specs/2026-10-10-quick-launch-card-design.md` §6.1（终端探测）——该文件已在 `b330a5c chore: clean docs and temp working files` 中被删除（P12），本文按**现存载体**修订它：代码注释 `src-main/quick-launch-terminals.ts:9` 与测试 `src-main/ipc-ql.test.ts:279`。

## 1 需求

「新建/编辑启动项」弹窗在 [类型] = 「命令行」时有一行 [终端] 下拉（`src/modules/QuickLaunchModal.vue:242-254`）。它的每一项现在只有文字（`PowerShell 7 (pwsh)` / `Windows PowerShell` / `命令提示符 (cmd)` / `WSL`）。

要做的是：**每一项前面显示该终端自己的图标**，图标取自本机那个 exe（真实图标，不是内置图形）。

同一处已有先例：[类型] 下拉的两项在 2026-10-16（commit `2f61eff`）加了 FontAwesome 图标，通道是 `Dropdown` 的可选 `option.icon`（`src/components/Dropdown.vue:23-32`、`:128`、`:140`）+ `src/style.css:343-359` 的图标规则。本次沿用「面板选项 + 收起态 trigger 都显示」这一口径（Q3）。

## 2 现状

| 环节 | 位置 |
|---|---|
| 终端探测（只出 `{id, path}`） | `src-main/quick-launch-terminals.ts:17-20`（`TerminalInfo`）、`:107-118`（`detectTerminals`，不缓存） |
| IPC | `src-main/main.ts:1126`（`ql_terminals`，async）→ `src-main/main.ts:1040-1042`（`detectTerminalsAsync`） |
| 渲染端取列表 | `src/modules/QuickLaunchModal.vue:131-143`（`loadTerminals`，每次打开都重新拉） |
| 选项表（无图标） | `src/modules/QuickLaunchModal.vue:110-113`（`terminalOptions`：只有 `value` + `label`）；标签文案表 `:56-61` |
| 共享下拉组件 | `src/components/Dropdown.vue:82-85`（`currentOption` / `triggerLabel` / `triggerIcon`）、`:128`（trigger 图标位）、`:140`（选项图标位） |
| 图标样式 | `src/style.css:351`（`.select-icon`）、`:352`（`.option-icon`）、`:359`（`.select-icon + .select-label`） |
| 钉住「只下发 {id,path}」的测试 | `src-main/ipc-ql.test.ts:273-287`（`:279` 断言 `Object.keys(info).sort() === ['id','path']`） |
| 钉住「[终端] 不传图标」的测试 | `src/modules/QuickLaunchModal.test.ts:726-737`（`:735` 断言终端下拉的 `.select-label` `flexGrow` **不是** `1`） |

## 3 现状取证（本机实测 2026-10-16，探针在 `.temp/ql-term-icon-probe/`，`.temp/` 在 gitignore 内）

| 编号 | 场景 | 真实输出（原样） |
|---|---|---|
| P1 | `powershell.exe` + `System.Drawing` 逐项提取（`.temp/ql-term-icon-probe/` 首轮，`-File` 脚本） | LanguageMode = **FullLanguage**；`powershell.exe` / `cmd.exe` / `wsl.exe` / `C:\\Program Files\\PowerShell\\7\\pwsh.exe` 四个全部 `ICON 32x32`、退出码 0，PNG 625–1619 字节，单次 174–210ms |
| P2 | 四个图标的样子（`iconprobe_*.png`，已肉眼核对） | pwsh 7 = 亮蓝底 `>_`；Windows PowerShell = 深蓝底 `>_`（**两者只差底色**）；cmd = 黑底 `C:\\_` 控制台；wsl = 企鹅 Tux |
| P3 | 生产形状：`-EncodedCommand` + here-string 灌 JSON 路径表 + `ConvertTo-Json`（`encoded-batch.cjs`） | 四项全部 `PNG magic=89504e470d0a1a0a`（1619 / 1203 / 625 / 1608 字节）；不存在的 `…\\no-such-zzz.exe` → `null`（脚本不抛异常） |
| P4 | 延迟归因（`latency2.cjs`，同一进程内交替 noop / 批量 4 项各 3 次） | `noop` = 1727 / 131 / 132 ms，`batch-4` = 1207 / 224 / 223 ms → **powershell.exe 自身启动是双峰的**（冷 1.3–1.8s / 热 ~130ms），提取本身只加 ~90ms |
| P5 | Electron 能不能直接把 exe / HICON 变成图片 | `node_modules/electron/electron.d.ts` 里只有 `createFromBitmap` / `createFromBuffer` / `createFromDataURL` / `createFromPath` / `createFromNamedImage`，**无 `createFromHICON`**（`HICON` 出现 0 次）→ 走 Win32 就得自己写 DIB→PNG |
| P6 | 纯 TS 解析 PE 资源表（`pe-probe.mjs`，四个 exe） | 四个全部 `ERR The value of "offset" is out of range`（RVA→文件偏移映射越界）→ 这条路要处理资源表边角，本次不走 |
| P7 | 渲染端能不能直接吃 `data:` URL 的 `<img>` | `index.html:1-8` 无 CSP；`src/App.vue:539` 已有 `<img :src="logoUrl">` 先例 → 可以 |
| P8 | [终端] 下拉的可用宽度 | `src/modules/QuickLaunchModal.vue:527-534` 记的 2026-10-15 无头 Chromium 实测：`.term-field` = **356.7px**（`flex: 1 1 auto`，吃掉行内余下宽度），最长标签 `Command Prompt (cmd)` 当时**不截断** |
| P9 | 图标盒子的字号基准 | `.btn` 的 `font-size: var(--fs-body)` = **14px**（`src/style.css:116` + `:31`）；FA 图标在 14px 下实测占位 17.5×14（`src/style.css:346-348` 的注释） |
| P10 | 缓存目录的既有先例 | `src-main/main.ts:83-86`（`dataDir()`：打包后 = exe 所在目录，dev = cwd）、`:105-109`（`updateZipDir()` = `<dataDir>/downloads/`，`mkdirSync` 失败不阻断） |
| P11 | 基线 | `npm test` → `Test Files 52 passed (52)`、`Tests 912 passed (912)`，exit 0（2026-10-16 16:07） |
| P12 | 前置规格文件本身 | `git log --diff-filter=D` → `docs/superpowers/specs/2026-10-10-quick-launch-card-design.md` 在 `b330a5c` 被删；从 `b330a5c^` 取回 §6.1 原文：「主进程只下发 `{ id, path }`，**标签文案由渲染端 `t()` 决定**」 |

## 4 目标

1. [终端] 下拉的**每一项**在文字之前显示该终端 exe 的真实图标；收起态 trigger 显示**当前选中项**的图标（与 [类型] 同一口径，Q3）。
2. 图标来源 = 本机那个 exe 的真实图标（Q1 选定「从 exe 真实提取」），机制 = Windows PowerShell + `System.Drawing`（Q2 选定）。
3. 提取结果落盘缓存（Q6/Q7）：第二次起打开弹窗不再起进程。
4. 任何一项取不到图标 → 那一项退回今天的样子（纯文字），其余照常（Q5）。**图标是装饰，不是功能**：不报错、不阻断、不改变终端列表。
5. 前置规格 §6.1 那句「只下发 `{ id, path }`」按本文改写（P12），与实现同一提交，不留「代码领先 spec」。

## 5 非目标

1. **不**给终端页签（`.log-tab`）、快捷启动卡片行、`LaunchBar` 加图标——只有这一个下拉。
2. **不改**终端探测的四行判定、顺序、「不跨调用缓存」（`quick-launch-terminals.ts:107-118`）。缓存只针对图标（§6.2）。
3. **不**新增 i18n 键：图标不带文案，`ql.term.*` 四个标签一字不动。
4. **不做**图标失效与清理（Q7 用户明确选定「不自动失效，也不清理」）。
5. **不改** [类型] 下拉的 FontAwesome 图标与 `.type-field` 的 180px 定宽（commit `2f61eff`）。
6. **不**新增依赖（不加 `pngjs` 之类），**不**用 koffi / PE 解析（P5/P6）。
7. **不**为 pwsh 与 Windows PowerShell 图标几乎相同做区分（P2，Q4 选定「照实显示」）。

## 6 设计

### 6.1 提取层：新模块 `src-main/ql-terminal-icons.ts`

```
/** 一次批量提取：exe 绝对路径 → base64 PNG（该项取不到 = null）；整批失败（超时 / 非 0 / 解析不出）= null。 */
export type ExtractIcons = (exePaths: string[]) => Promise<Record<string, string | null> | null>;

/** 真接缝：Windows PowerShell + System.Drawing（下面的脚本）。任何异常都不抛出，按 null 交回。 */
export const powershellExtract: ExtractIcons;

/** 纯函数：缓存文件名（不含目录、不碰 fs）。 */
export function cacheFileName(exePath: string): string;

/** 给已探测的终端补 icon 字段。顺序、条数、id、path 一字不动；取不到的项不带 icon。不抛异常。 */
export async function withTerminalIcons(
  cacheDir: string, infos: TerminalInfo[], extract?: ExtractIcons,
): Promise<TerminalInfo[]>;
```

- **接缝形态**照 `src-main/shell-execute.ts:14` / `src-main/ql-elevated.ts:34` 的既有做法：真实现是**导出的普通对象/函数**，单测替换它（不 mock `node:child_process` 整模块）。
- **进程**：`node:child_process` 的 `execFile`（异步，不阻塞主线程——本次不重复 `task 10` 那次「阻塞主线程」的病）。可执行文件 = `%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`（与 `quick-launch-terminals.ts:31-34` 同一个固定路径；`System.Drawing` 在 Windows PowerShell 里必然可用，pwsh 7 的 `System.Drawing` 依赖 .NET 桌面运行时，不赌）。
- **参数**：`-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand <base64(utf16le)>`。用 `-EncodedCommand` 是为了不踩引号/转义（P3 实测这条形状可用）。
- **脚本**（整段常量，路径表以 JSON here-string 内联）：

```powershell
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$paths = @'
<JSON 字符串数组>
'@ | ConvertFrom-Json
$out=[ordered]@{}
foreach($p in $paths){$b=$null
 try{$ic=[System.Drawing.Icon]::ExtractAssociatedIcon($p);if($null -ne $ic){$ms=New-Object System.IO.MemoryStream
 $ic.ToBitmap().Save($ms,[System.Drawing.Imaging.ImageFormat]::Png);$b=[System.Convert]::ToBase64String($ms.ToArray());$ms.Dispose()}}catch{$b=$null}
 $out[$p]=$b}
ConvertTo-Json -Compress -InputObject $out
```

- **超时 8000ms**、`windowsHide: true`、`maxBuffer: 1<<20`、`stdio: ['ignore','pipe','pipe']`。取值依据：P4 —— 提取本身只加 ~90ms，但 `powershell.exe` 冷启动实测到 1.7s；8s 是「冷启动 + 慢机器」的余量，不是提取的预算。
- **降级**（Q5）：`execFile` 抛错（ENOENT / 超时 / 非 0）、stdout 解析不出 JSON、某项为 `null` → 一律「该项无图标」。不写日志、不弹提示、不影响 `ql_terminals` 返回列表。
- **降级的完整口径**（2026-10-16 最终审查 I-2①②③：代码已实现、当时只落在 check 表 → 现补进 spec）：`execFile` 用 `encoding: "utf-8"`，stdout 带 BOM 时**先剥 BOM** 再 `JSON.parse`；解析结果不是普通对象（数组 / `null` / 标量）→ **整批**按 null 处理；某项的值不是非空字符串（含空串）→ **该项**无图标。
- **空输入不起进程**：`powershellExtract([])` 直接返回 `{}`，不启动 `powershell.exe`（取证：task-01 表 J-16）。
- **输出**：`icon = 'data:image/png;base64,' + b64`（P7：渲染端可直接吃）。

### 6.2 磁盘缓存（Q6 / Q7）

- 目录：`<dataDir>/cache/terminal-icons/`（`dataDir()` = `src-main/main.ts:83-86`；与 `updateZipDir()` 的 `<dataDir>/downloads/` 同一手法，P10）。**不放 `configs/`**：那里是用户配置，会被更新/迁移逻辑当用户数据对待。
- 建目录：**只在提取层内部做一次** —— `withTerminalIcons` 开头 `mkdirSync(cacheDir, { recursive: true })`（`ql-terminal-icons.ts:151-155`），失败不阻断（同 `main.ts:107` 的口径）→ 后续读写失败按「该项无图标」降级。`main.ts` 的 `terminalIconCacheDir()` **只算路径、不建目录**（2026-10-16 最终审查 I-2⑥：两处各建一遍 = 重复实现，统一归提取层）。
- **dev 态落点**：`dataDir()` 在非打包态 = `process.cwd()`（`main.ts:85`）→ 开发时跑应用会在仓库根生成 `cache/terminal-icons/`。因此 `.gitignore` 加一行 `cache/`（与既有 `dist-*/` / `logs/` 同一类：可丢弃的运行时产物）。**测试不受影响**：`src-main/ipc-ql.test.ts:168-175` 在 `beforeAll` 里把 `process.cwd` 换成临时目录，缓存落在临时目录里。
- 文件名：`cacheFileName(exePath) = sha1(path.win32.resolve(exePath).toLowerCase()) + '.png'`。规范化 + 小写：Windows 路径不区分大小写，同一 exe 换个写法要命中同一份。
- **不失效、不清理**（Q7 用户明确选定）：键里**不含**大小 / mtime，也不删旧文件。代价登记为 R3。
- 命中 = 文件存在且能读出非空字节 → 直接用，**不起进程**；未命中才把这批路径交给 §6.1。同一次调用里多项未命中 = **一次**进程调用；**同一次调用里同一路径只处理一次**（先去重再分批，`ql-terminal-icons.ts:160`）。
- 命中判据**不校验 PNG magic**（只看非空字节）→ 上次写到一半被打断 / 文件被截断 = 永久命中，用户看到破图，只能手删目录。这是 Q7「不失效不清理」的直接后果，代价登记为 R9。
- 写入：提取成功后 `writeFileSync`。写失败（只读目录等）不影响本次返回的 data URL。

### 6.3 IPC 载荷（修订前置规格 §6.1）

`TerminalInfo`（`src-main/quick-launch-terminals.ts:17-20`）扩出一个**可选**字段：

```
export interface TerminalInfo {
  id: TerminalId;
  path: string;
  /** 该项 exe 的真实图标，PNG 的 data URL（§6.1）。取不到 = 不带这个字段。 */
  icon?: string;
}
```

- 探测层**不填**这个字段（`detectTerminals` 一字不改）；补字段的是 `withTerminalIcons`，**调用点只有一处 = `ql_terminals` 的 handler**（`main.ts:1142`）：`resolve(withTerminalIcons(terminalIconCacheDir(), await detectTerminals()))`。`detectTerminalsAsync()` 本身**不补图标**（它只探测）。
- **为什么不在 `detectTerminalsAsync` 里补**（2026-10-16 最终审查 I-1）：那个函数还有两个消费方 —— `ql_save:1134` 与 `ql_start:1155-1157`，两处都只取 `.map(info => info.id)`。在那里补 = 保存 / 启动一个 shell 条目也付一次提取（冷缓存 0.9–1.7s，最坏 8s；装在只读目录则每次都付）。与 `ipc-ql.test.ts:736-760` 已钉的「exe 条目不付探测代价」同一口径：**不为用不上的东西付代价**。
- 前置规格 §6.1 那行（P12）改写为：「主进程下发 `{ id, path }`，**可选**带 `icon`（PNG data URL，由 `ql-terminal-icons.ts` 补，§6.1 of 2026-10-16-quick-launch-terminal-icons）；**标签文案仍由渲染端 `t()` 决定**」。同时改 `quick-launch-terminals.ts:9` 的注释。
- 通道不变：还是 `ql_terminals` 一条，不新增 IPC。

### 6.4 渲染端

**`src/components/Dropdown.vue`**：options 再扩一个**可选**字段（与既有 `icon` 并列）：

```
options: Array<{ value: string; label: string; tip?: string; icon?: IconDefinition; imageUrl?: string }>
```

- 面板选项（`:150`）与 trigger（`:137-138`）：`imageUrl` 优先 → `<img class="option-image">` / `<img class="select-image">`；否则 `icon` → 既有的 `<FontAwesomeIcon>`；两者都没有 → 一字不变。两个 `<img>` 都带 `alt=""`（装饰图，与 `App.vue:539` 的既有写法一致；索引 K22 已裁：**不钉测试**，代价 = 日后删掉 `alt` 不会红）——最终审查 I-2⑤：这条此前只在 K22，现补进 spec。
- `triggerIcon`（`:85`）旁边加 `triggerImageUrl`，同一条 `currentOption` 来源（图标随选中项走）。
- 不传 `imageUrl` 的调用方（`TemplateModal` / `LaunchBar` / [类型] 下拉）渲染结果一字不变。

**`src/modules/QuickLaunchModal.vue`**：`terminalOptions`（`:110-113`）加一行 `imageUrl: info.icon`（`undefined` 时 Vue 不写属性 → 不渲染 img）。[类型] 的 `typeOptions`（`:100-103`）不动。

**`src/style.css`**：紧跟既有图标规则（`:351-352`）加两条，并扩 `:359` 的相邻兄弟选择器：

```css
.select-trigger .select-image { flex: none; width: 1em; height: 1em; object-fit: contain; }
.dropdown-panel .option .option-image { margin-right: 6px; width: 1em; height: 1em; object-fit: contain; vertical-align: -0.125em; }
.select-trigger .select-icon + .select-label, .select-trigger .select-image + .select-label { flex: 1 1 auto; }
```

- `1em` = 14px（P9：`.btn` 的字号是 `--fs-body` 14px）→ 与 FA 图标的 14px 高度同高；真实图标是方形，取 14×14（FA 的 17.5 宽是它的 1.25em 盒，不是视觉宽度）。
- `vertical-align: -0.125em` 与 vue-fontawesome 自带的 `.svg-inline--fa` 同值（`src/style.css:350` 的注释），两种图标基线一致。
- 面板里的 `margin-right: 6px` 与 `.option-icon` 同值（`:352`）；trigger 里的间距由 `.select-trigger` 的 `gap: 8px`（`:319`）给，不另加。

### 6.5 宽度预算（不截断）

`.term-field` = 356.7px（P8）。trigger 可用内容区 = 356.7 − `.btn` 的 `padding: 0 14px`（`src/style.css:118`，28px）= **328.7px**；最长一项 `Command Prompt (cmd)` 的需求 = 图标 14 + gap 8 + 文本 ~150 + gap 8 + ▼ 15.8 ≈ **196px** → 余量 ~130px。面板选项：356.7 − 面板 `padding: 4px`×2 − li `padding: 8px`×2 = 332.7px，需求 = 14 + 6 + ~150 ≈ 170px → 余量 ~160px。

**结论：不改 `.term-field` 的宽度**（`QuickLaunchModal.vue:534` 一字不动）。这一条由真机门 §7.2-1/2 兜，不由这段算术兜。

### 6.6 既有测试的口径改动（不是回归，是本次要求）

1. `src-main/ipc-ql.test.ts:273-287`：`:279` 的 `Object.keys(info).sort() === ['id','path']` 改为「必含 `id` / `path`，除 `id`/`path`/`icon` 外不得有别的键；`icon` 若存在必须是 `data:image/png;base64,` 开头的字符串」。
2. `src/modules/QuickLaunchModal.test.ts:726-737`：`:735` 断言「不传 icon 的 [终端] 下拉不受影响」——本次之后 [终端] **就是**带图标的下拉，这条断言必红。改法：两个下拉的 `.select-label` 都断言 `flexGrow === '1'`；「不传图标就不受影响」那一半移到 `Dropdown.test.ts`（那里已有 `options_without_icon_render_no_icon_and_the_trigger_keeps_only_the_caret`，`:225-234`，加一条断言 `select-label` 的 `flexGrow` 不是 1）。

## 7 验收

### 7.1 自动化（先红后绿）

**`src-main/ql-terminal-icons.test.ts`（新建）**：

1. `cache_file_name_is_stable_and_case_insensitive` —— 同一路径两次调用同值；`C:\\WINDOWS\\System32\\cmd.exe` 与 `c:\\windows\\system32\\cmd.exe` 同值；不同路径不同值；名字匹配 `/^[0-9a-f]{40}\\.png$/`。
2. `cache_hit_skips_the_extraction_process` —— 预先把缓存文件写好，假接缝计数 → **0 次调用**，返回的 `icon` 是 `data:image/png;base64,` + 文件内容。
3. `misses_are_extracted_in_a_single_call_and_written_to_cache` —— 两项未命中 → 假接缝**恰好一次**调用、参数是两条路径；返回带 `icon`；缓存文件已落盘（第二次调用同一函数 → 假接缝 0 次）。
4. `seam_failure_yields_no_icon_and_throws_nothing` —— 假接缝返回 `null` / 抛错 / 返回 `{ path: null }` 三种 → 结果里**没有** `icon` 字段，其余字段一字不动，不抛异常。
5. `order_ids_and_paths_are_untouched` —— 输入四项（含一项无图标）→ 输出顺序、`id`、`path` 与输入逐字相同（钉「不重排、不增删」）。
6. `real_powershell_seam_extracts_a_png_for_a_known_exe`（真机冒烟，不 mock）—— `powershellExtract([cmd.exe 固定路径])` → 该项是非空 base64，解码后前 8 字节 = PNG magic（`89504e470d0a1a0a`，P3）。该路径不存在时 `it.skipIf` 跳过并在注释里指向真机门。

**`src-main/ipc-ql.test.ts`**：

7. 按 §6.6-1 改写 C4 的形状断言；并加一条：`ql_terminals` 两次调用，第二次的 `icon` 与第一次**逐字相同**（磁盘缓存生效），且两次都不抛。

**`src/components/Dropdown.test.ts`**：

8. `options_with_imageurl_render_an_img_before_the_label_in_trigger_and_panel` —— `imageUrl` 的选项：`li` 的第一个元素是 `<img class="option-image">` 且 `src` 逐字等于传入值，文字仍在其后；trigger 的第一个子节点是 `<img class="select-image">`，其后才是 `.select-label` / `.select-caret`；选中另一项 → trigger 的 `src` 跟着换。
9. `imageurl_wins_over_icon_and_absent_imageurl_keeps_the_fa_icon` —— 同时给 `imageUrl` 与 `icon` → 只有 img；只给 `icon` → 只有 svg（既有两条用例一字不改）。
10. 既有 `options_without_icon_render_no_icon_and_the_trigger_keeps_only_the_caret`（`:225-234`）加一条：`.select-label` 的 `flexGrow` **不是** `1`（§6.6-2 搬过来的那一半）。

**`src/modules/QuickLaunchModal.test.ts`**：

11. `terminal_options_and_trigger_carry_the_real_terminal_icons` —— 夹具（`:22-27` 的 `TERMS`）加 `icon` 字段 → 面板四项各有一个 `<img>`，`src` 与对应 `icon` 逐字相同、位置在文字之前、文字一字不改；trigger 带当前选中项（默认第一项 = powershell，索引 K31(3)）的 img；点选另一项 → trigger 的 `src` 跟着换。
12. `terminal_option_without_icon_renders_no_img` —— 夹具里 `cmd` 不带 `icon` → 那一项没有 `<img>`，其余三项有（Q5 的渲染端那一半）。
13. 按 §6.6-2 改写 `:726-737`。

**任务 6（最终审查 I-1 / I-3 / M-1 的修复轮，2026-10-16）**：

14. `src-main/ipc-ql.test.ts`：`ql_save` / `ql_start` 的 shell 分支**不付图标提取代价** —— 照 `:87-92` 的既有做法把 `./ql-terminal-icons` 包一层**透传计数器**（不改行为，只计数），断：保存 / 启动一个 shell 条目 → 计数器**不变**；对照 = 调 `ql_terminals` → 计数器 +1。与 `:736-760` 那两条同形。
15. `src-main/ipc-ql.test.ts`：**读缓存路径本身**有牙（I-3）—— 先按 `cacheFileName` 算出某 exe 的缓存文件名、往那个路径写一段**哨兵字节**（不是真 PNG），再调 `ql_terminals` → 断言返回的 `icon` 正是那段哨兵的 base64。原 `:315`（第二次不新增 `.png`）+ `:324`（两次 icon 相同）合起来钉不住读路径（键只由路径决定 + 真接缝对同一 exe 输出确定 → 读缓存全坏也全绿），保留它们但**不再称其为「磁盘缓存生效」**。
16. `src/components/Dropdown.test.ts`：图标盒尺寸契约的**声明检查**（M-1）—— 照 `QuickLaunchModal.test.ts:793-803` 的 `injectRealCss` + `getComputedStyle` 先例，断 `.option-image` / `.select-image` 的 `width`/`height` = **`14px`**（`getComputedStyle` 会把 `1em` 按继承字号解析成 px；`--fs-body` = 14px，见 §3-P9 / §8-K5 —— 契约要钉的是**渲染尺寸**，不是写法）、`object-fit: contain`、`.option-image` 的 `margin-right: 6px`。这条**不能**区分 `1em` 与写死的 `14px`（渲染等价，索引 K31）。这只是「CSS 里写了这条规则」的契约门（happy-dom 不做布局），**宽度不被截断仍归真机门 §7.2-1**（§6.5）。

**回归门**：`npm test` 全量绿（基线 P11 = 52 files / 912 tests，新增后只增不减）；`npx tsc --noEmit -p tsconfig.main.json` exit 0；`key-coverage` / `dict` / `no-hardcoded` 三道 i18n 硬门绿（本次不加键，必须一字不动）。

### 7.2 打包真机硬门（用户执行）

打包产物（`build.bat` → `dist-release\\win-unpacked\\`）上手工跑，逐条回报现象：

1. 打开「新建启动项」，[类型] = 命令行 → 点开 [终端]：每一项文字前都有图标；`cmd` 是黑底 `C:\\_`、`wsl` 是企鹅（本机若无 WSL 发行版则该项根本不出现，P1 的前置规格基线）；文字不被省略号截断。
2. 收起态 trigger 显示当前选中终端的图标；换选一项 → trigger 的图标跟着换。
3. 第二次打开弹窗 → 下拉**立刻**有图标（不再等提取）；`<exe 目录>\\cache\\terminal-icons\\` 下有 `.png` 文件，数量 = 本机可用终端数。
4. 删掉 `cache\\terminal-icons\\` 目录 → 再打开弹窗：第一次稍慢（P4：冷启动可到 1.7s）后仍有图标，目录被重建。
5. [类型] 切到「可执行程序」再切回来：图标仍在，弹窗高度不变（218px 定高门不回归）。
6. [类型] 下拉的两个 FontAwesome 图标、`TemplateModal` 的配置下拉、`LaunchBar` 的启动项下拉：**没有任何变化**（不传 `imageUrl` 的调用方一字不变）。
7. 快捷启动条目实际启动（终端页签、提权终端、[停止]）与今天一致。
8. 降级路径拆成两条，现象**不同**（最终审查：原来并成一条会误判）：
   - 8a **约束语言模式 / WDAC**（R1）或 `powershell.exe` 缺失 / 被 AppLocker 直接拦掉：图标**缺席**，列表与启动照常，无报错弹窗、无卡顿。
   - 8b **应用目录不可写**（R4，如装在 `Program Files`）：图标**照常出现**，但每次打开都重新提取（1.3–1.7s），`cache\terminal-icons\` 不存在或为空（索引 K14）。
9. 保存 / 启动一个 **shell** 条目：冷缓存下也不该感到变慢（任务 6 之后这两条路径不起提取进程；对照 §6.3）。**这是任务 6 的回归点，必须在修复后的构建上验。**
10. 第二次打开弹窗 / 第二次启动：**不出现新的 `powershell.exe` 进程**（任务管理器或 `Get-Process powershell` 计数），下拉即时。
11. 手动把某个 `.png` 截断（R9）→ 该项破图且不自动修（确认可接受；要修就删 `cache\terminal-icons\`）。
12. 装在**含空格 / 中文**的路径（portable 目录改名）→ 图标与缓存写入仍正常（非 ASCII 路径未取证）。
13. **150% / 200% 显示缩放**下看图标观感（R5：源图只有 32×32，显示 14×14）。
14. 图标**身份映射**可证伪：`pwsh`（亮蓝）与 Windows PowerShell（深蓝）底色**必须不同**；`cmd` 黑底、`wsl` 企鹅。只报「每项都有图标」不算过 —— 那证明不了图标来自各自的 exe（§8-Q4 说的是「相似」，不是「同一张」）。
15. §7.2-3 的「`.png` 数量 = 本机可用终端数」加限定：某项取不到图标时数量**少于**终端数；目录不可写时为 **0**。

## 8 已定口径（grill-me 逐项确认，2026-10-16）

| # | 口径 | 依据 |
|---|---|---|
| Q1 | 图标来源 = **从 exe 真实提取**，不是 FontAwesome 内置图形 | 用户选定（弹窗里已有 [类型] 用内置图标，本次明确要真实图标） |
| Q2 | 机制 = Windows PowerShell + `System.Drawing` | 用户选定（P1/P3 实测可用、零新依赖）；koffi 路线要自己写 DIB→PNG（P5），纯 TS PE 解析第一版就踩坑（P6） |
| Q3 | 面板选项 + 收起态 trigger 都显示 | 用户选定（与 [类型] 一致，`Dropdown` 的同一份来源） |
| Q4 | pwsh 与 Windows PowerShell 图标几乎相同 → 照实显示，不区分 | 用户选定（P2；识别靠文字标签，图标只是视觉锚点） |
| Q5 | 取不到图标 = 该项不显示图标，其余照常 | 用户选定（与「任何异常 = 该项不可用、不抛出」同口径） |
| Q6 | 图标缓存写磁盘到应用目录 | 用户选定（原话「缓存写磁盘到应用目录」） |
| Q7 | 缓存目录 = `<dataDir>/cache/terminal-icons/`；**不自动失效、也不清理** | 用户选定（原话「`<dataDir>/cache/terminal-icons/`, 不自动失效, 也不清理」）→ 键里不含大小/mtime，见 R3 |
| Q8 | 载荷 = 扩 `TerminalInfo` 加可选 `icon`，不新增 IPC 通道 | 用户选定（一次到位、无「后补闪烁」）；代价是同步改前置规格那句「只下发 {id,path}」（§6.3） |
| K1 | 探测层不填 `icon`，补字段的是新模块，**调用点只有 `ql_terminals` 的 handler**（`detectTerminalsAsync` 不补图标；见 §6.3 与 R9 之外的 I-1 说明） | 由 Q8 推论：`detectTerminals` 的四行判定与「不缓存」一字不动（§5-2） |
| K2 | 提取用 `execFile`（异步），不用 `spawnSync` | 由 P4 推论：冷启动可到 1.7s，同步会把主线程卡住 —— 那是 `2026-10-14-quick-launch-admin` 任务 10 刚治过的病 |
| K3 | 可执行文件取 `%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe` 固定路径 | 由 P1 推论：与 `quick-launch-terminals.ts:31-34` 同一固定路径口径；pwsh 7 的 `System.Drawing` 依赖 .NET 桌面运行时，不赌 |
| K4 | 超时 8000ms | 由 P4 推论：提取本身 ~90ms，冷启动实测到 1.7s；8s 是慢机器的余量 |
| K5 | 图标盒子 14×14（`1em`），与 FA 图标同高同基线 | 由 P9 推论：`.btn` 字号 14px；真实图标是方形，取 1em 见方 |
| K6 | 本次不改 [终端] 下拉宽度 | 由 P8 推论：余量 ~130px；真机门 §7.2-1 兜 |

## 9 风险与未验证项

| # | 风险 | 处理 |
|---|---|---|
| R1 | **约束语言模式 / WDAC 策略**的机器上 `Add-Type` 被禁 → 整批无图标 | 已知边界：现象 = 退回今天的样子（Q5）。不为此加第二条机制 |
| R2 | **`powershell.exe` 冷启动**首次打开弹窗慢到 ~1.7s（P4） | 接受：此时下拉本来就处于「加载中」（`QuickLaunchModal.vue:131-143` 的 `terminalsLoading`）；第二次起 0 进程 |
| R3 | **缓存永不失效**（Q7）：系统升级换了图标，仍显示旧图标 | 用户明确选定。要清就删 `cache\\terminal-icons\\` 目录（真机门 §7.2-4 就是这条） |
| R4 | **应用目录不可写**（如装在 `Program Files`）→ 缓存写不进去，每次打开都重新提取 | 与 `configs/` / `downloads/` 同一前提（P10：打包产物是 portable 目录）。写失败只降级，不报错 |
| R5 | **`ExtractAssociatedIcon` 只给 32×32**，不含高 DPI 变体 | 接受：显示尺寸 14×14（K5），32→14 缩小不糊 |
| R6 | **宽度数字来自 2026-10-15 的取证**（P8），本轮未重测 | 由真机门 §7.2-1/2 覆盖；check 表里该行写成 `☐（原因 + 去处）` |
| R7 | **`icon` 让 `ql_terminals` 的载荷变大**（4 项 ≈ 7KB base64，P3） | 接受：只在打开弹窗时一次，量级与一条日志行相当 |
| R9 | **半写 / 损坏的缓存文件永久命中**（§6.2 的命中判据只看非空字节）→ 破图，只能手删目录 | 接受（Q7「不失效不清理」的直接后果）。真机门 §7.2-11 就是这条：手动截断一个 `.png` 看现象 |
| R10 | **无在途合并**：并发调 `ql_terminals`（如快速连点两次弹窗）会并发起多个 `powershell.exe` | 接受：§6.2 只保证「单次调用内一次进程」。真机门 §7.2-10 观察进程数；要治就在下一份 spec |
| R11 | **`systemRoot()` 两处各一份**（`ql-terminal-icons.ts:24-26` 与 `quick-launch-terminals.ts:29-31`）| 已知债：本次 G1 明令不改探测层，重复是被约束逼出来的。合并成共享 helper 留给下一份 spec |
| R8 | **真机冒烟门依赖机器**：`cmd.exe` 固定路径不在（极罕见的精简系统）时用例跳过 | 与 `quick-launch-terminals.test.ts` 既有做法一致（夹具不在时跳过 + 注释指向真机门） |
