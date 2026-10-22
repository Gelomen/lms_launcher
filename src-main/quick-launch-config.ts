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
import { TERM_PALETTE_DEFAULT, isTermPaletteId, type TermPaletteId } from './term-palettes';

export type TerminalId = 'pwsh' | 'powershell' | 'cmd' | 'wsl';
export type QuickLaunchKind = 'shell' | 'exe';
// terminal_palette（spec #12 / ADR 0001）：**只有 shell 条目有它**（exe 没有终端，因而没有配色 —— GLOSSARY:19）。
// 读盘与保存两侧都把它规整成六档之一（缺键 / 表外值 → paper），且它不参与 VALIDATION:（与 admin 同一口径）。
export interface QuickLaunchEntry { name: string; type: QuickLaunchKind; shell?: TerminalId; cmd?: string; exe?: string[]; admin?: boolean; terminal_palette?: TermPaletteId }
export type QuickLaunchMap = Record<string, QuickLaunchEntry>;
export interface QuickLaunchList { items: QuickLaunchMap; invalid: string[] }

const TERMINAL_IDS: readonly TerminalId[] = ['pwsh', 'powershell', 'cmd', 'wsl'];
const NAME_MAX = 64;
const FILE_LABEL = 'quick_launch.yaml';

// 错误前缀只有 YAML: / VALIDATION:（check F2 / 索引 G7）。
// err.ql.* 已由任务 8 写进词典（src-main/i18n/dict.ts），所以这里一律改回「字面量 key 的 t() 调用」：
// 索引 K8 的收尾（K20(2)）——key-coverage.test.ts:39-41 的 KEY_CALL 只认字面量，:44 还会把调用点传的
// 参数名与词典取值里的 {占位符} **双向**比对，比原来的常量映射更强。
// key 名与计划 :301 / 任务 8 表 D1–D11 逐字一致（索引 K9 / check C6），占位符名与 dict.ts 逐字一致：
// nameTooLong→{max}、nameDup→{name}、typeInvalid→{type}、terminalMissing→{terminal}、notFound→{id}，
// nameRequired / cmdRequired / exeRequired 无占位符。
// YAML 与 id 格式**不建 err.ql.* 同义键**（索引 K9）：复用词典既有的 err.config.yamlLoadFail /
// err.config.yamlEmpty / err.config.idFormat（dict.ts 的 err.config.*）——同样是字面量 t()。

function isTerminalId(value: unknown): value is TerminalId {
  return typeof value === 'string' && (TERMINAL_IDS as readonly string[]).includes(value);
}

// 配色规整（ADR:3「缺键或非法值一律回落 paper，不判该条目非法」）：六档 id 的清单在 src-main/term-palettes.ts，
// 这里只回落、不抛错 —— 「非法值不得进落盘」那道拒绝门在 IPC 边界（main.ts 的 ql_set_palette，照 set_language）。
function termPaletteOr(value: unknown): TermPaletteId {
  return isTermPaletteId(value) ? value : TERM_PALETTE_DEFAULT;
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

// exe 数组归一（2026-10-17-quick-launch-exe-rows §6.1）：**只有数组**才继续——标量字符串一律非法，
// 不做旧格式兼容（G6/R-01）。逐元素只保留字符串并 trim、丢弃空串；归一后为空 → 调用方按「该条非法」处理。
// 顺序即启动顺序（§6.1），不去重（R-03）、无行数上限（R-04）。
function normalizeExeList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.length > 0) out.push(trimmed);
  }
  return out.length === 0 ? null : out;
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
    return { name, type: 'shell', shell, cmd, admin: e['admin'] === true, terminal_palette: termPaletteOr(e['terminal_palette']) };
  }
  if (e['type'] === 'exe') {
    const exe = normalizeExeList(e['exe']);
    if (exe === null) return null; // 标量 / 缺字段 / 空数组 / 全空串 → 该条非法（§6.1 / §4-8）
    return { name, type: 'exe', exe, admin: e['admin'] === true };
  }
  return null;
}

// 保存路径的校验（规格 §5.3 的 1/3/4/5/6 条）：通过则返回「只含该类型字段」的条目。
// §5.3-5：exe 只判「归一后非空数组」，不校验文件是否存在（启动时反馈；存在性只在启动预检，R-06）。
function validateEntry(entry: QuickLaunchEntry, available: readonly TerminalId[]): QuickLaunchEntry {
  const e = (entry ?? {}) as Partial<QuickLaunchEntry>;
  const name = typeof e.name === 'string' ? e.name.trim() : '';
  if (name.length === 0) throw new Error('VALIDATION: ' + t('err.ql.nameRequired'));
  if (name.length > NAME_MAX) throw new Error('VALIDATION: ' + t('err.ql.nameTooLong', { max: NAME_MAX }));
  if (e.type === 'shell') {
    if (!isTerminalId(e.shell) || !available.includes(e.shell)) {
      throw new Error('VALIDATION: ' + t('err.ql.terminalMissing', { terminal: String(e.shell ?? '') }));
    }
    const cmd = typeof e.cmd === 'string' ? e.cmd.trim() : '';
    if (cmd.length === 0) throw new Error('VALIDATION: ' + t('err.ql.cmdRequired'));
    return { name, type: 'shell', shell: e.shell, cmd, admin: e.admin === true, terminal_palette: termPaletteOr(e.terminal_palette) };
  }
  if (e.type === 'exe') {
    const exe = normalizeExeList(e.exe);
    // 保存路径：空数组 / 全空串 / 缺字段 / 标量写法同样是非法（§6.1「同样归一」+ §4-8 标量一律非法）
    if (exe === null) throw new Error('VALIDATION: ' + t('err.ql.exeRequired'));
    return { name, type: 'exe', exe, admin: e.admin === true };
  }
  throw new Error('VALIDATION: ' + t('err.ql.typeInvalid', { type: String(e.type ?? '') }));
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
    if (otherName === clean.name) throw new Error('VALIDATION: ' + t('err.ql.nameDup', { name: clean.name }));
  }
  const finalId = id === null ? suggestConfigId(Object.keys(map), 'ql') : id;
  map[finalId] = clean;
  writeFileSync(path, dump(map)); // 整表写回（config.ts:142 同一写法）
  return finalId;
}

/**
 * 窄通道落盘（spec #12 的 Implementation Decisions / 票 #13）：只改一条 shell 条目的 terminal_palette **一个键**。
 * 走法 = 读原始表 → 改一键 → 整表写回（与同文件里 qlSave / qlDelete 那两个导出函数同一形状，qlLoad 判为 invalid 的条目不会被抹掉）。
 * **不复用 qlSave**：它是整条覆盖，会把弹窗里别的尚未保存的表单值一并写回该条目。
 * id 不在表里 → VALIDATION:（照同文件 qlDelete 那条，复用词典 err.ql.notFound）；
 * 该条不是 shell（exe 没有终端、因而没有配色，GLOSSARY:19）或非映射形态 → 一个字节都不写、也不抛。
 * 「表外 id 不得进落盘」由 IPC 边界的 isTermPaletteId 挡（main.ts 的 ql_set_palette，照 set_language），
 * 所以这里的参数类型已经是 TermPaletteId。
 */
export function qlSetPalette(path: string, id: string, palette: TermPaletteId): void {
  const map = readRawMap(path);
  if (!Object.prototype.hasOwnProperty.call(map, id)) throw new Error('VALIDATION: ' + t('err.ql.notFound', { id }));
  const entry = map[id];
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return; // 非映射形态的条目（读盘即 invalid）：没有可改的键
  if ((entry as Record<string, unknown>)['type'] !== 'shell') return; // exe 条目不写配色键（与 normalizeEntry / validateEntry 同一口径）
  (entry as Record<string, unknown>)['terminal_palette'] = palette;
  writeFileSync(path, dump(map));
}

/** 删除（规格 §8）：id 不存在 → VALIDATION:（文件不存在同样是「不存在」，不是 MISSING）。 */
export function qlDelete(path: string, id: string): void {
  const map = readRawMap(path);
  if (!Object.prototype.hasOwnProperty.call(map, id)) throw new Error('VALIDATION: ' + t('err.ql.notFound', { id }));
  delete map[id];
  writeFileSync(path, dump(map));
}

/** 名称是否可用（计划接口）：trim 后 1..64。 */
export function validateQuickLaunchName(name: string): boolean {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= NAME_MAX;
}
