# 变更：GPU 卡片专用显存上限改 NVML 来源（对齐任务管理器）

日期：2026-09-10
状态：已实施（真机验收通过，npm test 353 全绿，npm run build 通过）
关联规格：`docs/superpowers/specs/2026-09-09-gpu-card-design.md` §2.2/§8（同日修订）

## 背景与用户诉求

用户要求 GPU 卡片「总显存量」分母与 Windows 任务管理器「性能 → GPU」完全一致：

| 字段 | 任务管理器 | 卡片（修复前） | 卡片（修复后） |
|---|---|---|---|
| 专用 GPU 内存 | 23.2 / 24.0 GB | 23.2 / 23.6 GB（错） | 23.2 / 24.0 GB（对） |
| GPU 内存（合计） | 24.1 / 71.7 GB | 24.1 / 71.3 GB（错） | 24.1 / 71.7 GB（对） |

## 根因

- 任务管理器的专用 total 来自 D3DKMT/VidMm 的「budget」（4090 实测 25757220864 B = 23.988 GiB，formatGb 1 位小数 → 24.0）。
- 原静态层用 DXGI IDXGIAdapter::GetDesc.DedicatedVideoMemory（4090 实测 25310527488 B = 23.57 GiB → 23.6）。该值是**扣掉驱动/BIOS 保留区后的可分配量**，恒比 VidMm budget 低 ~450 MB。这是规格 §2.2 早已记录的「已知偏差」，§8 当时容差 ≤0.5 GB；用户现要求精确一致，容差作废。
- D3DKMT 直连在本机不可行（规格 §6 已排除）：正确布局（hProcess@8 / hAdapter@16 / group@24 / Budget@28…56B）下 D3DKMTOpenAdapter 成功后 D3DKMTQueryVideoMemoryInfo 仍 0xC000000D，D3DKMTQueryAdapterInfo Type=5 仍 0xC0000017；D3DKMTQueryAdapters 未导出（995 个导出名核查）。证据：.temp/d3dkmt-probe4/5.ps1、.temp/d3dkmt-vmi-*.ps1、.temp/d3dkmt-qai-probe.ps1。

## 方案：静态层专用上限优先 NVML

- nvml.dll（C:\Windows\System32\）的 nvmlDeviceGetMemoryInfo.Total 与 VidMm budget **同源同值**（4090 实测 25757220864 B，与任务管理器逐位一致）。
- src-main/gpu-counters.ps1 的 -Mode static 分支：DXGI 枚举保留（LUID + 卡名 + 共享上限照旧），新增 NVML 探测块（nvmlInit_v2 / nvmlDeviceGetCount_v2 / nvmlDeviceGetHandleByIndex_v2 / nvmlDeviceGetName / nvmlDeviceGetMemoryInfo，全部 GetProcAddress 动态解析）。
- 匹配规则：NVML 卡名与 DXGI Description 均 Trim() 后**精确匹配**；DXGI 专用值为 0 且 NVML 无同名卡时保持 0（软件渲染器不误套）。
- 回退：无 nvml.dll / 初始化失败 / 无匹配卡 → 专用上限用 DXGI 值（AMD/Intel 跨厂商路径不变）；共享上限恒 DXGI。
- **输出契约不变**：仍是单行 JSON [{luid,name,dedicatedTotal,sharedTotal}]；TS 数据层（gpu-stats.ts）与渲染端（GpuModule.vue）零改动。
- NVML 仅静态层用（启动一次），不引入 2 秒轮询开销。

## 实测证据（开发机，2026-09-10）

    powershell -NoProfile -ExecutionPolicy Bypass -File src-main/gpu-counters.ps1 -Mode static
    [{"luid":"0x00010e4e_00000000","name":"NVIDIA GeForce RTX 4090","dedicatedTotal":25757220864,"sharedTotal":51208310784},{"luid":"0x00012919_00000000","name":"Microsoft Basic Render Driver","dedicatedTotal":0,"sharedTotal":51208310784}]

- 25757220864 B → formatGb → 24.0 GB；合计 25757220864+51208310784 → 71.7 GB，与任务管理器一致。
- 中间产物：.temp/nvml-probe.ps1（NVML 布局验证）、.temp/static-verify.ps1（DXGI+NVML 合并端到端验证，含 _src 溯源字段）。

## 踩坑记录（供后续维护）

1. **PowerShell here-string 文件行尾必须统一**：gpu-counters.ps1 原为 CRLF，用 LF 增量改写后行尾混杂 → PS 解析器降级为受限语法模式（1>&2 报 reserved、param 位置错乱、行号偏移），$Mode 分支静默失效、脚本掉进 dynamic 循环。统一回 CRLF 后恢复。后续改该文件必须保持 CRLF。
2. C#（PS 5.1 Add-Type，C# 5 语法）：无内联 out 变量声明（out ulong t 非法）；ded==0 || TryGetValue(name, out t) 短路时 t 未赋值 → 必须 ulong t = 0; 初始化；C# 字符串里 JSON 引号转义容易踩坑，改用 char(34) 拼接 + StringBuilder。
3. Add-Type 的 C# 注释保持 ASCII（中文注释经 here-string 落盘后编译期乱码报错）。

## 验收

- [x] static 模式输出 4090 专用上限 = 25757220864（→ 24.0 GB）
- [x] npm test 353/353 通过（gpu-stats / GpuModule fixture 不变，契约未破）
- [x] npm run build（vite + tsc main）通过
- [x] 规格 §2.2/§8 同步修订

## 不做的事

- 不动 TS 数据层 / 渲染端（契约不变，无需）
- 不做 AMD/Intel 的 VidMm budget 等价来源（DXGI 回退值可接受；如后续 A 卡用户报偏差再评估）
- 不做 NVML 动态层（温度/功耗仍属规格 §6 不做项）
