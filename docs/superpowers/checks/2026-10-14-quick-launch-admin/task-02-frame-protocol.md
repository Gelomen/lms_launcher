# 任务 2 · 帧协议 `src-main/ql-host-protocol.ts` — check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 2 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §6.5（帧部分） · 关联审查重点 **RF4 / RF5（帧是它们的载体）**（索引 R 组）
> 前置：无（与任务 1 无依赖，但按 plan 顺序执行）
> 现状锚点（本表生成时实测，2026-10-14）：新文件；可照搬的解析器形状见 `.temp/ql-admin-probe/child9.cjs`（本次取证探针，粘帧 / 半帧都过）；既有帧式协议先例：无
> 索引：[00-index.md](00-index.md) 的 G1、G6、G7

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 上一任务已提交、工作区干净 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 1 的提交；porcelain 不含其它代码文件 | ☐ |
| A2 | 全量基线（索引头部「测试基线」行：由主代理实测，子代理不重跑） | `npm test` | `Test Files 48 passed (48)` / `Tests 835 passed (835)`，exit 0；本任务后用例数只增不减 | ☑（主代理实测 2026-10-14 19:07：`Test Files 48 passed (48)` / `Tests 835 passed (835)`、`Duration 9.35s`、exit 0；与本表生成时的静态计数 48 份 `*.test.ts` 一致。跑 `npm test` 需要完全访问沙箱，见索引 K23） |
| A3 | 本表引用的锚点行号属实 | 读 `.temp/ql-admin-probe/child9.cjs` 的 `feed()`（粘帧 / 半帧处理） | 与本表引用一致 | ☐ |
| A4 | 前置任务交付的接口在（签名逐字可用） | ——（无前置） | 可用；不可用就停下来报告，不要自己补 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/ql-host-protocol.ts` | 新建：`HOST_FRAME` 常量 + `encodeFrame` + `createFrameParser` | 纯函数；不 import `electron` / `koffi` / `i18n`；不含汉字字面量 | ☐ |
| B2 | `src-main/ql-host-protocol.test.ts` | 新建 | 只测协议本身 | ☐ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | 类型常量 | `HELLO=0x01 WRITE=0x02 RESIZE=0x03 STOP=0x04 READY=0x81 DATA=0x82 EXIT=0x83 ERR=0x84` —— 规格 §6.5 表逐字 | ☐ |
| C2 | 帧格式 | `type:u8 \| len:u32LE \| payload` —— 规格 §6.5 | ☐ |
| C3 | 导出签名 | `encodeFrame(type, payload: string): Buffer`、`createFrameParser(onFrame): (chunk: Buffer) => void` —— plan 任务 2 的签名块 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先写失败测试（plan 任务 2 步骤 1 的 5 条） | `npx vitest run src-main/ql-host-protocol.test.ts` | 模块不存在 → 红 | ☐ |
| D2 | 实现 | 同上 | 全绿 | ☐ |
| D3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☐ |
| D4 | 全量 | `npm test` | 全绿 | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | 编解码往返（含多字节 UTF-8） | 规格 §6.5 | `round_trip` / `payload_with_multibyte_utf8_survives` | ☐ |
| E2 | 一个 chunk 里的两帧被拆开（粘帧） | 规格 §6.5 | `two_frames_in_one_chunk_are_split` | ☐ |
| E3 | 半帧不解析、等后续（按字节切，不按字符） | 规格 §6.5 | `half_frame_waits_for_the_rest` | ☐ |
| E4 | 未知 type 丢弃且不破坏流 | 规格 §6.5 | `unknown_type_is_dropped_without_breaking_the_stream` | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 新文件不得含汉字字面量 | 索引 G6（`no-hardcoded.test.ts:26-28`） | ☐ |
| F2 | 不新增依赖 | 索引 G7 | ☐ |
| F3 | 只改 B 段两个文件 | 索引 G9 | ☐ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/ql-host-protocol.test.ts` | 全绿 | ☐ |
| G2 | i18n 三门（新文件被 no-hardcoded 扫到） | `npx vitest run src-main/i18n` | 全绿 | ☐ |
| G3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☐ |
| G4 | 全量 | `npm test` | 全绿 | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/ql-host-protocol.ts`、`src-main/ql-host-protocol.test.ts` | ☐ |
| H2 | commit message 逐字 | `feat: 提权 PTY 宿主的帧协议（长度前缀 + 方向高位）` | ☐ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☐ |

## I. 完成判据

- [ ] A1-A4 成立
- [ ] B1-B2 之外没有文件被改
- [ ] C1-C3 逐字一致
- [ ] D1→D4 先红后绿
- [ ] E1-E4 有对应测试且绿
- [ ] G1-G4 全绿
- [ ] J 段有真实输出

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `npx vitest run src-main/ql-host-protocol.test.ts` |  |
| J-2 | `npx tsc --noEmit -p tsconfig.main.json` |  |
| J-3 | `npm test` |  |
