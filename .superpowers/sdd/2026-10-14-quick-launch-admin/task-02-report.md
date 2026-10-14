# 任务 2 报告 · 帧协议 `src-main/ql-host-protocol.ts`

> 执行者：子代理（子代理驱动 · 任务 2）｜时间：2026-10-14 19:55–20:03（Asia/Singapore）
> 输入：`.superpowers/sdd/2026-10-14-quick-launch-admin/task-02-brief.md` · `docs/superpowers/checks/2026-10-14-quick-launch-admin/task-02-frame-protocol.md` · 规格 §6.5「帧」部分（含帧表、「高位 0x80 区分方向」「解析器必须能处理粘帧 / 半帧」）
> 分支：`feat/quick-launch-admin`，HEAD `0be4614`（任务 1 的验收文档提交，索引 K30 同口径）。**未 `git add`、未 commit**（G8），改动全部留在工作区。

## 状态

**DONE** —— 先红后绿（D1→D2）、定向 5 条全绿、类型门干净、i18n 三门未红、全量 49 files / 844 tests 全绿、改动范围 = B 段两个文件。
三条疑虑见文末（都不影响本任务的判据，但第 3 条建议主代理在派任务 5 / 6 前看一眼）。

## A 段起点核对（实测）

| 项 | 结果 |
|---|---|
| A1 | `git log --oneline -1` = `0be4614 docs(checks): 任务 1 验收落勾（J 段真实输出）+ 索引 K30/K31 + SDD 账本`；`git status --porcelain` **完全为空**（连未跟踪项都没有）。按派单口径：HEAD = 任务 1 的提交（索引 K30 的同一口径），A 段文字未改 |
| A2 | 未重跑基线（表里注明由主代理实测：48 files / 835 tests；派单给的当前基线是任务 1 之后的 48 / 839）。收尾门跑的全量 = **49 / 844**，见 D4 |
| A3 | 锚点属实：`.temp/ql-admin-probe/child9.cjs:8-17` 的 `feed()` = `Buffer.concat` 累积 → `while (buf.length >= 5)` → `readUInt8(0)` / `readUInt32LE(1)` → 不足 `5 + len` 就 `break` → `subarray(5, 5+len).toString('utf8')` → `subarray(5+len)`。实现照搬该结构（只在最后一步加「未知 type 不派发」，见「偏离 5」） |
| A4 | 无前置任务，无需核对 |

## 改动清单（B 段；实测 `git status --porcelain` 只有这两个未跟踪文件，已跟踪改动为空）

| 文件 | 行 | 内容 |
|---|---|---|
| `src-main/ql-host-protocol.ts`（新建，43 行） | `:1-8` | 头注释：出处（规格 §6.5）、帧格式、方向高位、粘帧 / 半帧口径、锚点 `child9.cjs:8-17`、消费方（任务 4 / 5）。**注释含中文，字符串字面量零汉字**（F1 / G6） |
| 同上 | `:10` | `export const HOST_FRAME = { HELLO: 0x01, WRITE: 0x02, RESIZE: 0x03, STOP: 0x04, READY: 0x81, DATA: 0x82, EXIT: 0x83, ERR: 0x84 } as const;`（与 plan 签名块逐字同一行） |
| 同上 | `:12` | `export type HostFrameType = (typeof HOST_FRAME)[keyof typeof HOST_FRAME];`（逐字） |
| 同上 | `:15`、`:18` | `const HEADER_LEN = 5;`（`type(1) + len(4)`）；`const KNOWN_TYPES: ReadonlySet<number> = new Set<number>(Object.values(HOST_FRAME));` |
| 同上 | `:20-27` | `encodeFrame`：`Buffer.from(payload,'utf8')` → `Buffer.alloc(5+len)` → `writeUInt8(type,0)` → **`writeUInt32LE(body.length, 1)`**（plan 步骤 3）→ `body.copy` |
| 同上 | `:29-43` | `createFrameParser`：闭包内 `buf` 按**字节**累积（`Buffer.concat`）→ 表头不足 5 字节不读 → `buf.length < HEADER_LEN + len` 即 `break`（半帧不 `toString`、不产出）→ `subarray(5, 5+len).toString('utf8')` + `buf = buf.subarray(5+len)` → `if (KNOWN_TYPES.has(type)) onFrame(type, payload)`（未知 type 已消费、不派发） |
| `src-main/ql-host-protocol.test.ts`（新建，134 行） | `:27-134` | 一个 `describe` + **5 条用例，名称逐字取 plan 步骤 1**：`round_trip` / `two_frames_in_one_chunk_are_split` / `half_frame_waits_for_the_rest` / `unknown_type_is_dropped_without_breaking_the_stream` / `payload_with_multibyte_utf8_survives` |

`git diff --name-only package.json package-lock.json electron-builder.yml src-main/i18n/` = 空（F2 / F3 / G7）。新模块 `import` 行 0 条、`throw` / `VALIDATION:` / `STATE:` / `PROC:` 0 处（B1 / G1）。

## TDD 步骤门（D1→D4，命令与真实输出；同内容已填进 check 表 J-1…J-7）

- **D1 先写失败测试 → 跑红**：`npx vitest run src-main/ql-host-protocol.test.ts`（19:59:41，exit 1）→ `Error: Failed to load url ./ql-host-protocol (resolved id: ./ql-host-protocol) in D:/Dev/Projects/lms_launcher/src-main/ql-host-protocol.test.ts. Does the file exist?` → `Test Files 1 failed (1)` / `Tests no tests`。正是「模块不存在 → 红」。
- **D2 实现 → 跑绿**：同命令（20:00:14，exit 0）→ `✓ src-main/ql-host-protocol.test.ts (5 tests) 70ms` → `Test Files 1 passed (1)` / `Tests 5 passed (5)`。把 `HOST_FRAME` 收成一行后再跑一次（20:01:49）→ 仍 `5 passed (5)`。
- **D3 类型门**：`npx tsc --noEmit -p tsconfig.main.json`（20:00:2x 与 20:01:49 各一次）→ 无任何输出、`TSC_EXIT=0`。
- **D4 全量**：`npm test` 三次（20:00:46 / 把 `HOST_FRAME` 改成一行之後 / 最终 20:07:26）均 exit 0 → **`Test Files 49 passed (49)` / `Tests 844 passed (844)`**，`Duration 8.85s` / `8.91s` / `8.87s`。49 = 基线 48 + 本任务新增 1 份（与索引 `:7`「任务 2 之后应为 49 份」一致）；844 = 基线 839 + 本任务新增 5；无 failed / skipped。
- **G2 i18n 三门**：`npx vitest run src-main/i18n`（20:00:27 与 20:01:19）→ `Test Files 4 passed (4)` / `Tests 18 passed (18)`（`index` / `no-hardcoded` / `dict` / `key-coverage` 全绿）。

## E 段断言的落点

- **E1 往返** → `round_trip`：先逐字断八个 type 常量与帧表一致、并断「主进程 → 宿主」四个都 `& 0x80 === 0`、「宿主 → 主进程」四个都 `& 0x80 === 0x80`（规格 §6.5 的方向位）；再对 8 个 type × 4 种 payload（含空 payload）逐帧断字节布局 `readUInt8(0)` / `readUInt32LE(1) === Buffer.byteLength` / `subarray(5).equals(bytes)`，并喂回解析器断原样回来。多字节部分由 `payload_with_multibyte_utf8_survives` 守。
- **E2 粘帧** → `two_frames_in_one_chunk_are_split`：两帧拼一个 chunk 一次喂入 → 按顺序拆成两帧；再喂「空 payload 帧 + 未知帧 + 已知帧」三连 → 只丢未知帧，其余逐帧拆出。
- **E3 半帧** → `half_frame_waits_for_the_rest`：**在每一个字节切点**（含只给半截表头）断开，前半不得产出任何帧、补上后半才恰好一帧；再逐字节喂整帧（最碎形态）仍只一帧且不重复吐；空 chunk 不改变状态。
- **E4 未知 type** → `unknown_type_is_dropped_without_breaking_the_stream`：`0x00 / 0x05 / 0x7f / 0x80 / 0x85 / 0xff` 六种未知 type 各夹在已知帧前后 → 只丢弃、后续帧照常解析；另加「未知帧自己被半帧截断」一段：截断时不误报，补全后仍只丢弃。
- **多字节 / 按字节切** → `payload_with_multibyte_utf8_survives`：payload 混 2 / 3 / 4 字节 UTF-8（`café ☕ 😀 → ñ`），先断 `bytes.length > payload.length`（确证多字节），再断帧里的 `len` 是**字节**数不是字符数，最后在 payload 内每个字节切点断开（必然落在多字节序列内部）→ 半帧不产出、补全后逐字节还原。

## 偏离 brief / check 表的地方（都不改判据）

1. **A1 的 HEAD 串**：表里 A1 写「HEAD = 任务 1 的提交」，实测 `0be4614`（任务 1 的验收落勾文档提交）。按派单说明与索引 K30 的口径这就是本任务起点，A 段文字我一个字没改。
2. **J 段从 3 行扩到 7 行**（J-4 i18n 三门、J-5 汉字反证、J-6 范围核对、J-7 签名逐字机械核对）：G2 / F1 / F3 / C1-C3 的证据只能落在 J 段。A-I 段的勾一个没落，其它行一字未动；改完跑过列数机械校验（九张表每表所有 `|` 行列数一致）与普查：`node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → exit 0，本表 `☑=1 裸☐=26 I段 -[ ]=7 H2=未提交`（未提交表的正常状态）。
3. **多跑了一次「汉字反证」**（J-5）：临时在实现里插入 `const CJK_PROBE = '汉字探针';` → `no-hardcoded` 立刻红（`no-hardcoded.test.ts:147`），证明新模块**确实**被 `walk('src-main')` 扫到（不是「因为没被扫到所以假绿」）；随即撤销，撤销后文件 `sha256` 与插入前逐字节相同（`aa9a4e29…46cf`），再跑 i18n 三门全绿。
4. **`HOST_FRAME` 先写成三行、后改成一整行**：为让 plan 签名块能被逐行机械比对（J-7 的四条逐字命中）。语义与取值前后完全一致，改后重跑定向 + 类型门 + 全量。
5. **未知 type 的丢弃点选在解析器内**（`:40` 的 `if (KNOWN_TYPES.has(type))`），而不是把未知 type 也交给 `onFrame` 让消费方忽略。依据：接口契约「未知 type 丢弃且不破坏流」+ check E4 由本模块的用例守。锚点 `child9.cjs` 是在 `handle()` 里忽略，两种形状行为等价；选前者是让「丢弃」这件事由协议模块自己保证，任务 4 / 5 / 6 的调用方不必各自再写一遍。
6. **测试里的多字节样本不用 CJK**（用 `é` / `☕` / `→` / `😀`）：覆盖 2 / 3 / 4 字节序列与 CJK 等价，同时不触碰「新文件不得含汉字字面量」这条硬门（`no-hardcoded` 的 `walk` 本来就跳过 `.test.ts`，但 G6 的措辞是「新文件」，按最严的读法执行）。

## 遗留疑虑（请主代理定夺，我没有自行扩范围）

1. **没有帧长上限**：`len` 是 u32，脏字节（管道里混进非帧数据）会让解析器认为「还差很多字节」而无限等待，既不报错也不丢弃。规格 §6.5 未定义上限，plan 任务 2 也没要求 → 我没加。若要加，得先定「上限多少、超限算哪类错误」，属规格改动（按 AGENTS.md 要先改 spec / plan / check 表）。
2. **半帧缓冲无上界**：对端只写半帧就退出时，缓冲留在解析器实例里，直到实例被丢弃。生命周期归任务 4 / 6 的持有者，本模块不越界处理。
3. **`DATA` 的 payload 按规格是「终端原始字节」，而签名块把 payload 定为 `string`**（plan 逐字如此，我照用）。UTF-8 解码 → 再编码对**非法字节序列不保真**（替换字符不可逆），终端控制序列里出现非 UTF-8 字节时会失真。这是接口层面的既有决定，本任务没有改；建议派任务 5 / 6 时明确「原始字节怎么过帧」（例如 base64 或 JSON 包一层），否则任务 6 的 `onData` 转发会踩这里。

## 未做的事（按分工留给主代理）

- 不落 A-I 段的勾、不跑 H3 的落勾门（普查只作为状态记录跑过一次，见「偏离 2」）。
- 不 `git add` / 不 commit：H1 暂存范围（`src-main/ql-host-protocol.ts`、`src-main/ql-host-protocol.test.ts`）与 H2 逐字 message `feat: 提权 PTY 宿主的帧协议（长度前缀 + 方向高位）` 归主代理验收后执行。
- 未动 spec / plan / 其它 check 表 / 索引 / 词典 / `package.json` / `electron-builder.yml` / 任何既有源文件。
- 类型门按 R-01 用 `tsconfig.main.json`；该配置 `exclude` 了 `src-main/**/*.test.ts`（既有安排，未改），故测试文件不在 tsc 覆盖内——它由 vitest 的 esbuild 转译执行。
