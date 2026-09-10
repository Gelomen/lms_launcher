# gpu-counters.ps1 —— GPU 卡片数据脚本（spec 2026-09-09-gpu-card-design §2/§3）
#   -Mode static  ：一次性 DXGI 枚举（卡名 + 专用/共享上限 + LUID）；专用上限优先 NVML
#                   （与任务管理器 VidMm budget 同源，比 DXGI 高 ~450MB 驱动保留），无 nvml.dll
#                   / 无匹配卡时回退 DXGI 值；stdout 输出单行 JSON 数组（契约不变）
#   -Mode dynamic ：常驻 2 秒循环，采样 \GPU Adapter Memory(*) 与 \GPU Engine(*)\Utilization Percentage，
#                   每轮 stdout 输出单行 JSON：{"ded":{"实例名":字节},"shr":{...},"eng":{"实例名":0-100}}
# 无参数 = dynamic。stdout 只写 JSON；诊断信息一律走 stderr。
param([string]$Mode = 'dynamic')
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

if ($Mode -eq 'static') {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class GpuStaticProbe
{
    public delegate int CreateFactory1(IntPtr iid, IntPtr outPtr);
    public delegate int EnumAdapters1(IntPtr self, int idx, IntPtr outPtr);
    public delegate int GetDesc(IntPtr self, IntPtr buf);
    public delegate int Release(IntPtr self);
    public delegate int NvmlInit();
    public delegate int NvmlCnt(IntPtr p);
    public delegate int NvmlGetH(int idx, IntPtr p);
    public delegate int NvmlGetName(IntPtr h, IntPtr p, int sz);
    public delegate int NvmlGetMem(IntPtr h, IntPtr p);

    // DXGI_ADAPTER_DESC 真实布局（304 字节，已踩坑验证，字段类型不可改）：
    // WCHAR Description[128] @0、UINT VendorId/DeviceId/SubSysId/Revision @256-271、
    // SIZE_T(8B) DedicatedVideoMemory @272 / DedicatedSystemMemory @280 / SharedSystemMemory @288、LUID @296
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct ADAPTER_DESC
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string Description;
        public uint VendorId;
        public uint DeviceId;
        public uint SubSysId;
        public uint Revision;
        public ulong DedicatedVideoMemory;
        public ulong DedicatedSystemMemory;
        public ulong SharedSystemMemory;
        public int LuidLow;
        public uint LuidHigh;
    }

    // NVML_MEMORY（nvmlDeviceGetMemoryInfo 出参）：Total/Free/Used 各 8B
    [StructLayout(LayoutKind.Sequential)]
    public struct NVMEM
    {
        public ulong Total;
        public ulong Free;
        public ulong Used;
    }

    public static string Run()
    {
        try
        {
            var dx = new System.Collections.Generic.List<ADAPTER_DESC>();
            IntPtr dxgi = GetModuleHandle("dxgi.dll");
            if (dxgi == IntPtr.Zero) dxgi = LoadLibrary("dxgi.dll");
            IntPtr pCreate = GetProcAddress(dxgi, "CreateDXGIFactory1");
            if (pCreate != IntPtr.Zero)
            {
                var del = (CreateFactory1)Marshal.GetDelegateForFunctionPointer(pCreate, typeof(CreateFactory1));
                Guid iid = new Guid("770aae78-f26f-4dba-a829-253c83d1b387");
                IntPtr iidBuf = Marshal.AllocHGlobal(16);
                Marshal.StructureToPtr(iid, iidBuf, false);
                IntPtr fa = Marshal.AllocHGlobal(8);
                int hr = del(iidBuf, fa);
                IntPtr factoryPtr = Marshal.ReadIntPtr(fa);
                Marshal.FreeHGlobal(fa); Marshal.FreeHGlobal(iidBuf);
                if (hr == 0 && factoryPtr != IntPtr.Zero)
                {
                    IntPtr vt = Marshal.ReadIntPtr(factoryPtr);
                    var fnEnum = (EnumAdapters1)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(vt, 12 * 8), typeof(EnumAdapters1));
                    var fnRelF = (Release)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(vt, 2 * 8), typeof(Release));
                    for (int i = 0; i < 8; i++)
                    {
                        IntPtr aAddr = Marshal.AllocHGlobal(8);
                        int hrE = fnEnum(factoryPtr, i, aAddr);
                        if (hrE != 0) { Marshal.FreeHGlobal(aAddr); break; }
                        IntPtr a = Marshal.ReadIntPtr(aAddr);
                        Marshal.FreeHGlobal(aAddr);
                        IntPtr avt = Marshal.ReadIntPtr(a);
                        var fnDesc = (GetDesc)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(avt, 8 * 8), typeof(GetDesc));
                        var fnRel = (Release)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(avt, 2 * 8), typeof(Release));
                        IntPtr descBuf = Marshal.AllocHGlobal(304);
                        int hrD = fnDesc(a, descBuf);
                        if (hrD == 0) dx.Add((ADAPTER_DESC)Marshal.PtrToStructure(descBuf, typeof(ADAPTER_DESC)));
                        Marshal.FreeHGlobal(descBuf);
                        fnRel(a);
                    }
                    fnRelF(factoryPtr);
                }
            }

            // NVML 专用上限（与任务管理器 VidMm 的 budget 同源，比 DXGI DedicatedVideoMemory 高 ~450MB 驱动保留）。
            // 按卡名匹配；nvml.dll 不存在 / 初始化失败 / 无匹配 → 该卡回退 DXGI 值（跨厂商通用）。
            var nvml = new System.Collections.Generic.Dictionary<string, ulong>();
            IntPtr lib = LoadLibrary("nvml.dll");
            if (lib != IntPtr.Zero)
            {
                IntPtr pInit = GetProcAddress(lib, "nvmlInit_v2");
                IntPtr pCnt = GetProcAddress(lib, "nvmlDeviceGetCount_v2");
                IntPtr pH = GetProcAddress(lib, "nvmlDeviceGetHandleByIndex_v2");
                IntPtr pName = GetProcAddress(lib, "nvmlDeviceGetName");
                IntPtr pMem = GetProcAddress(lib, "nvmlDeviceGetMemoryInfo");
                if (pInit != IntPtr.Zero && pCnt != IntPtr.Zero && pH != IntPtr.Zero && pName != IntPtr.Zero && pMem != IntPtr.Zero)
                {
                    var init = (NvmlInit)Marshal.GetDelegateForFunctionPointer(pInit, typeof(NvmlInit));
                    var cntFn = (NvmlCnt)Marshal.GetDelegateForFunctionPointer(pCnt, typeof(NvmlCnt));
                    var getH = (NvmlGetH)Marshal.GetDelegateForFunctionPointer(pH, typeof(NvmlGetH));
                    var nameFn = (NvmlGetName)Marshal.GetDelegateForFunctionPointer(pName, typeof(NvmlGetName));
                    var memFn = (NvmlGetMem)Marshal.GetDelegateForFunctionPointer(pMem, typeof(NvmlGetMem));
                    if (init() == 0)
                    {
                        IntPtr cp = Marshal.AllocHGlobal(4);
                        if (cntFn(cp) == 0)
                        {
                            int n = Marshal.ReadInt32(cp);
                            for (int i = 0; i < n; i++)
                            {
                                IntPtr hp = Marshal.AllocHGlobal(4);
                                if (getH(i, hp) == 0)
                                {
                                    IntPtr h = Marshal.ReadIntPtr(hp);
                                    IntPtr np = Marshal.AllocHGlobal(256);
                                    if (nameFn(h, np, 256) == 0)
                                    {
                                        string nm = Marshal.PtrToStringAnsi(np).Trim();
                                        IntPtr mp = Marshal.AllocHGlobal(24);
                                        if (memFn(h, mp) == 0)
                                        {
                                            var mi = (NVMEM)Marshal.PtrToStructure(mp, typeof(NVMEM));
                                            if (!nvml.ContainsKey(nm)) nvml[nm] = mi.Total;
                                        }
                                        Marshal.FreeHGlobal(mp);
                                    }
                                    Marshal.FreeHGlobal(np);
                                }
                                Marshal.FreeHGlobal(hp);
                            }
                        }
                        Marshal.FreeHGlobal(cp);
                    }
                }
            }

            var sb = new StringBuilder();
            sb.Append("[");
            bool first = true;
            foreach (var d in dx)
            {
                string luidStr = string.Format("0x{0:x8}_{1:x8}", (uint)d.LuidLow, d.LuidHigh);
                string rawName = d.Description == null ? "" : d.Description.Trim();
                ulong ded = d.DedicatedVideoMemory;
                ulong t = 0;
                if (ded == 0 || nvml.TryGetValue(rawName, out t))
                {
                    if (t > 0) ded = t;
                }
                if (!first) sb.Append(",");
                first = false;
                sb.Append("{");
                sb.Append(Q() + "luid" + Q() + ":" + Q() + luidStr + Q() + ",");
                sb.Append(Q() + "name" + Q() + ":" + Q() + EscapeJson(rawName) + Q() + ",");
                sb.Append(Q() + "dedicatedTotal" + Q() + ":" + ded.ToString());
                sb.Append("," + Q() + "sharedTotal" + Q() + ":" + d.SharedSystemMemory.ToString());
                sb.Append("}");
            }
            sb.Append("]");
            return sb.ToString();
        }
        catch
        {
            return "[]";
        }
    }

    static string Q() { return ((char)34).ToString(); }

    // JSON 转义：反斜杠 → 双反斜杠；双引号 → 反斜杠双引号
    static string EscapeJson(string s)
    {
        string bs = ((char)92).ToString();
        string q = Q();
        return s.Replace(bs, bs + bs).Replace(q, bs + q);
    }

    [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string n);
    [DllImport("kernel32.dll")] static extern IntPtr LoadLibrary(string n);
    [DllImport("kernel32.dll")] static extern IntPtr GetProcAddress(IntPtr h, string n);
}
"@
    [GpuStaticProbe]::Run()
    exit 0
}

# dynamic：常驻 2 秒循环（stdout 只写 JSON 行）
while ($true) {
    try {
        $mem = Get-Counter -Counter '\GPU Adapter Memory(*)\Dedicated Usage', '\GPU Adapter Memory(*)\Shared Usage' -MaxSamples 1 -ErrorAction Stop
        $eng = Get-Counter -Counter '\GPU Engine(*)\Utilization Percentage' -MaxSamples 1 -ErrorAction Stop
        $ded = @{}; $shr = @{}; $u = @{}
        foreach ($s in $mem.CounterSamples) {
            $cn = $s.Path.Split('\')[-1]
            if ($cn -eq 'Dedicated Usage') { $ded[$s.InstanceName] = [long]$s.CookedValue }
            elseif ($cn -eq 'Shared Usage') { $shr[$s.InstanceName] = [long]$s.CookedValue }
        }
        foreach ($s in $eng.CounterSamples) {
            $cn = $s.Path.Split('\')[-1]
            if ($cn -eq 'Utilization Percentage') { $u[$s.InstanceName] = [long]$s.CookedValue }
        }
        Write-Output (ConvertTo-Json ([ordered]@{ ded = $ded; shr = $shr; eng = $u }) -Compress -Depth 5)
    } catch {
        Write-Error ('gpu sample failed: ' + $_.Exception.Message)
    }
    Start-Sleep -Seconds 2
}
