# 任务 11 第三轮派单（R-23：应用 exe + `--ql-host` 开关 + `boot.js` 入口分流）

## 先读这三份（真相源，按此顺序）

1. `docs/superpowers/specs/2026-10-14-quick-launch-admin.md` —— **§6.4（R-23，9 条）**、§6.3 模块表、§3 的 P13 / P14（带更正按语）/ **P15**、§6.5（管道与帧协议，不改）、§6.6（宿主入口与退出码）、§6.10（错误文案词表）
2. `docs/superpowers/plans/2026-10-14-quick-launch-admin.md` —— **### 任务 11（第三轮）** 步骤 0-6 + 全局约束 G1-G9（G7 有 R-23 的唯一例外）
3. `docs/superpowers/checks/2026-10-14-quick-launch-admin/task-11-host-mode-launch.md` —— **A-I 段已整体重写为第三轮**，逐行照做；J 段 J-1…J-19 是前两轮的历史证据（**只读、不改、不删**），你从 **J-20** 开始追加

## 起点与保留

- 起点 = **当前工作区**（HEAD `6cd1159`）。第二轮（R-21）的 6 个文件改动**保留**：删硬链接一族、`hostExePath() = process.execPath` + `hostScriptPath()`、`build.bat` 删块、测试改名、`main.ts` / `ql-pty-host.ts` 的注释修正。**这些不要重做、不要回退。**
- `git status --porcelain` 在动手前应只有：`build.bat`、`src-main/ql-elevated.ts`、`src-main/ql-elevated.test.ts`、`src-main/ipc-ql.test.ts`、`src-main/main.ts`、`src-main/ql-pty-host.ts`。若 `package.json` 也在里面 = 被 `npx asar extract-file` 误覆盖过（索引 K66），先 `git restore -- package.json` 再开工。

## 本轮要做的四件事（B 段逐字边界）

1. **新建 `src-main/boot.ts`**：`export function bootMain(argv: string[], load: (name: string) => unknown): void` —— `argv.includes('--ql-host')` → `load('./ql-pty-host')` 并调它的 `main()`；否则 `load('./main.js')`。模块顶层只调用一次：`bootMain(process.argv, (name) => require(name))`。不 import `electron`、不解析参数内容、字符串字面量全 ASCII（i18n 硬门扫非测试文件的字面量，注释不限）。
2. **`package.json`**：`"main"` → `"dist-main/boot.js"`。其余字段一字不动。
3. **`src-main/ql-pty-host.ts`**：`runHost`（`:86-89`）改成 C1 的双形状取参（先 `indexOf('--ql-host')`，取其后两个；找不到才 `slice(2)`）；`:202` 的留痕取管道名用同一套取法。`main()` 导出、`:209` 的 `require.main === module` 块、帧协议、退出码 2/1/3/4 **一字不改**。
4. **`src-main/ql-elevated.ts`**：只改 `:139` 的 `parameters` 为 `'--ql-host "' + pipeName + '" "' + token + '"';` 与 `:46-47` 的注释措辞。其余（含 `startHost`、`ElevatedPtyProcess`）一字不改。

## TDD 与门（照表 D / G 段）

- 先改测试再实现：新建 `src-main/boot.test.ts`（3 条，见 D1）；`src-main/ql-pty-host.test.ts` 加 2 条（`--ql-host` 夹在 argv 中间也取对两个参数；只有开关没有值 → `stage=pipe` 退出码 3）；`src-main/ql-elevated.test.ts` 把钉 `parameters` 的两条断言改成 C2 的串（**条数不变**）。既有 `ql-pty-host.test.ts:147-150` / `:352-355` 的夹具**保持 dev 形状不改**，用来证 E5（无开关仍可用）。
- 门：定向 → `npx vitest run src-main/quick-launch.test.ts src-main/ipc-ql.test.ts`（预期 `Tests 61 passed (61)` 不变）→ `npx tsc --noEmit -p tsconfig.main.json`（`TSC_EXIT=0`）→ `npx vitest run src-main/i18n`（`Tests 18 passed (18)`）→ `npm test`（预期 **52 文件 / 901 用例**；实测不同就在 J 段登记真值，别改表凑数）。
- **不要跑 `build.bat`、不要打包、不要启动应用**：本会话起不了 app 模式（`0x80000003`，索引 K64 ④），产物核对（G6）与真机门（D6）由主代理与用户负责。
- 每条命令与**真实输出**追加到该表 J 段（从 J-20 起，append-only）。A-I 段的勾**不要动**（验收由主代理落）。

## 硬规则

- 不 `git add`、不 commit、不 push；改动留在工作区。
- 不越出 B 段文件范围；要越界先在 J 段写清楚并停手等主代理裁。
- 不新增依赖、不改词典、不碰渲染端、不碰 `main.ts` / `quick-launch.ts` / `shell-execute.ts` / `ipc-ql.test.ts` / `build.bat`。
- 报告写到 `.superpowers/sdd/2026-10-14-quick-launch-admin/task-11r3-report.md`：逐条对应 A-I 段说明「做了什么 / 命令 / 真实输出 / 没做到的项」。
