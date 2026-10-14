# 任务 2 · 帧协议 `src-main/ql-host-protocol.ts` — check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 2 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §6.5（帧部分） · 关联审查重点 **RF4 / RF5（帧是它们的载体）**（索引 R 组）
> 前置：无（与任务 1 无依赖，但按 plan 顺序执行）
> 现状锚点（本表生成时实测，2026-10-14）：新文件；可照搬的解析器形状见 `.temp/ql-admin-probe/child9.cjs`（本次取证探针，粘帧 / 半帧都过）；既有帧式协议先例：无
> 索引：[00-index.md](00-index.md) 的 G1、G6、G7、**K32**（`DATA` 的 payload 按 string 传，裁决 R-06）、**K33**（不设帧长上限）
>
> **主代理验收（2026-10-14 20:0x，独立复跑 G 段全部命令）**：G1 → `Test Files 1 passed (1)` / `Tests 5 passed (5)`；G2 i18n → `4 passed (4)` / `18 passed (18)`；G3 tsc → 无输出 `TSC_EXIT=0`；G4 全量 → `Test Files 49 passed (49)` / `Tests 844 passed (844)`（49 = 48 + 本任务 1 份，与索引 :7 的预测一致）。另独立复核：`ql-host-protocol.ts` 非注释行零汉字（node 正则实测，空命中）；五条用例名与 plan 逐字；新模块 import 0 条、`throw` 0 处

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 上一任务已提交、工作区干净 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 1 的提交；porcelain 不含其它代码文件 | ☑ |
| A2 | 全量基线（索引头部「测试基线」行：由主代理实测，子代理不重跑） | `npm test` | `Test Files 48 passed (48)` / `Tests 835 passed (835)`，exit 0；本任务后用例数只增不减 | ☑（主代理实测 2026-10-14 19:07：`Test Files 48 passed (48)` / `Tests 835 passed (835)`、`Duration 9.35s`、exit 0；与本表生成时的静态计数 48 份 `*.test.ts` 一致。跑 `npm test` 需要完全访问沙箱，见索引 K23） |
| A3 | 本表引用的锚点行号属实 | 读 `.temp/ql-admin-probe/child9.cjs` 的 `feed()`（粘帧 / 半帧处理） | 与本表引用一致 | ☑ |
| A4 | 前置任务交付的接口在（签名逐字可用） | ——（无前置） | 可用；不可用就停下来报告，不要自己补 | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/ql-host-protocol.ts` | 新建：`HOST_FRAME` 常量 + `encodeFrame` + `createFrameParser` | 纯函数；不 import `electron` / `koffi` / `i18n`；不含汉字字面量 | ☑ |
| B2 | `src-main/ql-host-protocol.test.ts` | 新建 | 只测协议本身 | ☑ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | 类型常量 | `HELLO=0x01 WRITE=0x02 RESIZE=0x03 STOP=0x04 READY=0x81 DATA=0x82 EXIT=0x83 ERR=0x84` —— 规格 §6.5 表逐字 | ☑ |
| C2 | 帧格式 | `type:u8 \| len:u32LE \| payload` —— 规格 §6.5 | ☑ |
| C3 | 导出签名 | `encodeFrame(type, payload: string): Buffer`、`createFrameParser(onFrame): (chunk: Buffer) => void` —— plan 任务 2 的签名块 | ☑ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先写失败测试（plan 任务 2 步骤 1 的 5 条） | `npx vitest run src-main/ql-host-protocol.test.ts` | 模块不存在 → 红 | ☑ |
| D2 | 实现 | 同上 | 全绿 | ☑ |
| D3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☑ |
| D4 | 全量 | `npm test` | 全绿 | ☑ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | 编解码往返（含多字节 UTF-8） | 规格 §6.5 | `round_trip` / `payload_with_multibyte_utf8_survives` | ☑ |
| E2 | 一个 chunk 里的两帧被拆开（粘帧） | 规格 §6.5 | `two_frames_in_one_chunk_are_split` | ☑ |
| E3 | 半帧不解析、等后续（按字节切，不按字符） | 规格 §6.5 | `half_frame_waits_for_the_rest` | ☑ |
| E4 | 未知 type 丢弃且不破坏流 | 规格 §6.5 | `unknown_type_is_dropped_without_breaking_the_stream` | ☑ |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 新文件不得含汉字字面量 | 索引 G6（`no-hardcoded.test.ts:26-28`） | ☑ |
| F2 | 不新增依赖 | 索引 G7 | ☑ |
| F3 | 只改 B 段两个文件 | 索引 G9 | ☑ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/ql-host-protocol.test.ts` | 全绿 | ☑ |
| G2 | i18n 三门（新文件被 no-hardcoded 扫到） | `npx vitest run src-main/i18n` | 全绿 | ☑ |
| G3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☑ |
| G4 | 全量 | `npm test` | 全绿 | ☑ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/ql-host-protocol.ts`、`src-main/ql-host-protocol.test.ts` | ☑ |
| H2 | commit message 逐字 | `feat: 提权 PTY 宿主的帧协议（长度前缀 + 方向高位）` | ☑ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☑ |

## I. 完成判据

- [x] A1-A4 成立
- [x] B1-B2 之外没有文件被改
- [x] C1-C3 逐字一致
- [x] D1→D4 先红后绿
- [x] E1-E4 有对应测试且绿
- [x] G1-G4 全绿
- [x] J 段有真实输出

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `npx vitest run src-main/ql-host-protocol.test.ts` | **先红（D1，19:59:41，exit 1）**：`Error: Failed to load url ./ql-host-protocol (resolved id: ./ql-host-protocol) in D:/Dev/Projects/lms_launcher/src-main/ql-host-protocol.test.ts. Does the file exist?` → `Test Files 1 failed (1)` / `Tests no tests`（模块不存在，正是 D1 的预期）。**后绿（D2，20:01:49，exit 0）**：`✓ src-main/ql-host-protocol.test.ts (5 tests) 63ms` → `Test Files 1 passed (1)` / `Tests 5 passed (5)`（五条用例名逐字 = plan 步骤 1）。中间一次 20:00:14 的绿是 `Test Files 1 passed (1)` / `Tests 5 passed (5)`、`Duration 386ms` |
| J-2 | `npx tsc --noEmit -p tsconfig.main.json` | 两次（20:00:2x 与 20:01:49）均无任何输出、`TSC_EXIT=0`（命令尾追加 `Write-Output "TSC_EXIT=$LASTEXITCODE"` 取证） |
| J-3 | `npm test` | 两次全量（20:00:46 与改成一行的 `HOST_FRAME` 之后）均 exit 0：**`Test Files 49 passed (49)` / `Tests 844 passed (844)`**，`Duration 8.85s` / `8.91s`。49 = 基线 48 + 本任务新增 1 份；844 = 基线 839 + 本任务新增 5；无 failed / skipped |
| J-4 | `npx vitest run src-main/i18n` | exit 0：`Test Files 4 passed (4)` / `Tests 18 passed (18)`（`index` / `no-hardcoded` / `dict` / `key-coverage` 全绿，20:01:19）。新模块被 `no-hardcoded` 的 `walk('src-main')` 扫到 |
| J-5 | 同上 + 临时在 `ql-host-protocol.ts` 的 `const HEADER_LEN = 5;` 下一行插入 `const CJK_PROBE = '汉字探针';`（F1 的反证，随即撤销；不写行号——同文件后来把 `HOST_FRAME` 收成一行，行号会漂） | 插汉字后立刻红：`FAIL src-main/i18n/no-hardcoded.test.ts > i18n: 零硬编码中文 > 全部目标文件(词典除外)的字符串字面量不含汉字`（`no-hardcoded.test.ts:147`）→ `Test Files 1 failed \| 3 passed (4)`；撤销后 `sha256` 与插入前逐字节相同（`aa9a4e29…46cf`），再跑 J-4 = 全绿 |
| J-6 | `git status --porcelain`；`git diff --name-only`；`git diff --name-only package.json package-lock.json electron-builder.yml src-main/i18n/` | porcelain 只有两行 `?? src-main/ql-host-protocol.ts` / `?? src-main/ql-host-protocol.test.ts`（B 段两个文件，未 `git add`）；已跟踪改动为空；依赖段与词典 diff 为空（F2 / F3 / G7 / G8）。HEAD 仍 `0be4614` |
| J-7 | 机械核对签名块（读 `src-main/ql-host-protocol.ts` 逐行比对 plan 任务 2 的签名块） | 四条逐字命中：`:10` `export const HOST_FRAME = { HELLO: 0x01, … ERR: 0x84 } as const;`、`:12` `export type HostFrameType = (typeof HOST_FRAME)[keyof typeof HOST_FRAME];`、`:20` `export function encodeFrame(type: HostFrameType, payload: string): Buffer {`、`:29` `export function createFrameParser(onFrame: (type: number, payload: string) => void): (chunk: Buffer) => void {`；`import` 行 0 条、`throw` / `VALIDATION:` / `STATE:` / `PROC:` 0 处（B1 / C1 / C3 / G1） |
