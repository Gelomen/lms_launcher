# 快捷启动弹窗 [终端] 下拉的真实图标 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。
> 规格：`docs/superpowers/specs/2026-10-16-quick-launch-terminal-icons.md`（下文 §n 全部指它）。
> 执行载体：`subagent-driven-development`（一个任务 = 一个子代理，串行按任务号），任务内部 TDD。
> 分支：`feat/quick-launch`（当前分支）。本文与 spec 的 commit = `b3604be`，**实现的起点就是它**；[类型] 图标的既有实现 = `2f61eff`（本次沿用它的口径，见 §1）。要另起 `feat/ql-terminal-icons` 请在「开始实现」时说一声。
> 基线（§3-P11，实测 2026-10-16 16:07）：`npm test` → `Test Files 52 passed (52)`、`Tests 912 passed (912)`，exit 0。

**目标：** 给「新建/编辑启动项」弹窗的 [终端] 下拉每一项（含收起态 trigger）加上取自本机 exe 的真实图标，取不到就退回纯文字。

**架构：** 新增主进程模块 `src-main/ql-terminal-icons.ts`：按 exe 路径查 `<dataDir>/cache/terminal-icons/` 的磁盘缓存，未命中就**一次** `execFile` 起 Windows PowerShell 用 `System.Drawing` 批量提取 PNG → base64，补进 `TerminalInfo.icon`（可选字段，仍走 `ql_terminals` 一条通道）。渲染端 `Dropdown` 扩一个可选 `imageUrl`（与既有 `icon` 并列，`imageUrl` 优先），`QuickLaunchModal` 把 `info.icon` 接进去。探测层四行判定与「不缓存」一字不动。

**技术栈：** Electron + TypeScript（主进程）、Vue 3 SFC + `@vue/test-utils` + Vitest（渲染端）、`node:child_process.execFile` + `node:crypto` + `node:fs`（提取与缓存）、PowerShell `System.Drawing`（图标来源）。

## 全局约束

- **G1 探测层不动**：`src-main/quick-launch-terminals.ts:107-118`（四行判定、顺序、不缓存）与 `:31-42` / `:62-91` 一字不改；该文件只允许改 `:17-20`（加可选 `icon`）与 `:9` 的注释（§6.3）。
- **G2 不新增 i18n 键**：`ql.term.*` 四个标签一字不动；`key-coverage` / `dict` / `no-hardcoded` 三门任何任务后都不得变红，新代码字面量里不得有汉字。
- **G3 不新增依赖**：`package.json` / lockfile 一字不动；不用 koffi、不用 PE 解析（§5-6）。
- **G4 不阻塞主线程**：提取走 `execFile`（异步），**不用** `spawnSync`（索引 K2）。
- **G5 任何失败都不抛出、不写日志、不弹提示**：`execFile` 报错 / 超时 / 非 0 / JSON 解析失败 / 单项 `null` / 缓存目录不可写 → 一律「该项无图标」（§6.1 / Q5）。
- **G6 不传 `imageUrl` 的调用方一字不变**：`TemplateModal`、`LaunchBar`、[类型] 下拉（`QuickLaunchModal.vue:100-103`）的渲染结果与既有断言不得改动（`Dropdown.test.ts:225-234` 是这条的既有牙）。
- **G7 不改宽度**：`QuickLaunchModal.vue:534`（`.row-cell .term-field { flex: 1 1 auto; min-width: 0 }`）与 `.type-field` 的 180px（`:444`）一字不动（§6.5 / 索引 K6）。
- **G8 每个任务的收尾门**：`npx tsc --noEmit -p tsconfig.main.json` 干净 + 该任务定向测试绿 + `npm test` 全量绿。（仓库根只有 `tsconfig.main.json`，没有 `tsconfig.json`）
- **G9 子代理不 `git add`、不 commit**；改动留在工作区等验收（AGENTS.md 工作流第 5 步）。
- **G10 只改该任务「文件」段列出的文件**，越界即不勾。

## 审查重点（Review Focus）

| 编号 | 重点 | 钉住的任务与测试 |
|---|---|---|
| RF1 | **取不到图标必须退回今天的样子**：exe 不存在 / PowerShell 被策略禁 / 超时 / 单项 null —— 正常人期待的是「没有图标」，不是报错、不是整个下拉空掉 | 任务 1 `seam_failure_yields_no_icon_and_throws_nothing`（三种失败）+ 任务 4 `terminal_option_without_icon_renders_no_img` |
| RF2 | **列表形状不变**：图标是装饰 —— 顺序、条数、`id`、`path`、标签文案一个字都不能动（索引 K31(3) 的「不重排」口径） | 任务 1 `order_ids_and_paths_are_untouched` + 任务 2 改写后的 C4 形状断言 + 任务 4 断言 `li` 的 `textContent` 与 `t('ql.term.*')` 逐字相同 |
| RF3 | **缓存不得把「不缓存探测」带偏**：第二次打开弹窗图标 0 进程，但终端可用性每次仍实测（用户装好 WSL 下次要出现） | 任务 1 `cache_hit_skips_the_extraction_process` + 任务 2 的「两次调用 icon 逐字相同」+ 既有 C4「两次调用不共用数组实例」一字不改 |
| RF4 | **不传图标的下拉不受影响**：`TemplateModal` / `LaunchBar` / [类型] 的排布与 DOM 一字不变（`.select-icon + .select-label` 那条相邻兄弟规则是唯一的窄化点） | 任务 3 在既有 `options_without_icon_render_no_icon_and_the_trigger_keeps_only_the_caret` 里加 `flexGrow` 不是 1 的断言 + 真机门 §7.2-6 |
| RF5 | **图标随选中项走，不写死第一项**；且 `imageUrl` 与 `icon` 同时存在时只渲染一个 | 任务 3 `options_with_imageurl_render_an_img_before_the_label_in_trigger_and_panel`（换选项 → `src` 跟着换）+ `imageurl_wins_over_icon_and_absent_imageurl_keeps_the_fa_icon` |

## 文件结构

| 文件 | 动作 | 任务 |
|---|---|---|
| `src-main/ql-terminal-icons.ts` | 创建（`cacheFileName` / `powershellExtract` / `withTerminalIcons`） | 1 |
| `src-main/ql-terminal-icons.test.ts` | 创建（6 条：5 条假接缝 + 1 条真机冒烟） | 1 |
| `src-main/quick-launch-terminals.ts` | 改（`:17-20` 加可选 `icon`；`:9` 注释同步） | 2 |
| `src-main/main.ts` | 改（新增 `terminalIconCacheDir()`；`:1040-1042` 接线） | 2 |
| `src-main/ipc-ql.test.ts` | 改（C4 形状断言 `:279` + 新增一条缓存门） | 2 |
| `.gitignore` | 改（加一行 `cache/`，§6.2 的 dev 态落点） | 2 |
| 前置规格「只下发 {id,path}」的载体 | 该 spec 文件已删（P12）；现存载体 = `quick-launch-terminals.ts:9` 与 `ipc-ql.test.ts:279`，两处都在任务 2 里改 | 2 |
| `src/components/Dropdown.vue` | 改（`imageUrl` 可选字段 + trigger / 选项的 img 分支） | 3 |
| `src/style.css` | 改（`:351-352` 之后加两条 img 规则；`:359` 扩选择器） | 3 |
| `src/components/Dropdown.test.ts` | 改（2 条新用例 + 既有无图标用例加一条断言） | 3 |
| `src/modules/QuickLaunchModal.vue` | 改（`:110-113` 加 `imageUrl: info.icon`） | 4 |
| `src/modules/QuickLaunchModal.test.ts` | 改（2 条新用例 + 改写 `:726-737`） | 4 |
| 真机清单与回报 | 文档（本计划的真机任务） | 5 |

---

### 任务 1：`ql-terminal-icons.ts` —— 缓存 + PowerShell 提取接缝

**文件：**
- 创建：`src-main/ql-terminal-icons.ts`
- 创建：`src-main/ql-terminal-icons.test.ts`

- [ ] **步骤 0：起点核对**：`src-main/quick-launch-terminals.ts:17-20`（`TerminalInfo`，本任务**不改**，只 import 类型）、`:31-34`（powershell 固定路径的写法，照抄口径）、`src-main/shell-execute.ts:14`（接缝形态：真实现是普通导出、单测替换）、`src-main/main.ts:105-109`（`mkdirSync` 失败不阻断的写法）。
- [ ] **步骤 1：先写失败测试**（`src-main/ql-terminal-icons.test.ts`），用例名与断言逐字照 §7.1 的 1–6：
  - `cache_file_name_is_stable_and_case_insensitive`
  - `cache_hit_skips_the_extraction_process`
  - `misses_are_extracted_in_a_single_call_and_written_to_cache`
  - `seam_failure_yields_no_icon_and_throws_nothing`（三种失败：返回 `null`、抛错、返回该项为 `null` 的映射）
  - `order_ids_and_paths_are_untouched`
  - `real_powershell_seam_extracts_a_png_for_a_known_exe`（不 mock；夹具 = `%SystemRoot%\\System32\\cmd.exe`，不存在时 `it.skipIf` 跳过并注释指向真机门）
  - 缓存目录夹具用 `fs.mkdtempSync(path.join(os.tmpdir(), 'ql-icons-'))`，`afterEach` 删除。
- [ ] **步骤 2：跑红**：`npx vitest run src-main/ql-terminal-icons.test.ts` → 6 条全部失败（`Cannot find module './ql-terminal-icons'`）。输出贴 check 表 J 段。
- [ ] **步骤 3：实现**（§6.1 的三个签名，逐字）：
  - `cacheFileName(exePath: string): string` = `createHash('sha1').update(path.win32.resolve(exePath).toLowerCase()).digest('hex') + '.png'`。纯函数，不碰 fs。
  - `powershellExtract: ExtractIcons` = `execFile`（`promisify`）+ §6.1 那段脚本常量 + `-EncodedCommand`（`Buffer.from(script,'utf16le').toString('base64')`）+ `{ windowsHide: true, timeout: 8000, maxBuffer: 1 << 20, encoding: 'utf-8', stdio: ['ignore','pipe','pipe'] }`；stdout 剥 BOM 后 `JSON.parse`；任何异常 → `null`。
  - `withTerminalIcons(cacheDir, infos, extract = powershellExtract)`：`mkdirSync(cacheDir,{recursive:true})`（try/catch 吞）→ 逐项查缓存文件 → 未命中项去重后**一次** `extract` → 成功项写缓存文件（写失败吞）→ 返回新数组（浅拷贝每一项，只有拿到图标的项才加 `icon` 键）。
- [ ] **步骤 4：跑绿 + G8**：`npx vitest run src-main/ql-terminal-icons.test.ts` → `Tests 6 passed (6)`；`npx tsc --noEmit -p tsconfig.main.json` exit 0；`npm test` → `Tests 918 passed (918)`（912 + 6）。数字对不上就在 check 表 J 段说明差在哪，不许默默过。
- [ ] **步骤 5：真机冒烟取证**：`node .temp/ql-term-icon-probe/latency2.cjs <四个 exe 路径>` 复跑一次，把 `batch-4` 的真实毫秒数贴进 check 表 J 段（对照 §3-P4，验证「冷启动双峰」不是猜的）。
- [ ] **步骤 6：Commit（主代理）**：`feat(main): 终端图标提取层（PowerShell System.Drawing + 应用目录磁盘缓存）`

---

### 任务 2：`TerminalInfo.icon` + `main.ts` 接线 + IPC 形状门

**文件：**
- 修改：`src-main/quick-launch-terminals.ts:9`、`:17-20`
- 修改：`src-main/main.ts:1040-1042`（`detectTerminalsAsync`）+ 新增 `terminalIconCacheDir()`（放在 `updateZipDir()`（`:105-109`）之后，同一手法）
- 测试：`src-main/ipc-ql.test.ts:273-287`
- 修改：`.gitignore`（加一行 `cache/`）

- [ ] **步骤 0：起点核对**：`main.ts:1126`（`ql_terminals` handler，**不改**）、`main.ts:83-86`（`dataDir()`）、`main.ts:105-109`（`updateZipDir()` 的 `mkdirSync` 吞错写法）、`ipc-ql.test.ts:265-288`（C4 两条用例）、`quick-launch-terminals.ts:9`（「只下发 { id, path }」注释）。
- [ ] **步骤 1：先改测试**（`ipc-ql.test.ts`）：
  - 改写 C4 第二条（`:279`）：断言写成「必含 `id` 与 `path`；除 `id` / `path` / `icon` 外不得有别的键；若 `typeof info.icon === 'string'` 则以 `data:image/png;base64,` 开头」。用例名保留，注释里的「只含 {id,path}」改成 §6.3 的新口径。
  - 新增用例 `terminal_icons_are_stable_across_calls_and_come_from_the_disk_cache`：两次 `invoke('ql_terminals')` → 两次都有 `cmd` 项（本机基线）；两次该项的 `icon` 逐字相等；`join(workDir, 'cache', 'terminal-icons')` 下存在 `.png` 文件（`fs.readdirSync` 计数 ≥ 1）。`workDir` = 该文件 `:168-175` 已经造好的临时目录（`beforeAll` 把 `process.cwd` 换成它，`dataDir()` 因此指向它）——**不许**往仓库根写 `cache/`。
  - `.gitignore` 加一行 `cache/`（§6.2 的 dev 态落点：跑应用会在仓库根生成缓存目录；测试不产生它）。
- [ ] **步骤 2：跑红取证**：`npx vitest run src-main/ipc-ql.test.ts` → 新用例红（`icon` 不存在 / 缓存目录不存在）。改写后的 C4 仍绿（当前实现不带 `icon`）。两次输出贴 J 段。
- [ ] **步骤 3：实现接线**：`quick-launch-terminals.ts:17-20` 加 `icon?: string`（注释指向 §6.1）；`:9` 注释按 §6.3 改写；`main.ts` 加 `terminalIconCacheDir()`（`join(dataDir(),'cache','terminal-icons')` + `mkdirSync` 吞错），`detectTerminalsAsync` 改为 `resolve(withTerminalIcons(terminalIconCacheDir(), detectTerminals()))`（返回类型仍是 `Promise<TerminalInfo[]>`；既有断言 `handlerOf('ql_terminals').constructor.name === 'AsyncFunction'` 不得红）。
- [ ] **步骤 4：跑绿 + G8**：`npx vitest run src-main/ipc-ql.test.ts src-main/ql-terminal-icons.test.ts` 全绿；`npm test` → `Tests 919 passed (919)`（918 + 1）。
- [ ] **步骤 5：Commit（主代理）**：`feat(main): ql_terminals 带可选 icon（真实终端图标 data URL，走磁盘缓存）`

---

### 任务 3：`Dropdown` 的 `imageUrl` 通道 + 图标尺寸样式

**文件：**
- 修改：`src/components/Dropdown.vue:23-32`（props）、`:82-85`（`currentOption` 派生）、`:128`（trigger）、`:140`（选项）
- 修改：`src/style.css:351-352` 之后 + `:359`
- 测试：`src/components/Dropdown.test.ts:178-235`

- [ ] **步骤 0：起点核对**：`Dropdown.vue:82-85`（`currentOption` / `triggerLabel` / `triggerIcon`）、`:128`、`:140`；`style.css:343-359`（既有 FA 图标三条）；`Dropdown.test.ts:182-235`（既有 icon 两条用例与 `iconTags` 助手）。
- [ ] **步骤 1：先写失败测试**（`Dropdown.test.ts`，§7.1 的 8–10）：
  - `options_with_imageurl_render_an_img_before_the_label_in_trigger_and_panel` —— trigger 子节点序列 = `['img:select-image', 'select-label', 'select-caret']`（`img` 的 `src` 逐字等于传入值）；`li` 的 `firstElementChild` 是 `img.option-image` 且 `src` 对得上；点选另一项 → trigger 的 `src` 换成那一项。
  - `imageurl_wins_over_icon_and_absent_imageurl_keeps_the_fa_icon` —— 同时给两个 → 只有 `<img>`（`iconTags` 里不含它）；只给 `icon` → 只有 svg。
  - 既有 `options_without_icon_render_no_icon_and_the_trigger_keeps_only_the_caret`（`:225-234`）加一行：`.select-label` 的 `flexGrow` **不是** `'1'`（RF4；这条是从 `QuickLaunchModal.test.ts:735` 搬来的，任务 4 删原处）。
- [ ] **步骤 2：跑红**：`npx vitest run src/components/Dropdown.test.ts` → 2 条新用例红（`imageUrl` 被忽略 → 没有 img）。
- [ ] **步骤 3：实现 `Dropdown.vue`**：props 的 options 元素类型加 `imageUrl?: string`；加 `const triggerImageUrl = computed(() => currentOption.value?.imageUrl)`；trigger 与 `li` 的图标位改成：有 `imageUrl` → `<img class="select-image">` / `<img class="option-image">`；否则有 `icon` → 既有 `<FontAwesomeIcon>`（§6.4）。
- [ ] **步骤 4：实现样式**（`style.css`，§6.4 三条逐字：两条 img 规则紧跟 `:351-352`，`:359` 的选择器扩成 `.select-icon + .select-label, .select-image + .select-label`）。注释里写清 `1em` = 14px 的依据（`.btn` 的 `--fs-body`，`:116` / `:31`）与 `vertical-align: -0.125em` 与 vue-fontawesome 对齐的理由。
- [ ] **步骤 5：跑绿 + G8**：`npx vitest run src/components/Dropdown.test.ts` 该文件全绿（既有用例一字不改）；`npm test` → `Tests 921 passed (921)`（919 + 2）。**特别核对**：`TemplateModal.test.ts` 与 `LaunchBar.test.ts` 仍绿（G6）。
- [ ] **步骤 6：Commit（主代理）**：`feat(ui): Dropdown 支持选项图片图标（imageUrl，与 FontAwesome 并列且优先）`

---

### 任务 4：`QuickLaunchModal` 接上真实图标 + 改写既有 CSS 契约门

**文件：**
- 修改：`src/modules/QuickLaunchModal.vue:110-113`
- 测试：`src/modules/QuickLaunchModal.test.ts:22-27`（夹具）、`:726-737`（改写）、新增 2 条

- [ ] **步骤 0：起点核对**：`QuickLaunchModal.vue:110-113`（`terminalOptions`）、`:56-61`（`TERM_LABEL`，不动）、`:250-253`（[终端] 的 `Dropdown` 用法，不动）；`QuickLaunchModal.test.ts:22-27`（`TERMS` 夹具）、`:669-700`（[类型] 图标用例，作为写法样板）、`:711-721`（`.type-field` 180px 门，不动）、`:726-737`（要改写的那条）。
- [ ] **步骤 1：先写失败测试**（§7.1 的 11–13）：
  - 夹具：`TERMS` 每项加 `icon: 'data:image/png;base64,<短串>'`（四项各一个可区分的串，便于断言 `src` 的对应关系）。
  - `terminal_options_and_trigger_carry_the_real_terminal_icons` —— 打开 [终端] 面板：四项 `li` 的 `textContent` 与 `t('ql.term.*')` 逐字相同（RF2）、`firstElementChild` 是 `img.option-image`、`src` 与该项夹具逐字相同；trigger 第一个子节点是 `img.select-image` 且 `src` = 当前选中项（默认第一项 = powershell，索引 K31(3)）；点第二项（`cmd`）→ trigger 的 `src` 换成 `cmd` 的（RF5）。
  - `terminal_option_without_icon_renders_no_img` —— 夹具里 `cmd` 不带 `icon` → 那一项没有 `img`，其余三项有（RF1）。
  - 改写 `:726-737`：用例名改成 `trigger_labels_after_an_icon_absorb_the_free_space`，两个下拉（[类型] 与 [终端]）的 `.select-label` 都断言 `flexGrow === '1'`；注释指向 `Dropdown.test.ts` 里承接「不传图标不受影响」的那条（§6.6-2）。
- [ ] **步骤 2：跑红**：`npx vitest run src/modules/QuickLaunchModal.test.ts` → 2 条新用例红；改写那条红在 [终端] 的 `flexGrow`（此时还没接上图标）。输出贴 J 段。
- [ ] **步骤 3：实现**：`terminalOptions` 的 map 里加 `imageUrl: info.icon`（`QuickLaunchModal.vue:110-113`，一行）。`.term-field` 与 `.type-field` 的样式一字不动（G7）。
- [ ] **步骤 4：跑绿 + G8**：`npx vitest run src/modules/QuickLaunchModal.test.ts` 全绿（既有用例一字不改，含 `:669-700` 的 [类型] 图标门与 `:711-721` 的宽度门）；`npm test` → `Tests 923 passed (923)`（921 + 2）。
- [ ] **步骤 5：Commit（主代理）**：`feat(ui): 快捷启动 [终端] 下拉每一项显示真实图标`

---

### 任务 5：打包 + 真机清单（用户执行，§7.2）

- [ ] **步骤 1：跑 `build.bat`**（主代理），核对产物：`dist-release\\win-unpacked\\lms_launcher.exe` 存在；`npx asar list resources\\app.asar | Select-String ql-terminal-icons` 能看到 `dist-main\\ql-terminal-icons.js`；`koffi` 仍在 `app.asar.unpacked`。
- [ ] **步骤 2：把 §7.2 的 7 条清单逐字交给用户**，同时交前置 feature 未收尾的真机项（`docs/superpowers/checks/2026-10-15-quick-launch-exe-path-precheck/task-03-packaging-realmachine.md` 的真机回报）。**不得用「自动化已过」代替这一条。**
- [ ] **步骤 3：等回报**，逐条把「通过 / 不通过 + 现象」填进本任务 check 表 J 段。命中 §9-R1（约束语言模式）或 §9-R4（目录不可写）时按 Q5 的降级口径核对现象，并**同一 commit** 同步 spec / plan / check 表。
- [ ] **步骤 4：Commit（主代理）**：`docs: 快捷启动 [终端] 真实图标的真机门清单与回报`
