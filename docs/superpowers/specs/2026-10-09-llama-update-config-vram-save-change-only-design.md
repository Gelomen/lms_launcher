# 更新配置与显存保存「变更才落盘、才记日志」— 设计

日期：2026-10-09
状态：已批准（设计经逐节确认）
前身：`2026-10-08-settings-save-change-only-design.md`（下称**前规格**）。本规格沿用它的 H1（归一化语义比较）、H2（判定基线 = yaml 文件现值，不是内存态）、H3（未变化时完全不写）、H9（判定由「决定是否写盘的那一层」报告）、H11（`emptyAppConfig()` 工厂）口径，只补新的两处。

## 1. 背景

前一轮把设置弹窗的代理/语言保存改成「变更才落盘、才记日志」后，最终整分支审查指出同一形状的缺陷仍在另外两处（已登记在前规格 §2 非目标）。本规格处理它们。

### 已核实的事实

- F1 `set_llama_update_config`（`src-main/main.ts:953-972`）无条件 `appConfigLoad` → 改字段 → `appConfigSave`，随后无条件 `emitLog('[lms_launcher] ' + t('log.llama.cfg.saved'), 'sys')`（`:965`）。
- F2 其中 `if (!cfg.update) cfg.update = {};`（`:961`）在 `opts.last_llama_type === undefined` 时会凭空写出一个 `update: {}` 空节并落盘。
- F3 调用方只有渲染端两处，都在「安装成功后」回写所选变体：`src/modules/UpdateModal.vue:276`（下载并安装成功）、`src/modules/UpdateModal.vue:311`（停止并更新 → 安装成功）；`src/llama-update-client.ts:114` 的 `setLlamaUpdateConfig` 不做任何比较。因此**对同一变体重复安装 = 重复写盘 + 重复记一条日志**，与前一轮修掉的症状同形。
- F4 `LlamaUpdateConfig` 只有一个字段：`last_llama_type?: string`（`src-main/config.ts:7-9`）。唯一消费方是 `get_llama_update_config`（`src-main/main.ts:975-979`），返回 `cfg.update ?? {}`——**不依赖 `update` 节存在**。
- F5 更新流程本身另有完整日志：`log.llama.dl.start` / `dl.cuda` / `dl.fail` / `dl.done`、`log.llama.install.*`（`src-main/main.ts:803-933`）。门控 `log.llama.cfg.saved` 不会让用户失去「更新成功」的反馈。
- F6 `save_vram_total`（`src-main/main.ts:450-455`）无条件 `appConfigSave(p, { ...cfg, vram_total_gb: gb > 0 ? gb : undefined })`，**没有日志**；`src/modules/VramDialog.vue:44` 已挡掉非正数与非数字，所以 `gb <= 0` 只可能来自其它调用方或后续代码。
- F7 `appConfigSave` 全量重写，`yaml` 的 `stringify` 省略值为 `undefined` 的键 → 目标为 `undefined` 时该键从文件消失（前规格 F8 同构）。
- F11（实测，2026-10-09）`stringify({ update: {} })` 与 `stringify({ update: { last_llama_type: undefined } })` 都输出 `update: {}`——**空节不会自行消失**，只有把 `cfg.update` 本身置为 `undefined` 才让整节从文件消失（探针：`.temp/probe-yaml-empty.cjs`）。因此「让节消失」是实现必须显式做的事，不是写盘的副作用。
- F8 前一轮已交付且已审：`ConfigSaveResult`（`src-main/config.ts:199`）、`saveProxy`（`:225`）、`saveLanguage`（`:248`）、`emptyAppConfig()`（`:41`），以及 `src-main/config.test.ts` 里的 mtime 哨兵（`pinMtime`/`mtime`）与字节逐字比对基建。
- F9 `src-main/main.ts` 没有自动化测试基建：判定必须落在 `config.ts` 才可测（前规格 F10）。
- F10 文案 `log.llama.cfg.saved` = `llama.cpp · 更新配置已保存`（`src-main/i18n/dict.ts:218`、英文 `:498`）。本次不改文案。

## 2. 目标与非目标

**目标**

- G1 对同一变体重复安装不再改写 `lms_launcher.yaml`，也不再重复记 `llama.cpp · 更新配置已保存`。
- G2 不再凭空造 `update: {}` 空节。
- G3 显存总量重复保存同一值不再改写文件（消除 mtime 抖动；它本来就没有日志）。
- G4 判定与写盘仍在同一层（`config.ts`），全部可被 vitest 覆盖。

**非目标**

- 不改 `saveLlamaDir`（前规格 H5：安装目录卡片无日志，由校验通过自动触发）。
- 不改渲染端：`UpdateModal.vue` / `VramDialog.vue` 仍不比较就发 IPC（主进程侧不写盘即可）。
- 不改任何 i18n 文案，不新增日志。
- 不改 `get_llama_update_config` 的返回契约。
- 不抽公共 `save*` 抽象（前一轮最终审查已判定为过早抽象）。

## 3. 决策记录

| # | 决策 | 内容 | 理由 |
|---|---|---|---|
| D1 | 判定位置 | `config.ts` 新增 `saveLlamaUpdateConfig` / `saveVramTotal`，返回 `ConfigSaveResult`；`main.ts` 只按 `changed` 门控日志 | 沿用前规格 H9 + F9：判定与写盘同层才可测 |
| D2 | 判定基线 | yaml 现值（`appConfigLoad` 后比较），不用内存态 | 沿用前规格 H2 |
| D3 | 未变化时 | 完全不写：不进入 `appConfigSave`，文件与 mtime 都不动 | 沿用前规格 H3 |
| D4 | `opts` 无值 | `opts.last_llama_type === undefined` → 什么都不做，`changed: false`，**不造 `update: {}`** | 修 F2。安全性由 F4 保证：唯一消费方用 `cfg.update ?? {}` |
| D5 | 空串 | `last_llama_type: ''` 视为「未配置」。目标状态 = **整个 `update` 节不存在**：文件里有有效值 → 变化，落盘时把 `cfg.update` 置为 `undefined`（不是把节内字段置 `undefined`，见 F11）；文件里已是 `update: {}` 或没有该节 → 未变化、不写（垃圾节不主动清理，同前规格 H8） | 与「空输入 = 缺键」的既有口径一致；渲染端不会发空串，属边界防御 |
| D6 | 显存取值 | `gb > 0` → 目标为该数值；`gb <= 0` 或非有限（`NaN`/`Infinity`）→ 目标「无该键」 | 保持 F6 既有语义（≤0 视为未配置），只加变更判定 |
| D7 | 返回值契约 | 两个 IPC 的返回类型与语义不变：未变化仍是 `{ success: true }`；`save_vram_total` 仍是 `void` | 渲染端无需改动（F3 的两处调用点不动） |
| D8 | 日志门 | 只在 `changed` 时记 `log.llama.cfg.saved`；`catch` 分支与 `log.llama.cfg.saveFail` 不变 | G1；用户反馈由 F5 的其它日志保证 |

## 4. 行为规格

「文件」= `lms_launcher.yaml` 现值；「输入」= 本次 IPC 参数按 D5/D6 归一后的目标状态。

### 4.1 更新配置（`set_llama_update_config`）

| # | 文件当前 | 本次输入 | 判定 | 落盘 | 日志 |
|---|---|---|---|---|---|
| U1 | 无 `update` 节 | `last_llama_type: 'Windows x64 (CUDA 13)'` | **变化** | 写入该节 | `llama.cpp · 更新配置已保存` |
| U2 | `update.last_llama_type: 'A'` | `'A'` | 未变化 | 不写（mtime 不变） | 无 |
| U3 | `'A'` | `'B'` | **变化** | 覆盖为 `'B'` | 有 |
| U4 | 任意 | `opts` 不含该键 | 未变化 | 不写，**不出现 `update: {}`** | 无 |
| U5 | `'A'` | `''` | **变化** | **整个 `update` 节消失**（实现须置 `cfg.update = undefined`，见 D5/F11） | 有 |
| U6 | 文件已是 `update: {}`（旧缺陷留下的垃圾节） | `''` 或不含该键 | 未变化 | 不写，垃圾节保持原样 | 无 |
| U7 | 文件已是 `update: {}` | `'A'` | **变化** | 写入 `update: {last_llama_type: 'A'}` | 有 |

其它节（`llama_dir` / `vram_total_gb` / `proxy` / `language`）在任何分支都不得丢失。

### 4.2 显存总量（`save_vram_total`）

| # | 文件当前 | 本次输入 | 判定 | 落盘 |
|---|---|---|---|---|
| W1 | 无 `vram_total_gb` 键 | `24` | **变化** | 写入 `vram_total_gb: 24` |
| W2 | `vram_total_gb: 24` | `24` | 未变化 | 不写（mtime 不变） |
| W3 | `vram_total_gb: 24` | `0` / `NaN` / `Infinity` | **变化** | 该键消失 |
| W4 | 无该键 | `0` | 未变化 | 不写 |

该路径始终没有日志（本次不新增）。

## 5. 契约

### 5.1 `src-main/config.ts`

```ts
/** 更新配置：只写 update.last_llama_type；与文件现值相同则完全不写（D2/D3）。
 *  opts 不含该键 → 什么都不做，绝不凭空造 update: {}（D4）。空串 = 未配置（D5）。 */
export function saveLlamaUpdateConfig(p: string, opts: { last_llama_type?: string }): ConfigSaveResult;

/** 显存总量：gb > 0 → 该值；否则视为未配置（键消失）（D6）。与文件现值相同则完全不写。 */
export function saveVramTotal(p: string, gb: number): ConfigSaveResult;
```

`ConfigSaveResult` 复用前一轮已交付的定义，不新增类型、不改其语义。

### 5.2 `src-main/main.ts`

- `set_llama_update_config`：`appConfigLoad` + 改字段 + `appConfigSave` + `emitLog` 换成 `const { changed } = saveLlamaUpdateConfig(cp, opts); if (changed) { emitLog('[lms_launcher] ' + t('log.llama.cfg.saved'), 'sys'); }`；`try/catch`、`log.llama.cfg.saveFail`、返回值 `{ success: true }` 全部不变（D7/D8）。
- `save_vram_total`：`appConfigLoad` + `appConfigSave` 换成 `saveVramTotal(p, gb)`，返回值仍为 `void`。

## 6. 验收

- V1（单测）真值表 U1–U7、W1–W4 全部有对应用例；U5 必须断言落盘后的文件里**不含** `update` 这一行（字节级），而不是只断言读回 `undefined`；U4 必须断言文件里**不出现** `update: {}`；「未变化」的分支必须用 mtime 哨兵（`pinMtime` 后 `mtime(p) === 0`）与文件字节逐字比对证明**没有落盘**，而不是只断言读回的值相同。
- V2（单测）任何变化分支落盘后重读，`llama_dir` / `proxy` / `language` / 其它节逐项保留。
- V3（类型）`npx tsc -p tsconfig.main.json` 无输出。
- V4（边界）`git diff --name-only` 只含 `src-main/config.ts`、`src-main/config.test.ts`、`src-main/main.ts`；`dict.ts`、`UpdateModal.vue`、`VramDialog.vue`、`llama-update-client.ts` 零改动。
- V5（真机，`npm run dev`）
  1. 更新弹窗选一个变体 → 下载并安装 → 恰好一条 `llama.cpp · 更新配置已保存`，yaml 出现 `update: {last_llama_type: …}`。
  2. 对**同一变体**再次下载并安装 → 仍有 `下载完成` 等更新日志，但**不再**出现第二条「更新配置已保存」，yaml 的 mtime 不变。
  3. 显存小窗重复保存同一个值 → 文件 mtime 不变。
  4. 把显存改成一个不同的值 → 文件写入新值。
