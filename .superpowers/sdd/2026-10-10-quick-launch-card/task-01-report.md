# 任务 1 报告 · 公共命名工具 `nextCopyName`

- 状态：**DONE**（H 段按 K5 留给主代理）
- 起点：HEAD `341319a`，分支 `feat/quick-launch`，工作区干净
- check 表：`docs/superpowers/checks/2026-10-10-quick-launch-card/task-01-next-copy-name.md`（A–G 各行已勾，J 段已填真实命令与输出；H 段与 I 段 H1-H2 未勾，按 K5 由主代理执行）

## 1. 改了什么

| 文件 | 动作 | 内容 |
|---|---|---|
| `src/util/copy-name.ts` | 新建（12 行） | 模块头注释（原 TemplateModule.vue 70-72 行三行原样搬入 + 1 行来源说明）+ `const COPY_SUFFIX = / - copy( \d+)?$/;` + `export function nextCopyName(base: string, taken: Set<string>): string`，循环体逐字照搬 |
| `src/util/copy-name.test.ts` | 新建（15 行） | 计划 §任务 1 步骤 1 的三个用例逐字抄录，未增删用例 |
| `src/modules/TemplateModule.vue` | 修改（+1 / −12） | 第 10 行新增 `import { nextCopyName } from '../util/copy-name';`（紧跟既有 `../util/truncate` 之后）；删除原 70-80 行的本地定义。调用点（现第 84 行）`nextCopyName(src.name ?? '', taken)` 一字未改 |

`git diff --stat`：`src/modules/TemplateModule.vue | 13 +------------`，`1 file changed, 1 insertion(+), 12 deletions(-)`。

## 2. TDD 顺序与命令输出

### D1 先写测试
`src/util/copy-name.test.ts` 落盘（3 用例：首次 `- copy` / 已占用递增 / 剥后缀重算）。

### D2 红（实现前）
```
npx vitest run src/util/copy-name.test.ts
 ❯ src/util/copy-name.test.ts (0 test)
 FAIL  src/util/copy-name.test.ts [ src/util/copy-name.test.ts ]
Error: Failed to load url ./copy-name (resolved id: ./copy-name) in
D:/Dev/Projects/lms_launcher/src/util/copy-name.test.ts. Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
exit code 1
```
失败原因正是「无法解析 `./copy-name`」，与 check 表 D2 预期一致。

### D3 实现
搬移（非重写）：正则与循环原样进入新文件，唯一改动是函数签名前加 `export`（C1 契约要求）。

### D4 绿
```
npx vitest run src/util/copy-name.test.ts src/modules/TemplateModule.test.ts
 ✓ src/util/copy-name.test.ts (3 tests) 54ms
 ✓ src/modules/TemplateModule.test.ts (20 tests) 173ms
 Test Files  2 passed (2)
      Tests  23 passed (23)
exit code 0
```

## 3. 回归门

### G1 既有兜底测试
```
npx vitest run src/modules/TemplateModule.test.ts
 ✓ src/modules/TemplateModule.test.ts (20 tests) 166ms
 Test Files  1 passed (1)
      Tests  20 passed (20)
exit code 0
```
其中直接钉住复制命名的三条均绿：`copy_button_renders_left_of_edit_button_in_each_row`、`copy_click_dups_config_after_source_with_copy_name_and_new_id`（断言 `日常 - copy`）、`copying_a_copy_strips_suffix_and_increments_number`（断言 `日常 - copy 2` 且不含 `copy - copy`）、`copy_skips_taken_numbers_and_reuses_free_slot`（占用 `- copy` 与 `- copy 3` → 得 `- copy 2`）。

### G2 改动范围
```
git diff --name-only
src/modules/TemplateModule.vue
git status --porcelain
 M src/modules/TemplateModule.vue
?? src/util/copy-name.test.ts
?? src/util/copy-name.ts
```
恰好 B1–B3 三个文件，无其它文件被触碰。

### 额外（非本任务要求，提前跑索引 V5）
`npx vitest run`（全量）：`Test Files 40 passed (40)` / `Tests 667 passed (667)` / `Duration 8.39s`，exit 0。仅作跨文件回归自证，不作为本任务的验收项。

## 4. E1–E4 证据

| # | 断言 | 证据 |
|---|---|---|
| E1 | `nextCopyName('Qwen', {'Qwen'})` → `Qwen - copy` | `copy-name.test.ts` 用例 1，D4 中 3 tests 全绿 |
| E2 | `{'Qwen','Qwen - copy'}` → `Qwen - copy 2` | 用例 2，同上 |
| E3 | `'Qwen - copy'` → `Qwen - copy 2`；`'Qwen - copy 2'` → `Qwen - copy` | 用例 3（两条 expect），同上；组件侧 `copying_a_copy_strips_suffix_and_increments_number` 再从 UI 路径钉一次 |
| E4 | 搬出的正则与旧实现逐字一致 | 用 `git show HEAD:src/modules/TemplateModule.vue` 的 73-80 行与新文件 5-12 行逐行 diff：8 行中 7 行完全相同，唯一差异是签名行多出 `export `；`/ - copy( \d+)?$/`（含空格与转义）与模板串 `${root} - copy` / `${root} - copy ${i}` 完全一致；旧注释三行原样保留在新文件头 |

## 5. 自审发现

1. **删的是 70-80 行，不是 73-80 行**：check 表 B3 写「修改第 73-80 行改为引用」，简报「边界」写「仅把第 70-80 行的定义替换为 import 引用」。两处差的是 70-72 行那段方案 A 注释。按 73-80 删会在 `reload()` 与「// 复制：…」之间留下一段无代码可解释的悬空注释；按 70-80 删并把注释原样搬到新文件头，才符合规格 §5.4「原样搬出」。已按简报（70-80）执行，并在此登记，请主代理验收时确认这一处理符合 B3 的边界意图。
2. **换行符**：仓库工作区是 CRLF（`core.autocrlf=true`，index 存 LF，无 `.gitattributes`）。两个新文件按工作区惯例写成 CRLF，`git add` 后入库为 LF，与 `src/util/truncate.ts` 等既有文件一致，不会产生噪音 diff。
3. **未新建 `index.ts`**，未改 `vitest.config.ts`（`include: ['src/**/*.test.ts']` 已覆盖新测试；默认 `environment: 'node'`，纯函数测试无需 `@vitest-environment` 声明，故测试文件保持计划给出的逐字内容）。
4. **未扩范围**：无多语言后缀、无可配置后缀、无新逻辑、无参数校验分支；`COPY_SUFFIX` 仍是模块内私有常量，未导出。
5. **类型检查**：本仓库无渲染端 typecheck 脚本（`tsc -p tsconfig.main.json` 只覆盖 `src-main/`，索引 V3 也不适用于本次改动）。新导入路径的解析与编译由 vitest 转实验证（D4/G1 均 exit 0）。
6. 未 `git add`、未 commit，改动全部留在工作区（K5）。

## 6. 疑虑

无阻塞项。仅第 5.1 条（70-80 vs 73-80 的注释归属）需要主代理一句话确认口径；若认为注释应留在 `TemplateModule.vue`，回退成本是把三行注释搬回原处并从新文件删除，代码部分不受影响。
