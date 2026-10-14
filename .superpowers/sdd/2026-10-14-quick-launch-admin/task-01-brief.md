任务 1 简报（从 plan 逐字抽取，勿改）

### 任务 1：配置层 `admin` 字段

**改什么**：`QuickLaunchEntry` 加 `admin?: boolean`；`normalizeEntry` / `validateEntry` 的两个返回字面量带 `admin`（§6.1）。
**为什么单独一个任务**：它是后面所有任务的类型前提，且只碰数据层，测试自成闭环。

- [ ] **步骤 0：起点核对**：`quick-launch-config.ts:14`（类型）、`:63-80`（`normalizeEntry`）、`:84-103`（`validateEntry`）、`:138-139`（`qlSave` 整表写回）。
- [ ] **步骤 1：先写失败测试**（`quick-launch-config.test.ts`）：
  - `entry_without_admin_loads_as_false`（沿用 `:81-82` 的既有夹具，断言里加 `admin: false`）
  - `admin_true_round_trips_through_save_and_load`
  - `non_boolean_admin_values_normalize_to_false`（`'yes'` / `1` / `null`）
  - `saved_yaml_contains_an_explicit_admin_key`（读原文断言含 `admin: false`）
- [ ] **步骤 2：跑红**：`npx vitest run src-main/quick-launch-config.test.ts` → 新用例失败（缺 `admin` 键）。
- [ ] **步骤 3：实现**：`:14` 加字段；`:72` / `:77` / `:95` / `:100` 加 `admin: ... === true`。
- [ ] **步骤 4：跑绿** + 修 `quick-launch-config.test.ts:81`、`:82`、`:103`、`:241`、`:250` 与 `ipc-ql.test.ts:245` 的 `toEqual` 字面量（加 `admin: false`）。
- [ ] **步骤 5：类型门 + 全量回归**（G5）。`src/modules/QuickLaunchModal.test.ts` 的 `toEqual` 此时**不应**变红——它断言的是渲染端发出的 payload，`admin` 要到任务 8 才进 payload。`src-main/ipc-ql.test.ts:245` 断言的是 `ql_list` 的**加载结果**，本任务之后必红：属预期，与其余夹具一样加 `admin: false`（索引 K28）。除这一处之外还有别处变红，说明 `admin` 被写进了不该写的地方，停下来报告。
- [ ] **步骤 6：Commit（主代理）**：`feat: 快捷启动配置增加 admin 字段（总是显式落盘）`

---
