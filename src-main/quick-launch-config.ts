// src-main/quick-launch-config.ts
// 快捷启动卡片（任务 3）：quick_launch.yaml 的加载 / 校验 / 保存 / 删除。
// 规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §5.1–§5.4、§8（ql_list / ql_save / ql_delete）
// 只管数据：不 import node-pty、不 spawn——终端生命周期在任务 5 的 QuickLaunchManager。
// YAML 读写口径照搬 src-main/config.ts:45-57 / :128-143（读→改→整表写回），
// 但**缺失/空文件不抛 MISSING**（规格 §5.2：首次使用必然没有这个文件，与 configsLoad 语义不同）。
import { t } from './i18n';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parse, stringify as dump } from 'yaml';
import { suggestConfigId, validateConfigId } from './config';

export type TerminalId = 'pwsh' | 'powershell' | 'cmd' | 'wsl';
export type QuickLaunchKind = 'shell' | 'exe';
export interface QuickLaunchEntry { name: string; type: QuickLaunchKind; shell?: TerminalId; cmd?: string; exe?: string }
export type QuickLaunchMap = Record<string, QuickLaunchEntry>;
export interface QuickLaunchList { items: QuickLaunchMap; invalid: string[] }

const TERMINAL_IDS: readonly TerminalId[] = ['pwsh', 'powershell', 'cmd', 'wsl'];
const NAME_MAX = 64;
const FILE_LABEL = 'quick_launch.yaml';

// 已定口径 K8（check F3）：err.ql.* 词典键要到任务 8 才落地。key-coverage.test.ts:39-41 的 KEY_CALL
// 只认「t('字面量')」，写死字面量就报「词典缺键」；这里用常量映射传 key（正则不匹配 → 该守护跳过），
// 任务 8 落地词典后再把调用点改回字面量 t()。错误前缀只有 YAML: / VALIDATION:（check F2 / 索引 G7）。
// key 名与计划 :301 / 任务 8 表 D1–D11 逐字一致（索引 K9 / check C6），占位符名见任务 8 表 D 段注：
// nameTooLong→{max}、nameDup→{name}、typeInvalid→{type}、terminalMissing→{terminal}、notFound→{id}，
// nameRequired / cmdRequired / exeRequired 无占位符。
// YAML 与 id 格式**不建 err.ql.* 同义键**（索引 K9）：复用词典既有的 err.config.yamlLoadFail /
// err.config.yamlEmpty / err.config.idFormat（dict.ts:220-226 / :500-506）。词典里已有这三个键，
// 所以它们写成字面量 t()——key-coverage 的占位符双向比对（:44 / :131-151）正好守护 {name}/{msg} 拼写。
const QL_ERR = {
  nameRequired: 'err.ql.nameRequired',
  nameTooLong: 'err.ql.nameTooLong',
  nameDup: 'err.ql.nameDup',
  typeInvalid: 'err.ql.typeInvalid',
  terminalMissing: 'err.ql.terminalMissing',
  cmdRequired: 'err.ql.cmdRequired',
  exeRequired: 'err.ql.exeRequired',
  notFound: 'err.ql.notFound',
} as const;

// 参数是「词典 key 本身」（QL_ERR 的取值），不是 QL_ERR 的属性名：变量传 key → key-coverage 跳过
function invalidError(key: string, params?: Record<string, string | number>): Error {
  return new Error('VALIDATION: ' + t(key, params));
}

function isTerminalId(value: unknown): value is TerminalId {
  return typeof value === 'string' && (TERMINAL_IDS as readonly string[]).includes(value);
}

// 顶层必须是映射：解析失败 / 顶层非对象（含数组、标量、null）→ YAML:（规格 §5.2）
function parseYamlMap(s: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = parse(s);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error('YAML: ' + t('err.config.yamlLoadFail', { name: FILE_LABEL, msg }));
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('YAML: ' + t('err.config.yamlEmpty', { name: FILE_LABEL }));
  }
  return parsed as Record<string, unknown>;
}

// 原始映射（未做条目校验）：缺失 / 空 → {}，**不抛 MISSING**（check F1）。
// 保存与删除走它，而不是走 qlLoad 的 items——否则一次保存会把 qlLoad 判为 invalid 的条目静默抹掉。
function readRawMap(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const s = readFileSync(path, 'utf8');
  if (s.trim().length === 0) return {};
  return parseYamlMap(s);
}

// 条目形状校验（规格 §5.3 的 1/3/4/5 条 + §5.3-6 的字段规整）。
// 加载路径不判 §5.3-2（重名）与 §5.3-4 的「终端当前可用」——两者只在保存路径成立（§5.2 只说「单条条目非法」）。
// 返回 trim 后的规范条目；非法 → null（加载时该条进 invalid，保存时由 validateEntry 抛 VALIDATION:）。
function normalizeEntry(raw: unknown): QuickLaunchEntry | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  const name = typeof e['name'] === 'string' ? (e['name'] as string).trim() : '';
  if (name.length === 0 || name.length > NAME_MAX) return null;
  if (e['type'] === 'shell') {
    const shell = e['shell'];
    const cmd = typeof e['cmd'] === 'string' ? (e['cmd'] as string).trim() : '';
    if (!isTerminalId(shell) || cmd.length === 0) return null;
    return { name, type: 'shell', shell, cmd };
  }
  if (e['type'] === 'exe') {
    const exe = typeof e['exe'] === 'string' ? (e['exe'] as string).trim() : '';
    if (exe.length === 0) return null;
    return { name, type: 'exe', exe };
  }
  return null;
}

// 保存路径的校验（规格 §5.3 的 1/3/4/5/6 条）：通过则返回「只含该类型字段」的条目。
// §5.3-5：exe 只判非空，不校验文件是否存在（启动时反馈）。
function validateEntry(entry: QuickLaunchEntry, available: readonly TerminalId[]): QuickLaunchEntry {
  const e = (entry ?? {}) as Partial<QuickLaunchEntry>;
  const name = typeof e.name === 'string' ? e.name.trim() : '';
  if (name.length === 0) throw invalidError(QL_ERR.nameRequired);
  if (name.length > NAME_MAX) throw invalidError(QL_ERR.nameTooLong, { max: NAME_MAX });
  if (e.type === 'shell') {
    if (!isTerminalId(e.shell) || !available.includes(e.shell)) {
      throw invalidError(QL_ERR.terminalMissing, { terminal: String(e.shell ?? '') });
    }
    const cmd = typeof e.cmd === 'string' ? e.cmd.trim() : '';
    if (cmd.length === 0) throw invalidError(QL_ERR.cmdRequired);
    return { name, type: 'shell', shell: e.shell, cmd };
  }
  if (e.type === 'exe') {
    const exe = typeof e.exe === 'string' ? e.exe.trim() : '';
    if (exe.length === 0) throw invalidError(QL_ERR.exeRequired);
    return { name, type: 'exe', exe };
  }
  throw invalidError(QL_ERR.typeInvalid, { type: String(e.type ?? '') });
}

/** 加载（规格 §5.2）：缺失/空 → 空表；YAML 坏或顶层非对象 → YAML:；单条非法 → 跳过该条、id 收进 invalid。 */
export function qlLoad(path: string): QuickLaunchList {
  const items: QuickLaunchMap = {};
  const invalid: string[] = [];
  for (const [id, raw] of Object.entries(readRawMap(path))) {
    const entry = normalizeEntry(raw);
    if (entry) items[id] = entry;
    else invalid.push(id);
  }
  return { items, invalid };
}

/**
 * 保存（规格 §5.3 / §8）：校验通过才落盘，返回最终 id。
 * id === null → suggestConfigId(existing, 'ql')（规格 §5.4，任务 2 已支持前缀）；显式 id 沿用，
 * 但它就是 yaml 的 key，故仍须通过 validateConfigId（与 config.ts:129 saveConfigEntry 同一口径）。
 * 重名判定跳过自身 id，因此「编辑并保存同一条目」不会被自己的名字挡住。
 */
export function qlSave(path: string, id: string | null, entry: QuickLaunchEntry, available: TerminalId[]): string {
  const clean = validateEntry(entry, available);
  // 词典已有键 → 写字面量 t()，与 config.ts:129 同一写法（无占位符，见索引 K9）
  if (id !== null && !validateConfigId(id)) throw new Error('VALIDATION: ' + t('err.config.idFormat'));
  const map = readRawMap(path);
  // §5.3-2：与其它条目不重复——trim 后精确比较、区分大小写
  for (const [otherId, raw] of Object.entries(map)) {
    if (otherId === id) continue;
    const otherName = raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      && typeof (raw as Record<string, unknown>)['name'] === 'string'
      ? ((raw as Record<string, unknown>)['name'] as string).trim()
      : '';
    if (otherName === clean.name) throw invalidError(QL_ERR.nameDup, { name: clean.name });
  }
  const finalId = id === null ? suggestConfigId(Object.keys(map), 'ql') : id;
  map[finalId] = clean;
  writeFileSync(path, dump(map)); // 整表写回（config.ts:142 同一写法）
  return finalId;
}

/** 删除（规格 §8）：id 不存在 → VALIDATION:（文件不存在同样是「不存在」，不是 MISSING）。 */
export function qlDelete(path: string, id: string): void {
  const map = readRawMap(path);
  if (!Object.prototype.hasOwnProperty.call(map, id)) throw invalidError(QL_ERR.notFound, { id });
  delete map[id];
  writeFileSync(path, dump(map));
}

/** 名称是否可用（计划接口）：trim 后 1..64。 */
export function validateQuickLaunchName(name: string): boolean {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= NAME_MAX;
}
