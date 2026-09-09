// GPU 显存数据层（spec 2026-09-09-gpu-card-design §3）。
// 动态层 = 常驻 PowerShell 2 秒计数器采样（gpu-counters.ps1 -Mode dynamic）；
// 静态层 = 启动时一次性 DXGI 枚举（-Mode static，卡名 + 上限 + LUID，缓存）。
// 纯函数（parseGpuStatsJson / mergeGpuStats / formatGb）无 IO，单测见 gpu-stats.test.ts；
// startGpuStats 为 IO 层（spawn），不进单测，由真机验收覆盖（spec §8）。
import { spawn, type ChildProcess } from 'node:child_process';

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
// 真机实测（任务 9，2026-09-10，4090 双卡）：计数器实例名两段 LUID 各带 0x 前缀
// （luid_0x{High}_0x{Low}_phys_N），第二段 0x 可选以兼容 spec 记录的单 0x 写法
const MEM_INST_RE = /^luid_(0x[0-9a-f]{8}_(?:0x[0-9a-f]{8}|[0-9a-f]{8}))_phys_\d+$/i;
const ENG3D_INST_RE = /^pid_\d+_luid_(0x[0-9a-f]{8}_(?:0x[0-9a-f]{8}|[0-9a-f]{8}))_phys_\d+_eng_\d+_engtype_3D$/i;

interface DynSample {
  ded?: Record<string, number>;
  shr?: Record<string, number>;
  eng?: Record<string, number>;
}

// LUID 规范键：动态/静态两层 LUID 串的 32 位段顺序不一致（真机实测 2026-09-10：
// 动态计数器实例名 = 0x{High}_0x{Low} 双 0x；静态 DXGI 输出 = 0x{Low}_{High} 单 0x）。
// 去 0x 后按字典序（等长 8 位 hex，字典序 = 数值序）排序两段，得顺序无关的 join 键。
// 碰撞风险：仅当两个适配器 Low/High 恰为同一段值交换序时发生——LUID 由系统分配，概率 ≈ 0。
export function canonicalLuid(luidRaw: string): string {
  const segs = luidRaw.toLowerCase().replace(/0x/g, '').split('_').filter((s) => /^[0-9a-f]{8}$/.test(s));
  if (segs.length !== 2) return luidRaw.toLowerCase();
  const [a, b] = segs;
  return a <= b ? a + '_' + b : b + '_' + a;
}

// 解析动态层单行 JSON → 按小写 LUID 聚合（同 LUID 多 phys 实例用量取 max 防御；
// 利用率 = 该 LUID 所有 pid 的 engtype_3D 实例取 max；非 3D 引擎实例忽略）
export function parseGpuStatsJson(raw: string): GpuDynamic[] {
  const o: DynSample = JSON.parse(raw);
  const map = new Map<string, GpuDynamic>();
  const ensure = (luidRaw: string): GpuDynamic => {
    const k = luidRaw.toLowerCase(); // 动态层内部键保持原始小写（渲染端 luid 契约不变）；跨层 join 才用 canonicalLuid
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
  const byLuid = new Map(statics.map((s) => [canonicalLuid(s.luid), s]));
  return dyn.map((d, i) => {
    const s = byLuid.get(canonicalLuid(d.luid));
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
// ---------- 常驻采样（IO 层，不进单测） ----------

// 动态层 LUID 集合与静态层是否一致（热插拔检测用）
function sameLuidSet(a: GpuDynamic[], b: GpuStatic[]): boolean {
  const sa = new Set(a.map((x) => canonicalLuid(x.luid)));
  const sb = new Set(b.map((x) => canonicalLuid(x.luid)));
  if (sa.size !== sb.size) return false;
  for (const l of sa) if (!sb.has(l)) return false;
  return true;
}

/**
 * 启动 GPU 采样。onStats 每轮采样（~2 秒）回调一次合并后的 GpuStats[]（数据层负责 merge，
 * 合计行由组件层计算）。返回 stop()：置停止标志并 kill 动态子进程（will-quit / exit_app 调用）。
 *
 * 生命周期规则（spec §3）：
 * - 动态进程异常退出 → 限频重建（每 5 秒至多一次），期间 onStats 不回调，渲染端保留最后数据
 * - 静态层启动查一次并缓存；动态 LUID 集合与静态层不一致且距上次查询 > 30 秒 → 重查一次
 * - 所有诊断经 log 回调（主进程写 sys 日志行），不 console.log
 */
export function startGpuStats(scriptPath: string, onStats: (gpus: GpuStats[]) => void, log: (line: string) => void): () => void {
  let statics: GpuStatic[] = [];
  let lastStaticQuery = 0;
  let stopped = false;
  let proc: ChildProcess | null = null;
  let lastRespawn = 0;
  let respawnTimer: ReturnType<typeof setTimeout> | null = null;

  const psArgs = (mode: string): string[] =>
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Mode', mode];

  function queryStatic(): void {
    lastStaticQuery = Date.now();
    let p: ChildProcess;
    try {
      p = spawn('powershell.exe', psArgs('static'));
    } catch (e) {
      log('GPU 静态查询启动失败：' + (e instanceof Error ? e.message : String(e)));
      return;
    }
    let out = '';
    if (p.stdout) { p.stdout.on('data', (c: Buffer) => { out += c.toString('utf8'); }); }
    p.on('error', (e) => { log('GPU 静态查询失败：' + e.message); });
    p.on('close', (code) => {
      if (stopped) return;
      if (code === 0) {
        try {
          statics = JSON.parse(out.trim()) as GpuStatic[];
        } catch {
          log('GPU 静态查询结果解析失败（卡名/上限回退占位值）');
        }
      } else {
        log('GPU 静态查询异常退出 code=' + code + '（卡名/上限回退占位值）');
      }
    });
  }

  function handleLine(line: string): void {
    let dyn: GpuDynamic[];
    try {
      dyn = parseGpuStatsJson(line);
    } catch {
      return; // 非 JSON 行（脚本诊断等）静默跳过
    }
    // 静态层缺失或 LUID 集合不一致（热插拔，罕见）且距上次查询 >30 秒 → 重查
    if ((statics.length === 0 || !sameLuidSet(dyn, statics)) && Date.now() - lastStaticQuery > 30000) {
      queryStatic();
    }
    onStats(mergeGpuStats(dyn, statics));
  }

  function startProc(): void {
    lastRespawn = Date.now();
    try {
      proc = spawn('powershell.exe', psArgs('dynamic'));
    } catch (e) {
      log('GPU 采样进程启动失败：' + (e instanceof Error ? e.message : String(e)));
      return;
    }
    let buf = '';
    if (proc.stdout) { proc.stdout.on('data', (c: Buffer) => {
      buf += c.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line.length > 0) handleLine(line);
      }
    }); }
    proc.on('error', (e) => { log('GPU 采样进程错误：' + e.message); });
    proc.on('close', () => {
      if (stopped) return;
      const wait = 5000 - (Date.now() - lastRespawn); // 限频：每 5 秒至多重建一次
      if (wait <= 0) startProc();
      else respawnTimer = setTimeout(() => { if (!stopped) startProc(); }, wait);
    });
  }

  startProc();
  queryStatic();

  return (): void => {
    stopped = true;
    if (respawnTimer !== null) clearTimeout(respawnTimer);
    if (proc) {
      try { proc.kill(); } catch { /* 已退出 */ }
    }
  };
}
