<script setup lang="ts">
// UpdateModal：检查更新弹窗（计划 task-2；规格 docs/superpowers/specs/2026-09-01-update-modal-design.md）
// 纯渲染层：七态状态机由外层（App）持有 → 本组件 props 驱动（open=false 不渲染）；
// 事件契约：action(index, kind) / close。关闭 × 只发 close（不中断下载——下载在主进程）。
// 视觉语言同 TemplateModal：全局 .modal-overlay 遮罩 + 440px 白底 12px 圆角卡片 +
// 32px 标题栏（标题居中，右上角 × 关闭 hover 红底白字）+ 内容区 padding 16px。
// Task 7 扩展：新增 llama.cpp 更新区域（版本选择器 + 下载进度）

import { ref, watch, onBeforeUnmount } from 'vue';
// 2026-09 视觉统一：llama.cpp Windows 版本下拉改用共享 Dropdown 组件（原生 <select> 样式与应用其他下拉不一致）
import Dropdown from '../components/Dropdown.vue';
import {
  checkLlamaUpdate,
  // 2026 契约：打开弹窗的自动动作——本地版本查询（无网络、不比对远端）；
  // 检查落定后本地版本显示统一改由 check_llama_update 返回的 localVersion 派生
  getLlamaLocalVersion,
  // 2026-11 细化：打开时本地查询成功后追加联网拉取版本选项（下拉立即可见）；
  // 无 --version、无版本比对（最新版本 bNNNNN 的获取与比较仅在点击「检查更新」后）
  getLlamaReleaseOptions,
  downloadLlamaUpdate,
  setLlamaUpdateConfig,
  // 2026-09-17 两阶段更新：下载完成后判定服务运行 → 「停止并更新」
  installLlamaUpdate,
  // 2026-09-18：手动「检查更新」时读取 last_version_type，版本下拉默认选中上一次使用的变体
  getLlamaUpdateConfig,
} from '../llama-update-client';
import { onLlamaUpdateProgress } from '../ipc';

// 2026-09-17 两阶段更新：新增 stop-update 态（仅 llama.cpp 行使用——下载完成但服务运行中，
// 按钮「停止并更新」；LMS 启动器行不会进入此态，BUTTONS 保留完整映射）
type Phase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'up-to-date' | 'stop-update';
type Item = {
  name: string;
  phase: Phase;
  version?: string;
  pct?: number;
  errorText?: string;
};

const props = withDefaults(defineProps<{
  open: boolean;
  items: Item[];
}>(), { items: () => [] });

const emit = defineEmits<{
  (e: 'action', index: number, kind: string): void;
  (e: 'close'): void;
  // Task 7: llama.cpp 更新完成事件
  (e: 'llama-complete', success: boolean, error?: string): void;
}>();

// Task 7: llama.cpp 更新状态
// 本地版本显示文本（2026-09-14 修复）：dev 构建显示 b 号（与 nightly tag 同格式），
// 正式版显示 vX.Y.Z；避免旧契约下 localResult.version.version 的 undefined 显示。
// 2026 契约取值来源：打开弹窗的本地版本查询（get_llama_local_version，unknown 态显示）；
// 检查落定后改由 check_llama_update 返回的 localVersion 派生（避免 --version 背靠背两次、
// 「本地版本」日志落两条——本地查询与网络检查永不背靠背执行，日志去重由构造保证）
const llamaLocalVersion = ref<string>('');
const llamaRemoteVersion = ref<string>('');
const llamaUpdateStatus = ref<'up-to-date' | 'update-available' | 'unknown' | 'error' | 'unconfigured'>('unknown');
const llamaVersionOptions = ref<Array<{ label: string; downloadUrl: string; cudaDllsUrl?: string }>>([]);
const llamaSelectedOptionIndex = ref(0);
// 2026-09-18：版本下拉默认选中「上一次使用的版本类型」——打开弹窗时从
// lms_launcher.yaml 的 llama_update.last_version_type 读取（每次下载成功后写入），
// 选项表就绪后按 label 精确匹配恢复；无配置/取配置失败/选项表已无该 label → 第一项。
const llamaLastVersionType = ref('');
const llamaDownloading = ref(false);
const llamaDownloadPct = ref(0);
const llamaError = ref('');
// 2026-09-17 两阶段更新：stop-update 态下服务是否仍在运行（影响名称行下方提示文案）
const llamaStopUpdateRunning = ref(false);
// 2026-09-17：pre-release 勾选框移除——llama.cpp stable release 无 Windows 包（仅 nightly-tag.txt，
// 2026-09-17 实测 v0.4.1），nightly（b 号）是唯一可下载来源，故恒查 pre-release，无需用户开关。
// llama.cpp 行按钮独立七态（2026-09 需求：llama.cpp 行恒显示，按钮默认「检查更新」；
// 与 LMS 启动器行同一套 BUTTONS 映射复用文案/禁用逻辑）
const llamaPhase = ref<Phase>('idle');
let llamaProgressCleanup: (() => void) | null = null;

// 2026 契约：打开弹窗的唯一自动动作——本地版本查询（无网络，仅判定 unconfigured + 显示当前版本）。
// llama_dir 未配置 → unconfigured 态（提示 + 按钮禁用）；用户在主界面选目录后重开弹窗，
// 本查询重新执行 → 恢复（unconfigured 死锁逃生口）。成功时 status 保持 unknown（不重置、
// 下次打开仍会查询并刷新本地版本显示）。日志去重：检查落定后本地版本显示改由 check 返回
// 的 localVersion 派生，本地查询与网络检查永不背靠背执行。
async function checkLlamaLocalVersionOnOpen() {
  llamaPhase.value = 'checking'; // 按钮短暂「检查中...」（禁用）
  try {
    const r = await getLlamaLocalVersion();
    if (r.success) {
      llamaLocalVersion.value = r.localVersion?.build !== undefined
        ? `b${r.localVersion.build}`
        : r.localVersion?.version ? `v${r.localVersion.version}` : '';
      // 保持 unknown：非重置语义（重开仍会查询刷新），按钮回到「检查更新」
      llamaUpdateStatus.value = 'unknown';
      // 2026-11 回归修复：配置读取时机随下拉提前到打开时（2026 契约曾挪进手动检查路径，
      // 而 2026-11 细化让下拉打开即出现 → 配置未读时恒选第一项，丢失「默认选中上一次
      // 用的版本」）。先静默读 yaml 的 last_version_type 恢复内存值，再拉选项表（顺序
      // await 保证 applyLlamaDefaultSelection 读到的是本次恢复值）。
      await restoreLlamaLastVersionType();
      // 2026-11 细化：目录已配置（本地查询成功）→ 追加联网拉取版本选项（下拉立即可见）。
      // 失败静默：下拉不出现、不进入错误态（用户手动「检查更新」走完整检查恢复）。
      // 注意：此处不比对版本、不落 status——最新 tag 的获取与本地比较只在点击「检查更新」后。
      await fetchLlamaReleaseOptionsOnOpen();
    } else if (r.error === 'unconfigured') {
      llamaUpdateStatus.value = 'unconfigured';
    } else {
      llamaUpdateStatus.value = 'unknown'; // 查询失败 → 中段「本地版本未检测到」
      llamaLocalVersion.value = '';
    }
  } catch {
    llamaUpdateStatus.value = 'unknown';
    llamaLocalVersion.value = '';
  } finally {
    llamaPhase.value = 'idle'; // 按钮回到「检查更新」（unconfigured 态由 llamaBtnDisabled 禁用）
  }
}

// 2026-11 回归修复：打开时恢复「上一次使用的版本类型」（2026-09-18 契约的读取时机
// 最终落点——曾随下拉出现时机两次迁移：2026-09-18 检查落定后 → 2026 契约手动检查路径
// 前 → 2026-11 打开时选项拉取前）。静默：取配置失败/无 last_version_type 字段 → 保持
// 现有内存值（首次打开为空 → 默认第一项），不影响选项拉取与检查主流程。
async function restoreLlamaLastVersionType(): Promise<void> {
  try {
    const r = await getLlamaUpdateConfig();
    if (r.success && r.config?.last_version_type) {
      llamaLastVersionType.value = r.config.last_version_type;
    }
  } catch {
    // 取配置失败 → 回退第一项（不阻塞选项拉取）
  }
}

// 2026-11 细化：打开弹窗时的选项拉取——只取 release 信息（versionOptions + cudaDlls），
// 无本地 --version、无版本比对（日志去重不变量保持：打开时唯一「本地版本」日志行仍来自
// get_llama_local_version；本拉取只落一条「版本列表」日志）。成功填充选项表 + 恢复默认
// 选中（无配置 → 第一项），status 保持 unknown；失败静默（清空选项，下拉不渲染）。
async function fetchLlamaReleaseOptionsOnOpen(): Promise<void> {
  try {
    const r = await getLlamaReleaseOptions();
    if (r.success) {
      llamaVersionOptions.value = (r.versionOptions ?? []).map(opt => ({
        label: opt.label,
        downloadUrl: opt.downloadUrl,
        cudaDllsUrl: opt.cudaDllsUrl,
      }));
      applyLlamaDefaultSelection();
    } else {
      llamaVersionOptions.value = []; // 静默：下拉不渲染（v-if 长度条件兜底）
    }
  } catch {
    llamaVersionOptions.value = []; // invoke 抛错同样静默
  }
}

// Task 7: 检查 llama.cpp 更新（2026 契约：仅手动「检查更新」/「重试」/「切换版本」触发；
// 打开弹窗不自动做完整检查——打开时的自动网络动作仅为选项拉取，见 watch(open)）。
async function checkLlamaUpdateInternal() {
  llamaPhase.value = 'checking'; // 按钮切换「检查中...」并禁用，同 LMS 启动器行语义
  try {
    await runLlamaUpdateCheck();
  } catch (e) {
    llamaUpdateStatus.value = 'error';
    llamaError.value = e instanceof Error ? e.message : String(e);
    llamaPhase.value = 'error';
  }
}

// 2026-11 契约（manualLlamaCheck 移除）：配置读取时机迁至打开弹窗时（restoreLlamaLastVersionType，
// 下拉出现前恢复默认选中）。点击「检查更新」/「重试」直接走 checkLlamaUpdateInternal——
// 不再读配置：该路径若重读 yaml，会把用户在本弹窗内手动切换过的变体重置回磁盘旧值
// （2026-09-18 T27 回归根因）；下载/安装成功后的程序性重查同理（已同步内存值）。

// 执行远程检查（含结果落态）。独立成函数供打开弹窗与下载完成后复用。
// 2026-09-17：恒查 pre-release（nightly），无 includePreRelease 参数。
async function runLlamaUpdateCheck() {
  llamaPhase.value = 'checking';
  try {
    // 检查远程更新（恒查 nightly：llama.cpp 的 stable release 无 Windows 资产，nightly 是唯一可下载来源）
    const result = await checkLlamaUpdate();
    if (result.success) {
      llamaUpdateStatus.value = result.status ?? 'unknown';
      // 2026 契约：检查落定后本地版本显示改由 check 返回的 localVersion 派生（主进程同一
      // 查询只落一条日志；打开时的本地查询不在检查路径上重复执行）；b 号优先显示（与远端
      // nightly tag 同格式），无 build 号显示 vX.Y.Z；主进程未返回 → 空串（up-to-date 中段
      // 回退不带版本号，且不覆盖本地查询已显示的裸版本号）
      if (result.localVersion) {
        const v = result.localVersion;
        llamaLocalVersion.value = v.build !== undefined
          ? `b${v.build}`
          : v.version ? `v${v.version}` : '';
      }
      if (result.remoteVersion) {
        llamaRemoteVersion.value = result.remoteVersion;
      }
      // 选项表恒与最近一次检查同步：主进程未返回（异常/旧契约）→ 清空旧选项，
      // 防止重查后残留上一轮选项导致 up-to-date 态误显下拉（2026-09-18 修复）。
      // cudaDllsUrl 已由主进程按 release body 行内关联解析（2026-09-14 修复：
      // 旧实现把所有 DLLs 塞给第一个选项 → CPU 版下载时误装 CUDA DLLs）
      llamaVersionOptions.value = (result.versionOptions ?? []).map(opt => ({
        label: opt.label,
        downloadUrl: opt.downloadUrl,
        cudaDllsUrl: opt.cudaDllsUrl,
      }));
      // 2026-09-18：选项表同步后恢复默认选中（配置 last_version_type 命中 → 该项）
      applyLlamaDefaultSelection();
      // 按钮态随检查结论切换：可用 → 下载更新（点击即下载）；已是最新 → 检查更新；
      // 未知/失败 → 重试（kind='retry'，重发检查）
      llamaPhase.value = result.status === 'update-available' ? 'available'
        : result.status === 'up-to-date' ? 'up-to-date'
        : 'error';
    } else {
      // 区分 unconfigured 和一般错误
      if (result.error === 'unconfigured') {
        llamaUpdateStatus.value = 'unconfigured';
        llamaPhase.value = 'idle'; // 未配置目录：按钮保持「检查更新」可点（重新检查）
      } else {
        llamaUpdateStatus.value = 'error';
        llamaError.value = result.error ?? '未知错误';
        llamaPhase.value = 'error'; // 红字错误 + 「重试」
      }
    }
  } catch (e) {
    llamaUpdateStatus.value = 'error';
    llamaError.value = e instanceof Error ? e.message : String(e);
    llamaPhase.value = 'error';
  }
}

// 2026-09-18：选项表就绪后恢复默认选中（配置 last_version_type 命中 → 该项；
// 无配置/未命中 → 第一项）。选项表为空（未检查到选项）时 no-op——下拉 v-if 本就不渲染。
function applyLlamaDefaultSelection(): void {
  const opts = llamaVersionOptions.value;
  if (opts.length === 0) return;
  const idx = llamaLastVersionType.value
    ? opts.findIndex((o) => o.label === llamaLastVersionType.value)
    : -1;
  llamaSelectedOptionIndex.value = idx >= 0 ? idx : 0;
}

// Task 7: 下载 llama.cpp 更新
async function downloadLlamaUpdateInternal() {
  const option = llamaVersionOptions.value[llamaSelectedOptionIndex.value];
  if (!option) return;

  llamaDownloading.value = true;
  llamaPhase.value = 'downloading';
  llamaDownloadPct.value = 0;
  llamaError.value = '';

  try {
    const result = await downloadLlamaUpdate(option.downloadUrl, option.cudaDllsUrl);
    if (result.success) {
      // 2026-09-17 两阶段更新：主进程下载完成后判定服务运行——
      // installed=true  → 服务未运行，已自动安装完成（等价旧行为）→ 保存配置 + 重查
      // installed=false → 服务运行中，包已暂存 → 按钮切「停止并更新」，等用户点击
      if (result.installed === false) {
        llamaStopUpdateRunning.value = true; // 主进程判定服务运行中（含外部进程占用）
        llamaPhase.value = 'stop-update';
        return;
      }
      // 更新成功，保存配置；同步内存值——随后重查的 applyLlamaDefaultSelection
      // 按本次所选 label 恢复选中，不被打开弹窗时读到的旧配置重置（2026-09-18）
      llamaLastVersionType.value = option.label;
      await setLlamaUpdateConfig({ last_version_type: option.label });
      emit('llama-complete', true);
      // 重新检查更新状态
      await checkLlamaUpdateInternal();
    } else {
      llamaError.value = result.error ?? '下载失败';
      llamaUpdateStatus.value = 'error'; // 错误原因移到名称行下方红字显示
      llamaPhase.value = 'error'; // 下载失败 → 「重试」（重发检查，同步主进程状态）
      emit('llama-complete', false, result.error);
    }
  } catch (e) {
    llamaError.value = e instanceof Error ? e.message : String(e);
    llamaUpdateStatus.value = 'error';
    llamaPhase.value = 'error';
    emit('llama-complete', false, llamaError.value);
  } finally {
    llamaDownloading.value = false;
  }
}

// 2026-09-17 两阶段更新：「停止并更新」→ 主进程停 llama-server 后安装已下载的 pending 包
async function installLlamaUpdateInternal() {
  // 安装是纯本地操作（秒级），复用 downloading 视觉通道（按钮禁用 + 进度条空载）
  llamaDownloading.value = true;
  llamaPhase.value = 'downloading';
  llamaDownloadPct.value = 0;
  llamaError.value = '';
  try {
    const result = await installLlamaUpdate();
    if (result.success) {
      // 保存配置（与自动安装成功路径一致：last_version_type 记录本次所选版本类型）；
      // 同步内存值，重查后下拉保持本次所选（2026-09-18）
      const option = llamaVersionOptions.value[llamaSelectedOptionIndex.value];
      if (option) {
        llamaLastVersionType.value = option.label;
        await setLlamaUpdateConfig({ last_version_type: option.label });
      }
      emit('llama-complete', true);
      await checkLlamaUpdateInternal(); // 重查 → 通常 up-to-date
    } else if (result.busy) {
      // 2026-09-17 修复（二轮）：占用类失败（如 ggml-cuda.dll 被外部 CUDA 版 llama-server 锁住）
      // → 回到「停止并更新」（pending 包仍在主进程，关闭外部进程后再点一次即可），
      // 而不是「重试」（会重走完整下载，浪费且包并未失效）
      llamaError.value = result.error ?? '文件仍被占用';
      llamaStopUpdateRunning.value = true;
      llamaPhase.value = 'stop-update';
      emit('llama-complete', false, llamaError.value);
    } else {
      llamaError.value = result.error ?? '安装失败';
      llamaUpdateStatus.value = 'error'; // 错误原因移到名称行下方红字显示
      llamaPhase.value = 'error'; // →「重试」重新走完整检查+下载流程
      emit('llama-complete', false, llamaError.value);
    }
  } catch (e) {
    llamaError.value = e instanceof Error ? e.message : String(e);
    llamaUpdateStatus.value = 'error';
    llamaPhase.value = 'error';
    emit('llama-complete', false, llamaError.value);
  } finally {
    llamaDownloading.value = false;
  }
}

// 2026 契约变更：adoptPendingLlamaDownload 删除——打开弹窗的自动动作仅为本地版本查询，
// 不再查询/接管暂存包（stop-update 态仅由下载 installed=false / 安装 busy 进入）。

// Task 7: 监听 llama.cpp 下载进度
function setupLlamaProgressListener() {
  if (llamaProgressCleanup) {
    llamaProgressCleanup();
  }
  llamaProgressCleanup = onLlamaUpdateProgress((e) => {
    llamaDownloadPct.value = e.percent;
  });
}

// Task 7: 清理进度监听器
function cleanupLlamaProgressListener() {
  if (llamaProgressCleanup) {
    llamaProgressCleanup();
    llamaProgressCleanup = null;
  }
}

// 2026 契约（终局）：弹窗恒常驻挂载（组件状态不随开关丢失），打开时的自动动作
// 仅为「本地版本查询」——仅当状态为 unknown（会话首次打开）或 unconfigured（用户
// 选完目录后重开的死锁逃生口）时执行；其它状态（checking/available/downloading/
// stop-update/up-to-date/error）重开不重置、不重查、不 adopt——状态 + 进度 + 下拉
// 全部保留，仅重挂进度监听。网络检查只由手动「检查更新」/「重试」/「切换版本」触发。
watch(
  () => props.open,
  (open) => {
    if (open) {
      if (llamaUpdateStatus.value === 'unknown' || llamaUpdateStatus.value === 'unconfigured') {
        void checkLlamaLocalVersionOnOpen();
      }
      setupLlamaProgressListener(); // 重开始终重挂进度监听（监听器随关闭清理）
    } else {
      cleanupLlamaProgressListener();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  cleanupLlamaProgressListener();
});

// 七态按钮映射：phase → 按钮文案 / 事件 kind / 是否禁用
// idle=检查更新 / checking=检查中...(禁用) / available=下载更新 / downloading=下载中 NN%(禁用)
// / ready=重启应用 / error=重试 / up-to-date=检查更新
const BUTTONS: Record<Phase, { label: (pct: number) => string; kind: string; disabled: boolean }> = {
  idle:         { label: () => '检查更新',       kind: 'check',    disabled: false },
  checking:     { label: () => '检查中...',      kind: 'check',    disabled: true },
  available:    { label: () => '下载更新',       kind: 'download', disabled: false },
  downloading:  { label: (p) => `下载中 ${Math.floor(p)}%`, kind: 'download', disabled: true },
  ready:        { label: () => '重启应用',       kind: 'restart',  disabled: false },
  error:        { label: () => '重试',           kind: 'retry',    disabled: false },
  'up-to-date': { label: () => '检查更新',       kind: 'check',    disabled: false },
  'stop-update': { label: () => '停止并更新',    kind: 'stop-update', disabled: false }, // 仅 llama 行使用
};

function btnLabel(item: Item): string {
  const b = BUTTONS[item.phase];
  return b ? b.label(item.pct ?? 0) : '';
}

function btnDisabled(item: Item): boolean {
  const b = BUTTONS[item.phase];
  return b ? b.disabled : true;
}

// 中段渲染（12px）：available/downloading/ready → 新版号（--muted）；up-to-date → 灰字「已是最新版本 vX.Y.Z」；error → 红字错误原因
// ready 带 errorText（run_update 失败）→ 红字错误优先展示；否则显示新版号
// downloading 期间版本号为已知信息（来自 update-available），恒显示不隐藏
function middleKind(item: Item): string {
  switch (item.phase) {
    case 'ready':
      return item.errorText ? 'error' : 'version';
    case 'available':
    case 'downloading':
      return 'version';
    case 'up-to-date':
      return 'latest';
    case 'error':
      return 'error';
    default:
      return '';
  }
}

function middleText(item: Item): string {
  switch (middleKind(item)) {
    case 'version':
      return item.version ?? '';
    case 'latest':
      return `已是最新版本 ${item.version ?? ''}`;
    case 'error':
      return item.errorText ?? '';
    default:
      return '';
  }
}

function onAction(index: number, item: Item): void {
  const b = BUTTONS[item.phase];
  if (!b || b.disabled) return;
  emit('action', index, b.kind);
}

function onClose(): void {
  emit('close');
}

// downloading：按钮本身即进度条——底为全局 .btn:disabled 灰底（未下载部分），
// 左侧紫填充宽 = pct%；文字白/灰双色渐变的硬边界与填充右缘同一坐标系（按钮 padding 盒）对齐：
// 压在紫色段的文字为白色，进度条未到的部分保持禁用灰（--muted）；文字内容与百分比不变。
function fillStyle(item: Item): string | undefined {
  if (item.phase !== 'downloading') return undefined;
  return `width: ${Math.floor(item.pct ?? 0)}%;`;
}
function textGradientStyle(item: Item): string | undefined {
  if (item.phase !== 'downloading') return undefined;
  const p = Math.floor(item.pct ?? 0);
  return `background-image: linear-gradient(to right, #fff ${p}%, var(--muted) ${p}%);`;
}

// ---- llama.cpp 行按钮（2026-09 需求：llama.cpp 行恒显示，按钮默认「检查更新」；
//      与 LMS 启动器行同一套七态语言，available 文案同为「下载更新」）----
const LLAMA_BUTTONS: Record<Phase, { label: (pct: number) => string; disabled: boolean }> = {
  idle:         { label: () => '检查更新',           disabled: false },
  checking:     { label: () => '检查中...',          disabled: true },
  available:    { label: () => '下载更新',           disabled: false },
  downloading:  { label: (p) => `下载中 ${Math.floor(p)}%`, disabled: true },
  ready:        { label: () => '检查更新',           disabled: false }, // llama 无 ready 态（覆盖安装无需重启），仅保映射完整
  error:        { label: () => '重试',               disabled: false },
  'up-to-date': { label: () => '检查更新',           disabled: false },
  // 2026-09-17 两阶段更新：下载完成但 llama-server 运行中 → 「停止并更新」
  'stop-update': { label: () => '停止并更新',        disabled: false },
};
// 2026-09-18：up-to-date 态也显示 Windows 版本下拉（允许切换变体，如 CPU/CUDA/Vulkan）→
// 按钮文案随「所选版本 vs lms_launcher.yaml 配置（llama_update.last_version_type）」切换：
//   一致（无配置 = 第一项视为一致 / 配置命中选中项）→「检查更新」（点击重查）；
//   不一致（用户在弹窗里切换了下拉）→「切换版本」（点击即下载所选变体，覆盖安装）。
// 无选项（主进程未返回 versionOptions 的异常情形）保持「检查更新」（点击重查）
function llamaUpToDateHasOptions(): boolean {
  return llamaUpdateStatus.value === 'up-to-date' && llamaVersionOptions.value.length > 0;
}
// 所选版本与配置一致：无配置时以第一项为一致基准（默认选中即第一项，用户未切=一致，
// 切到其它项=不一致；无法判断真实安装变体，不诱导对第一项的完整下载覆盖）；
// 有配置时按 label 精确匹配（与 applyLlamaDefaultSelection 同一匹配口径）。
// 选项表为空时恒返回 true（此时按钮走「检查更新」兜底分支，该值不被消费）。
function llamaSelectedMatchesConfig(): boolean {
  if (llamaVersionOptions.value.length === 0) return true;
  if (!llamaLastVersionType.value) return llamaSelectedOptionIndex.value === 0;
  return llamaVersionOptions.value[llamaSelectedOptionIndex.value]?.label === llamaLastVersionType.value;
}
function llamaBtnLabel(): string {
  if (llamaPhase.value === 'up-to-date' && llamaUpToDateHasOptions()) {
    return llamaSelectedMatchesConfig() ? '检查更新' : '切换版本';
  }
  return LLAMA_BUTTONS[llamaPhase.value].label(llamaDownloadPct.value);
}
function llamaBtnDisabled(): boolean {
  // 2026-09-15 需求：未选择安装目录（unconfigured）时按钮置灰不可点——
  // 此时检查只会再得到 unconfigured，无意义；用户在主界面选目录后重开弹窗即恢复可点
  if (llamaUpdateStatus.value === 'unconfigured') return true;
  return LLAMA_BUTTONS[llamaPhase.value].disabled;
}
function onLlamaBtn(): void {
  // 2026-09-18：up-to-date + 有版本选项 → 按「所选 vs 配置」分流：
  //   不一致 → 下载所选变体（「切换版本」，用户切换变体的主路径）；
  //   一致 → 重查（「检查更新」，重新同步主进程状态）。无选项时保持旧行为（重查）。
  if (llamaPhase.value === 'up-to-date' && llamaUpToDateHasOptions()) {
    if (llamaSelectedMatchesConfig()) {
      void checkLlamaUpdateInternal(); // 用户发起的完整检查（配置已在打开时恢复，此处不重读）
    } else {
      void downloadLlamaUpdateInternal();
    }
    return;
  }
  switch (llamaPhase.value) {
    case 'idle':
    case 'up-to-date':
    case 'error':
    case 'ready':
      void checkLlamaUpdateInternal(); // 检查 / 重试均为用户发起 → 重发完整检查（不重读配置）
      break;
    case 'available':
      void downloadLlamaUpdateInternal();
      break;
    case 'stop-update':
      void installLlamaUpdateInternal(); // 2026-09-17：停止服务并安装已下载的包
      break;
    default:
      break; // checking / downloading 已禁用，不可点
  }
}

// llama.cpp 行中段状态文字（latest=已最新灰字 / version=新版本紫字）
// 2026-09-16：up-to-date 中段并入本地版本号「已是最新版本 bNNNNN」（与 LMS 启动器行
// 「已是最新版本 0.2.0」同格式）；独立「本地:」span 删除；本地版本未知时回退不带版本号
// 未配置提示与错误文字不再占中段（2026-09 优化：移到名称行下方独立一行完整显示，
// 可换行、无省略号截断）→ 见 llamaBelow()
function llamaMiddle(): { kind: string; text: string } | null {
  switch (llamaUpdateStatus.value) {
    case 'up-to-date':
      return { kind: 'latest', text: llamaLocalVersion.value
        ? '已是最新版本 ' + llamaLocalVersion.value
        : '已是最新版本' };
    case 'update-available':
      return { kind: 'version', text: '新版本: ' + (llamaRemoteVersion.value || '') };
    case 'unknown':
      // 2026 契约：打开仅本地查询（无网络检查）→ 中段显示当前本地版本（裸号灰字，
      // 如 b10679）；查询失败/无版本号 → 「本地版本未检测到」。kind='latest' → 模板
      // 映射为灰字 .llama-state-text（非 version 紫字）。
      return { kind: 'latest', text: llamaLocalVersion.value || '本地版本未检测到' };
    default:
      return null; // unconfigured / error：中段留白（提示/红字走 llamaBelow）
  }
}

// llama.cpp 名称行下方提示行（2026-09 优化）：unconfigured 灰字提示 / error 红字，
// 整行完整显示（允许换行，长提示不再被卡片宽度截断）
function llamaBelow(): { kind: string; text: string } | null {
  // 2026-09-17 两阶段更新：stop-update 态下名称行下方灰字说明，引导用户点「停止并更新」
  if (llamaPhase.value === 'stop-update') {
    return { kind: 'hint', text: llamaStopUpdateRunning.value
      ? 'llama-server 正在运行，点击「停止并更新」停止服务并完成安装'
      : '更新包已下载完成，点击「停止并更新」完成安装' };
  }
  switch (llamaUpdateStatus.value) {
    case 'unconfigured':
      return { kind: 'hint', text: '请先在主界面选择 llama.cpp 安装目录' };
    case 'error':
      return { kind: 'error', text: llamaError.value || '检查更新失败' };
    default:
      return null;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open" class="modal-overlay update-modal">
      <div class="update-card">
        <!-- 32px 标题栏：标题「检查更新」居中；右上角 × 关闭（hover 红底白字，同 .modal-close） -->
        <div class="update-head">
          <span class="update-title">检查更新</span>
          <button type="button" class="update-close" aria-label="关闭弹窗" @click="onClose()">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <!-- 内容区 padding 16px；每行单行三段 flex：项目名（14px） | 中段（12px） | 动作按钮（.btn .btn-primary 紫底白字，同 VramDialog [保存]） -->
        <div class="update-body">
          <div v-for="(item, i) in props.items" :key="i" class="update-row">
            <span class="update-row__name">{{ item.name }}</span>
            <span
              v-if="middleKind(item) !== ''"
              class="update-row__middle"
              :class="
                middleKind(item) === 'version' ? 'update-row__version'
                : middleKind(item) === 'latest' ? 'update-row__latest'
                : 'update-row__error'
              "
            >{{ middleText(item) }}</span>
            <div class="update-row__action">
              <!-- downloading：按钮本身即进度条——左侧紫填充宽 = pct%，文字白/灰双色渐变与填充边界对齐；文字与百分比不变 -->
              <button
                type="button"
                class="btn btn-primary"
                :class="{ 'update-row__btn-progress': item.phase === 'downloading' }"
                :disabled="btnDisabled(item)"
                @click="onAction(i, item)"
              >
                <span v-if="item.phase === 'downloading'" class="update-row__fill" :style="fillStyle(item)"></span>
                <span class="update-row__label" :style="textGradientStyle(item)">{{ btnLabel(item) }}</span>
              </button>
            </div>
          </div>

          <!-- Task 7: llama.cpp 更新区域（2026-09 需求：llama.cpp 行恒显示，打开弹窗即见，
               按钮默认「检查更新」；检查到更新后中段显示新版本 + 版本选择器，按钮切换「下载更新」） -->
          <div class="update-row llama-section">
            <div class="llama-info">
              <span class="update-row__name">llama.cpp</span>
              <!-- 2026-09-16：「本地:」独立 span 删除——本地版本号并入 up-to-date 中段「已是最新版本 bNNNNN」（与 LMS 启动器行同格式） -->
              <!-- 中段状态文字（已最新灰字/新版本紫字），与 LMS 启动器行同语言 -->
              <span
                v-if="llamaMiddle() !== null"
                class="update-row__middle llama-middle"
                :class="
                  llamaMiddle()?.kind === 'version' ? 'llama-new-version'
                  : 'llama-state-text'
                "
              >{{ llamaMiddle()?.text }}</span>
            </div>
            <!-- 2026-09-15 布局修复：按钮容器紧跟名称行（.llama-info）置于第一行，与「llama.cpp」文字同行；
                 原先排在整行独占的 .llama-below 提示行之后，未配置/出错态会被挤到下一行、与名称不同行（截图 bug）。 -->
            <div class="update-row__action">
              <!-- 七态按钮（复用全局 .update-row .btn 尺寸规则）：idle/up-to-date=检查更新 / checking=检查中...(禁用)
                   / available=下载更新 / downloading=下载中 NN%(禁用) / error=重试 -->
              <button
                type="button"
                class="btn btn-primary"
                :class="{ 'update-row__btn-progress': llamaPhase === 'downloading' }"
                :disabled="llamaBtnDisabled()"
                @click="onLlamaBtn()"
              >
                <span v-if="llamaPhase === 'downloading'" class="update-row__fill" :style="`width: ${Math.floor(llamaDownloadPct)}%;`"></span>
                <span class="update-row__label"
                  :style="llamaPhase === 'downloading' ? `background-image: linear-gradient(to right, #fff ${Math.floor(llamaDownloadPct)}%, var(--muted) ${Math.floor(llamaDownloadPct)}%);` : undefined"
                >{{ llamaBtnLabel() }}</span>
              </button>
            </div>
            <!-- 名称行下方提示行（2026-09 优化）：未配置灰字提示 / 错误红字，整行完整显示（可换行） -->
            <div v-if="llamaBelow() !== null" class="llama-below"
              :class="llamaBelow()?.kind === 'error' ? 'llama-below--error' : 'llama-below--hint'"
            >{{ llamaBelow()?.text }}</div>
            <!-- 版本选项选择器：检查到更新或有选项时出现（独立成行，避免与状态文字挤占行宽）。
                 2026-09 统一视觉：原生 <select> → 共享 Dropdown 组件（与 LaunchBar/TemplateModal 下拉同风格：
                 白底卡片弹层 + .btn 触发按钮 + ▼ 指示符；选项 value 用索引字符串，选中态回写索引）
                 2026-09-18：up-to-date 态同样渲染（用户可在已是最新时切换 Windows 变体，如 CPU/CUDA/Vulkan） -->
            <Dropdown
              v-if="['update-available', 'up-to-date', 'unknown'].includes(llamaUpdateStatus) && llamaVersionOptions.length > 0"
              :value="String(llamaSelectedOptionIndex)"
              :options="llamaVersionOptions.map((opt, idx) => ({ value: String(idx), label: opt.label }))"
              :disabled="llamaDownloading"
              @update:value="(v: string) => { llamaSelectedOptionIndex = Number(v); }"
            />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 440px 白底 12px 圆角卡片（同 TemplateModal 卡片语言；2026-09 优化：320px 太窄，
   llama.cpp 行「本地: bNNNNN」+「新版本: …」与按钮之间空间不足被截断，加宽至 440px） */
.update-card {
  width: 440px;
  background: var(--card);
  border-radius: var(--radius-card);
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04); /* 与 TemplateModal 全局 .card 卡片阴影一致 */
  /* 2026-09：overflow:hidden 移除——llama.cpp Windows 版本下拉贴近卡片底部，
     向下展开的 .dropdown-panel 会被卡片圆角裁切；圆角改由顶缘 .update-head
     （顶部左右双圆角）+ .update-close（border-top-right-radius 同值）兜底，
     内容区 padding 16px 无贴角元素，移除无副作用（2026-09-16 补 .update-head 左上圆角回归修复） */
}

/* 32px 标题栏：标题居中；右上角 × 关闭（角形占满标题栏高，同 .modal-close）。
   2026-09-16 圆角回归修复：卡片 overflow:hidden 移除后（bf9698f，防裁剪 Dropdown 弹层），
   顶缘圆角必须由标题栏自身兜底——左上 + 右上均补 border-*-top-*-radius；
   左上角无其他元素覆盖（右上角由 .update-close 同值圆角对齐），内容区 padding 16px 无贴角元素。 */
.update-head {
  position: relative;
  height: 32px;
  display: flex;
  align-items: center;
  background: var(--card);
  border-bottom: 1px solid var(--border);
  border-top-left-radius: var(--radius-card);  /* 卡片左上角兜底（不恢复卡片 overflow:hidden） */
  border-top-right-radius: var(--radius-card); /* 与 .update-close 的 border-top-right-radius 同值对齐 */
}
.update-title {
  flex: 1;
  text-align: center;
  font-size: var(--fs-title);
  font-weight: 600;
}
.update-close {
  position: absolute;
  top: 0;
  right: 0;
  width: 36px;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--card);
  color: var(--muted);
  border: none;
  border-top-right-radius: var(--radius-card); /* 与卡片右上角圆角一致 */
  cursor: pointer;
}
.update-close:hover { background: var(--danger); color: #fff; } /* Windows 关闭键 hover：红底白字 */

/* 内容区 padding 16px；多行预留 8px 行间距（本期单行） */
.update-body {
  padding: var(--card-pad);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 每行单行三段 flex：项目名（左） | 中段（中，12px） | 动作按钮（右） */
.update-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
/* 2026-09-16 布局修复（截图 bug）：两行中段提示文字（「已是最新版本 …」）未与弹窗居中对齐。
   根因：名称列自然宽（「LMS 启动器」~78px /「llama.cpp」~63px）与按钮列（七态恒 99.03px）不对称——
   中段 flex:1 只居中于「名称..按钮」之间，几何中心偏卡片中心 (99.03−名称宽)/2（截图实测 LMS 行
   偏左 ~13px、llama.cpp 行偏左 ~20px）。修复：名称列定宽 = 按钮 min-width（99.03px；现有名称均
   短于该宽，左对齐观感不变）→ 名称列与按钮列等宽对称，中段 flex:1 的几何中心恰为卡片中心，两行同时居中。 */
.update-row__name {
  font-size: var(--fs-body);
  color: var(--text);
  flex: none;
  width: 99.03px; /* = 按钮 min-width（.update-row .btn 同值）：两列对称 → 中段居中于卡片中心 */
}
.update-row__middle {
  flex: 1; /* 2026-09 优化：撑满名称与按钮之间的整段空间（名称 flex:none 恒自然宽），
             text-align:center 使提示文字对齐卡片中心（标题/按钮位置不变） */
  min-width: 0;
  font-size: var(--fs-label);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.update-row__version { color: var(--muted); }
.update-row__latest { color: var(--muted); }
.update-row__error { color: var(--danger); }
.update-row__action {
  flex: none;
  margin-left: auto; /* 动作按钮恒贴行右缘：中段不渲染（idle/checking）时不留白、不跳变 */
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

/* 七态按钮同尺寸（2026-09-06 用户反馈）：以下载态按钮为基准（最长标签「下载中 100%」）。
   实测（应用渲染器 Segoe UI 14px，真实盒模型：下载态 padding 14/16 + 边框 2）：
   「下载中 100%」= 99.03px，为七态最宽；其余态自然宽 57.33–85.33px。
   全局 box-sizing:border-box → min-width 即总宽下限：短标签（检查更新/重启应用/重试等）
   撑满到 99.03px 不收缩；下载态各百分比（0–100%）恰好贴满不扩不缩，填充/文字渐变对齐不变。
   nowrap 防窄行下 CJK 按字换行（与 .btn-noshrink 同语言）。 */
.update-row .btn {
  min-width: 99.03px; /* = 下载态「下载中 100%」实测总宽（边框 2 + padding 14/16 + 标签 67.03） */
  white-space: nowrap;
}

/* downloading：按钮本身即进度条——
   底色 = 全局 .btn:disabled 灰底（未下载部分）；左侧 .update-row__fill 紫填充宽 = pct%；
   文字颜色随填充：压在紫段上的文字为白色，进度条未到的地方保持禁用灰（--muted）。
   填充与文字双色渐变共用同一坐标系（按钮 padding 盒）：label 以负 margin 延展至 padding 盒
   左缘，使渐变硬边界与填充右缘精确对齐。 */
.update-row__btn-progress {
  position: relative;
  overflow: hidden;
  padding-right: 16px; /* .btn 的 14px + 2px：下载态按钮比常规按钮长 2px */
}
.update-row__btn-progress .update-row__fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: var(--primary);
}
.update-row__btn-progress .update-row__label {
  position: relative; /* 位于 fill 之上（DOM 序在后，同为定位元素） */
  display: block;
  width: calc(100% + 30px); /* 按钮 padding 为 0 14px/16px：延展至 padding 盒宽，与 fill 同一坐标系 */
  margin-left: -14px;
  height: 100%;
  line-height: calc(var(--h-control) - 2px); /* 文字垂直居中（扣除按钮上下各 1px 边框） */
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}

/* Task 7: llama.cpp 更新区域样式（2026-09：行恒显示，布局与 LMS 启动器行一致——
   第一行 名称 | 本地版本 | 中段状态文字 | 按钮（右贴缘）；更新可用时下方独立成行放版本选择器。
   2026-09-16 优化：下载进度收敛到按钮本身（紫填充 + 「下载中 NN%」），不再有独立细进度条） */
.llama-section {
  flex-wrap: wrap;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
.llama-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
/* 2026-09-16：.llama-version（「本地: bNNNNN」）span 及其居中样式删除——本地版本号并入 up-to-date 中段 */
/* 2026-09-16 布局修复（截图 bug）：llama.cpp 行中段嵌套在 .llama-info 内，须占满「名称..按钮」
   整段并允许收缩（基类 .update-row__middle 的 flex:1/min-width:0 在 flex 容器 .llama-info 内
   对 .llama-info 的剩余空间生效，此处显式重申，防 .llama-info 结构变更时静默失效）；
   名称列已定宽 99.03px 与按钮列对称 → 占满后的几何中心恰为卡片中心 */
.llama-info .update-row__middle {
  flex: 1;
  min-width: 0;
}
.llama-state-text {
  font-size: var(--fs-label);
  color: var(--muted);
}
.llama-new-version {
  font-size: var(--fs-label);
  color: var(--primary);
}
/* 名称行下方提示行（2026-09 优化）：.llama-section 为 flex-wrap:wrap 布局，
   width:100% 使其独占换行到名称行下方；长提示（如「请先在主界面选择 llama.cpp 安装目录」）
   允许换行完整显示，不再受名称行剩余宽度截断 */
.llama-below {
  width: 100%;
  font-size: var(--fs-label);
  line-height: 1.4;
  white-space: normal;
  word-break: break-word;
  color: var(--muted);
}
.llama-below--error { color: var(--danger); }
.llama-section .update-row__middle {
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 2026-09 视觉统一：Windows 版本下拉改共享 Dropdown 组件（全局 .select-trigger/.dropdown-panel 样式），
   原生 <select> 的 .llama-version-select 样式已删除。
   2026-09-16 优化：按钮下方独立细进度条（细条 + 阶段文字）删除——
   按钮本身即进度条（「下载中 NN%」+ 左侧紫填充），细条与阶段文字冗余。 */
</style>