# 任务 3 报告：build.ts（TDD，6 测试）

**状态：** DONE
**提交：** da51a3a — feat: 命令行拼装 TS 移植——引号/空值跳过/必填校验（6 测试）
**分支：** lms-launch-v1（worktree D:\AI\Workspace\lms_launch\.worktrees\lms-launch-v1）

## 实现内容

- src-main/build.ts：Rust build.rs 的 TS 移植，导出 4 个函数：
  - quoted(v) — Windows 路径引号规则：含空格或引号 → 整体加引号。
  - buildArgVector(exe, pf, entry) — 拼 [exe, flag1, val1, ...] 向量；空值整对跳过；必填参数 trim 后为空 / 未知 key → VALIDATION 错误（必填报错带 flag 名，如 "-m"）。
  - prepareLaunch(dir, pf, configs, id) — 启动前完整校验链：id 合法（validateConfigId）→ exe 存在 → 配置存在 → buildArgVector；返回完整向量。exe/配置缺失报 MISSING。
  - summarize(e, pf) — 日志/列表用的 flag 形式摘要，如 `-m "D:\x\a gguf.q8.gguf" --port 9931`。
- src-main/build.test.ts：简报中的 6 个测试逐字落地（quotes_path_values_only_when_needed / empty_values_are_skipped_whole_pair / required_empty_rejected_with_flag_name / unknown_keys_rejected / prepare_launch_requires_exe_and_config / summarize_uses_flag_form）。

## TDD 证据

### RED
命令：`npx vitest run src-main/build.test.ts`（worktree 根目录）
输出摘要：
```
FAIL  src-main/build.test.ts [ src-main/build.test.ts ]
Error: Failed to load url ./build (resolved id: ./build) in .../src-main/build.test.ts. Does the file exist?
 Test Files  1 failed (1)
 Tests       no tests
```
为何预期：此时刻意尚未创建 build.ts，测试 import './build' 必然加载失败——这正是简报步骤 2 预期的 RED。

### GREEN
实现 build.ts 后同一命令：
```
✓ src-main/build.test.ts (6 tests) 4ms
 Test Files  1 passed (1)
 Tests       6 passed (6)
```
完整套件 `npm test`：
```
✓ src-main/build.test.ts (6 tests) 4ms
✓ src-main/config.test.ts (9 tests) 19ms
 Test Files  2 passed (2)
 Tests       15 passed (15)
```

## 修改文件

- src-main/build.ts（新建，45 行）
- src-main/build.test.ts（新建，56 行）
未改动 config.ts / config.test.ts / test-utils.ts / main.ts / preload.ts / package.json。git diff fb81655..da51a3a 仅 2 个新文件 +101 行。

## 自审发现（完整性/质量/YAGNI）

- 完整性：4 个导出与简报逐字一致；测试 6/6 全过，全套件 15/15。
- 接口契合：build.ts 只读使用 config.ts 的 ParamsFile/ConfigEntry/ConfigsMap 类型与 validateConfigId，无接口缺口，未私改任何既有文件。
- 测试质量：验证真实行为——prepareLaunch 用真实临时目录（tmpPath/rm/mkDir/writeText/jp，test-utils）落盘 stub exe，断言真实向量/摘要字符串，无任何 mock；错误断言走 toThrow 正则匹配分类前缀（VALIDATION/MISSING）。
- YAGNI：未添加简报之外的函数或导出；quoted() 单独导出仅因简报结构如此，无过度抽象。

## 疑虑

- 无功能性疑虑。唯一注意点：quoted() 对已含引号的值不做转义（原样回显），这是 Rust quoted() 的既定语义、测试亦未覆盖转义场景——与简报/Rust 侧一致，非本任务范围，后续若需转义应在 Rust 侧先定稿再同步。
