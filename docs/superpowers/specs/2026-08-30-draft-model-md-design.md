# draft 模型（-md）字段与 dflash/dspark 显存公式 设计规格

状态：已实现（042dfd2）

## 背景

`--spec-draft-n-max` 的显存预测此前只按 draft-mtp 的内建 MTP 头公式计（`n_ctx × kvDim × 4B`）。
但 `draft-dflash` / `draft-dspark` 使用**独立外挂 draft 模型**（`-md` GGUF 文件），额外显存 ≈
draft 模型本体 + 它自己的 KV context，远大于 MTP 头（社区实测 MTP ≈ +2-3GB，DFlash ≈ +5GB）。
launcher 的 `llama_params.yaml` 里根本没有 `-md` 字段，dflash/dspark 无从配置。

## 目标

1. 新增 `-md` 参数（params_file 类型），紧随 `--spec-draft-n-max` 之后。
2. dflash/dspark 的 draft 项改用独立模型公式；mtp 保持现公式。

## 参数定义

| 键 | flag | 类型 | 位置 |
|---|---|---|---|
| md | --spec-draft-model | params_file（gguf 选择器） | spec_draft_n_max 之后 |

`params_file` 追加 `md`。required 仍只有 `m`——md 非必填（mtp 不需要 -md）。

## 显存公式

`estimateUsedBytes` 新增入参（draft 模型信息，main.ts 读 -md 的 stat + GGUF 头后传入）：

- `mdBytes: number`（0 = 无 -md）
- `mdNLayer/mdNEmbD` + 可选 `mdNFullAttentionInterval/mdNHeadCountKV/mdNHeadCount/mdNHeadDim`（draft GGUF 头，命名与主模型一致）

`EstimateResult` 新增 `draftModelBytes: number`（独立行，便于明细展示）。

门控（不变）：`specEnabled = spec_type 非空且 ≠ none`；`nd = spec_draft_n_max > 0`。
`!specEnabled || nd<=0` → 所有 draft 项为 0（含 -md）。

- **draft-mtp**：`draftBytes = nCtx × kvDim × 4 × r`（不变）；-md 忽略（mtp 无外挂模型）。
- **draft-dflash / draft-dspark**：
  - `draftModelBytes = mdBytes × r_md`（-ngld 不在 launcher 参数中 → r_md 恒 1，保守高估）
  - `draftBytes` = 用 **draft 头**（mdNLayer/kvDim）套现有 KV 公式 × nCtx，dtype 沿用主模型 -ctk/-ctv（缺省 f16，保守）
  - **mdBytes=0（dflash 但未填 -md）**：main.ts 降级 `ok:false`（reason 提示需 -md），不估算

`total = model + mmproj + kv + batch + draft + draftModelBytes + fixed`。

## main.ts（vram_estimate）

- 入参加 `md?: string`；仅 spec_type 为 dflash/dspark 才 stat -md + 解析 draft GGUF 头；mtp/none 不读 -md。
- -md 文件不存在 / 非 GGUF / 缺层数维度 → `ok:false`（与 -m 同策略）。

## 渲染端（TemplateModal.vue）

- `VRAM_KEYS` 加 `md`（共 11 键），md 变化触发重估。
- 明细加「draft 模型（-md）」行，`gb = parts.draftModel`（0 项隐藏）。

## 测试

- `config.test`：params 键数 35→36；params_file 断言加 md；flag = `--spec-draft-model`；md 紧随 spec_draft_n_max。
- `vram.test`：dflash/dspark + md → draftModelBytes = mdBytes 且 draftBytes = draft 头 KV > 0；mtp 忽略 md；none/nd=0 时 md 不计入；dflash 无 mdBytes → draft 项 0。
- `TemplateModal.test`：md 进 VRAM_KEYS；parts.draftModel 行展示。

## 非目标

- 不新增 `-ngld` 参数（draft 模型按 100% GPU 计，保守）。
- 不改 -m/mmproj 的既有估算逻辑。