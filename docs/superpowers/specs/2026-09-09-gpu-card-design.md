# GPU 显存卡片 设计规格

日期：2026-09-09（2026-09-10 修订 §2.2/§8：专用上限改 NVML，精确对齐任务管理器）
状态：已实现（2026-09-09 通过审查并落地；2026-09-10 修订专用上限数据源）

## 1. 目标

新增一张卡片，实时显示系统 GPU 显存相关信息，字段与口径对齐 Windows 任务管理器「性能 → GPU」：

- 利用率（百分比，整数）
- 专用 GPU 内存（used/total，GB，1 位小数）
- GPU 内存（合计行 = 专用 + 共享，used/total）
- 共享 GPU 内存（used/total）

**不含温度**（用户明确砍掉）。

## 2. 数据源（全部已在本机实测验证）

**代码不硬编码任何 LUID / 卡名 / 显存值。** 下列开发机 LUID 仅为实测证据（证明双卡场景已验证过），运行时代码全部来自运行时枚举，换任意配置机器（单卡 / 核显 / A 卡 / 多卡）无需改代码：

开发机（实测环境）：双 LUID（0x0000edff = RTX 4090，0x00010f23 = Microsoft Basic Render Driver），Win11。数据分两层：

### 2.1 动态层（每 2 秒，任务管理器同款计数器）

| 数据 | 计数器路径（MultiInstance） | 说明 |
|---|---|---|
| 专用显存用量 | \GPU Adapter Memory(*)\Dedicated Usage | 字节，实例名 `luid_0x{High}_0x{Low}_phys_N`（真机两段各带 0x 前缀，2026-09-09 真机实证；部分来源为裸 hex，解析器两者兼容） |
| 共享显存用量 | \GPU Adapter Memory(*)\Shared Usage | 字节，同上 |
| 利用率 | \GPU Engine(*)\Utilization Percentage | 实例名 `pid_X_luid_0x{High}_0x{Low}_phys_N_eng_M_engtype_3D`（同双 0x 前缀），0-100 |

- 该 LUID 下所有 pid 的 engtype_3D 实例取 max（GPU 级口径，与任务管理器一致）；无 3D 引擎实例的卡利用率取 0
- 卡列表 = 计数器实例名里的 LUID 集合（动态，能感知热插拔）
- LUID 大小写不统一（见过 0x0000EDFF 与 0x0000edff），匹配前统一转小写
- 属性/计数器名恒为英文，不受系统语言影响

### 2.2 静态层（启动时一次，DXGI 枚举 + NVML 专用上限）

专用/共享**上限**没有公开文档化的标准接口（任务管理器内部用 D3DKMT，未逆向成功——D3DKMTQueryVideoMemoryInfo 参数校验在本机失败 0xC000000D，且函数表按名导出需 PE 解析，路径脆弱，放弃；2026-09-10 用正确结构体布局重验仍失败，维持放弃结论）。**DXGI** 负责一次调用拿到 LUID + 卡名 + 共享上限（天然解决多卡关联）；**专用上限**额外从 **NVML**（`nvml.dll`，`nvmlDeviceGetMemoryInfo.Total`）取值——它与任务管理器 VidMm 的 budget 同源（4090 实测两者均为 25757220864 B），而 DXGI `DedicatedVideoMemory` 是扣掉驱动保留区后的可分配量（少 ~450 MB），是原 23.6 vs 24.0 偏差的根因（变更见 `docs/superpowers/changes/2026-09-10-gpu-dedicated-total-nvml.md`）：

- 专用上限匹配：NVML 卡名（`nvmlDeviceGetName`，ASCII）与 DXGI 卡名（`Description`）`Trim()` 后精确匹配；DXGI 专用值为 0（软件渲染器等）且 NVML 无同名卡时也回退 0，不误套
- 跨厂商：AMD/Intel 机器无 `nvml.dll`（或 NVML 初始化失败）→ 专用上限自动回退 DXGI 值，共享上限恒取 DXGI，无厂商分支
- NVML 仅参与静态层（启动一次），不引入轮询开销

- CreateDXGIFactory1（IID 770aae78-f26f-4dba-a829-253c83d1b387 = IDXGIFactory1）→ EnumAdapters1（factory vtable slot 12）逐卡枚举 → IDXGIAdapter::GetDesc（slot 8）
- DXGI_ADAPTER_DESC 真实布局（304 字节，字段类型猜错会越界崩溃，已踩坑验证）：WCHAR Description[128]、UINT VendorId/DeviceId/SubSysId/Revision、SIZE_T(8 字节) DedicatedVideoMemory/DedicatedSystemMemory/SharedSystemMemory、LUID AdapterLuid
- 返回：卡名（英文全称）、专用上限、共享上限、LUID

实测输出（开发机，2026-09-10 更新；LUID 随机器/驱动变化，仅示例）：

| LUID | 卡名 | 专用上限 | 共享上限 |
|---|---|---|---|
| 0x00010e4e | NVIDIA GeForce RTX 4090 | 25757220864 B（24.0 GiB，NVML） | 51208310784 B（47.7 GiB，DXGI） |
| 0x00012919 | Microsoft Basic Render Driver | 0（DXGI，NVML 无同名卡） | 51208310784 B |

- 跨厂商：NVIDIA/AMD/Intel 通用（VendorId 区分：0x10DE / 0x1002 / 0x8086），无厂商分支
- 上限为静态值，启动查一次并缓存；动态层 LUID 集合与静态层不一致时（热插拔，罕见）重查一次（限频 30 秒）
- 容错：DXGI 查询失败时，卡名回退 "GPU 序号"、上限回退 0（UI 显示 "–"），动态数据照常
- 专用上限取 NVML（VidMm budget 同源）→ 4090 与任务管理器逐位一致（24.0）；无 NVML 的机器回退 DXGI 值（仍比任务管理器低 ~450 MB 驱动保留区），验收口径见 §8

### 2.3 合并规则（跨机器通用性）

- **卡列表以动态层为准**：计数器出现过的 LUID 才构成卡片条目。某些机器上 DXGI 会枚举出无 GPU Adapter Memory 实例的虚拟/遗留适配器——这类 LUID 只存在于静态层，**不显示**（避免空卡噪音）
- 静态层按顺序无关 canonicalLuid join 到动态层（真机动态层段序 0x{High}_0x{Low} 与静态层 0x{Low}_{High} 相反，join 键须排序归一；小写 + 去 0x 前缀）：卡名 + 专用/共享上限；join 不上（罕见）→ 卡名回退 "GPU 序号"、上限回退 0（UI 显示 "–"），动态用量照常
- 开发机上两个 LUID 都有计数器实例，故双卡都会显示；单卡机器只有 1 条——这是同一套规则的运行时结果，无分支逻辑

## 3. 数据层（src-main/gpu-stats.ts，新增）

- 动态：child_process.spawn 常驻 PowerShell（-NoProfile），每 2 秒查一次 \GPU Adapter Memory(*) 与 \GPU Engine(*)\Utilization Percentage 两组计数器，转 JSON 写 stdout
- 静态：启动时一次短命 spawn（同一 .ps1 脚本，Add-Type C# P/Invoke 调 DXGI，见 §2.2），输出 [{luid, name, dedicatedTotal, sharedTotal}] JSON；结果缓存
- 纯函数（可单测，无 IO）：
  - parseGpuStatsJson(raw: string): GpuDynamic[]——解析动态计数器 JSON，按 LUID 聚合（用量求值、利用率取 max）
  - mergeGpuStats(dyn: GpuDynamic[], statics: GpuStatic[]): GpuStats[]——按顺序无关 canonicalLuid 合并静态名/上限，动态有而静态无 → 回退命名 + 上限 0
  - formatGb(bytes: number): string——字节 → "22.7 GB"（1024 进制，1 位小数，对齐任务管理器）；bytes ≤ 0 → "–"
- 推送结构（每轮采样约 2 秒，一次 webContents.send）：

export interface GpuStats {
  luid: string;              // 小写 luid 串（真机双 0x 形状 0x00000000_0x00010fbf；字符串不透明键，组件不解析）
  name: string;              // DXGI 卡名；失败回退 "GPU " + 序号
  utilization: number;       // 0-100
  dedicatedUsed: number;     // 字节
  dedicatedTotal: number;
  sharedUsed: number;
  sharedTotal: number;
}

- 合计行 = dedicatedUsed + sharedUsed / dedicatedTotal + sharedTotal（组件层计算，不在数据层）
- 所有卡持续采样，不做暂停；常驻进程异常退出 → 静默重建（限频：每 5 秒至多一次），期间保留最后一次推送的数据
- 排序：保持计数器返回的稳定顺序，不做厂商/显存排序
- before-quit / 应用退出时 kill 子进程

## 4. IPC 桥

- 主进程 → 渲染端事件 gpu-stats（payload: GpuStats[]），仿 log-line 模式：
  - src-main/preload.ts：白名单加 onGpuStats(cb): () => void
  - src/ipc.ts：export function onGpuStats(cb: (e: { gpus: GpuStats[] }) => void): () => void + GpuStats 类型导出
- 无 invoke 通道（纯推送，无请求-响应）

## 5. UI（src/modules/GpuModule.vue，新增）

挂载位置：src/App.vue 左侧 .stack 内，DirModule 之后、LaunchBar 之前。

### 5.1 版式

┌──────────────────────────────────────────┐
│  ‹   当前卡名（标题行，始终显示）        ›  │
│      利用率            专用 GPU 内存       │
│      28 %              22.7/24.0 GB     │
│      GPU 内存          共享 GPU 内存      │
│      23.5/71.7 GB      0.8/47.7 GB      │
│               ● ○ ○                     │
└──────────────────────────────────────────┘

- 标题行：当前卡名始终显示（单卡也显示，用户指定）
- 多卡时：‹ 按钮贴卡片**左边缘**、› 按钮贴**右边缘**（左右各占一边，纵向居中，用户指定）；单卡时两个按钮都不渲染
- 有按钮时内容区左右各让出按钮宽度（padding 或 flex 预留），避免与内容重叠
- 四格数值区：2×2 网格，标签小字 + 数值大字，复用现有 .card 内部既有排版类
- 底部指示点：N 张卡 = N 个圆点；当前卡 = 实心灰点，其余 = 灰色空心（描边）点。纯展示，不可点击（切换只走 ‹ ›）
- 首帧数据到达前：标题显示 "…"，四格数值位置显示 "…"，无圆点

### 5.2 轮播与动画

- 组件状态 index（当前卡下标），数据 GpuStats[] 由 onGpuStats 订阅更新
- 点 ›：目标 (index+1) % N；点 ‹：目标 (index+N-1) % N。无论卡数一律模运算绕回（用户指定：单一循环逻辑，不分支卡数）
- 动画：内容区两张绝对定位层（当前层 currentLayer / 目标层 nextLayer）。
  - 点 ›：当前层 translateX(0 → -100%)，目标层 translateX(100% → 0)
  - 点 ‹：方向相反（0 → +100%，-100% → 0）
  - 时长 ~200ms，ease-out；切换结束（transitionend 或 setTimeout）后隐藏闲置层、重置 transform
- 数据刷新不触发动画（只有点击触发）；切换过程中新数据到达：写入对应层数据即可，不打断动画
- 连续快速点击：以最后一次点击的目标为准，当前动画直接跳到该目标位置继续（实现上：点击时先立即把中间状态归位，再对新目标跑动画）
- 卡数组长度变化（如热插拔，罕见）：index 越界时钳回 0

### 5.3 样式

- 复用 .card 容器；内部新增 scoped 类：.gpu-title-row、.gpu-nav-btn / .gpu-nav-btn--left / .gpu-nav-btn--right、.gpu-grid、.gpu-dots、.dot / .dot--active
- 圆点 8px，实心 fill: var(--gray-...)（取现有调色板变量）；空心为同色 1.5px 描边、透明填充
- 裁切容器 = GPU 卡的 .card（App.vue 给该类加 .card--gpu，overflow:hidden）：滑动动画期间 ±100% 屏外层的四格内容裁在**卡片边框**处（而非内容区）（用户 2026-09-10 两轮指定，见 docs/superpowers/changes/2026-09-10-gpu-slide-overflow-fix.md）

## 6. 不做的事（YAGNI）

- 温度 / 功率 / 风扇（本期不做，GpuStats 结构留扩展位）
- 圆点点击切换、键盘左右键切换
- 采样间隔配置（固定 2 秒）
- 托盘悬浮窗展示
- D3DKMT 直连（已验证不可靠，§2.2）

## 7. 测试

- src-main/gpu-stats.test.ts（纯函数，无 IO）：
  - parseGpuStatsJson：单卡 / 多卡（双 LUID）/ 空结果 / 利用率取 max / 非 3D 引擎实例忽略 / LUID 大小写归一
  - mergeGpuStats：静态缺失回退（命名 + 上限 0）、LUID 匹配、动态新增 LUID、仅静态层存在的 LUID 被过滤（不显示）
  - formatGb：0（→ "–"）、非整 GB、1 位小数进位
- src/modules/GpuModule.test.ts：
  - 首帧占位 "…"
  - 数据到达后四格数值 + 合计行正确
  - 单卡：无 ‹ › 按钮，单点实心
  - 多卡：N 个圆点、当前实心其余空心；点 › 后 index 前进、点 ‹ 回绕（2 卡与 3 卡各验一次模运算）
  - 动画断言只验证层 transform 类名切换，不测时长
- DXGI/计数器脚本为 IO 层，不进单测；由 §8 真机验收覆盖

## 8. 验收

- 开发机（双 LUID）npm run dev 启动：卡片显示两颗卡、可轮播切换
- 与任务管理器「性能 → GPU」页逐字段对照：
  - 利用率、专用/共享/合计的 used 值：一致（±1 位小数舍入）
  - 专用/共享 total 值：与任务管理器一致（专用上限取 NVML = VidMm budget 同源，4090 实测 24.0 逐位一致；无 NVML 的机器回退 DXGI 值，容差 ≤ 0.5 GB 驱动保留区偏差）
- 单卡机器逻辑由单测覆盖（mergeGpuStats 单卡用例 + 组件单卡用例）
- npm test 全绿；npm run build 通过
