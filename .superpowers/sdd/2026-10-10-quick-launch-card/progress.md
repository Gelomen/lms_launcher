# SDD ledger — plan: docs/superpowers/plans/2026-10-10-quick-launch-card.md

工作区：当前仓库工作树（分支 `feat/quick-launch`）
check 表目录：docs/superpowers/checks/2026-10-10-quick-launch-card/
执行方式：串行，任务号 1→14（K6）；子代理不 git add / 不 commit（K5），主代理验收后按 H 段提交。

## 起飞前扫描（计划 14 个任务）

| 涉及任务 | 产出 → 消费 | 发现 | 处理 |
|---|---|---|---|
| 1 → 11 | `nextCopyName` → QuickLaunch 复制按钮 | 一致：任务 11 前置含 1，签名逐字相同 | 无需处理 |
| 2 → 3 | `suggestConfigId(existing, prefix)` → `qlSave` 生成 id | 一致：任务 3 前置含 2 | 无需处理 |
| 3 → 6/11/12 | `QuickLaunchEntry` 等类型 → IPC / 卡片 / 弹窗 | 一致 | 无需处理 |
| 5 → 6/7/9/13 | `QuickLaunchManager` → main.ts / exit_app / App | 一致 | 无需处理 |
| 9 ↔ 10 | `TerminalTabView` props ↔ `LogTabItem` | K2 已定口径：props 以计划为准、无 `configId`，需要处用 `QL_TAB_PREFIX` 反解 | 按 K2 |
| 10 → 13 | `QL_TAB_PREFIX` / `qlTabId` → App 页签 | 一致 | 无需处理 |
| 8 → 9/10/11/12 | i18n 键 → 组件文案 | K4 已定口径：键必须以字面量 `t()` 出现在源码里 | 按 K4 |
| 5 | 包管理器 | K3 已定口径：npm，只提交 `package-lock.json` | 按 K3 |
| 14 | 验收对象 | K1 已定口径：`dist-release\\win-unpacked\\lms_launcher.exe`，计划「portable exe」为过时措辞 | 按 K1 |

Ruling: 沿用 K1–K6 六条已定口径，不重新讨论 — 它们由用户确认并登记在 00-index.md K 组 — 若口径错了，代价是相应任务返工。
Ruling: 不新建 git worktree，直接在 `feat/quick-launch` 工作树执行 — 用户在该分支上备好 plan/check 文档并说「开始任务1」，check 表 A1 也以当前工作区干净为起点 — 代价是隔离性弱于 worktree，可用 git 回退。

## 任务 1 相关裁决

Ruling: 旧注释 3 行（原 70-72「方案 A」说明）随代码一起搬到 src/util/copy-name.ts 头部，另加一行来源说明 — check 表 B3 写「修改第 73-80 行」，但只删 73-80 会在 .vue 里留下描述已搬走逻辑的悬空注释；规格 §5.4 要求「原样搬出」，注释属于被搬移的那段 — 代价：B3 的「其余行不动」被放宽 3 行注释；若判断错了，回退只涉及注释三行，代码不受影响。
Ruling: check 表（J 段 + ☑）不进代码提交，验收后另做一笔 docs 提交 — AGENTS.md「后续更新」第 5 条要求 docs 提交与代码提交分开，且 H1 暂存范围只含三个代码文件；不提交则下一任务 A1「工作区干净」不成立 — 代价：每任务多一笔 docs 提交；若你希望 check 表随代码同提交，改 H1 口径即可。

## 任务账

Task 1: 任务审查结论 规格 ✅（接口逐字、搬移字节级一致、调用点未改、无扩范围）+ 任务质量「需要修复」，唯一 Important #1 = 偏离（删 70-80 而非 73-80）只体现在代码里、未回写文档。
Task 1: Ruling: 审查 Important #1 取 (a) 回写文档 — 把 plan 任务 1 与任务 1 表 A2/B3 改成 70-80 并登记 K7 — 依据：AGENTS.md「偏离 spec：先改 spec/plan/check 表（同一 commit）再改代码；不得只在代码里体现」+ 规格 §5.4「原样搬出」；代价：若你更希望注释留在 .vue，回退只涉及三行注释（审查者亦确认代码功能不受影响）。
Task 1: fix round 1/5 (1 addressed, 0 open — 文档同步由主代理执行（check 表/K 组属主代理职责，AGENTS.md「后续更新」第 2 条），代码零改动; commits 341319a..e97f79c，其中代码提交 1e313bb)
Task 1: minor (deferred): 纯函数层未覆盖空 base / 含正则特殊字符的名字 / 「跳过已占用编号复用空位」（B2 限定「计划给出的 3 个用例」，本任务不可加）— 最终整分支审查甄别是否合并前补
Task 1: minor (deferred): copy-name.ts:8 的 for(;;) 无上限（旧实现原样，F1 禁止改）— 最终审查勿误报
Task 1: complete (commits 341319a..e97f79c; 代码 1e313bb + docs 662880b/e97f79c, review clean after doc sync)

Ruling: 登记 K8 — 任务 3 早于任务 8，`err.ql.*` 词典键未落地时写字面量 `t('err.ql.x')` 会被 key-coverage 判缺键而红、写中文硬编码会被 no-hardcoded 判红；口径 = 常量映射/拼接传 key，不改 dict.ts / err-keys.ts，任务 8 落地词典后再改回字面量 — 依据：key-coverage.test.ts:39-45 只认字面量、no-hardcoded.test.ts:136-148、err-keys.ts:17-18 的 IPC_ERROR_KEYS 由 dict.test.ts 守护 — 代价：任务 8 需回头把调用点改回字面量（已写进 K8）。

Task 2: 任务审查结论 规格 ✅ + 任务质量 通过。Important #1（「check 表已被暂存，H1 会把它卷进代码提交」）经我核实为**审查包生成缺陷**：我用 `.trim()` 处理 status 段吞掉了首行前导空格；实测 `git diff --cached --name-only` 无输出、`git status --porcelain` 三行均以空格开头 → 索引为空，无需 `git restore --staged`。
Ruling: 审查包生成不再对 status 段 trim，改逐行加边界标记 — 代价：无（流程工具修正）。
Task 2: minor (deferred): `suggestConfigId` 不校验 prefix 本身，非法前缀会白跑 100 次后抛 `VALIDATION: err.config.idGen`（计划强制：步骤 3 只要求改候选串、F3 禁止扩契约面；任务 3 调用点写死 'ql'）— 最终审查甄别
Task 2: minor (deferred): 新用例只走 `existing=[]` 路径，「自定义前缀 + 防重换候选」「非法前缀抛错」无用例（计划强制：步骤 1 逐字两例、B2 限定追加 2 个用例）— 最终审查甄别
Task 2: Ruling: 审查 Minor #2（config.ts:115-116 注释未提「前缀由调用方提供」）不改 — 该注释描述的是候选串必须满足的不变量，而该不变量仍由函数内 `validateConfigId(candidate)` 强制（坏前缀不会返回坏 id），注释没有误导；且 B1 边界不含注释 — 代价：若日后放开前缀来源，注释需同步
Task 2: minor (deferred): 报告把既有用例数写成 75（实为 74）；用例名中文 vs 同文件 snake_case（计划逐字强制）— 文档/风格瑕疵，不影响代码
Task 2: complete (commits e97f79c..be3475c; 代码 7b65a98，docs d8c11bc + be3475c, review clean)

Task 3: 任务审查结论 规格 ✅（§5.2/§5.3/§5.4 与 E1–E15 全落实、九条签名逐字、F1–F4 无违反）+ 任务质量「需要修复」，两条 Important 都在未来契约上。
Task 3: Ruling: 审查 Important #2（显式 id 的 validateConfigId 守卫超出 §5.3）= **保留并回写文档** — id 就是 yaml 的 key，缺了会把 'Bad ID' 写进文件、下次加载既不进 items 也不进 invalid；与 config.ts:129 同口径。落点：任务 3 表 E16/C6 + 索引 K9 + 计划 :301 补 nameTooLong + 任务 8 表 D11 与占位符注（commit 410c298）— 代价：若你认为 §5.3 六条是封闭集合，删掉 :141 一行 + 对应用例即可。
Task 3: fix round 1/5 (1 addressed, 1 resolved by 主代理文档回写 — QL_ERR 键名改回计划名 nameDup/typeInvalid/terminalMissing、YAML 与 id 复用词典既有 err.config.yamlLoadFail/yamlEmpty/idFormat、nameTooLong 补登记；反向探针证明 key-coverage 已守护复用键的 {name}/{msg}; 基线 410c298)
Task 3: Ruling: 保持 K8，不让任务 3 提前建 err.ql.* 词典键 — 占位符契约已钉进任务 8 表 D 段注与源码注释，任务 8 把调用点改回字面量 t() 时 key-coverage 自动生效，而任务 8 必然早于任务 14 的发布门；代价：任务 3→8 之间这 8 处占位符名无守护，只能靠注释与表对齐。
Task 3: minor (deferred): __proto__ 作条目 key 会静默消失（items[id] 写原型；qlDelete 的 hasOwnProperty 反而能命中，两边不一致）— 建议 Object.create(null)
Task 3: minor (deferred): available 非数组时抛裸 TypeError 不带 VALIDATION: 前缀（任务 6 IPC 传入）
Task 3: minor (deferred): 加载侧的三条行为（name>64 判非法、加载即 trim、丢弃异类字段）无夹具钉住；重名判定把 invalid 条目的 name 也算「其它条目」，无测试无说明
Task 3: minor (deferred): 保存/删除路径的 YAML: 分支无用例；整表写回会丢 YAML 注释（与 config.ts:142 同口径，但注释未写明）；normalizeEntry/validateEntry 的字符串抽取重复可抽 str()
Task 3: Ruling: 加载路径把 name>64 判为非法（进 invalid）= **保留** — §5.2 的「单条条目非法」在规格里唯一可依据的定义就是 §5.3，而 §5.3-1 含「≤64」；该条目不会被删（保存走原始映射写回），卡片按 §5.2 显示「N 条配置无效」。代价：用户手改超长名字后看到的是「无效」而不是自动截断 — 若你要的是宽容加载，改 normalizeEntry 一处即可（已记在审查 Minor 里）。
Task 3: 定向复审（第 1 轮）结论：两条发现均 ADDRESSED，无新 Critical/Important 破坏。
Task 3: complete (commits be3475c..5db815f; 代码 c5aeb04，docs 410c298 + 5db815f, fix round 1/5 then review clean)

Task 4: 主代理独立验收：3 passed / tsc exit 0 / 范围只有两个新文件 + 表；全文逐行看过（2 处 spawnSync 均 windowsHide+timeout，无模块级状态，TerminalId 用 import type）。
Task 4: 任务审查结论 规格 ✅ + 任务质量 **通过**；审查者真机独立复现 E4/E5/E6/E7/F3/F4（四次改 env 调用、单次 ~90ms、wsl.exe 存在但不出现）。
Task 4: Ruling: 审查 Important #1（E4-E7 无自动化覆盖，标注计划强制）= **补**，不是接受缺口 — 本机永远观察不到 wsl 可用（§6.3 / §12.10），不注入则 §6.1 的 wsl 行与 pwsh 行永不验证；先改文档（B2/E8/E9 + 索引 K10，commit fdc2770）再补测试，C1-C3 导出签名不动。代价：多一轮修复 + 复审；若注入做不到，退路是给未导出内部函数加默认参数。
Task 4: Ruling: wsl.exe 定位手段 = where.exe 命中或 System32 固定路径回退（与 cmd 行同口径）→ 登记 K10 / 任务 4 表 F6，后续不再讨论 — 依据：实现者主动披露 + 审查者认可「与 cmd 行同口径」。代价：规格未指定手段，若你要严格 where.exe，删 :71-72 即可（本机结果不变）。
Task 4: Ruling: detectTerminals() 最坏 3 次 spawnSync ≈ 9s 同步阻塞（实现者报告写 2 次/6s，审查者更正）→ 任务 6 的 ql_terminals 与任务 12 的打开弹窗按 9s 预算（K10）。代价：若真机出现慢探测，需在任务 6 侧做超时/降级，不改本文件语义。
Task 4: fix round 1/5 (补 E8/E9 注入式回归用例; 基线 fdc2770)
Task 4: minor (deferred): systemRoot() 硬编码 'C:\\WINDOWS' 兜底且无注释（超出规格的小扩展）
Task 4: minor (deferred): 先 existsSync(System32\\wsl.exe) 再 where.exe 可省一次 ~30ms spawnSync（顺序优化）
Task 4: minor (deferred): parseWslDistroOutput 把每非空行都当发行版名 —— 规格 §6.1 正是这么定义条件的，仅作已知边界登记
Task 4: minor (deferred): 返回顺序 powershell/cmd/pwsh/wsl 照规格表序；任务 12 若要 pwsh 优先在渲染端排序，不改本文件
Task 4: minor (deferred): 真机用例依赖本机必有 cmd（计划逐字，Windows-only 项目可接受，Linux CI 会红）
Task 4: Ruling: 保留测试里「钉 wsl -l -q 调用选项（windowsHide/timeout/encoding: 'buffer'）」的断言（test:153）— 它是唯一能抓 :84 encoding 变异的断言（ASCII 发行版名经双重解码仍能解析，数组级断言抓不到），而 encoding 是规格 §6.1「UTF-16LE」的直接要求；代价：把实现的一个内部选项钉进测试，将来若规格改编码需同时改这条断言。
Task 4: Ruling: check 表 I 段完成判据由「E1-E7」改为「E1-E9」并写明各条证据类型 — 补了 E8/E9 却不改完成判据 = 表与判据不一致。
Task 4: 定向复审（第 1 轮）结论：唯一发现 ADDRESSED，两个具名变异（impl:84 encoding / impl:89 长度判定）现均有回归保护；实现文件哈希三方一致（我 + 实现者 + 复审者）→ 未被改动。
Task 4: Ruling: 复审的 5 条 Minor 里，前两条（夹具不具区分力 → 「退出码 0」这条没钉住；E8① 把定位手段钉死与 K10(1) 冲突）= **现在顺手修**（第 2/5 轮），因为第一条正好抵消我刚裁定补 E8 的目的；其余三条（委托兜底无用例、异常路径/超时无用例、解析侧宽松）留最终审查。代价：多一轮 + 一次复审。
Task 4: 文档更正（主代理）：任务 4 表 J:109 原称「顺带复现 F6 固定路径回退分支」，复审实测本机 where.exe wsl.exe 退出码 0 且首行即 System32\wsl.exe → 观察到的是命中不是回退；已改为更正并记「:71-72 回退分支至今无证据」。
Task 4: minor (deferred): 「未装脚本时委托真实 spawnSync」的兜底无用例（临时取证文件已删、仓库不可复现）
Task 4: minor (deferred): 异常路径 impl:114 catch、r.error/ENOENT、3s 超时（F2）无任何用例
Task 4: minor (deferred): tsconfig.main.json:15 exclude 了 src-main/**/*.test.ts → check 表 G2 类型门守不到测试代码（复审已 ad-hoc 严格 tsc 补验 exit 0）；若要长期守住需另定门
Task 4: fix round 2/5 (夹具区分力 + 定位手段断言形状; 基线 fdc2770) — DONE
Task 4: 第 2 轮未再派复审者（对 skill 的一处有意偏离，记此）：本轮只处理两条 Minor（skill 规定 Minor 不进循环），且要求的证据是「夹具的区分力」，我亲自跑变异探针取得：impl:52 只判 r.error → E9① 红；impl:87 只判 r.error → E8① 红；两次还原后实现文件哈希恒为 8BFDE9E3…A5E125；28 passed / tsc exit 0。代价：若夹具改动引入了别的行为破坏，本轮无人独立看那 11 行 diff —— 已交最终整分支审查覆盖。
Task 4: minor (deferred): 新断言不再钉 where.exe wsl.exe 的调用次数/顺序；若将来重构成只走 System32 回退，E8①/E8③ 会红，需同步让夹具里的回退路径真实存在（与 E8③ 既有形状一致）
Task 4: complete (commits fdc2770..d42a8b0; 代码 99285c6（2 files +310），docs fdc2770 + d42a8b0; 2 fix rounds, round-1 review clean)

Task 5: 主代理独立验收：22 passed（新 17 + process 回归 5）/ tsc exit 0 / i18n 22 passed；process.ts 与 process.test.ts 的 git diff 为空；package.json 只加 5 包（node-pty 在 dependencies、@xterm/* 在 devDependencies 且精确钉版）；prebuilds 四产物实测在（conpty.node 291328B / conpty.dll 110152B / OpenConsole.exe 1062472B）；373 行实现逐行读过。
Task 5: 任务审查结论 规格 ✅（C1-C5 逐字、F1-F6 全成立、E1-E11 有对应用例、R1 用共享时间线真钉住顺序）+ 任务质量「需要修复」，一条真实缺陷 + 两条计划强制接口缺口。审查者还独立跑了一次真机 cmd.exe 用例（1 passed, 273ms）。
Task 5: Ruling: 审查 Important #2（start() 不带尺寸 → 80×24 兜底）= **接受兜底 + 把补救钉进下游** — C5 逐字钉死了 start(configId, entry)，没有尺寸位；兜底比 0×0 好。已写 K11(2)：任务 6 的 ql_start 成功后必须在建页签前/同时发一次 ql_resize，任务 13 复原同理。代价：首帧按 80 列排版，宽终端下会有一次重排；若你要严格「先定尺寸再起」，得改 C5 签名（跨任务改动）。
Task 5: Ruling: 审查 Important #3（protected createShellProcess）= **保留并登记**（K11(3) / 任务 5 表 C5(b)）— E4/E5 要求注入假进程而 C4/C5 没有注入位，这是唯一不破坏导出契约的做法，与 K10(2) 同口径。代价：QuickLaunchManager 多一个可子类化扩展点。
Task 5: Ruling: 实现者疑虑 2a（@xterm 精确钉版）= **接受**，规格 §7.1 表格 + §9.5 + check B1「版本钉死」优先于本机 save-prefix=^；2b（spawnShell 传 args 使 -NoLogo 生效）= **接受**，规格 §7.3 正文与代码片段自相矛盾（片段写 []），取正文与 E1/E2，spec 片段待更正。
Task 5: Ruling: 实现者疑虑 4（真机 kill() 已连带清掉 ConPTY 子进程，真机用例区分不了只 kill 与 taskkill /T /F）= **§12 硬门 5 不得因本任务绿而视为已验收**，任务 14 必须真机逐条记录（ping -n 60 → [停止] → tasklist 无残留）。
Task 5: 文档更正（主代理）：任务 5 表 J:103 的 OpenConsole.exe 字节数 62472 → 实测 1062472；任务 8 表 D 段注并入任务 5 的占位符注册表（terminalGone→{terminal}、ptySpawn→{exe}{err} 等）与复用的既有键（err.proc.noChild / log.launcher.start.cmd / log.app.exit）。
Task 5: fix round 1/5 (stopAll 透传 timeoutSecs + E9 改 stopAll(7); 基线 321707b)
Task 5: minor (deferred): states() 从「在 Map 里且不在 stopping」推导 running，从不调 proc.isRunning()（两个接口都声明了却没用）→ 进程已死而 exit 事件未到时任务 13 会重建空壳页签
Task 5: minor (deferred): stop() 强杀兜底不置 inst.exited = true，exited 在两条收尾路径语义不一致
Task 5: minor (deferred): FORCE_EXIT_WAIT_MS=1000 与 process.ts 口径不一致（那边 taskkill 后立即返回）；叠加 stopAll 串行 → 应用退出最坏 N×4s。要么去掉等待用 -1 兜底，要么 stopAll 并发；任务 7 简报要写退出预算
Task 5: minor (deferred): write/resize 在 stopping 期间仍放行，向已 kill() 的 PTY 写入在 node-pty 上可能抛
Task 5: minor (deferred): QL_ERR.notFound 定义了但本文件从未使用（给任务 6 备用的死条目）
Task 5: minor (deferred): ^1.2.0-beta.15 允许升到 stable 1.x（计划逐字给的 range，lock 已钉死）；真要钉死需改规格口径
Task 5: minor (deferred): 测试 stderr 持续打 [i18n] missing key: err.ql.*（K8 过渡状态），任务 8 前这些错误对用户显示 key 本身 —— 不可当无害忘掉
Task 5: minor (deferred): stopAll 末尾 this.instances.clear()（:328）会吞掉异常态实例的 onExit 补发（报告 §9-4）
Task 5: fix round 1/5 (stopAll 透传 + E9 改 stopAll(7); 基线 321707b) — DONE，主代理探针 A：丢参数 → E9 红 expected [3] to equal [7]
Task 5: Ruling: 修复轮 1 自己引入的盲区（E9 改用 7 后 stop() 的默认 3s 无人钉）= **立即补**（第 2 轮，只在 E8 加 stopArgs===[3]）— 我实测常量改 9 全套仍绿才下的判断；代价：多一轮。教训已可见：改测试常量前要问「它顺带拆掉了谁的覆盖」。
Task 5: fix round 2/5 (E8 补默认 3s 断言; 基线 321707b) — DONE，主代理探针 B：常量改 9 → E8 红 expected [9] to equal [3]
Task 5: 定向复审（覆盖两轮）结论：四条发现全部 ADDRESSED，无新 Critical/Important 破坏；复审独立逐行 diff 证明无顺手改动、独立哈希与报告逐字符一致。
Task 5: 文档补正（主代理）：任务 5 表 E8/E9 两行补上「默认 3s」「超时透传」两条断言口径（复审指出 E 段落后于测试）。
Task 5: complete (commits 321707b..b092f9f; 代码 90c9320（4 files +902：package.json +5 / lock +134 / quick-launch.ts 382 / quick-launch.test.ts 381），docs 321707b + b092f9f; 2 fix rounds, re-review clean)

Task 6 前置（主代理取证 + 三条裁定，已提交 6a558e1 / c8902c8 / 8ac9fa9）：
Task 6: Ruling: K12(1) 更正我自己写的 check 表 B2/E2 —— preload.ts:4 是通用 invoke(cmd, ...args) 透传，**没有按通道白名单**；通道在 main.ts 用 ipcMain.handle 注册（既有 25 例 :234-465），preload 只需两个事件订阅（照 :5-9 onLogLine）。取证：读 preload.ts:1-40 全文。代价：若将来引入按通道白名单，这条要重写。
Task 6: Ruling: K12(2) 原 D6「npm run dev → DevTools 依次调 …」实现者做不到（子代理驱动不了 DevTools），拆成 D6a 自动化形状门（vi.mock(electron) 捕获 ipcMain.handle 处理器直调断形状，新建 src-main/ipc-ql.test.ts，check 表新增 B5 并放宽 G3）+ D6b 真机冒烟；DevTools 逐条手测推到任务 14。代价：任务 6 阶段拿不到「真机 DevTools 里真的通」的证据，只能靠形状测试 + 冒烟。
Task 6: Ruling: K13 解决规格 §7.3 与 ProcessState 的冲突 —— QlDeps.spawnExe 生产实现 = 每配置一个新 ProcessState 实例（不得复用 main.ts:59 的 ps 单例，它只持一个 child + runningConfigId）+ takePipes() 两路 .resume() 丢弃。取证：process.ts:27-59（spawn 未显式 windowsHide，Node ≥12 默认 true，:22 注释写明「隐藏窗口」）、:62-68 takePipes、:28/:46 自带 STATE:/PROC: 前缀。同时更正规格 §7.3 的 pty.spawn(exe, [], …) → pty.spawn(exe, args, …)（-NoLogo 必须生效，任务 5 已按此实现）。代价：每个 exe 配置一个 ProcessState 实例（N 个并发子进程由渲染端 UI 限制）；若 Node 默认 windowsHide 变了，需回到 process.ts 显式加参数（本期不可改该文件）。
Task 6: 已派单（brief 66 行：前置 API 真实签名与行号、既有代码照抄位置、K8/K11(4)/K12/K13/K10-3 口径、D1-D6b 步骤门、边界）

Task 6: 主代理独立验收：定向 6 文件 114 passed / tsc exit 0 / i18n 22 passed / process.ts 与 process.test.ts 的 diff 为空 / 范围只含 B1-B5。逐行读了 main.ts:983-1124，并亲自核实三条「像偏离其实不是」：start() 体内无 await（槽安全）、[lms_launcher] 前缀是 llama-check.ts:23-26 的既有约定、dialog 动态 import 是 main.ts:341/:349 的既有写法。
Task 6: 任务审查结论：C1-C12 逐字符合、F1-F4 与 K13/K12 全部核实通过、E1-E5 落实、D6a 是行为级真测试（真配置层/真 detectTerminals/真 cmd.exe/真 notepad/真 ProcessState，K13 用 get_state 反证钉住）；任务质量「需要修复」= 2 条 Important + 若干 Minor。
Task 6: Ruling: K14(1) ql_pick_exe 的过滤器名归**主进程**词典 app.dialog.filterExe —— 对话框由 main.ts:1110-1119 渲染、通道无参数，只能取主进程词典；**是我写的计划 :299 把它错列成渲染端键**。已更正计划 + 任务 8 表 C9 作废 / 新增 D12 / B2 / I 段。代价：词典落地前对话框显示原始 key（K8 过渡态）。
Task 6: Ruling: K14(2) ql_save / ql_start 各带一次探测（最坏 9s）= **接受**，不改任务 4 签名（按 id 单探测 / TTL 缓存都要扩范围）。代价转成下游硬要求：任务 12 保存按钮必须单飞（重复点击 qlSave(id=null) 会生成两条新配置），任务 13 启动按钮同理。
Task 6: Ruling: K15(1) 「异步不阻塞」只做到一半（setImmediate 让一拍后仍同步 3×3s）= **本任务不改**（K10-3 + §6.1 钉死 spawnSync；真不阻塞要开 worker，属 §2 非目标），后果写进任务 6 表 J 段与 K15。
Task 6: Ruling: K15(2) **exe 配置不探测**（审查重要 #1）—— available 只在 shell 分支被读（quick-launch-config.ts:104-107 / quick-launch.ts:238），保存/启动 exe 付 9s 纯浪费 → 进修复轮。
Task 6: Ruling: K15(3) **exe 的 cwd 保持不传**（K13 逐字 launch(exe, [], configId)）—— 规格 §7.3 对 exe 的 cwd 未规定、快捷启动 exe 条目无参数，不引入「按 exe 所在目录解析」的新语义（§2 非目标）。
Task 6: Ruling: 审查重要 #2 的槽本身**不去掉**（K13 + 任务 5 C4 签名逐字，没有 configId 可传），只把 ?? 默认值换成显式 STATE: 守卫 + 加并发用例。
Task 6: 文档新增：任务 8 表 E6（钉三处常量映射的 key 取值，审查次要 #4）——补上「常量映射游离在 key-coverage 之外」的缺口。
Task 6: fix round 1/5 (重要 #1 exe 不探测 + 重要 #2 显式守卫与并发用例 + Minor #1/#2/#3/#8; 基线 6581374)
Task 6: minor (deferred): main.ts:1038-1045 的 launchError 是死代码（.catch 是微任务，同帧 catch 时必为 null；ProcessState 的 ENOENT 走 on('error') 不 reject）——已并入本轮 Minor #1
Task 6: minor (deferred): D6a 的 expect(a).not.toBe(b) 证不了「不缓存」（返回副本的缓存也能过）；constructor.name === AsyncFunction 是源码形状断言 → 注释应写成形状断言
Task 6: minor (deferred): D6a 机器依赖（真 cmd.exe / notepad.exe / 16 次真探测，wsl 挂住的机器上 16×9s 远超 60s testTimeout）——修重要 #1 消掉 7 次，其余留最终审查
Task 6: minor (deferred): 新测试文件不在类型门（tsconfig.main.json:15 排除 src-main/**/*.test.ts），D5 的 tsc 结论不含测试文件
Task 6: minor (deferred): App.test.ts:33-34 的两个捕获数组目前无人读（留给任务 13）
Task 6: 给任务 13 的接口事实：不要对 exe 配置调 ql_write / ql_resize（quick-launch.ts:299/:306 抛 STATE: err.proc.noChild）

Task 6: 定向复审结论：六条发现全部 ADDRESSED、无新 Critical/Important。它独立复算了探测次数（修复后 9 / 去掉守卫 20，差 13 = 7 次 exe 保存 + 6 次 exe 启动）并逐条核了「available 只在 shell 分支被读」的前提；对计数包壳判定「仍测真实探测路径，反而更强」（importOriginal 委托真实现、全部导出被 spread 保留）。
Task 6: Ruling: K16(1) main.ts 为测试导出 qlStartContextOrThrow = **本轮接受**（只读 seam、不触门、缺失时用例红而非加载期炸），**但不是分支最终形状**：应把「槽 + 守卫 + 两个构造期回调」抽到非入口模块（ql-start-context.ts 或 registerQlIpc()），入口回到零导出、:382 的 typeof 结构断言换成真实 set/clear 行为断言 → 留给最终整分支审查。代价：入口文件目前有一个导出，import main.ts 会跑副作用（D6a 早已如此）。
Task 6: minor (deferred): ipc-ql.test.ts:373-374 断未翻译 key 文本，任务 8 词典落地后必红 → 已写进任务 8 表 E7（用 t() 生成期望文本）
Task 6: minor (deferred): ipc-ql.test.ts:170-173 的 KNOWN_STARTED_IDS 是手维护清单，新增起进程用例会静默失效（可在 invoke 里记录 ql_start 的 id）
Task 6: minor (deferred): 计数器只数模块级 detectTerminals 一个入口，若 main.ts 改调别的入口会静默归零而用例仍绿
Task 6: complete (commits a789477 代码 / 452f6d5 文档；fix rounds 1/5；6 files +722；ipc-ql.test.ts 23 用例)
Task 7: 派单前主代理主动取证 → 发现计划只写了 exit_app，实际有两条显式 app.exit(0)（exit_app :376-382 与 run_update :643-649）。按 SDD 先改文档：规格 §7.5 退出行 + 计划任务 7 + 任务 7 表 A2/B1/C3/E5/F4 + K17（commit 86aeb19）。依据：app.exit 不触发 will-quit（main.ts:53-54），conpty/cmd 是独立进程 → 漏一处即孤儿 PTY（R3）。
Task 7: 主代理独立验收：定向 6 文件 124 passed / tsc exit 0 / i18n 22 passed；git diff --stat HEAD -- src-main/quick-launch.ts 为空（SHA 前缀 3AD853E6378CB9B5 与任务 5 提交一致 → B2「无需改动」的说法成立）；范围只含 main.ts + quick-launch.test.ts。
Task 7: 主代理自己跑的变异：P1 去掉 quick-launch.ts:334 的 if (!inst) return → 2 红（含新幂等用例）；P3 把 stopAll 改 Promise.all → 恰「逐个 await」用例红；两次还原后字节级一致。
Task 7: Ruling: K17 扩展 —— 第三处 app.exit(0)（main.ts:56，单实例锁失败）**除外**：模块求值期退出，ql（:1080）尚未构造、无渲染端可调 ql_start，真去调还会踩 TDZ。最终审查不得算漏项。
Task 7: Ruling: K18(1) 跨任务已落地的语义不要求「先红」——stopAll 语义在任务 5 已实现并有测试，任务 7 的新用例是**特征化用例**（首跑即绿属预期），红由变异自检提供。已更正任务 7 表 D2。
Task 7: Ruling: K18(2) 允许为 F4（串行）加测试，即使超出计划 步骤 1 的字面「追加幂等用例」：判据 = 新增用例钉的必须是本任务表里的硬约束，不是任意打磨。已写进任务 7 表 B3。
Task 7: minor (deferred): stopAll 先快照 keys 再逐个 await、末尾无条件 instances.clear() —— 与并发 start 完成有理论竞态（会被摘掉而不停 → 孤儿 PTY）。退出路径上到不了（app.exit 紧跟）；修它要动任务 5 已审的停止语义 → 交最终整分支审查。
Task 7: minor (deferred): run_update 的 stopAll 放在 setTimeout(3000) 之前（与 C3 逐字一致），该路径退出时间 = stopAll 上界 + 3s；若最终要挪到 setTimeout 之后（仍在 app.exit 之前、不破 F1）需明示。
Task 7: 真机事实（供任务 14）：本环境 npm run dev 的 electron 段崩在 dist-main/main.js:87（继承 ELECTRON_RUN_AS_NODE=1）；去掉后 0x80000003 STATUS_BREAKPOINT。实现者另做替代取证：真 node-pty 起 3 个 cmd → stopAll(3) 318ms、onExit 0xC000013A、states()={}、进程表残留 0。
Task 7: fix round 0/5（等定向复审结论）
Task 7: 任务审查结论：通过。C2/C3 顺序逐字、F1-F4 与 K11(1)/K17 全部成立；B2「无需改动」有可核对的行号证据；三条新用例经代码推演 + 主代理变异探针确认有牙且不 flaky（Promise.all 变异下第二个 stopInternal 在 map 回调里同步调用 → 失败是确定的）。它独立 grep 出全部退出点（三处 app.exit + 一处 app.quit）并核实 :56 的排除理由成立。
Task 7: Ruling: K19 —— 本任务唯一的新行为（两处退出接线）没有自动化测试保护（main.ts 是纯副作用模块、E5 明确不要求为 run_update 造测试）→ 接受现状，登记为「靠任务 14 真机门把关」的已知缺口，不得声称已被测试钉住。真 node-pty 探针算机制取证、不算 G3 通过。
Task 7: minor (deferred): 复审 Minor #1 —— stopAll 快照 keys + 末尾无条件 clear() 的竞态被本任务**放大**（退出前新增最长 N×4s 的 await，期间渲染端仍活着；此时完成的 ql_start 实例不在快照里 → 不停却被摘掉 = 孤儿 PTY）。修法给了两种（while 循环逐个停 / 去掉末尾 clear()，finalize 已逐个摘除）→ 交最终整分支审查或任务 14 决定。
Task 7: minor (deferred): 复审 Minor #5 —— E4 用例的 states() 断言不是承重项（去掉内层吞异常后 clear() 仍会抹掉），红的是 ctx.exits；建议补「失败实例退出码 = -1」的断言（quick-launch.ts:343）。
Task 7: minor (deferred): 复审 Minor #2 —— run_update 的 stopAll 耗时计入更新脚本的 60s 等待预算（scripts/lms-launcher-update.ps1:67 → :104 中止更新）；已在任务 7 表 F4 补注。调换 stopAll 与 setTimeout(3000) 的顺序对总时长无影响。
Task 7: 约定：报告/表里引用 main.ts 行号一律按**工作区当前**行号（本任务 +5 位移，ql 单例现 :1085）。
Task 7: complete (commits 9680c3a 代码 / 97e15ed + 5de57c6 文档；fix rounds 0/5；2 files +73；quick-launch.test.ts 20 用例)

Task 8: 派单前主代理取证 → 两处文档错误已更正（commit 02fca10，K20）：(1) **词典只有一份**——src/i18n.ts:3 直接 import src-main/i18n/dict.ts，:30-36 的 t() 读的就是它；计划 :297 与任务 8 表 B1「修改 src/i18n.ts 加 ql.*」是错的。(2) **K8 的收尾必须在任务 8 执行**：grep 得 17 处「常量映射传 key」调用点（quick-launch-config.ts 9 / quick-launch.ts 6 / main.ts 2），词典落地后必须改回字面量 t() 才能进入 key-coverage 的存在性与占位符双向比对 → 任务 8 表新增 B3、E6 从「枚举断言」改为「确认映射清零 + 删死代码」。
Task 8: 已派单（brief 3900 字符：单词典事实、17 处调用点行号、占位符逐字清单、复用既有键不建同义键、app.dialog.filterExe 措辞照 filterModel/filterJinja、E7 修 ipc-ql.test.ts 三条断言、回归门含 quick-launch/ipc-ql/App）
Task 8: 主代理独立验收：i18n 5 files / 25 passed；V2 六文件 124 passed；tsc exit 0；E6 三条 grep 全 0；git grep "ql\.dialog" 的 4 处命中全在 docs（代码里没有）；字面量 t('err.ql. 调用点 17 = 生产 15 + ipc-ql.test.ts 2（E7 新增）。
Task 8: 主代理自己跑的变异（证明 K8 收尾确实把键纳入了硬门）：A) 词典 err.ql.nameDup 的 {name} 改 {nme} → 恰「占位符双向一致」用例红；B) 删 err.ql.ptySpawn 的 zh 条目 → 2 红（key-coverage 存在性 + dict.test zh/en 集合一致）。两次还原后 dict.ts 字节级一致（SHA 前缀 8D92EBB75D36F6A3）。
Task 8: Ruling: K20 更正 —— 我写的「17 处调用点」把 invalidError() 的定义行数进去了，真实是 16（config 8 / quick-launch 6 / main 2）。已改索引。
Task 8: Ruling: K21(1) KEY_CALL 连注释一起扫（key-coverage.test.ts:39-41 的正则不看语法树）→ 源码注释里不得出现 t(字面量key) 形态。实现者第一版注释举的假 key 把硬门跑红，已踩已修。这条对任务 9-13 全部适用。
Task 8: Ruling: K21(2) 终端查找的「清空」复用既有 log.search.clear（dict.ts:135 zh / :478 en），不建 ql.terminal.searchClear —— 计划 :299 的 searchPrev|Next|Clear 是我写计划时的扩写，规格 §9/§10 没有。计划已更正。
Task 8: Ruling: K21(3) 尚无调用点的键，占位符名以词典为准（ql.invalid→{n}、ql.terminal.count→{cur}{total}、ql.modal.delete.message→{name}、ql.log.exit→{name}、ql.log.fail→{name}{msg}）→ 任务 9/11/12/13 的调用点必须照抄，否则那几轮 key-coverage:44 会红。
Task 8: Ruling: 任务 8 表 G3 与 E7 自相矛盾（G3 说 diff 只含 B1-B3，E7 要求改 ipc-ql.test.ts）→ 已更正 G3 措辞。
Task 8: minor (deferred): 除 C3 四条终端标签 en（表里钉死）外的中文措辞由实现者判断，测试只钉 ql.title 非键名 + 四条标签 → 改文案不会连带红。真机验收（任务 14）时按界面复核。
Task 8: fix round 0/5（等定向复审结论）
Task 8: 任务审查结论：通过（关键 0 / 重要 1 条口径强制 / 次要 2）。它逐个数过词典 diff：zh/en 各 51 键、两侧新增集合相同、删除 0；C3 的 en 四条逐字并有测试钉；F3 成立（TerminalInfo 只有 {id,path}）；K9 复用真实（既有键一行未改、无同义键）；16 处调用点前缀/参数表达式/求值顺序/String() 兜底逐字等价；E7 断言比旧的更强（两侧都钉带插值的译文）。
Task 8: Ruling: K22(1) 规格 §10 的「剪贴板提示」在 §8/§9 里没有对应行为（§9 只有 Ctrl+Shift+C/V + 右键粘贴 + 两个 clipboard_* 通道）→ 早期版本残留，不建键，已更正规格 §10。
Task 8: Ruling: K22(2) 计划 :297 的「9 处」更正为 8 处（原数把 invalidError() 定义行数进去）。
Task 8: Ruling: K22(3) 界面措辞不在 spec/check 表钉死范围：C3 只钉 en 四条，zh 措辞由实现者按既有词典风格判断（它刻意镜像了 err.config.notFound / tplModal.delete.message / log.toolbar.clear 的惯例，已核实），真机验收复核。
Task 8: Ruling: K22(4) 删掉 invalidError() 后 VALIDATION: + t(...) 样板在 quick-launch-config.ts 重复 8 次 = K20(2) 强制的正确取舍（任何接 key 的辅助函数都会让调用点重新逃出 KEY_CALL）。将来消重要用「接已译消息」的 validationError(t(...)) 形态并另立口径 → 交最终整分支审查。
Task 8: minor (deferred): dict.ts:492 的 en ql.invalid 在 n=1 时语法不成立 → 已登记给任务 11（首个调用点）改成 invalid entries skipped: {n}（现无调用点零成本）。
Task 8: 关闭实现者疑虑 1（G3 vs E7）：check 表 G3 已更正，验收时关闭。
Task 8: complete (commits e919b25 代码 / b1f5033 + 32ead61 + 1d35691 文档；fix rounds 0/5；6 files +212/-65；词典 zh/en 各 322 键)

Task 9: 派单前主代理取证：(1) 我自己先前追加的「首帧上报尺寸」误编号成第二个 E9（与既有的链接点击行冲突）→ 已改为 E10 并同步 I 段（E1-E10）。(2) 实测依赖已装（@xterm/xterm 5.5.0 + 三 addon）。(3) 实测组件测试必须文件级声明 happy-dom（vitest.config.ts:7 默认 node、:10 注释、样板 LogTabView.test.ts:1）。(4) 实测可复用锚点：style.css:29 --font-mono / :184 .log-panel / :194 .log-view；LogTabView.vue:142-162 的查找工具条 markup 模式；src/ipc.ts:48 invoke、:116-121 onQlData/onQlExit（本组件不订阅，数据走 register/sink）。
Task 9: 已在简报里点名一处可疑口径：F1 逐字要求 fontFamily: var(--font-mono)，而 xterm 会把 fontFamily 拼进 canvas 字体测量串（CSS 变量很可能不解析）→ 要求按 F1 原样实现、把判断作为疑虑回报并给依据，不得自行换成具体字体串或加回退（那属偏离口径，需先改表）。
Task 9: 已派单（brief 3830 字符：happy-dom pragma、四个 vi.mock、props 不含 configId、E1-E10 逐条、K21 三条 i18n 口径、范围只两份新文件）
Task 9: 实现回传 DONE_WITH_CONCERNS：两轮 TDD 都先红后绿（D2 = Failed to resolve import；D4 = 17 passed → 追加「强制重报尺寸」用例先红 1 failed | 17 → 加 force → 18 passed）。G1 18 passed；G2 LogTabView 21 + LogPanel 11；G3 i18n 5 文件 25 passed；G4 只两份新文件；额外全量 45 files / 762 tests；四处变异自检各红 3/1/1/1，还原后 SHA 一致。
Task 9: 主代理独立核实 fontFamily 取证（不是采信说法）：node_modules/@xterm/xterm/src/browser/services/CharSizeService.ts:29-33 确实优先 new TextMetricsMeasureStrategy（catch 才退 DomMeasureStrategy），:122 是 ctx.font = `${fontSize}px ${fontFamily}` → canvas 不解析 CSS 变量、无效值被忽略 → 格子按 canvas 默认字体量，而 DomRenderer 渲染时 var() 会解析 → 网格与字形不匹配。结论：F1/规格 §9.3 的写法是**文档缺陷**，先改三份文档再改代码。
Task 9: Ruling: K23(1) fontFamily 改用与 style.css:29 逐字同值的字面量栈（已同步规格 §9.3:250 / 计划 步骤 3 / 任务 9 表 F1；commit 41e04a2 + 49df85c）。
Task 9: Ruling: K23(2) 批准 defineExpose({ fit, focus })，新增任务 9 表 C3 行：任务 13 表 E5 要「自动激活 + fit() + 聚焦」而任务 13 的 B 段改不到本组件。
Task 9: Ruling: K23(3) 批准尺寸上报去重 + fit(force) 强制重报，新增 F8 行：去重避免每次 ResizeObserver 都打 ql_resize；但「页签还在、PTY 重建为 80×24」时尺寸未变却必须重报（K11(2)）。实现者为此自发走了一轮 TDD（先红后绿）——这是加分不是扩范围。
Task 9: Ruling: K23(4) 批准 Ctrl+Shift+C 无选中时返回 false，新增 F9 行（规格未规定，取「不产生终端输入」一侧）。
Task 9: minor (deferred): 挂载点用内联 overflow: hidden; min-height: 0 压掉 .log-view 的重复滚动条 → 若最终要收进 style.css 由任务 10 的 B3 承接。
Task 9: minor (deferred): label/fullLabel 目前只落根节点 data-tab-id / data-tab-label（页签文案与 tooltip 属任务 10）→ 任务 10 简报里明确接口形态。
Task 9: minor (deferred): 组件内 import @xterm/xterm/css/xterm.css（本轮接受，最终审查决定是否集中到入口）。
Task 9: 起点 A1 不干净是我造成的（先于本任务把第二个 E9 改编号为 E10）→ 已确认不影响 G4/H1 口径。
Task 9: fix round 1/5（定向修复：fontFamily 按更正后的 F1；已派新实现者 894d0acd）
Task 9: fix round 1 完成（新实现者，只改一处）：TerminalTabView.vue:150-151 的 fontFamily 换成字面量栈 + 一行注释；test.ts:202-203 同步期望值；其余一律未动。
Task 9: 主代理独立验收：G1 18 passed；G2（含 App.test.ts）80 passed；G3 i18n 25 passed；tsc exit 0；范围只两份未跟踪文件 + 该表。取值同值我自己读两行核对：style.css:29 与 .vue:151 逐字符一致。
Task 9: 主代理自己的变异：把 fontFamily 改回 var(--font-mono) → 恰 1 红（terminal_is_created_with_spec_options_and_three_addons，toEqual 逐字比对传给 Terminal() 的 options）；还原后 SHA 前后同为 a61640e3c573（与实现者报的一致）。
Task 9: 流程记录：本轮是「先改三份文档（41e04a2/49df85c）→ 再派新实现者改代码」，符合 AGENTS.md「偏离先改文档、同一 commit」与「fix round 用新实现者」。
Task 9: fix round 1/5 已闭环，等定向复审结论。
Task 9: 任务审查结论：通过（关键 0 / 重要 2 / 次要 8）。它核了 addon/xterm 真实签名（addon-web-links.d.ts:19 的 handler、addon-search.d.ts:34/46-76/130/140-144 的 decorations 键名与 onDidChangeResults 契约、addon-fit 在 0 尺寸时返回 undefined 而非抛错），并独立核了「复用 .log-view 不会漏 line-height/white-space 进 xterm」（DomRenderer 自设 lineHeight 与 white-space:pre）→ 实现只覆盖 overflow 是对的。E1-E10 逐条给出用例行号，全部真实断言。
Task 9: 我自己核过它的两条重要（不采信说法）：① test.ts:30/:173 的假 FitAddon 恒为 proposed 118×41，且没有任何用例改它 → 「尺寸真的变化 → 第二次 onResize」这条腿没有测试（去重只钉住负半边；实现 .vue:57-66 按阅读是正确的）。② .vue:183 的 fit: (force = true) → 任务 13 每次激活都会强制发一次 ql_resize，正是 F8 去重要消除的那次。
Task 9: 用户要求「任务 9 完成后停止，不再派子代理」→ 两条重要不在本轮修，登记为【派任务 13 前必修】：① 补一条用例（改 h.state.proposed = 90×30 → fireResize → 断 onResize 第二次收到 90,30）；② fit 默认改 force = false，由任务 13 在「同一页签再次启动」处显式 fit(true)。两条都要写进任务 13 的简报。
Task 9: minor (deferred): term.clear() 不复位查找计数/装饰（计数停在 1/3）；fullLabel 声明未用而 data-tab-label 装的是短 label（任务 10 若从这里取全名会踩空 → 任务 10 简报要明确接口形态）；test.ts:272 把「每次 RO 都 fit」钉成契约（将来加防抖会误红）；resultIndex<0 钳制分支无用例；假 addon 有实现没用到的死面（onResize/hasSelection）；内联 min-height:0 冗余（必需的是 overflow:hidden）；xterm.css 靠叶子组件副作用导入（建议收进入口）。
Task 9: 真机门留给任务 14 的六项：真实网格/字形对齐（K23(1) 因果链）、overflow:hidden 与 xterm 视口滚动条的组合、file:// 下真实粘贴复制、上层是否真用 v-show 保活、主进程是否真按 80×24 建 PTY（K11(2) 上游）、open() 后立即 fit() 能否量出真实 cell（proposeDimensions 在 cell.width===0 时返回 undefined → 首帧可能报 80×24 后由 RO 自纠，真机日志出现一次多余 ql_resize 属预期）。
Task 9: complete (commits 151046e 代码 / 41e04a2 + 49df85c + 0ff8763 文档；fix rounds 1/5；2 files +626；TerminalTabView.test.ts 18 用例)

【停线点】用户要求任务 9 完成（含审查）后停止，不再派子代理。任务 10-14 未开始。恢复时先做：任务 9 的两条【派任务 13 前必修】→ 再派任务 10（页签条两种页签 + [x] + 横向滚动；简报需明确 label/fullLabel 的接口形态与是否把内联 overflow 收进 style.css）。
【口径更新】用户改令：「继续使用子代理去修改，直到在开始任务 10 之前停下来」→ 即：把任务 9 的两条重要修完并验收，然后停在任务 10 之前。
Task 9: fix round 2/5 已派（新实现者 061b9904；brief task-09-fix2-brief.md）：必修 A 补「尺寸真的变化 → 第二次 onResize(90,30)」用例（假 FitAddon 恒 118×41，去重只钉负半边）；必修 B fit 默认 force=false + 注释与用例同步（否则任务 13 每次激活多一次 ql_resize）；顺手修 C term.clear() 复位查找计数/装饰；D 新增 data-tab-full-label（fullLabel 目前完全未用、data-tab-label 装的是短名 → 任务 10 会踩空）；E 补 resultIndex<0 哨兵用例。明确不动：props 形状、键盘归属、字体栈、内联样式、xterm.css 导入位置、假 addon 死面、fitCalls===3 断言。
Task 9: 三次变异要求：reportSize 改「每实例只报一次」→ A 红；fit 默认改回 true → B 红；去掉 clear 的查找复位 → C 红。
Task 9: fix round 2 完成并验收（新实现者 061b9904）：A 补「尺寸真的变化 → 第二次 onResize(90,30)」；B fit 默认 force=false + 注释与用例同步；C term.clear() 复位查找计数/装饰（提成 resetSearchState()，与空查询分支共用 = 我要求的复用）；D 新增 data-tab-full-label；E 补 resultIndex<0 哨兵用例。用例 18 → 22。
Task 9: 主代理独立验收：G1 22 passed；G2（含 App.test.ts）80 passed；G3 25 passed。我自己跑的三次变异与实现者计数完全一致：① reportSize 只报一次 → 2 红（含新用例 A）；② fit 默认改回 true → 1 红（B）；③ 去掉查找复位 → 1 红（C）；三次还原后 SHA 前后同为 2e8d35b220e0。
Task 9: Ruling: K24(1) —— fit 默认不强制重报；「同一页签再次启动」必须显式 fit(true)。已写进任务 13 表 E5（普通激活不重发 / 重启路径重发一次，两条分别钉）。
Task 9: Ruling: K24(2) —— 接受一处测试强度边界：resultIndex<0 钳位删掉后 22 全绿（文档哨兵就是 -1，-1+1=0），用例只能钉「不产出负数/NaN」；不为此喂 -2（API 永不产生的输入 = 虚构契约）。钳位作为防御保留，边界如实登记。
Task 9: complete (commits 151046e + 03b031e 代码 / 41e04a2 + 49df85c + 0ff8763 + c898f4b 文档；fix rounds 2/5；TerminalTabView.test.ts 22 用例)

【停线点 · 当前】用户要求：修完任务 9 的两条重要后，在开始任务 10 之前停下。已停：工作区干净，HEAD = c898f4b。
恢复时第一件事：派任务 10（页签条两种页签 + [x] + 横向滚动）。其简报必须先定两件事：(1) 页签全名 tooltip 的取值来源——TerminalTabView 现在同时提供 data-tab-label（短名）与 data-tab-full-label（全名），但页签条本身在 LogPanel/log-tabs 侧（任务 10 的 B 段），要说明用哪一侧；(2) 是否把 TerminalTabView 的内联 overflow: hidden 收进 style.css（B3 正好在改该文件；注意 min-height:0 是冗余项，别一起搬）。
另外已登记给后续任务的待办：任务 11 顺手改 dict.ts:492 的 en ql.invalid 语法（invalid entries skipped: {n}）；任务 13 按 K24(1) 在重启路径显式 fit(true)；任务 14 真机门六项（见上一行 Task 9 记录）。
【验收勾缺失 · 我的流程缺陷】用户指出「从任务 5 起就没有勾选」。实测确认：任务 1-4 的 A-I 全勾；任务 5-9 只有 H/I 部分勾，A-G 行 173 行 + I 段清单 16 项全是 ☐ —— 我从任务 5 起改成「把验收证据追加到 J 段」，就没有回落勾。证据一直在 J 段，但 AGENTS.md 明说「表里的勾是我验收用的」，J 段不能替代勾。
已逐行补齐（commit 4de6e3b）：任务 5 勾 41、任务 6 勾 40、任务 7 勾 28、任务 8 勾 56（含 C 段 zh/en 两个附加列各 9/8 处）、任务 9 勾 40；三处**故意保持未勾并写明去处**：任务 5 H3（pnpm-lock.yaml 处置，本任务不做）、任务 6 D6b 与任务 7 G3（真机门，K12/K19）。
Ruling: K25 —— 验收通过后必须把该任务表 A-I 每行的 ☐ 改成 ☑；未满足的行写成 ☐（原因 + 去处）；带附加列的表每一列都要落勾；J 段是证据不是勾。
【规则已提升到 AGENTS.md（commit 0e7c5b8）】自检一节加两条（验收勾完整性 + 普查脚本取证，并注明「普查只保证不漏勾、不保证勾是真的」）、骨架 H 段定义加 H3 勾完整性门、「后续更新」新增第 5 条「验收通过 = 落勾」（原第 5 条顺延为 6，已复核编号连续）。这条规则从此对项目内所有 plan 生效，不只这份。

【防复发机制】(1) 普查脚本 .superpowers/sdd/2026-10-10-quick-launch-card/tick-census.mjs：逐表统计 ☑ / 裸 ☐ / 显式未勾 / I 段 - [ ]，规则是「H2 已勾（= 已提交）的表不得有裸 ☐ 或 - [ ]」，退出码非 0 即拦下；实测当前 1-9 全过、10-14 未提交所以不拦。(2) 任务 10-14 五张表各加一行 H3 勾完整性门，把普查写进提交门本身——不靠我记得。(3) 验收顺序固定为：跑门 → 跑普查落勾 → 才 git add/commit（勾在提交之前，不在之后补）。(4) K25 已登记规则本身。commit：普查脚本 + H3 行。

本次我自己踩的坑（已纠正，记录以免重犯）：第一版补勾脚本把整行按 | 重排，导致（a）原文里的字面 § 被误转成 \|（任务 7 G3 的「规格 §13.2」），（b）J 段同 id 行（任务 7 G3 / 任务 9 A1）的证据单元格被覆盖。已 git checkout 回退重做：只替换最后一个 | 之间的内容，其余字节原样保留；改完逐表跑列数自检 + 抽样核对 § 与 J 段未被污染。教训：改 check 表只能定点改目标单元格，不能整行重建。
【恢复 · 2026-10-12】用户说「继续任务」。起点核对：分支 feat/quick-launch、HEAD 5ca9cb1、工作区干净；基线复跑 TerminalTabView 22 / LogTabView+LogPanel+App 80 / i18n 25 / tsc exit 0 —— 全绿，起点干净。

Task 10: 派单前先做取证并定口径 K26（docs 先行，commits b7bffbe / 1ae9e07 / 5ca9cb1）：
Task 10: Ruling: K26(1) —— LogPanel 的 tabs 改为**可选** + 缺省由 LOG_TABS 生成两个 text 页签。依据：计划原写 tabs: LogTabItem[]（必填）与任务 10 表 B4「既有用例不改」互斥；实测 App.vue:373 只传 :buckets、LogPanel.test.ts 有 7 处 mount 只传 buckets（:20/:63/:81/:103/:127/:159/:168），而 App.vue 属任务 13。必填的后果：任务 10 一落地应用就失去日志面板，且 7 条既有用例被迫改夹具。代价：任务 13 之前存在「缺省路径」这条临时兼容层，任务 13 必须显式传 tabs（已写进 K26）。
Task 10: Ruling: K26(2) —— 截断职责在构造方（任务 13 用 truncateByWidth(fullLabel, 16) 生成 label），LogPanel 只渲染 label 并在 label !== fullLabel 时挂 title=fullLabel，不得二次截断。依据：LaunchBar.vue:93 的 grace=2 tooltip 既有口径 + 两处预算会互相抵消。新增任务 10 表 E7 行钉这个行为。
Task 10: Ruling: K26(3) —— 页签文案不从 TerminalTabView 的 data-tab-* 反取（M4 落地）。
Task 10: Ruling: K26(4) —— 两种页签一律 v-show 保活，terminal 页签不得 v-if。依据：TerminalTabView.vue:169-178 卸载即 unregister + observer.disconnect + term.dispose()，v-if 等于「切页签杀终端」。新增任务 10 表 E8（断切换过程 dispose/unregister 未被调用）与 F7 行。
Task 10: M3 决定：TerminalTabView 的内联 overflow: hidden 本任务**不收进 style.css**（不改该文件；写进共享 .log-view 会影响文本日志页）。M5：xterm.css 仍由叶子组件导入，本任务只确认仍被加载。M6：不加防抖、不动 fitCalls===3。
Task 10: 已派单（brief 5694 字符：四文件范围、C1-C4 按 K26 更正、6+1 条用例、E1-E8/F1-F7 逐条、三条门 + 额外 App.test.ts 48 passed 作为 K26(1) 兼容性证据、三处变异（v-if→E8 红 / 去 closeDisabled→E3 红 / 无条件 title→E7 红）、明确不做与「范围外文件先停下报告」）。
索引新增 M 组（commit 5afbb71）：把 45 条 minor (deferred) 里**会被任务 10-14 触到或放大**的 16 条路由到对应任务（M1-M16，含落点与处置要求），其余 29 条留在本账本交最终整分支审查。派任务 10-14 时把对应 M 行原样贴进简报。
流程事故（我的提交范围）：.gitignore 的 !.superpowers/ 与 !.superpowers/** 是**用户本人**改的（我先前误记成实现者所为，已更正）。结果我的 docs 提交 a7be5fb 把 .gitignore + 43 个 .superpowers/ 文件一起带进去了（9105 行）。已 git reset --soft + restore --staged 拆成两半：5afbb71 只含 00-index.md；.gitignore 与 .superpowers/ 回到未跟踪/未暂存，等用户决定是否入仓。教训：提交前必须看 git show --stat 的实际文件数，不能只看自己 add 的路径。

Task 1 主代理验收取证（与子代理独立复跑）：npx vitest run src/util/copy-name.test.ts src/modules/TemplateModule.test.ts → exit 0，2 files / 23 tests passed；git diff --name-only → TemplateModule.vue + 该 check 表（J 段所致，见上条 Ruling），未跟踪新增 = copy-name.ts / copy-name.test.ts，范围 = B1-B3。
