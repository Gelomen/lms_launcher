# 修复轮 B · 渲染端三处（最终审查 I-1 / I-2 / M19 / Minor 2、9、10）

**不要读 `00-index.md` 与 `final-review.md` 全文**（太长）。本简报就是全部所需信息。
允许改的文件：`src/App.vue`、`src/modules/QuickLaunchModal.vue`、`src/modules/QuickLaunch.vue`、`src/App.test.ts`、`src/modules/QuickLaunchModal.test.ts`。**`src-main/**`、词典、`src/components/Dropdown.vue`、`src/style.css` 一字不动。**

## 1. I-1：删除「运行中」的条目 → 死胡同（必修）
- 现状：`src/App.vue:438-443`（`refreshQlConfigs` 只刷镜像、不对账）+ `src/modules/QuickLaunchModal.vue:131-139`（`doDelete` 无运行态守卫）。删掉运行中的条目后：卡片行消失（没有 [停止] 了），而页签的 [x] 因 `closeDisabled`（`src/App.vue:358-369`）永久禁用 → **既关不掉也停不掉**，只能退出应用；exe 类型同理（进程在后台跑，UI 无入口）。
- **裁定（不要改成「删除时自动停进程」**，那是用户没要求的副作用）：把运行态传进弹窗，**运行中的条目禁用 [删除]**，tooltip 用**已存在的键** `ql.err.running`（`src-main/i18n/dict.ts:184` zh / `:526` en，计划 :299 要求建的，**全仓零引用**——这次就是把它接上，**不得新建键**）。
- 接线：`App.vue` 已有只读镜像 `qlStates`（`:338-346` 一带）。把「哪些 configId 处于 running/stopping」传给卡片 → 弹窗（经由 `src/modules/QuickLaunch.vue`）。**props 形状你自己定，但要最小**（一个 `string[]` 或 `Set<string>` 即可），并在 C 段风格的注释里写清来源。
- 测试：`QuickLaunchModal.test.ts` 加用例——运行中的条目 [删除] 禁用且 tooltip = `t('ql.err.running')` 的 zh 值；非运行的仍可删（正对照）。

## 2. I-2：启动在途（最坏 ≈9s）没有任何界面反馈（必修）
- 现状：`src/App.vue:447-452`（`doQlStart` 的 `qlStarting` 只用于内部单飞，不下发）。`src/App.test.ts:1348-1354` 把「在途期间按钮既没变红也没禁用」钉成了契约——**那是任务 13 修复轮的特征化断言，不是需求**，本轮**有意改掉它**（登记为契约变更）。
- 改法：`doQlStart` 在 `invoke('ql_start')` **之前**置 `qlStates[configId] = { running: true, stopping: true }` → 按钮走既有的「正在停止」视觉语言（`LaunchBar.vue:129` 的 `<span v-else-if="state.stopping">...</span>`，半角三点，索引 K30(1)）并禁用；失败分支已有 `clearQlState` 兜住，成功分支由 `ql_states` / `ql-start` 事件覆盖。**不得**新增 CSS 类或新键。
- 测试：改 `App.test.ts:1348-1354` 那条 E8 用例——在途期间断言按钮**禁用**且显示停止态；保留原有的「单飞：只发一次 `ql_start`」断言。再加一条：`ql_start` 失败（reject）后按钮回落到 [启动]（正对照，防「卡在 …」）。

## 3. M19（只修下拉那一半）+ Minor 2 + Minor 9（各 1-2 行）
- `src/modules/QuickLaunchModal.vue:78` 给终端下拉传的是**未截断**标签，违反共享组件自己写的契约（`src/components/Dropdown.vue:4` 明写「label 截断由父级负责」）。改成 `label: truncateByWidth(…, 16)`、`tip: 全名`——`Dropdown` 的 option 已支持 `tip` 字段（`:18`），零新组件零新键。截断预算 16 与规格 §11-1 的页签预算一致（索引里钉过）。
- Minor 2：`src/App.vue:359` 页签名回退用 `qlConfigs[id]?.name || tab.configId` → 删掉**已停止**的条目后页签名退化成配置 id。改成用页签自己存的名字（`qlTabs` 建页签时已存全名），不查镜像。
- Minor 9：`src/modules/QuickLaunchModal.vue:92-94` 删除确认文案用了**未 trim** 的名字 → 用 trim 后的值（与保存时同一处理）。

## 4. Minor 10：测试夹具的 `[Vue warn]` 噪声（只改测试）
- `src/App.test.ts:1196` 的 `default` 返回 `undefined` → 每条 ql 用例打 `[Vue warn]: Invalid prop: paramsMeta`，会淹掉真警告。给夹具补上符合类型的 `paramsMeta`（`{}` 即可），**不得改任何断言**。

## 边界（越界即打回）

- 只改上面列出的 5 个文件。**不新建 i18n 键**（`ql.err.running` 已存在）；不动 `src-main/**`、词典、`Dropdown.vue`、`style.css`、`LogPanel.vue`。
- 现有断言除 `App.test.ts:1348-1354`（本轮明示的契约变更）外不得改；用例数只增不减。
- 不 `git add`、不 commit（K5）；不跑 `npm run dev`（K33）。必须动别的文件才能过门时，停下来报告。

## 门（真实输出贴进回传消息）

1. 基线：`npx vitest run src/App.test.ts src/modules/QuickLaunchModal.test.ts src/modules/QuickLaunch.test.ts` 记下改前用例数
2. TDD：每条新用例先红再绿（贴红时的失败摘要）
3. `npm test` → 47 files 全绿，总数 ≥ **805** + 新增数（基线 805，A2 刚加过 5 条）
4. i18n 硬门：`npx vitest run src-main/i18n src/i18n.test.ts` → 全 PASS（接上 `ql.err.running` 后必须仍过）
5. `npx tsc -p tsconfig.main.json --noEmit` → exit 0（注意：`src/**` 没有类型门，所以渲染端的类型错误只能靠测试与人工，别指望这条）
6. 卫生门：`npm test` 跑完 4s 后 notepad 计数 = 0；并确认 `[Vue warn]: Invalid prop: type check failed for prop 'paramsMeta'` 的条数**明显下降**（贴前后计数）
7. 变异门（各贴结果）：(a) 去掉 [删除] 的运行态守卫 → 新用例红；(b) 去掉 `doQlStart` 的前置状态 → E8 用例红；(c) 下拉标签不截断 → 新用例红；(d) 页签名改回查镜像 → 新用例红。全部还原后报每个文件的 `git hash-object`，并确认 `git diff --numstat` 只含允许的文件