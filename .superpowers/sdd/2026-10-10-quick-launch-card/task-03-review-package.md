# 审查包 · 任务 3（quick-launch-config.ts）

BASE = be3475c（HEAD 未变：按 K5 实现者不提交，改动全部在工作区；两个源码文件是**未跟踪**新文件，git diff 不显示，故附全文）

## git status --porcelain（每行用方括号定界，前导空格 = 未暂存）

```
 M docs/superpowers/checks/2026-10-10-quick-launch-card/task-03-quick-launch-config.md
?? src-main/quick-launch-config.test.ts
?? src-main/quick-launch-config.ts
```

## git diff HEAD --stat（已跟踪文件）

```
.../task-03-quick-launch-config.md                 | 89 ++++++++++++----------
 1 file changed, 48 insertions(+), 41 deletions(-)
```

## 新增未跟踪文件全文：src-main/quick-launch-config.ts（167 行）

```ts
  1: // src-main/quick-launch-config.ts
  2: // 快捷启动卡片（任务 3）：quick_launch.yaml 的加载 / 校验 / 保存 / 删除。
  3: // 规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §5.1–§5.4、§8（ql_list / ql_save / ql_delete）
  4: // 只管数据：不 import node-pty、不 spawn——终端生命周期在任务 5 的 QuickLaunchManager。
  5: // YAML 读写口径照搬 src-main/config.ts:45-57 / :128-143（读→改→整表写回），
  6: // 但**缺失/空文件不抛 MISSING**（规格 §5.2：首次使用必然没有这个文件，与 configsLoad 语义不同）。
  7: import { t } from './i18n';
  8: import { readFileSync, writeFileSync, existsSync } from 'node:fs';
  9: import { parse, stringify as dump } from 'yaml';
 10: import { suggestConfigId, validateConfigId } from './config';
 11: 
 12: export type TerminalId = 'pwsh' | 'powershell' | 'cmd' | 'wsl';
 13: export type QuickLaunchKind = 'shell' | 'exe';
 14: export interface QuickLaunchEntry { name: string; type: QuickLaunchKind; shell?: TerminalId; cmd?: string; exe?: string }
 15: export type QuickLaunchMap = Record<string, QuickLaunchEntry>;
 16: export interface QuickLaunchList { items: QuickLaunchMap; invalid: string[] }
 17: 
 18: const TERMINAL_IDS: readonly TerminalId[] = ['pwsh', 'powershell', 'cmd', 'wsl'];
 19: const NAME_MAX = 64;
 20: const FILE_LABEL = 'quick_launch.yaml';
 21: 
 22: // 已定口径 K8（check F3）：err.ql.* 词典键要到任务 8 才落地。key-coverage.test.ts:39-41 的 KEY_CALL
 23: // 只认「t('字面量')」，写死字面量就报「词典缺键」；这里用常量映射传 key（正则不匹配 → 该守护跳过），
 24: // 任务 8 落地词典后再把调用点改回字面量 t()。错误前缀只有 YAML: / VALIDATION:（check F2 / 索引 G7）。
 25: const QL_ERR = {
 26:   yamlLoadFail: 'err.ql.yamlLoadFail',
 27:   yamlNotObject: 'err.ql.yamlNotObject',
 28:   nameRequired: 'err.ql.nameRequired',
 29:   nameTooLong: 'err.ql.nameTooLong',
 30:   nameDuplicate: 'err.ql.nameDuplicate',
 31:   badType: 'err.ql.badType',
 32:   badTerminal: 'err.ql.badTerminal',
 33:   cmdRequired: 'err.ql.cmdRequired',
 34:   exeRequired: 'err.ql.exeRequired',
 35:   idFormat: 'err.ql.idFormat',
 36:   notFound: 'err.ql.notFound',
 37: } as const;
 38: 
 39: // 参数是「词典 key 本身」（QL_ERR 的取值），不是 QL_ERR 的属性名：变量传 key → key-coverage 跳过
 40: function invalidError(key: string, params?: Record<string, string | number>): Error {
 41:   return new Error('VALIDATION: ' + t(key, params));
 42: }
 43: 
 44: function isTerminalId(value: unknown): value is TerminalId {
 45:   return typeof value === 'string' && (TERMINAL_IDS as readonly string[]).includes(value);
 46: }
 47: 
 48: // 顶层必须是映射：解析失败 / 顶层非对象（含数组、标量、null）→ YAML:（规格 §5.2）
 49: function parseYamlMap(s: string): Record<string, unknown> {
 50:   let parsed: unknown;
 51:   try {
 52:     parsed = parse(s);
 53:   } catch (e) {
 54:     const msg = e instanceof Error ? e.message : String(e);
 55:     throw new Error('YAML: ' + t(QL_ERR.yamlLoadFail, { name: FILE_LABEL, msg }));
 56:   }
 57:   if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
 58:     throw new Error('YAML: ' + t(QL_ERR.yamlNotObject, { name: FILE_LABEL }));
 59:   }
 60:   return parsed as Record<string, unknown>;
 61: }
 62: 
 63: // 原始映射（未做条目校验）：缺失 / 空 → {}，**不抛 MISSING**（check F1）。
 64: // 保存与删除走它，而不是走 qlLoad 的 items——否则一次保存会把 qlLoad 判为 invalid 的条目静默抹掉。
 65: function readRawMap(path: string): Record<string, unknown> {
 66:   if (!existsSync(path)) return {};
 67:   const s = readFileSync(path, 'utf8');
 68:   if (s.trim().length === 0) return {};
 69:   return parseYamlMap(s);
 70: }
 71: 
 72: // 条目形状校验（规格 §5.3 的 1/3/4/5 条 + §5.3-6 的字段规整）。
 73: // 加载路径不判 §5.3-2（重名）与 §5.3-4 的「终端当前可用」——两者只在保存路径成立（§5.2 只说「单条条目非法」）。
 74: // 返回 trim 后的规范条目；非法 → null（加载时该条进 invalid，保存时由 validateEntry 抛 VALIDATION:）。
 75: function normalizeEntry(raw: unknown): QuickLaunchEntry | null {
 76:   if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
 77:   const e = raw as Record<string, unknown>;
 78:   const name = typeof e['name'] === 'string' ? (e['name'] as string).trim() : '';
 79:   if (name.length === 0 || name.length > NAME_MAX) return null;
 80:   if (e['type'] === 'shell') {
 81:     const shell = e['shell'];
 82:     const cmd = typeof e['cmd'] === 'string' ? (e['cmd'] as string).trim() : '';
 83:     if (!isTerminalId(shell) || cmd.length === 0) return null;
 84:     return { name, type: 'shell', shell, cmd };
 85:   }
 86:   if (e['type'] === 'exe') {
 87:     const exe = typeof e['exe'] === 'string' ? (e['exe'] as string).trim() : '';
 88:     if (exe.length === 0) return null;
 89:     return { name, type: 'exe', exe };
 90:   }
 91:   return null;
 92: }
 93: 
 94: // 保存路径的校验（规格 §5.3 的 1/3/4/5/6 条）：通过则返回「只含该类型字段」的条目。
 95: // §5.3-5：exe 只判非空，不校验文件是否存在（启动时反馈）。
 96: function validateEntry(entry: QuickLaunchEntry, available: readonly TerminalId[]): QuickLaunchEntry {
 97:   const e = (entry ?? {}) as Partial<QuickLaunchEntry>;
 98:   const name = typeof e.name === 'string' ? e.name.trim() : '';
 99:   if (name.length === 0) throw invalidError(QL_ERR.nameRequired);
100:   if (name.length > NAME_MAX) throw invalidError(QL_ERR.nameTooLong, { max: NAME_MAX });
101:   if (e.type === 'shell') {
102:     if (!isTerminalId(e.shell) || !available.includes(e.shell)) {
103:       throw invalidError(QL_ERR.badTerminal, { terminal: String(e.shell ?? '') });
104:     }
105:     const cmd = typeof e.cmd === 'string' ? e.cmd.trim() : '';
106:     if (cmd.length === 0) throw invalidError(QL_ERR.cmdRequired);
107:     return { name, type: 'shell', shell: e.shell, cmd };
108:   }
109:   if (e.type === 'exe') {
110:     const exe = typeof e.exe === 'string' ? e.exe.trim() : '';
111:     if (exe.length === 0) throw invalidError(QL_ERR.exeRequired);
112:     return { name, type: 'exe', exe };
113:   }
114:   throw invalidError(QL_ERR.badType, { type: String(e.type ?? '') });
115: }
116: 
117: /** 加载（规格 §5.2）：缺失/空 → 空表；YAML 坏或顶层非对象 → YAML:；单条非法 → 跳过该条、id 收进 invalid。 */
118: export function qlLoad(path: string): QuickLaunchList {
119:   const items: QuickLaunchMap = {};
120:   const invalid: string[] = [];
121:   for (const [id, raw] of Object.entries(readRawMap(path))) {
122:     const entry = normalizeEntry(raw);
123:     if (entry) items[id] = entry;
124:     else invalid.push(id);
125:   }
126:   return { items, invalid };
127: }
128: 
129: /**
130:  * 保存（规格 §5.3 / §8）：校验通过才落盘，返回最终 id。
131:  * id === null → suggestConfigId(existing, 'ql')（规格 §5.4，任务 2 已支持前缀）；显式 id 沿用，
132:  * 但它就是 yaml 的 key，故仍须通过 validateConfigId（与 config.ts:129 saveConfigEntry 同一口径）。
133:  * 重名判定跳过自身 id，因此「编辑并保存同一条目」不会被自己的名字挡住。
134:  */
135: export function qlSave(path: string, id: string | null, entry: QuickLaunchEntry, available: TerminalId[]): string {
136:   const clean = validateEntry(entry, available);
137:   if (id !== null && !validateConfigId(id)) throw invalidError(QL_ERR.idFormat, { id });
138:   const map = readRawMap(path);
139:   // §5.3-2：与其它条目不重复——trim 后精确比较、区分大小写
140:   for (const [otherId, raw] of Object.entries(map)) {
141:     if (otherId === id) continue;
142:     const otherName = raw !== null && typeof raw === 'object' && !Array.isArray(raw)
143:       && typeof (raw as Record<string, unknown>)['name'] === 'string'
144:       ? ((raw as Record<string, unknown>)['name'] as string).trim()
145:       : '';
146:     if (otherName === clean.name) throw invalidError(QL_ERR.nameDuplicate, { name: clean.name });
147:   }
148:   const finalId = id === null ? suggestConfigId(Object.keys(map), 'ql') : id;
149:   map[finalId] = clean;
150:   writeFileSync(path, dump(map)); // 整表写回（config.ts:142 同一写法）
151:   return finalId;
152: }
153: 
154: /** 删除（规格 §8）：id 不存在 → VALIDATION:（文件不存在同样是「不存在」，不是 MISSING）。 */
155: export function qlDelete(path: string, id: string): void {
156:   const map = readRawMap(path);
157:   if (!Object.prototype.hasOwnProperty.call(map, id)) throw invalidError(QL_ERR.notFound, { id });
158:   delete map[id];
159:   writeFileSync(path, dump(map));
160: }
161: 
162: /** 名称是否可用（计划接口）：trim 后 1..64。 */
163: export function validateQuickLaunchName(name: string): boolean {
164:   if (typeof name !== 'string') return false;
165:   const trimmed = name.trim();
166:   return trimmed.length >= 1 && trimmed.length <= NAME_MAX;
167: }
```

## 新增未跟踪文件全文：src-main/quick-launch-config.test.ts（317 行）

```ts
  1: // src-main/quick-launch-config.test.ts
  2: // 任务 3：quick_launch.yaml 的加载 / 校验 / 保存 / 删除。
  3: // 规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §5.1 / §5.2 / §5.3 / §5.4 / §8
  4: // 用例 ↔ check 表 E1–E15 的对应关系见 .superpowers/sdd/2026-10-10-quick-launch-card/task-03-report.md
  5: // 夹具一律用 src-main/test-utils.ts 的 tmpPath / rm / writeText / readText（A2）
  6: import { describe, it, expect } from 'vitest';
  7: import {
  8:   qlLoad,
  9:   qlSave,
 10:   qlDelete,
 11:   validateQuickLaunchName,
 12:   type QuickLaunchEntry,
 13:   type TerminalId,
 14: } from './quick-launch-config';
 15: import { validateConfigId } from './config';
 16: import { tmpPath, rm, writeText, readText } from './test-utils';
 17: 
 18: const NL = String.fromCharCode(10);
 19: const lines = (...ls: string[]): string => ls.join(NL) + NL;
 20: 
 21: describe('quick-launch-config.ts', () => {
 22: 
 23:   // E1（规格 §5.2 / check F1）：文件不存在 → 空表，不抛 MISSING
 24:   it('ql_load_missing_file_returns_empty_list_without_MISSING', () => {
 25:     const p = tmpPath('ql_missing.yaml');
 26:     rm(p);
 27:     expect(qlLoad(p)).toEqual({ items: {}, invalid: [] });
 28:   });
 29: 
 30:   // E2（规格 §5.2）：空文件 / 只有空白 → 空表
 31:   it('ql_load_empty_or_blank_file_returns_empty_list', () => {
 32:     const p = tmpPath('ql_empty.yaml');
 33:     rm(p);
 34:     for (const blank of ['', '   ' + NL, NL, '\t' + NL + '  ']) {
 35:       writeText(p, blank);
 36:       expect(qlLoad(p)).toEqual({ items: {}, invalid: [] });
 37:     }
 38:     rm(p);
 39:   });
 40: 
 41:   // E3a（规格 §5.2）：YAML 解析失败 → YAML:
 42:   it('ql_load_yaml_parse_error_throws_yaml_prefix', () => {
 43:     const p = tmpPath('ql_bad_yaml.yaml');
 44:     rm(p);
 45:     writeText(p, lines('ql1:', '  name: "unclosed'));
 46:     expect(() => qlLoad(p)).toThrow(/^YAML:/);
 47:     writeText(p, lines('ql1:', '  name: A', '   type: shell'));
 48:     expect(() => qlLoad(p)).toThrow(/^YAML:/);
 49:     rm(p);
 50:   });
 51: 
 52:   // E3b（规格 §5.2）：顶层非对象（数组 / 标量）→ YAML:
 53:   it('ql_load_top_level_not_object_throws_yaml_prefix', () => {
 54:     const p = tmpPath('ql_not_object.yaml');
 55:     rm(p);
 56:     for (const bad of [lines('- 1', '- 2'), lines('just a string')]) {
 57:       writeText(p, bad);
 58:       expect(() => qlLoad(p)).toThrow(/^YAML:/);
 59:     }
 60:     rm(p);
 61:   });
 62: 
 63:   // 规格 §5.1 形状：示例文件读回即卡片要的形状（E4 的正面对照）
 64:   it('ql_load_reads_the_shape_from_spec_5_1', () => {
 65:     const p = tmpPath('ql_spec_shape.yaml');
 66:     rm(p);
 67:     writeText(p, lines(
 68:       'qlx1a2b3c4:',
 69:       '  name: 启动 webui',
 70:       '  type: shell',
 71:       '  shell: pwsh',
 72:       '  cmd: python -m webui',
 73:       'qlp9q8r7s6:',
 74:       '  name: LM Studio',
 75:       '  type: exe',
 76:       '  exe: D:\\Tools\\LM Studio.exe',
 77:     ));
 78:     const list = qlLoad(p);
 79:     expect(list.invalid).toEqual([]);
 80:     expect(Object.keys(list.items)).toEqual(['qlx1a2b3c4', 'qlp9q8r7s6']);
 81:     expect(list.items['qlx1a2b3c4']).toEqual({ name: '启动 webui', type: 'shell', shell: 'pwsh', cmd: 'python -m webui' });
 82:     expect(list.items['qlp9q8r7s6']).toEqual({ name: 'LM Studio', type: 'exe', exe: 'D:\\Tools\\LM Studio.exe' });
 83:     rm(p);
 84:   });
 85: 
 86:   // E4（规格 §5.2）：单条非法 → 跳过该条、id 进 invalid，其余照常返回
 87:   it('ql_load_skips_entry_missing_type_and_collects_its_id', () => {
 88:     const p = tmpPath('ql_partial.yaml');
 89:     rm(p);
 90:     writeText(p, lines(
 91:       'good01:',
 92:       '  name: 好的',
 93:       '  type: shell',
 94:       '  shell: pwsh',
 95:       '  cmd: python -m webui',
 96:       'bad01:',
 97:       '  name: 坏的',
 98:       '  shell: pwsh',
 99:       '  cmd: x',
100:     ));
101:     const list = qlLoad(p);
102:     expect(Object.keys(list.items)).toEqual(['good01']);
103:     expect(list.items['good01']).toEqual({ name: '好的', type: 'shell', shell: 'pwsh', cmd: 'python -m webui' });
104:     expect(list.invalid).toEqual(['bad01']);
105:     rm(p);
106:   });
107: 
108:   // E4 补充：各种非法条目形态都进 invalid，合法条目不受牵连
109:   it('ql_load_collects_every_invalid_entry_shape', () => {
110:     const p = tmpPath('ql_invalid_shapes.yaml');
111:     rm(p);
112:     writeText(p, lines(
113:       'ok01:',
114:       '  name: ok',
115:       '  type: exe',
116:       '  exe: a.exe',
117:       'noName01:',
118:       '  type: exe',
119:       '  exe: a.exe',
120:       'blankName01:',
121:       '  name: "   "',
122:       '  type: exe',
123:       '  exe: a.exe',
124:       'badType01:',
125:       '  name: badtype',
126:       '  type: bat',
127:       '  cmd: x',
128:       'scalar01: hello',
129:       'null01:',
130:       'noCmd01:',
131:       '  name: nocmd',
132:       '  type: shell',
133:       '  shell: pwsh',
134:       'badTerm01:',
135:       '  name: badterm',
136:       '  type: shell',
137:       '  shell: wt',
138:       '  cmd: x',
139:       'noExe01:',
140:       '  name: noexe',
141:       '  type: exe',
142:     ));
143:     const list = qlLoad(p);
144:     expect(Object.keys(list.items)).toEqual(['ok01']);
145:     expect(list.invalid).toEqual([
146:       'noName01', 'blankName01', 'badType01', 'scalar01', 'null01', 'noCmd01', 'badTerm01', 'noExe01',
147:     ]);
148:     rm(p);
149:   });
150: 
151:   // E5（规格 §5.3-1）：name trim 后为空 → VALIDATION:，且失败不落盘
152:   it('ql_save_rejects_blank_name_and_writes_nothing', () => {
153:     const p = tmpPath('ql_name_blank.yaml');
154:     rm(p);
155:     expect(() => qlSave(p, null, { name: '  ', type: 'shell', shell: 'pwsh', cmd: 'x' }, ['pwsh'])).toThrow(/^VALIDATION:/);
156:     expect(() => qlSave(p, null, { name: '', type: 'exe', exe: 'a.exe' }, [])).toThrow(/^VALIDATION:/);
157:     expect(qlLoad(p)).toEqual({ items: {}, invalid: [] });
158:   });
159: 
160:   // E6（规格 §5.3-1）：name 长度按 trim 后计，> 64 → VALIDATION:
161:   it('ql_save_rejects_name_longer_than_64_after_trim', () => {
162:     const p = tmpPath('ql_name_long.yaml');
163:     rm(p);
164:     const ok64 = 'x'.repeat(64);
165:     expect(qlSave(p, null, { name: ok64, type: 'exe', exe: 'a.exe' }, [])).toBeTruthy();
166:     expect(() => qlSave(p, null, { name: ok64 + 'x', type: 'exe', exe: 'b.exe' }, [])).toThrow(/^VALIDATION:/);
167:     // 长度按 trim 后计：另一个 64 字符名两侧带空格仍合法
168:     expect(qlSave(p, null, { name: '  ' + 'y'.repeat(64) + '  ', type: 'exe', exe: 'c.exe' }, [])).toBeTruthy();
169:     rm(p);
170:   });
171: 
172:   // E7（规格 §5.3-3）：type 不在 {'shell','exe'} → VALIDATION:
173:   it('ql_save_rejects_type_outside_shell_and_exe', () => {
174:     const p = tmpPath('ql_bad_type.yaml');
175:     rm(p);
176:     const bat = { name: 'A', type: 'bat', cmd: 'x' } as unknown as QuickLaunchEntry;
177:     expect(() => qlSave(p, null, bat, ['pwsh'])).toThrow(/^VALIDATION:/);
178:     expect(() => qlSave(p, null, { name: 'A' } as unknown as QuickLaunchEntry, [])).toThrow(/^VALIDATION:/);
179:     expect(qlLoad(p)).toEqual({ items: {}, invalid: [] });
180:   });
181: 
182:   // E8（规格 §5.3-4）：shell 不在四种之内，或该终端不在 available 里 → VALIDATION:
183:   it('ql_save_rejects_terminal_outside_four_or_not_available', () => {
184:     const p = tmpPath('ql_terminal.yaml');
185:     rm(p);
186:     expect(() => qlSave(p, null, { name: 'A', type: 'shell', shell: 'wsl', cmd: 'x' }, ['pwsh'])).toThrow(/^VALIDATION:/);
187:     expect(() => qlSave(p, null, { name: 'A', type: 'shell', shell: 'wt' as TerminalId, cmd: 'x' }, ['wt' as TerminalId])).toThrow(/^VALIDATION:/);
188:     expect(() => qlSave(p, null, { name: 'A', type: 'shell', cmd: 'x' }, ['pwsh'])).toThrow(/^VALIDATION:/);
189:     for (const term of ['pwsh', 'powershell', 'cmd', 'wsl'] as TerminalId[]) {
190:       expect(qlSave(p, null, { name: 'n-' + term, type: 'shell', shell: term, cmd: 'x' }, [term])).toBeTruthy();
191:     }
192:     rm(p);
193:   });
194: 
195:   // E9（规格 §5.3-4）：shell 类型的 cmd trim 后为空 → VALIDATION:
196:   it('ql_save_rejects_blank_cmd_for_shell_entry', () => {
197:     const p = tmpPath('ql_blank_cmd.yaml');
198:     rm(p);
199:     expect(() => qlSave(p, null, { name: 'A', type: 'shell', shell: 'pwsh', cmd: '   ' }, ['pwsh'])).toThrow(/^VALIDATION:/);
200:     expect(() => qlSave(p, null, { name: 'A', type: 'shell', shell: 'pwsh' }, ['pwsh'])).toThrow(/^VALIDATION:/);
201:     expect(qlLoad(p)).toEqual({ items: {}, invalid: [] });
202:   });
203: 
204:   // E10（规格 §5.3-5）：exe trim 后为空 → VALIDATION:；不校验文件是否存在
205:   it('ql_save_rejects_blank_exe_but_never_checks_file_existence', () => {
206:     const p = tmpPath('ql_exe.yaml');
207:     rm(p);
208:     expect(() => qlSave(p, null, { name: 'A', type: 'exe', exe: '   ' }, [])).toThrow(/^VALIDATION:/);
209:     expect(() => qlSave(p, null, { name: 'A', type: 'exe' }, [])).toThrow(/^VALIDATION:/);
210:     const missing = 'D:\\no-such-dir\\no-such.exe';
211:     const id = qlSave(p, null, { name: 'A', type: 'exe', exe: missing }, []);
212:     expect(qlLoad(p).items[id].exe).toBe(missing);
213:     rm(p);
214:   });
215: 
216:   // E11（规格 §5.3-2）：重名按 trim 后精确比较、区分大小写；覆盖保存自身不算重名
217:   it('ql_save_rejects_duplicate_name_compared_trimmed_case_sensitive', () => {
218:     const p = tmpPath('ql_dup_name.yaml');
219:     rm(p);
220:     const first = qlSave(p, null, { name: 'A', type: 'exe', exe: 'a.exe' }, []);
221:     expect(() => qlSave(p, null, { name: 'A', type: 'exe', exe: 'b.exe' }, [])).toThrow(/^VALIDATION:/);
222:     expect(() => qlSave(p, null, { name: '  A  ', type: 'exe', exe: 'b.exe' }, [])).toThrow(/^VALIDATION:/);
223:     const lower = qlSave(p, null, { name: 'a', type: 'exe', exe: 'c.exe' }, []); // 区分大小写 → 允许
224:     expect(lower).toBeTruthy();
225:     const again = qlSave(p, first, { name: 'A', type: 'exe', exe: 'a2.exe' }, []); // 与自身同名不算重名
226:     expect(again).toBe(first);
227:     expect(qlLoad(p).items[first].exe).toBe('a2.exe');
228:     rm(p);
229:   });
230: 
231:   // E12（规格 §5.3-6）：只写该类型字段——用 readText 做字节级断言
232:   it('ql_save_writes_only_the_fields_of_that_kind', () => {
233:     const p = tmpPath('ql_field_filter.yaml');
234:     rm(p);
235:     const shellId = qlSave(p, null, {
236:       name: 'sh', type: 'shell', shell: 'pwsh', cmd: 'python -m webui', exe: 'D:\\should\\drop.exe',
237:     }, ['pwsh']);
238:     const rawShell = readText(p);
239:     expect(rawShell).toMatch(/^ql[0-9a-z]+:$/m);
240:     expect(rawShell).not.toMatch(/^\s*exe:/m); // 字节级：exe 键没有落盘
241:     expect(qlLoad(p).items[shellId]).toEqual({ name: 'sh', type: 'shell', shell: 'pwsh', cmd: 'python -m webui' });
242:     expect(qlLoad(p).items[shellId]).not.toHaveProperty('exe');
243:     rm(p);
244:     const exeId = qlSave(p, null, {
245:       name: 'ex', type: 'exe', exe: 'D:\\Tools\\LM Studio.exe', shell: 'pwsh', cmd: 'ignored',
246:     }, ['pwsh']);
247:     const rawExe = readText(p);
248:     expect(rawExe).not.toMatch(/^\s*shell:/m);
249:     expect(rawExe).not.toMatch(/^\s*cmd:/m);
250:     expect(qlLoad(p).items[exeId]).toEqual({ name: 'ex', type: 'exe', exe: 'D:\\Tools\\LM Studio.exe' });
251:     expect(qlLoad(p).items[exeId]).not.toHaveProperty('shell');
252:     expect(qlLoad(p).items[exeId]).not.toHaveProperty('cmd');
253:     rm(p);
254:   });
255: 
256:   // E13（规格 §5.4 / §8）：id === null → ql 前缀且通过 validateConfigId；显式 id 原样沿用并返回
257:   it('ql_save_generates_ql_prefixed_valid_id_or_keeps_explicit_id', () => {
258:     const p = tmpPath('ql_id.yaml');
259:     rm(p);
260:     const generated = qlSave(p, null, { name: 'A', type: 'exe', exe: 'a.exe' }, []);
261:     expect(generated).toMatch(/^ql/);
262:     expect(validateConfigId(generated)).toBe(true);
263:     expect(Object.keys(qlLoad(p).items)).toEqual([generated]);
264:     const kept = qlSave(p, 'qlkeep01', { name: 'B', type: 'exe', exe: 'b.exe' }, []);
265:     expect(kept).toBe('qlkeep01');
266:     // 显式 id 就是 yaml 的 key，仍须通过 validateConfigId（与 config.ts:129 同一口径）
267:     expect(() => qlSave(p, 'Bad ID', { name: 'C', type: 'exe', exe: 'c.exe' }, [])).toThrow(/^VALIDATION:/);
268:     expect(Object.keys(qlLoad(p).items).sort()).toEqual([generated, 'qlkeep01'].sort());
269:     const ids = new Set<string>();
270:     for (let i = 0; i < 5; i++) ids.add(qlSave(p, null, { name: 'n' + i, type: 'exe', exe: 'x.exe' }, []));
271:     expect(ids.size).toBe(5); // 生成的 id 互不相同
272:     rm(p);
273:   });
274: 
275:   // E14（规格 §8）：删除不存在的 id → VALIDATION:；删除存在的 id → 读回该键消失
276:   it('ql_delete_unknown_id_throws_validation_and_removes_existing_key', () => {
277:     const p = tmpPath('ql_delete.yaml');
278:     rm(p);
279:     const id = qlSave(p, null, { name: 'A', type: 'exe', exe: 'a.exe' }, []);
280:     const other = qlSave(p, null, { name: 'B', type: 'exe', exe: 'b.exe' }, []);
281:     expect(() => qlDelete(p, 'no-such-id')).toThrow(/^VALIDATION:/);
282:     expect(() => qlDelete(p, 'no-such-id')).toThrow(/^VALIDATION:/); // 重复删除仍是 VALIDATION，不是 MISSING
283:     qlDelete(p, id);
284:     expect(Object.keys(qlLoad(p).items)).toEqual([other]);
285:     expect(readText(p)).not.toMatch(new RegExp('^' + id + ':', 'm')); // 字节级：键已从文件消失
286:     rm(p);
287:     expect(() => qlDelete(p, 'anything')).toThrow(/^VALIDATION:/); // 文件不存在时仍是 VALIDATION
288:   });
289: 
290:   // E15（计划接口）：validateQuickLaunchName = trim 后 1..64
291:   it('validate_quick_launch_name_accepts_trimmed_length_1_to_64', () => {
292:     expect(validateQuickLaunchName('A')).toBe(true);
293:     expect(validateQuickLaunchName('  A  ')).toBe(true);
294:     expect(validateQuickLaunchName('x'.repeat(64))).toBe(true);
295:     expect(validateQuickLaunchName('  ' + 'x'.repeat(64) + '  ')).toBe(true);
296:     expect(validateQuickLaunchName('')).toBe(false);
297:     expect(validateQuickLaunchName('   ')).toBe(false);
298:     expect(validateQuickLaunchName(NL + '\t')).toBe(false);
299:     expect(validateQuickLaunchName('x'.repeat(65))).toBe(false);
300:   });
301: 
302:   // 整表写回（check D3）：保存不得抹掉文件里的其它条目，包括 qlLoad 判为 invalid 的那些
303:   it('ql_save_preserves_other_entries_including_invalid_ones', () => {
304:     const p = tmpPath('ql_preserve.yaml');
305:     rm(p);
306:     writeText(p, lines(
307:       'bad01:',
308:       '  name: 坏的',
309:       '  shell: pwsh',
310:     ));
311:     const id = qlSave(p, null, { name: 'good', type: 'exe', exe: 'a.exe' }, []);
312:     const list = qlLoad(p);
313:     expect(list.invalid).toEqual(['bad01']); // 坏条目仍在文件里、仍报 invalid，而不是被保存动作静默删除
314:     expect(Object.keys(list.items)).toEqual([id]);
315:     rm(p);
316:   });
317: });
```
