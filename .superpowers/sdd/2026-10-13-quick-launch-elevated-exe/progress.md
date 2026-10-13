# SDD ledger — plan: docs/superpowers/plans/2026-10-13-quick-launch-elevated-exe.md

工作区：分支 feat/quick-launch（非 main/master；本仓库既有惯例是直接在该 feature 分支上提交，用户已在此分支提交全部快捷启动工作）。
规格：docs/superpowers/specs/2026-10-13-quick-launch-elevated-exe-design.md（可达，已读）
基线：npm test → Test Files 47 passed (47) / Tests 826 passed (826)，exit 0（主代理 2026-10-13 19:25 实测，规格 E18）
文档提交：0f7c597（spec + plan，代码一行未改）

## 起飞前扫描（plan 通读，逐对/逐任务）

| 行 | 发现 | 裁决 |
|---|---|---|
| 任务 1 ↔ 任务 2 | 任务 2 的代码 import koffi，任务 1 才装依赖 → 顺序依赖真实存在 | Ruling: 严格按 1→2→3 串行 — plan 的任务编号就是拓扑序 — 错了代价：任务 2 红在模块缺失，一眼可见 |
| 任务 2 ↔ 任务 3 | 都碰 src-main/，但文件不相交（新建 shell-execute.* vs main.ts/dict.ts/ipc-ql.test.ts） | Ruling: 无需额外协调 — 任务 3 只消费任务 2 的导出 — 若冲突：串行执行本身排除了并发写 |
| 任务 3 自身 | 适配器保留未使用的 configId 形参（plan 步骤 3 的 void configId）与「:1084 接线不变」并存 | Ruling: 保留形参与接线 — tsconfig.main.json 无 noUnusedParameters（实测），且 :1084 的 qlStartContextOrThrow('spawnExe') 是修复轮 1 · 重要 #2 的槽守卫，删掉会退化成静默降级 — 代价：一个空语句，注释已说明用途 |
| 任务 3 自身 | plan 步骤 1 要求先改测试变红，但 :346-357 旧断言在旧代码下是绿的 → 「红」只来自新断言 | Ruling: 以「三处改写后至少一处红」为 D 段判据（ql_start 由 resolve 改 rejects 在旧代码下必红）— 不要求三处同时红 — 代价：无 |
| 任务 2 计数 | plan 写「Tests 834 = 826 + 8」 | Ruling: 以实测为准；若实现者增删用例数，必须在 check 表 J 段说明差额 — 规格 E18 是基线唯一真相 |
| 任务 4 ↔ 全局约束 | 任务 4 跑 build.bat 会写 dist-release/，会不会污染工作区 | Ruling: 不会 — 实测 git check-ignore 命中 .gitignore:2 的 dist-/ — 真机门只读产物不入库 — 代价：无 |


## 执行期裁决（内联实现，用户 21:04 指定不使用子代理驱动）

- Ruling: 词典两条键（err.proc.uacCancelled zh/en）从任务 3 提前到任务 2 步骤 2b，与实现同一提交 — 依据：check 表 task-02 G3 实测 key-coverage.test.ts:117-129 扫 src-main/** 的非 .test.ts 文件，「有调用点、无键」必红，plan 原排序会让任务 2 末尾全量必为 1 failed — 代价：任务 2 的提交范围多一个文件（已同步 plan 两张表与索引 K15）
- Ruling: 内联执行（executing-plans）取代子代理驱动 — 用户明确指令；check 表仍逐行执行落勾、J 段填真实输出、提交仍按 H 段、顺序仍按 plan 任务号（索引 K14）
- 已同步文档：spec 的 .gitignore 行号（:5→:4）、plan 的 utf16le 出处（process.ts:87→quick-launch-terminals.ts:96，索引 K12）、索引工作基线措辞（K13）
- 文档提交：check 表 + spec/plan 同步 = 见 git log（紧接 0f7c597 之后）
