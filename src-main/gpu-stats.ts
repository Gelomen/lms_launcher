// GPU 显存数据层（spec 2026-09-09-gpu-card-design §3）。
// 动态层 = 常驻 PowerShell 2 秒计数器采样（gpu-counters.ps1 -Mode dynamic）；
// 静态层 = 启动时一次性 DXGI 枚举（-Mode static，卡名 + 上限 + LUID，缓存）。
// 纯函数（parseGpuStatsJson / mergeGpuStats / formatGb）无 IO，单测见 gpu-stats.test.ts；
// startGpuStats 为 IO 层（spawn），不进单测，由真机验收覆盖（spec §8）。
export interface GpuDynamic {
  luid: string; // 小写 luid 串（0x%08x_%08x）
  dedicatedUsed: number; // 字节
  sharedUsed: number;    // 字节
  utilization: number;   // 0-100
}
export interface GpuStatic {
  luid: string; // 小写 luid 串
  name: string;
  dedicatedTotal: number; // 字节
  sharedTotal: number;    // 字节
}
export interface GpuStats {
  luid: string;
  name: string; // DXGI 卡名；join 不上回退 "GPU " + 序号
  utilization: number;
  dedicatedUsed: number;
  dedicatedTotal: number;
  sharedUsed: number;
  sharedTotal: number;
}

// 计数器实例名格式（spec §2.1，已实测）：
//   GPU Adapter Memory：luid_0x%08x_%08x_phys_N
//   GPU Engine：        pid_X_luid_0x%08x_%08x_phys_N_eng_M_engtype_3D
const MEM_INST_RE = /^luid_(0x[0-9a-f]{8}_[0-9a-f]{8})_phys_\d+$/i;
const ENG3D_INST_RE = /^pid_\d+_luid_(0x[0-9a-f]{8}_[0-9a-f]{8})_phys_\d+_eng_\d+_engtype_3D$/i;

interface DynSample {
  ded?: Record<string, number>;
  shr?: Record<string, number>;
  eng?: Record<string, number>;
}

// 解析动态层单行 JSON → 按小写 LUID 聚合（同 LUID 多 phys 实例用量取 max 防御；
// 利用率 = 该 LUID 所有 pid 的 engtype_3D 实例取 max；非 3D 引擎实例忽略）
export function parseGpuStatsJson(raw: string): GpuDynamic[] {
  const o: DynSample = JSON.parse(raw);
  const map = new Map<string, GpuDynamic>();
  const ensure = (luidRaw: string): GpuDynamic => {
    const k = luidRaw.toLowerCase();
    let d = map.get(k);
    if (!d) { d = { luid: k, dedicatedUsed: 0, sharedUsed: 0, utilization: 0 }; map.set(k, d); }
    return d;
  };
  const collectMem = (section: Record<string, number> | undefined, field: 'dedicatedUsed' | 'sharedUsed'): void => {
    for (const [inst, v] of Object.entries(section ?? {})) {
      const m = MEM_INST_RE.exec(inst);
      if (!m || typeof v !== 'number' || !Number.isFinite(v)) continue;
      const d = ensure(m[1]);
      d[field] = Math.max(d[field], v);
    }
  };
  collectMem(o.ded, 'dedicatedUsed');
  collectMem(o.shr, 'sharedUsed');
  for (const [inst, v] of Object.entries(o.eng ?? {})) {
    const m = ENG3D_INST_RE.exec(inst);
    if (!m || typeof v !== 'number' || !Number.isFinite(v)) continue;
    const d = ensure(m[1]);
    d.utilization = Math.max(d.utilization, v);
  }
  return [...map.values()];
}

// 合并规则（spec §2.3）：卡列表以动态层为准、保持动态层顺序；静态层按小写 LUID join 补
// 卡名 + 上限；join 不上 → 回退命名 "GPU 序号"（按动态层下标 +1）+ 上限 0（UI 显示 "–"）；
// 仅静态层存在的 LUID 被过滤（不显示，避免虚拟/遗留适配器空卡噪音）。
export function mergeGpuStats(dyn: GpuDynamic[], statics: GpuStatic[]): GpuStats[] {
  const byLuid = new Map(statics.map((s) => [s.luid.toLowerCase(), s]));
  return dyn.map((d, i) => {
    const s = byLuid.get(d.luid);
    return {
      luid: d.luid,
      name: s ? s.name : 'GPU ' + (i + 1),
      utilization: d.utilization,
      dedicatedUsed: d.dedicatedUsed,
      dedicatedTotal: s ? s.dedicatedTotal : 0,
      sharedUsed: d.sharedUsed,
      sharedTotal: s ? s.sharedTotal : 0,
    };
  });
}

// 字节 → "22.7 GB"（1024 进制，1 位小数，对齐任务管理器）；bytes ≤ 0 → "–"（上限回退 0 的占位）
export function formatGb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '–';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}
