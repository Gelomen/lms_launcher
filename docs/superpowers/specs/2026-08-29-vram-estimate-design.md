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
- modelBytes = modelFileBytes × r,其中 r = ngl ÷ n_layer;ngl 空(未填)或 ≥999 → r = 1。
- mmprojBytes = mmproj 文件字节数(未配置 → 0);全量计入,不乘 r。
- kvBytes = 2 × nCtx × n_layer × n_embd × (dtypeBytes(ctk) + dtypeBytes(ctv)) ÷ 2 × r。
  (K 与 V 的 cache 分别按各自 dtype;ngl 占比同样作用于 KV 的 GPU 层部分。)
- batchBytes = n_embd × n_layer × r × 16,max(b, ub) 为空则不计。
- draftBytes = 2 × nDraftMax × n_layer × n_embd × dtypeBytes(ctk) × r,nDraftMax ≤ 0 不计。
- usedBytes = modelBytes + mmprojBytes + kvBytes + batchBytes + draftBytes。
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
- UI:安装目录卡片(DirModule)右上角,边框紧贴卡片右上圆角:
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

## 7. 测试

- vram.ts 纯函数单测(vitest):
  - GGUF 头解析:构造合法 GGUF Buffer(magic + tensor 计数 + KV)断言 n_layer/n_embd;
  - 公式边界:ngl 空、ngl=0、ngl=999、nCtx 空、各 ctk/ctv 档位、b/ub 取大、
    spec_draft_n_max ≤ 0 不计、mmproj 未配置。
- TemplateModal 组件测试:底栏文本格式(22.0 / 24.0 GB)与三档颜色
  (绿/橙/红)随 used/total 切换;未配置总量时灰色 --。

## 8. 不改动

- llama_params.yaml 参数表、模板数据结构、启动命令拼装、现有 IPC 契约。
