# gpu-counters.ps1 —— GPU 卡片数据脚本（spec 2026-09-09-gpu-card-design §2/§3）
#   -Mode static  ：一次性 DXGI 枚举（卡名 + 专用/共享上限 + LUID），stdout 输出单行 JSON 数组
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

public static class GpuStaticProbe
{
    public delegate int CreateFactory1(IntPtr iid, IntPtr outPtr);
    public delegate int EnumAdapters1(IntPtr self, int idx, IntPtr outPtr);
    public delegate int GetDesc(IntPtr self, IntPtr buf);
    public delegate int Release(IntPtr self);

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

    public static string Run()
    {
        var sb = new System.Text.StringBuilder();
        try
        {
            IntPtr dxgi = GetModuleHandle("dxgi.dll");
            if (dxgi == IntPtr.Zero) dxgi = LoadLibrary("dxgi.dll");
            IntPtr pCreate = GetProcAddress(dxgi, "CreateDXGIFactory1");
            if (pCreate == IntPtr.Zero) return "[]";
            var del = (CreateFactory1)Marshal.GetDelegateForFunctionPointer(pCreate, typeof(CreateFactory1));
            Guid iid = new Guid("770aae78-f26f-4dba-a829-253c83d1b387");
            IntPtr iidBuf = Marshal.AllocHGlobal(16);
            Marshal.StructureToPtr(iid, iidBuf, false);
            IntPtr fa = Marshal.AllocHGlobal(8);
            int hr = del(iidBuf, fa);
            IntPtr factoryPtr = Marshal.ReadIntPtr(fa);
            Marshal.FreeHGlobal(fa); Marshal.FreeHGlobal(iidBuf);
            if (hr != 0 || factoryPtr == IntPtr.Zero) return "[]";
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
                if (hrD == 0)
                {
                    var d = (ADAPTER_DESC)Marshal.PtrToStructure(descBuf, typeof(ADAPTER_DESC));
                    string luidStr = string.Format("0x{0:x8}_{1:x8}", (uint)d.LuidLow, d.LuidHigh);
                    string name = EscapeJson(d.Description == null ? "" : d.Description);
                    sb.Append(string.Format(",{{\"luid\":\"{0}\",\"name\":\"{1}\",\"dedicatedTotal\":{2},\"sharedTotal\":{3}}}", luidStr, name, d.DedicatedVideoMemory, d.SharedSystemMemory));
                }
                Marshal.FreeHGlobal(descBuf);
                fnRel(a);
            }
            fnRelF(factoryPtr);
        }
        catch
        {
            return "[]";
        }
        string s = sb.ToString();
        if (s.Length > 0) s = "[" + s.Substring(1) + "]";
        else s = "[]";
        return s;
    }

    // JSON 转义：反斜杠 → 双反斜杠；双引号 → 反斜杠双引号
    static string EscapeJson(string s)
    {
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"");
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
        foreach ($s in $mem.CounterSet) {
            if ($s.CounterName -eq 'Dedicated Usage') { $ded[$s.InstanceName] = [long]$s.CookedValue }
            elseif ($s.CounterName -eq 'Shared Usage') { $shr[$s.InstanceName] = [long]$s.CookedValue }
        }
        foreach ($s in $eng.CounterSet) {
            if ($s.CounterName -eq 'Utilization Percentage') { $u[$s.InstanceName] = [long]$s.CookedValue }
        }
        Write-Output (ConvertTo-Json ([ordered]@{ ded = $ded; shr = $shr; eng = $u }) -Compress -Depth 5)
    } catch {
        Write-Error ('gpu sample failed: ' + $_.Exception.Message)
    }
    Start-Sleep -Seconds 2
}
