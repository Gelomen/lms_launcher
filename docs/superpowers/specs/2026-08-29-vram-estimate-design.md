# 模板弹窗显存占用预测 (VRAM Estimate) 设计

日期:2026-08-29
状态:已批准(用户批注定稿)

## 1. 目标

在「启动参数模板」弹窗的底栏正中,实时预测当前配置将占用的显存,并以
「占用 / 显卡显存 GB」格式展示(如 22.0 / 24.0 GB),按余量变色。显卡显存
总量由用户在安装目录卡片右上角的 VRAM 按钮里配置并持久化。

## 2. 参与计算的参数(仅以下参数影响估算)

| 参数 key | flag | 角色 |
|---|---|---|
| m | -m | 模型主文件(大小 + GGUF 头) |
| mmproj | --mmproj | 视觉投影文件(全量计入) |
| ngl | -ngl | GPU 层数,空 = 100%(llama-server 默认 999) |
| c | -c | 上下文长度,空 = 默认 4096 |
| ctk | -ctk | K cache dtype 系数 |
| ctv | -ctv | V cache dtype 系数 |
| b | -b | 上下文 batch(取 max(b, ub) 的较大值) |
| ub | -ub | 上下文 batch |
| spec_draft_n_max | --spec-draft-n-max | draft 草稿缓存 |

其余参数(port、temp 等)不影响估算;用户在弹窗修改其它参数不会改变数字。

## 3. 计算公式

主进程纯函数,单位字节,最终 ÷ 2³⁰ 得 GB:

- n_layer、n_embd 来自 -m 模型文件的 GGUF 元数据头(只读 magic + tensor 计数 +
  KV 元数据,不读张量数据)。
- dtypeBytes(ctk) = q4_0 → 0.5; q5_0 → 0.625; q8_0 → 1.0; f16 → 2.0(未配置按 2.0)。
- modelBytes = modelFileBytes × r,其中 r = min(ngl ÷ n_layer, 1);ngl 空(未填)→ r = 1;ngl ≤ 0 → r = 0。
  (ngl 超出实际层数按 100% 封顶,如 99/65 不得算 1.52。)
- mmprojBytes = mmproj 文件字节数(未配置 → 0);全量计入,不乘 r。
- kvBytes = nCtx × kvLayers × kvDim × (dtypeBytes(ctk) + dtypeBytes(ctv))。
  kvLayers = ceil(n_layer ÷ full_attention_interval) 若混合注意力(如 qwen3.8-27b: 65 层 / 4 ≈ 17 层),否则 = n_layer;
  kvDim = (head_dim) × head_count_kv,其中 head_dim 优先读 GGUF attention.key_length(如 256),
  无则退回 n_embd ÷ head_count;head_count_kv 为 GQA/MQA 的 KV 头数(如 4),无则按全部注意力头。
  (K 与 V 的 cache 分别按各自 dtype;ngl 占比同样作用于 KV 的 GPU 层部分。)
- batchBytes = max(b, ub) × n_embd × 16 × r,max(b, ub) 为空则不计。(llama.cpp 'CUDA0 compute buffer' 量级)
- draftBytes = nCtx × kvDim × 4 × r（nd > 0 即启用;nd ≤ 0 不计）。独立 MTP draft context：
  llama.cpp 按完整 n_ctx 预留 cell × 1 个 MTP 层 × kvDim,K/V 恒 f16（不跟 -ctk/-ctv）；
  --spec-draft-n-max（nd）只控制每步投机 token 数,不改变分配。实测锚点（Qwen3.6-27B,PR #25465 日志）：
  n_ctx 190464 → CUDA0 KV buffer 744 MiB（1 layers, K+V f16）。
- fixedBytes = GPU_FIXED_BYTES(= 2 GiB),恒定计入(不乘 r)。
  实测锚点(Qwen3.8-27B-Ridge @ RTX4090,nvidia-smi):llama.cpp 进程上 GPU 后恒定占用
  ~1.9GiB——CUDA context + cuBLAS/cuBLASLt workspace + 常驻 compute buffer + KV 块
  scale/pad,与 -c / -b / -ctk 无关。旧五项公式漏算此底座 → Ridge 预测 18.66GB vs
  实测净占 ~20.5GiB。取固定 2 GiB(用户批注 2026-08-30):覆盖底座并留余量,估算可复现。
  tooltip 明示「含约 2GB GPU 固定开销」。
- usedBytes = modelBytes + mmprojBytes + kvBytes + batchBytes + draftBytes + fixedBytes。
- usedGb = usedBytes ÷ 2³⁰。

ngl = 0 → r = 0 → 仅 mmprojBytes 与 batchBytes 中 r 相关项归零;模型/KV/draft 为 0。

## 4. IPC 契约

新增命令 vram_estimate,入参:

{
  m: string,          // -m 路径(必填,可不存在)
  mmproj?: string,
  ngl?: string,
  nCtx?: string,
  ctk?: string,
  ctv?: string,
  b?: string,
  ub?: string,
  specDraftNMax?: string
}

返回:

{ ok: true,  usedGb: number }        // 估算成功
{ ok: false, reason: string }        // 估算失败(文件不存在 / 非 GGUF / 解析失败)

不向渲染端暴露内部字节数;usedGb 由渲染端按 0.1 GB 取一位小数展示。

## 5. 显卡显存总量入口

- 持久化:lms_launcher.yaml 新增字段 vram_total_gb(数字,未配置时字段不存在)。
- UI:「启动参数模板」卡片(TemplateModule)右上角,边框紧贴卡片右上圆角:
  - 14px 文字,本身是可点击按钮;
  - 未配置显示 VRAM;已配置显示如 24GB;
  - 紫色底(与现有 icon 同色调)、白色字。
- 点击弹出小窗口:纯数字输入(GB),保存后写回 vram_total_gb 并关闭。

## 6. 弹窗底栏 VRAM 指示

TemplateModal 底部栏 .modal-actions 正中(左 [删除]、右 [保存] 之间):

- 格式:22.0 / 24.0 GB(两位数字均取一位小数)。
- 显卡显存数字恒蓝色。
- 占用显存数字按余量 total − used:
  - ≥ 2 GB → 绿色;
  - ≥ 1 GB → 橙色;
  - < 1 GB → 红色。
- 状态降级:
  - vram_total_gb 未配置,或估算失败(ok:false)→ 整个指示灰色,显示 --,
    tooltip 给出 reason(估算失败)或提示去配置显卡显存。
- 动态更新:watch 表单 m / mmproj / ngl / c / ctk / ctv / b / ub / spec_draft_n_max
  九键 + vram_total_gb,150ms 防抖 → invoke vram_estimate → 更新数字与颜色。
- tooltip(估算成功档):「余量 X GB(含约 2GB GPU 固定开销:CUDA context + cuBLAS workspace)」。
  说明估算值已计入 GPU 固定运行时开销(§3 fixedBytes = 2 GiB 常量),提示用户实际占用
  比「纯数据量」略高。其它档(未配置/估算失败/未填模型)沿用原 tooltip。

## 7. 测试

- vram.ts 纯函数单测(vitest):
  - GGUF 头解析:构造合法 GGUF Buffer(magic + tensor 计数 + KV)断言 n_layer/n_embd;
  - 公式边界:ngl 空、ngl=0、ngl=999、nCtx 空、各 ctk/ctv 档位、b/ub 取大、
    spec_draft_n_max ≤ 0 不计、mmproj 未配置。
- TemplateModal 组件测试:底栏文本格式(22.0 / 24.0 GB)与三档颜色
  (绿/橙/红)随 used/total 切换;未配置总量时灰色 --。

## 8. 不改动

- llama_params.yaml 参数表、模板数据结构、启动命令拼装、现有 IPC 契约。
