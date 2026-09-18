# 变更：llama.cpp 更新后自动清理旧 CUDA runtime DLL

日期：2026-09-18
状态：已实施（npm test 482 全绿；npm run build 通过）

## 背景与用户诉求

用户的 llama.cpp 安装目录（llama_dir）里同时存在 CUDA 12 与 CUDA 13 两版 runtime DLL
（cudart64_12.dll / cublas64_12.dll / cublasLt64_12.dll 与对应 _13 版本）。根因：

- 官方 Windows CUDA 包按 CUDA 版本分拆（llama-bin-win-cuda-12.4-x64.zip 配
  cudart-llama-bin-win-cuda-12.4-x64.zip；13.4 同理），跨版本更新后旧版 DLL 残留在目录里；
- Windows 进程按 DLL 文件名精确加载，两套文件互不冲突也互不替代——旧版 DLL 是永不
  加载的死文件，但会误导用户对「当前实际在跑哪套 CUDA」的判断。

用户诉求：llama.cpp 更新流程加一步「清理 CUDA dll」。

## 用户定稿（对话确认）

1. 清理时机与前置：复用现有「停止服务 + 外部进程占用探测」，不新增运行判断；清理发生在
   **解压覆盖之后**（解压失败时目录保持原样，不出现「新 exe + 旧 DLL 已删」的半死状态）。
2. 删除范围：只删三个精确命名家族 cudart64_*.dll / cublas64_*.dll / cublasLt64_*.dll
   （= 官方 CUDA DLLs 包的全部内容），模型、配置、其他文件一律不动。**不是清空目录。**
3. 版本判定：从本次下载的 CUDA DLLs 包文件名解析主版本号（cuda-12.4 → 12，cuda-13.4 → 13），
   保留该版本、删除其他版本。
4. 非 CUDA 变体（CPU/Vulkan 等，无 CUDA DLLs 包）：**三个家族全部删除**（用户明确选择，
   与「CPU 构建不加载任何 CUDA DLL」的事实一致；代价是切回 CUDA 变体需重新下载 CUDA DLLs，
   已告知用户）。
5. 删除前逐个占用探测：被锁文件跳过并记日志，不阻塞安装；删除失败不算更新失败。
6. 删除/跳过均落 [lms_launcher] 日志，便于用户确认。

## 方案

### src-main/llama-update-download.ts（新增 3 个导出函数）

- cudaMajorFromDllsUrl(url?)：从 CUDA DLLs 下载链接解析保留主版本号（cuda-(\d+) → 12/13）。
  链接缺失（非 CUDA 变体）或不含版本号 → null（不猜测；null 语义 = 全部视为过期）。
- staleCudaDllFiles(names, keepMajor)：纯判定函数——目录文件名列表中匹配
  ^(?:cudart64|cublas64|cublasLt64)_(\d+)\.dll$ 且主版本号 ≠ keepMajor 的条目
  （keepMajor 为 null 时匹配的全部条目）。
- cleanupStaleCudaDlls(dir, keepMajor)：枚举目录 → 判定 stale → findLockedFiles 逐个占用
  探测（复用 openSync 'a+' 机制，覆盖外部进程锁定场景）→ 空闲者 rmSync 删除、被锁者跳过。
  绝不抛错：目录不可读 → 空结果。返回 { deleted, skipped }。

### src-main/main.ts（接线）

- pendingLlamaUpdate 增加 keepCudaMajor: number | null 字段：download_llama_update 的
  两处赋值（运行中暂存 / 未运行直装）均携带 cudaMajorFromDllsUrl(opts.cuda_dlls_url)。
- installPendingLlama 在「2. 解压覆盖」与「4. 验证」之间插入「3. 清理旧 CUDA DLL」：
  调 cleanupStaleCudaDlls(dir, keepCudaMajor)，deleted 非空 → 日志「清理旧 CUDA DLL：…」（逐个
  文件名）；skipped 非空 → 日志「…被占用未删除（可稍后手动删除）」。
- 两条自动安装路径（下载完成未运行 → 直装；「停止并更新」按钮 → install_llama_update）
  共用 installPendingLlama，均自动获得该行为，UI 无新状态、无新 IPC。

### 测试（TDD，先红后绿）

src-main/llama-update-download.test.ts 新增 12 例：

- cudaMajorFromDllsUrl：12.4→12、13.4→13、undefined→null、无版本号 URL→null。
- staleCudaDllFiles：保留 13 只删三个 _12、保留 12 只删三个 _13、保留 null 全删、
  exe/ggml-*/模型文件不碰、无 CUDA DLL 空列表。
- cleanupStaleCudaDlls：空闲删除/被锁跳过（rmSync 次数与 skipped 精确断言）、
  无 stale 不调 rmSync、目录不可读不抛。

## 边界与已知限制

- 仅覆盖 Windows（.dll 命名家族）；Linux 构建无此问题。
- 用户手动放入的其他 CUDA 命名 DLL（如 cudnn、nvrtc）不清理——不在官方 DLLs 包范围，
  保持最小删除面。
- CUDA 主版本号解析依赖官方 DLLs 包命名（cuda-<major>.<minor>）；命名变更时
  cudaMajorFromDllsUrl 返回 null → 退化为「全删」，有日志可追溯（当前官方命名 2026-09 实测）。
- 清理在解压成功之后：若清理前进程崩溃，下次更新会重跑清理（幂等）。
