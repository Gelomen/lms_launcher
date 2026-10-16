# SDD ledger — plan: docs/superpowers/plans/2026-10-16-quick-launch-terminal-icons.md

规格：docs/superpowers/specs/2026-10-16-quick-launch-terminal-icons.md（有规格，裁决非临时）
分支：feat/quick-launch　实现起点 BASE = 50c9e77（check 表 commit）
执行载体：subagent-driven-development（AGENTS.md 工作流第 5 步：一任务一子代理、串行、子代理不 commit、主代理验收后按 H 段提交）

## 起飞前扫描（2026-16-16 16:5x 逐行取证）

| 行 | 事实 / 冲突 | 裁决 |
|---|---|---|
| PF1 | plan:6 写「文档 commit = b3604be」、task-01 A1/F6 写 HEAD = 5c4313d；实际 HEAD = 50c9e77（check 表 commit）。两处 hash 都是生成时的旧值 | Ruling: 以当前 HEAD 50c9e77 为实现起点，「仍是文档 commit」按此读 — 不改文档里的历史 hash（改了反而失真）— 代价：无 |
| PF2 | task-03 E3（plan 任务 3 步骤 1 第三条）要在 Dropdown.test.ts:225-237 末尾加 getComputedStyle(.select-label).flexGrow !== '1'，但该 describe 块（:182-238）没有 injectRealCss()；文件里那个 helper 是 :106-112 另一个 describe 的局部函数。不注入真 CSS → happy-dom 里没有 .select-icon + .select-label 这条规则，断言恒真 = 假勾 | Ruling: 任务 3 必须在该用例内注入真实 src/style.css（同 :106-112 手法），否则 E3 不勾 — 依据：该断言的用途就是守 style.css:359 的窄化点，恒真的断言等于没有 — 代价：若 happy-dom 不认相邻兄弟选择器，E3 会红，那时按实测改断言写法（同一 commit 改表） |
| PF3 | task-02 新用例要真起 powershell.exe（execFile + pipe stdio）并从 workDir/cache/terminal-icons/ 读 .png。已核：ipc-ql.test.ts:48 isPackaged:false → dataDir() = process.cwd() = :173-175 的临时目录；:87-95 只给 detectTerminals 包计数壳、实现仍跑真的 → 路径是本机真实路径；本机 PowerShell = FullLanguage（spec §3-P1） | 不阻塞：任务 2 照 plan 做；若沙箱禁 pipe spawn，J 段贴真实报错再裁 |
| PF4 | 任务 4 给 TERMS 夹具加 icon 会不会带偏既有用例：已核 :116/:219 用 li.textContent（img 不带文字）、:101/:221 用 .select-label 文本、:450/:494 同理 → 不受影响 | 无需改动；任务 4 仍要求「既有用例一字不改」 |
| PF5 | 锚点复核：quick-launch-terminals.ts:17-20/:26-28/:31-34/:107-118、shell-execute.ts:14-15、main.ts:83-86/:105-109/:1040-1042/:1126、Dropdown.vue:23-32/:82-85/:128/:140、style.css:343-359、Dropdown.test.ts:182-237、QuickLaunchModal.test.ts:22-27/:669-700/:711-721/:726-737 全部与 check 表逐字一致 | 无需改动 |
| PF6 | 探针脚本 .temp/ql-term-icon-probe/{encoded-batch.cjs,latency2.cjs} 在位（A4/A5/D7 可跑）；.gitignore 现无 cache/（任务 2 加） | 无需改动 |

## 任务账

（尚未开始）

## 任务 1 · ql-terminal-icons.ts（缓存 + PowerShell 提取接缝）

Task 1: complete (commits 50c9e77..2175f9d, 主代理逐行验收 + 独立复跑，无独立任务审查者 — 见 R8)

实现者：子代理 49254019（DONE_WITH_CONCERNS，报告 .superpowers/sdd/2026-10-16-quick-launch-terminal-icons/task-01-report.md）
产物：src-main/ql-terminal-icons.ts（189 行）+ src-main/ql-terminal-icons.test.ts（6 条，E1–E6 名字逐字）+ task-01 表 J 段 J-1..J-16 + 索引 K13–K18 + plan 两处措辞

主代理独立复跑（不是转述）：定向 `Tests 6 passed (6)`（真机冒烟未跳过）；`tsc --noEmit -p tsconfig.main.json` exit 0；`npm test` → `Test Files 53 passed (53)` / `Tests 918 passed (918)` exit 0；A4 探针复现同一字节数（1203/625/1608/1619 + null）；F3/F4/F5 计数全 0；汉字只在注释。普查：task-01 ☑=43 裸☐=0 I段=0，EXIT=0。

### 我作出的裁决（任务 1）
- R1 Ruling: `powershellExtract` 用内联 Promise 包装而非 `promisify` — plan 步骤 3 的 `promisify` 与 check F2 的 import 白名单（无 `node:util`）互相矛盾，spec §6.1 只约束「用 `execFile`、异步、不阻塞主线程」，两者都满足；代价：plan 的措辞已同步改掉（同一 commit），若日后要 `promisify` 只需给 F2 加一行。
- R2 Ruling: 「缓存目录不可写」按 spec §6.2 = 本次不缓存、图标照常（不是「该项无图标」）— spec 是真相源且比 plan G5 的概括更具体；plan G5 已同步改写。代价：G5 的读者要去看 K14。
- R3 Ruling: D2 的「跑红」判据改为 vitest 2.1 的实际措辞（`Failed to load url … Does the file exist?` + `Tests no tests`）— 原预期是 Node CJS 措辞，工具链事实；判据实质（模块解析不到、不是断言写错）不变。代价：无。
- R4 Ruling: 允许本地类型 `ExecFileOptionsWithStdio` 承载 `stdio` — @types/node 不声明它，运行时有效（探针同 stdio 实测可用），C2 五个取值一字未改。代价：升级 @types/node 后这个本地类型可能变冗余，删掉即可。
- R5 Ruling: check E6 引用的「索引 K11」是错的，真实先例 = `shell-execute.test.ts:204-222`；已改表并登记 K16。代价：无。
- R6 Ruling: 测试文件 import `node:os`/`node:fs`/`node:path` 属 B2 夹具所需，F2 白名单只约束 B1 实现文件；已写进 F2 行。代价：无。
- R7 Ruling: H1 的暂存范围扩到受影响的三份文档（plan / 索引 / 本表）— AGENTS.md「偏离先改文档（同一 commit）」优先于 H1 的窄列表；登记 K18。代价：本 commit 含文档，diff 比纯代码大。
- R8 Ruling: 逐任务审查合并进主代理的 check 表逐行验收（AGENTS.md 工作流第 5 步把验收明确交给主代理），只在**任务 3**（共享组件、三个调用方）与**最终整分支**各加一次独立审查。代价：任务 1/2/4 少一轮独立视角，靠 check 表的 E/F/G 段与我自己复跑兜。

## 任务 2 起
BASE for task 2 review package = 2175f9d

## 任务 2 · TerminalInfo.icon + main.ts 接线 + IPC 形状门

Task 2: complete (commits 2175f9d..c3f5746, 主代理逐行验收 + 独立复跑)

实现者：子代理 93b5f4c1（DONE，报告 task-02-report.md）
产物：quick-launch-terminals.ts（2 hunk）/ main.ts（terminalIconCacheDir + 接线）/ ipc-ql.test.ts（C4 三条 + 新用例）/ .gitignore（cache/）+ task-02 表 J 段 + 索引 K19/K20 + plan 任务 2 步骤 1 措辞修正

主代理独立复跑：定向四文件 `Tests 78 passed (78)`；`tsc` exit 0；`npm test` → `Tests 919 passed (919)` exit 0；`git diff -U0 quick-launch-terminals.ts` hunk 数 = 2；仓库根无 `cache/`。普查：task-02 ☑=40 裸☐=0。

### 我作出的裁决（任务 2）
- R9 Ruling: 新用例对「本机 PowerShell 可用」**不加** §9-R1 豁免（硬断言）— spec §7.1-7 未给豁免口径，且与任务 1 真机冒烟一致（只在夹具 exe 缺失时 skipIf）；R1 机器的降级现象归真机门 §7.2-4。代价：约束语言模式的机器上 `npm test` 会红一条，不是跳过。已登记 K19。
- R10 Ruling: plan 任务 2 步骤 1「注释里的『只含 {id,path}』」自相矛盾（该字符串只在 `it()` 标题里）→ 标题一字不改，新口径写进断言旁注释；plan 已改（同一 commit）。代价：无。
- R11 Ruling: 文档里的历史行号（spec §2、各表 A 段）不改写，改后真实行号只写报告/J 段；登记 K20。代价：读文档时要按 K20 换算。
- 成本登记：`ipc-ql.test.ts` 现在多起一次真实 `powershell.exe`（该文件 8.5s）。不是缺陷。

## 任务 3 起
BASE for task 3 review package = c3f5746
PF2 裁决已落文档：plan 任务 3 步骤 1 + task-03 E3 + 索引 K21（断 `flexGrow` 前必须注入真实 style.css，否则假勾）

## 任务 3 · Dropdown 的 imageUrl 通道 + 图标尺寸样式

Task 3: complete (commits c3f5746..646d81a, 主代理逐行验收 + 独立复跑 + **独立审查者**（R8 计划内的一次）)

实现者：子代理 35d8b083（DONE，报告 task-03-report.md）
审查者：子代理 c4a01d26（**Approved-with-minors**，无 Critical / 无 Important；抽查 5 条 J 段逐字复现；另补跑名单外两个调用方 = 82 passed）
产物：Dropdown.vue（四处）/ style.css（两条规则 + 一条选择器扩展）/ Dropdown.test.ts（两条新用例 + K21 的注入与断言）+ task-03 表 J 段 J-1..J-18 + 索引 K21/K22/K23 + plan G6 与任务 3 步骤措辞

主代理独立复跑：`npm test` → `Tests 921 passed (921)` exit 0；V2 三份 `83 passed`；`tsc` exit 0；**亲自复做 K21 有牙验证**：把 `:371` 选择器改宽 → 该用例红（`expected '1' not to be '1'`）→ 还原后 style.css diff 回到 2 hunk/+13-1。

### 我作出的裁决（任务 3 + 审查）
- R12 Ruling: `<img alt="">` **接受**且不补测试钉 —— 装饰图（规格 §4-4）、与 `App.vue:539` 同写法；补钉只会把一条装饰属性写成契约。代价：日后有人删掉 `alt` 不会红。登记 K22，并把 task-03 C3 行补全（审查者 Minor 1）。
- R13 Ruling: 审查者指出「`Dropdown` 三个调用方」不实 —— 实测六处（`SettingsModal.vue:109`、`LaunchBar.vue:118`、`QuickLaunchModal.vue:234`/`:250`、`TemplateModal.vue:409`、`UpdateModal.vue:685`）。**文档名单补全**：plan G6、索引 G6/V2、task-03 G2、task-04 G2 全部改成六个，并写明「定向名单只是快速反馈，权威门是 `npm test` 全量」。登记 K23。代价：任务 4 的定向门变长一点。
- R14 Ruling: 测试注入的真 CSS 不回收（审查者 Minor 4）—— 与既有 helper 同风格、vitest 按文件隔离，接受现状。代价：同文件后续用例在真实样式表下跑（今天无害）。
- 审查者 Minor 3（H 段先勾后提交的时间窗）：本次已按 H1/H2 立即提交消解。

## 任务 4 起
BASE for task 4 review package = 646d81a

## 任务 4 · QuickLaunchModal 接上真实图标 + 改写既有 CSS 契约门

Task 4: complete (commits 646d81a..34303ad, 主代理逐行验收 + 独立复跑；按 R8 不再单独派审查者)

实现者：子代理 c686d0f7（DONE，报告 task-04-report.md）
产物：QuickLaunchModal.vue（1 个 hunk：terminalOptions 加 imageUrl: info.icon）/ QuickLaunchModal.test.ts（TERMS 四项带可区分 icon + E1/E2 两条 + C4 改写）+ task-04 表 J 段 J-1..J-14 + 索引 K23 路径补全 + task-04 E2 行补「另一半」出处

主代理独立复跑：`npm test` → `Test Files 53 passed (53)` / `Tests 923 passed (923)` exit 0（= 921 + 2，与 plan 预期逐字一致）；六个调用方 + QuickLaunchModal = `Test Files 6 passed (6)` / `Tests 195 passed (195)`；`tsc` exit 0；组件 diff = **1 个 hunk**；`TemplateModal.vue / LaunchBar.vue / Dropdown.vue / style.css / src-main/i18n` 的 diff = **0 行**。

### 我作出的裁决（任务 4）
- R15 Ruling: B1 的 hunk 里两行说明注释**接受** —— F1 的边界是「一处 hunk」，注释在同一处内且写的是 §6.4/Q5 口径。代价：无。
- R16 Ruling: E2 多出的「另一半」（换选到缺图标项 → trigger 不带 img、文字照常）**接受** —— 与 E1 的 ④ 成对，出处仍是 §8-Q5 / 索引 K5，不是扩范围；已把出处写进 task-04 E2 行。代价：无。
- R17 Ruling: 索引 K23 的 `LaunchBar.vue:118` 补全为 `src/modules/LaunchBar.vue:118`（实现者实测指出目录缺失）。代价：无。

## 任务 5 起（打包 + 真机门，实现者 = 用户）
BASE = 34303ad；D1 build.bat → D2 asar 含 dist-main/ql-terminal-icons.js → D3 koffi 仍在 unpacked → D4 把 C1–C8 逐字交用户（含前置 feature 未收尾项）→ D5 录回报。

## 任务 5 · 打包 + 真机门（实现者 = 用户）

Task 5: 打包门 complete（commit 34303ad..c99df0d）；真机门 = 等用户回报（C1–C8 / D5 / E1–E5 / F1 写成显式未勾）

我亲自跑的（不是转述）：
- 打包前 npm test = Test Files 53 passed (53) / Tests 923 passed (923) exit 0
- cmd /c build.bat（后台 pwsh-183）exit 0：vite build 78 modules → tsc -p tsconfig.main.json → electron-builder packaging appOutDir=dist-release\win-unpacked → [build] Done.；无新增告警（只有既有的 chunk >500kB 提示）
- D2 = npx asar list …app.asar 里 SimpleMatch ql-terminal-icons → **\dist-main\ql-terminal-icons.js 在 app.asar 内**
- D3 = app.asar.unpacked\node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node 仍在
- Test-Path dist-release\win-unpacked\cache = False；Test-Path cache = False（运行期缓存没进产物，测试也没往仓库根写 cache/，索引 K11）
- A3：前置 feature 未收尾的真机项 = 2026-10-15-quick-launch-exe-path-precheck/task-03 的 C1–C9（全部仍是显式未勾，该表 J-2 记录清单曾交付但无回报）+ 更早 2026-10-13/task-04、2026-10-14/task-09 的真机项同样未回报 → 与本次 C1–C8 一并交回用户

顺带修的文档债（同一 commit c99df0d）：五张表里 17 处被 check 表生成器写坏的代码段（闭合反引号被写成右括号）+ 2 处行内破损（task-02 J-7、task-04 E5）。修后复核：六份文档 odd-反引号行 = 0、列数普查 = 0 处不一致、tick-census exit 0。

### 我作出的裁决（任务 5）
- R18 Ruling: 真机门未回报的行写成 ☐（原因 + 去处：等用户真机回报…）而不是留空或假勾 —— AGENTS.md「确实未满足的项不得留空」。代价：真机回报前本 feature 不算闭环，回报到达后要补一次提交填 C/E/J 段（与 2026-10-15 那份表同一处理方式）。

## 最终整分支审查
已派（ce3c17bf，只读）：端到端数据流、降级一致性、主进程阻塞、**spec 是否落后于代码**、测试网洞、越界/重复实现。结论到达后：Critical/Important 我修（或补 spec 同 commit），文档债登记进 K 组或下一份 spec。

## 全分支裁决清单（R1–R18）
R1 内联 Promise 包装不引 node:util（K13）· R2 缓存目录不可写 = 本次不缓存、图标照常（K14）· R3 D2 红字面按 vitest 实际措辞（K15）· R4 本地类型承载 stdio（K13）· R5 E6 先例改引 shell-execute.test.ts:204-222（K16）· R6 测试文件 import 范围（K16）· R7 H1 扩到受影响文档（K18）· R8 逐任务审查合并进主代理验收，仅任务 3 与最终各一次独立审查 · R9 IPC 用例不为 §9-R1 加豁免（K19）· R10 C4 用例标题不改、新口径进注释（K19）· R11 历史行号不改写（K20）· R12 alt 空串接受且不补测试钉（K22）· R13 调用方名单补全为六个（K23）· R14 测试注入的真 CSS 不回收 · R15 B1 hunk 内两行注释接受 · R16 E2 的「另一半」接受（出处 §8-Q5/K5）· R17 K23 路径补全 · R18 真机未回报行写成显式未勾

## 最终整分支审查（ce3c17bf，只读）+ 我的处置

结论：**可以合并**，无 Critical；1 项 Important（I-1）+ 6 处 spec 落后（I-2）+ 2 处测试网无牙（I-3）+ 7 项 Minor（M-1~M-7）。与索引 K1–K23 无冲突。审查者亲自复跑：40 + 44 passed、census exit 0、hunk 计数与 G1/G7 相符、五个提交的 --name-only 与各表 B 段一致。

### 我逐条核过的证据（不是接受自述）
- I-1 **成立**：我读了 main.ts:1134（`ql_save` shell 分支）与 :1155-1157（`ql_start` shell 分支），两处确实 `await detectTerminalsAsync()` 且只取 `.map(info => info.id)`；而 :1056 无条件 `withTerminalIcons(...)`。项目先例 ipc-ql.test.ts:736-760 正是钉这类「白付代价」。
- I-2⑥ **成立**：main.ts:118 与 ql-terminal-icons.ts:151-155 各做一次 mkdirSync。
- I-3 **成立**：缓存键只由路径决定 + 真接缝对同一 exe 确定 → :315/:324 对「读路径坏掉」不敏感；只有 :311 的 ≥1 有牙。
- M-1/M-2/M-3/M-4/M-5/M-6/M-7 全部核对为真（M-6 的重复 J 编号是我插入验收行时造成的）。

### 我作出的裁决（R19–R24）
- R19 Ruling: **I-1 改代码**（不是只登记风险）—— 补图标的调用点收敛到 `ql_terminals` handler 一处；`detectTerminalsAsync` 恢复只探测。理由：用户可感知的延迟回归 + 项目已有同口径先例。代价：多一个修复轮任务（任务 6）。→ spec §6.3 / §8-K1 已改写，索引 K24。
- R20 Ruling: **建目录只在提取层一处**，`terminalIconCacheDir()` 只算路径（消 I-2⑥ 的重复实现）。→ spec §6.2 已改写。
- R21 Ruling: **读缓存路径改用哨兵字节钉**（I-3）；原两条保留但措辞降级为「写入生效 + 键稳定」，用例名不改（K19 不变）。→ spec §7.1-15、索引 K25。
- R22 Ruling: **补三条声明门**（spec §7.1-14/15/16）：不付提取代价、哨兵读路径、尺寸声明。尺寸门只是「CSS 写了这条规则」的契约，宽度仍归真机门（K26）。
- R23 Ruling: **三条代价接受、不在本 feature 修**：损坏/半写缓存永久命中（R9）、无在途合并（R10）、`systemRoot()` 重复（R11，G1 逼出来的）。→ spec §9 新增三行、索引 K27。
- R24 Ruling: **真机清单从 7 条扩到 15 条**（审查「真机门必须覆盖」1–9 全部吸收）：降级拆 8a/8b（现象不同）、新增「保存/启动不付提取」「第二次不起进程」「损坏缓存」「含空格/中文路径」「powershell 被拦」「150%/200% 缩放」「图标身份映射可证伪」「.png 数量加限定」。→ spec §7.2 改写、task-05 C 段重写、索引 K28。**任务 6 改了产物 → 重新打包后重发清单。**
- 文档债处置：I-2 的六处 spec 落后全部补进 spec（§6.1 空输入不起进程 / BOM / encoding / 非对象与空串；§6.2 去重与不校验 magic；§6.4 `alt=""`）；M-4 给 K19 补代价；M-5 由 R24 消解；M-6 把 task-02 的重复 J 编号改成 J-14/J-15（保留实现者原编号与交叉引用）。

## 任务 6（修复轮）
Task 6: 已派子代理 5ed58185（TDD：先红两条 → 改 main.ts 三处 → 尺寸声明门有牙验证 → 回归门；预期 `Tests 926 passed (926)`）。文档已先改（spec / plan / 00-index / task-05 / task-06 五份，工作区未提交）——按 AGENTS.md 与代码同一个 commit（K24）。
BASE for task 6 = dee5f83。

## 任务 6 验收（主代理，23:2x–23:5x）→ 已提交 `d4c054b`

子代理 5ed58185 报 DONE_WITH_CONCERNS。我独立复跑，不接受自述：
- `npm test` = `Test Files 53 passed (53)` / `Tests 926 passed (926)` exit 0（= 基线 923 + 3，与表里 G4 一致）；`npx tsc --noEmit -p tsconfig.main.json` exit 0。
- 定向四份（V6）= `Tests 57 passed (57)`；载荷链三份（V1/V3）= `Tests 74 passed (74)`。
- 边界：`git diff -U0 -- src-main/main.ts` 的 hunk 头 = 5 个，**落在三处**（:113/:117 = terminalIconCacheDir；:1050/:1056 = detectTerminalsAsync；:1142 = handler）——与 B1 一致；子代理报的「3 个 hunk」是默认上下文下的同一事实。六个不得改的文件 `git diff --quiet` exit 0；`git diff --name-only` 源码侧只有 B1–B3 三份。
- 逐行读了三份 diff：计数器是只计数的透传壳（其余导出原样）、哨兵用真 `cacheFileName` 算键、尺寸门断解析后的 `14px` 并在注释里写清不能区分 `1em`。
- 重新打包：`cmd /c build.bat` exit 0；exe 在位；`\dist-main\ql-terminal-icons.js` 与 `\dist-main\main.js` 都在 app.asar 内；`koffi.node` 仍在 `app.asar.unpacked`；产物树无游离 `terminal-icons` 目录。

### 三条疑虑的裁决（R25–R27，已登记索引 K29/K30/K31）
- R25 Ruling: **实现者的疑虑 1 成立**，我表里 D1 对 §7.1-15 的「改前必红」预期是错的（读路径本来就工作）。改口径 = 这类「读路径」门的红只能靠**变异取证**（临时把 `readCachedIcon` 改成 `return null` → 红 → 还原）。已改 task-06 D1 行 + 登记 K29。
- R26 Ruling: **§7.1-14 用一条三段式用例**（保存 → 启动 → 对照），不照 `:736-760` 拆两条。理由：同一个契约的两条路径 + 拆开会为计数改文档；代价（与该文件既有风格不一致、失败靠断言消息定位）已写进 K30 与 task-06 E2。
- R27 Ruling: **声明门断解析后的 `14px`**（happy-dom 解析 `em`），不防「把 `1em` 写成 `14px`」（渲染等价）。spec §7.1-16 已按此改写 + K31。
- 疑虑 3（A1 的 porcelain 预期）：我的落账造成的，实质判据（`git diff --name-only -- src src-main` 为空）成立 → 不改表。
- 实现者另做的基线复核（临时换回 HEAD 的两份测试文件跑出 923）= 有效佐证，保留在它的报告里。

## 收尾状态
- 六个提交：`50c9e77`(check 表) → `2175f9d` → `c3f5746` → `646d81a` → `34303ad` → `c99df0d` → `dee5f83`(SDD 账本) → **`d4c054b`(任务 6 修复 + 文档同步)**。
- 自动化门全绿（926）。**真机门未闭环**：§7.2 的 15 条已按新构建重发（task-05 C 段 C1–C14 写成显式未勾 + 去处）。回报到达后再补一次提交填 C/E/J 段，然后才谈合并。
