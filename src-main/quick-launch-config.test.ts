// src-main/quick-launch-config.test.ts
// 任务 3：quick_launch.yaml 的加载 / 校验 / 保存 / 删除。
// 规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §5.1 / §5.2 / §5.3 / §5.4 / §8
// 用例 ↔ check 表 E1–E15 的对应关系见 .superpowers/sdd/2026-10-10-quick-launch-card/task-03-report.md
// 夹具一律用 src-main/test-utils.ts 的 tmpPath / rm / writeText / readText（A2）
import { describe, it, expect } from 'vitest';
import {
  qlLoad,
  qlSave,
  qlDelete,
  validateQuickLaunchName,
  type QuickLaunchEntry,
  type TerminalId,
} from './quick-launch-config';
import { validateConfigId } from './config';
import { tmpPath, rm, writeText, readText } from './test-utils';

const NL = String.fromCharCode(10);
const lines = (...ls: string[]): string => ls.join(NL) + NL;

describe('quick-launch-config.ts', () => {

  // E1（规格 §5.2 / check F1）：文件不存在 → 空表，不抛 MISSING
  it('ql_load_missing_file_returns_empty_list_without_MISSING', () => {
    const p = tmpPath('ql_missing.yaml');
    rm(p);
    expect(qlLoad(p)).toEqual({ items: {}, invalid: [] });
  });

  // E2（规格 §5.2）：空文件 / 只有空白 → 空表
  it('ql_load_empty_or_blank_file_returns_empty_list', () => {
    const p = tmpPath('ql_empty.yaml');
    rm(p);
    for (const blank of ['', '   ' + NL, NL, '\t' + NL + '  ']) {
      writeText(p, blank);
      expect(qlLoad(p)).toEqual({ items: {}, invalid: [] });
    }
    rm(p);
  });

  // E3a（规格 §5.2）：YAML 解析失败 → YAML:
  it('ql_load_yaml_parse_error_throws_yaml_prefix', () => {
    const p = tmpPath('ql_bad_yaml.yaml');
    rm(p);
    writeText(p, lines('ql1:', '  name: "unclosed'));
    expect(() => qlLoad(p)).toThrow(/^YAML:/);
    writeText(p, lines('ql1:', '  name: A', '   type: shell'));
    expect(() => qlLoad(p)).toThrow(/^YAML:/);
    rm(p);
  });

  // E3b（规格 §5.2）：顶层非对象（数组 / 标量）→ YAML:
  it('ql_load_top_level_not_object_throws_yaml_prefix', () => {
    const p = tmpPath('ql_not_object.yaml');
    rm(p);
    for (const bad of [lines('- 1', '- 2'), lines('just a string')]) {
      writeText(p, bad);
      expect(() => qlLoad(p)).toThrow(/^YAML:/);
    }
    rm(p);
  });

  // 规格 §5.1 形状：示例文件读回即卡片要的形状（E4 的正面对照）
  it('ql_load_reads_the_shape_from_spec_5_1', () => {
    const p = tmpPath('ql_spec_shape.yaml');
    rm(p);
    writeText(p, lines(
      'qlx1a2b3c4:',
      '  name: 启动 webui',
      '  type: shell',
      '  shell: pwsh',
      '  cmd: python -m webui',
      'qlp9q8r7s6:',
      '  name: LM Studio',
      '  type: exe',
      '  exe:',
      '    - D:\\Tools\\LM Studio.exe',
    ));
    const list = qlLoad(p);
    expect(list.invalid).toEqual([]);
    expect(Object.keys(list.items)).toEqual(['qlx1a2b3c4', 'qlp9q8r7s6']);
    expect(list.items['qlx1a2b3c4']).toEqual({ name: '启动 webui', type: 'shell', shell: 'pwsh', cmd: 'python -m webui', admin: false });
    expect(list.items['qlp9q8r7s6']).toEqual({ name: 'LM Studio', type: 'exe', exe: ['D:\\Tools\\LM Studio.exe'], admin: false });
    rm(p);
  });

  // E4（规格 §5.2）：单条非法 → 跳过该条、id 进 invalid，其余照常返回
  it('ql_load_skips_entry_missing_type_and_collects_its_id', () => {
    const p = tmpPath('ql_partial.yaml');
    rm(p);
    writeText(p, lines(
      'good01:',
      '  name: 好的',
      '  type: shell',
      '  shell: pwsh',
      '  cmd: python -m webui',
      'bad01:',
      '  name: 坏的',
      '  shell: pwsh',
      '  cmd: x',
    ));
    const list = qlLoad(p);
    expect(Object.keys(list.items)).toEqual(['good01']);
    expect(list.items['good01']).toEqual({ name: '好的', type: 'shell', shell: 'pwsh', cmd: 'python -m webui', admin: false });
    expect(list.invalid).toEqual(['bad01']);
    rm(p);
  });

  // E4 补充：各种非法条目形态都进 invalid，合法条目不受牵连
  it('ql_load_collects_every_invalid_entry_shape', () => {
    const p = tmpPath('ql_invalid_shapes.yaml');
    rm(p);
    writeText(p, lines(
      'ok01:',
      '  name: ok',
      '  type: exe',
      '  exe:',
      '    - a.exe',
      'noName01:',
      '  type: exe',
      '  exe:',
      '    - a.exe',
      'blankName01:',
      '  name: "   "',
      '  type: exe',
      '  exe:',
      '    - a.exe',
      'badType01:',
      '  name: badtype',
      '  type: bat',
      '  cmd: x',
      'scalar01: hello',
      'null01:',
      'noCmd01:',
      '  name: nocmd',
      '  type: shell',
      '  shell: pwsh',
      'badTerm01:',
      '  name: badterm',
      '  type: shell',
      '  shell: wt',
      '  cmd: x',
      'noExe01:',
      '  name: noexe',
      '  type: exe',
      'exeScalar01:',
      '  name: scalarexe',
      '  type: exe',
      '  exe: D:\\a.exe',
    ));
    const list = qlLoad(p);
    expect(Object.keys(list.items)).toEqual(['ok01']);
    expect(list.invalid).toEqual([
      'noName01', 'blankName01', 'badType01', 'scalar01', 'null01', 'noCmd01', 'badTerm01', 'noExe01', 'exeScalar01',
    ]);
    rm(p);
  });

  // E1（2026-10-17-quick-launch-exe-rows §4-8 / §8 / RF8）：旧标量写法**一律失效**——
  // 加载进 invalid（不抛错、不进 items），保存路径 VALIDATION:（不做旧格式兼容，G6）。
  it('E1_scalar_exe_entry_loads_as_invalid_and_saves_as_validation', () => {
    const p = tmpPath('ql_scalar_exe.yaml');
    rm(p);
    writeText(p, lines(
      'ok01:',
      '  name: ok',
      '  type: exe',
      '  exe:',
      '    - D:\\Tools\\a.exe',
      'scalar01:',
      '  name: old style',
      '  type: exe',
      '  exe: D:\\a.exe', // 今天的写法：单值字符串（§9-R11 的夹具）
      'scalarQuoted01:',
      '  name: old quoted',
      '  type: exe',
      '  exe: "D:\\b.exe"',
    ));
    const list = qlLoad(p);
    expect(Object.keys(list.items), '只有数组写法的条目进 items').toEqual(['ok01']);
    expect(list.items['ok01'].exe).toEqual(['D:\\Tools\\a.exe']);
    expect(list.invalid, '标量条目静默进 invalid：不抛错、不提示（§7-1）').toEqual(['scalar01', 'scalarQuoted01']);
    // 保存路径同一判据：标量载荷 → VALIDATION:，且失败不落盘
    expect(() => qlSave(p, 'scalar01', { name: 'old style', type: 'exe', exe: 'D:\\a.exe' as unknown as string[] }, [])).toThrow(/^VALIDATION:/);
    expect(qlLoad(p).invalid).toEqual(['scalar01', 'scalarQuoted01']);
    rm(p);
  });

  // E2（§6.1 落盘形状 / §8）：数组落盘 round-trip——保存两条 → 落盘是序列 → 读回顺序逐字。
  it('E2_exe_array_round_trips_through_yaml_in_order', () => {
    const p = tmpPath('ql_exe_array.yaml');
    rm(p);
    const id = qlSave(p, 'qlexearr01', { name: '一组工具', type: 'exe', exe: ['D:\\Tools\\a.exe', 'D:\\Tools\\b.exe'] }, []);
    expect(id).toBe('qlexearr01');
    // 字节级：落盘是序列（§6.1 的示例形状），不是把两条拼成一条字符串（P10 被否掉的方案）
    const raw = readText(p);
    expect(raw).toMatch(/^  exe:$/m);
    expect(raw).toMatch(/^ {4}- D:\\Tools\\a\.exe$/m);
    expect(raw).toMatch(/^ {4}- D:\\Tools\\b\.exe$/m);
    expect(raw).not.toMatch(/^  exe: D:/m); // 标量落盘 = 顺序信息被降级
    const back = qlLoad(p);
    expect(back.invalid).toEqual([]);
    expect(back.items[id].exe, '顺序即启动顺序：读回逐字不变（不去重 R-03）').toEqual(['D:\\Tools\\a.exe', 'D:\\Tools\\b.exe']);
    // 重复路径不去重：两条相同也照样两条落盘、两条读回（R-03）
    const dup = qlSave(p, 'qlexedup01', { name: '两遍同一个', type: 'exe', exe: ['C:\\x.exe', 'C:\\x.exe'] }, []);
    expect(qlLoad(p).items[dup].exe).toEqual(['C:\\x.exe', 'C:\\x.exe']);
    // 编辑回填再保存：不得把顺序或条数丢掉
    expect(qlSave(p, id, back.items[id], [])).toBe(id);
    expect(qlLoad(p).items[id].exe).toEqual(['D:\\Tools\\a.exe', 'D:\\Tools\\b.exe']);
    rm(p);
  });

  // E4（§6.1）：逐元素 trim + 丢弃空串——保存与加载两条路径同一归一（R-02：与 cmd 先例逐字一致）。
  it('E4_exe_entries_are_trimmed_and_blank_rows_dropped_on_both_paths', () => {
    const p = tmpPath('ql_exe_trim.yaml');
    rm(p);
    // 保存路径：两侧空格被 trim、空串/纯空白元素被丢弃，其余顺序不变（弹窗提交前也会做同一件事，这里是主进程的牙）
    const id = qlSave(p, 'qlexetrim1', { name: 'trim', type: 'exe', exe: ['  D:\\Tools\\a.exe  ', '', '   ', 'D:\\Tools\\b.exe'] }, []);
    expect(qlLoad(p).items[id].exe).toEqual(['D:\\Tools\\a.exe', 'D:\\Tools\\b.exe']);
    // 加载路径：yaml 里带空格与空元素 → 读回是规整后的两条（§9-R3「中间留一行空」的自动化对应物）
    writeText(p, lines(
      'trim01:',
      '  name: yaml trim',
      '  type: exe',
      '  exe:',
      '    - "  C:\\\\a.exe  "', // YAML 双引号风格：两个反斜杠 = 一个字面反斜杠（裸 \a 会被解析成 BEL）
      '    - ""',
      '    - "   "',
      '    - C:\\b.exe',
    ));
    const back = qlLoad(p);
    expect(back.invalid).toEqual([]);
    expect(back.items['trim01'].exe).toEqual(['C:\\a.exe', 'C:\\b.exe']);
    rm(p);
  });

  // E5（规格 §5.3-1）：name trim 后为空 → VALIDATION:，且失败不落盘
  it('ql_save_rejects_blank_name_and_writes_nothing', () => {
    const p = tmpPath('ql_name_blank.yaml');
    rm(p);
    expect(() => qlSave(p, null, { name: '  ', type: 'shell', shell: 'pwsh', cmd: 'x' }, ['pwsh'])).toThrow(/^VALIDATION:/);
    expect(() => qlSave(p, null, { name: '', type: 'exe', exe: ['a.exe'] }, [])).toThrow(/^VALIDATION:/);
    expect(qlLoad(p)).toEqual({ items: {}, invalid: [] });
  });

  // E6（规格 §5.3-1）：name 长度按 trim 后计，> 64 → VALIDATION:
  it('ql_save_rejects_name_longer_than_64_after_trim', () => {
    const p = tmpPath('ql_name_long.yaml');
    rm(p);
    const ok64 = 'x'.repeat(64);
    expect(qlSave(p, null, { name: ok64, type: 'exe', exe: ['a.exe'] }, [])).toBeTruthy();
    expect(() => qlSave(p, null, { name: ok64 + 'x', type: 'exe', exe: ['b.exe'] }, [])).toThrow(/^VALIDATION:/);
    // 长度按 trim 后计：另一个 64 字符名两侧带空格仍合法
    expect(qlSave(p, null, { name: '  ' + 'y'.repeat(64) + '  ', type: 'exe', exe: ['c.exe'] }, [])).toBeTruthy();
    rm(p);
  });

  // E7（规格 §5.3-3）：type 不在 {'shell','exe'} → VALIDATION:
  it('ql_save_rejects_type_outside_shell_and_exe', () => {
    const p = tmpPath('ql_bad_type.yaml');
    rm(p);
    const bat = { name: 'A', type: 'bat', cmd: 'x' } as unknown as QuickLaunchEntry;
    expect(() => qlSave(p, null, bat, ['pwsh'])).toThrow(/^VALIDATION:/);
    expect(() => qlSave(p, null, { name: 'A' } as unknown as QuickLaunchEntry, [])).toThrow(/^VALIDATION:/);
    expect(qlLoad(p)).toEqual({ items: {}, invalid: [] });
  });

  // E8（规格 §5.3-4）：shell 不在四种之内，或该终端不在 available 里 → VALIDATION:
  it('ql_save_rejects_terminal_outside_four_or_not_available', () => {
    const p = tmpPath('ql_terminal.yaml');
    rm(p);
    expect(() => qlSave(p, null, { name: 'A', type: 'shell', shell: 'wsl', cmd: 'x' }, ['pwsh'])).toThrow(/^VALIDATION:/);
    expect(() => qlSave(p, null, { name: 'A', type: 'shell', shell: 'wt' as TerminalId, cmd: 'x' }, ['wt' as TerminalId])).toThrow(/^VALIDATION:/);
    expect(() => qlSave(p, null, { name: 'A', type: 'shell', cmd: 'x' }, ['pwsh'])).toThrow(/^VALIDATION:/);
    for (const term of ['pwsh', 'powershell', 'cmd', 'wsl'] as TerminalId[]) {
      expect(qlSave(p, null, { name: 'n-' + term, type: 'shell', shell: term, cmd: 'x' }, [term])).toBeTruthy();
    }
    rm(p);
  });

  // E9（规格 §5.3-4）：shell 类型的 cmd trim 后为空 → VALIDATION:
  it('ql_save_rejects_blank_cmd_for_shell_entry', () => {
    const p = tmpPath('ql_blank_cmd.yaml');
    rm(p);
    expect(() => qlSave(p, null, { name: 'A', type: 'shell', shell: 'pwsh', cmd: '   ' }, ['pwsh'])).toThrow(/^VALIDATION:/);
    expect(() => qlSave(p, null, { name: 'A', type: 'shell', shell: 'pwsh' }, ['pwsh'])).toThrow(/^VALIDATION:/);
    expect(qlLoad(p)).toEqual({ items: {}, invalid: [] });
  });

  // E10（规格 §5.3-5，2026-10-17-quick-launch-exe-rows §8 改写）：exe 归一后为空 → VALIDATION:；不校验文件是否存在。
  // E3（本次新增编号）：空数组 / 全空串元素 = 旧「trim 后为空」判据的新形状；标量载荷同样被拒（§4-8 / G6）。
  it('ql_save_rejects_blank_exe_but_never_checks_file_existence', () => {
    const p = tmpPath('ql_exe.yaml');
    rm(p);
    expect(() => qlSave(p, null, { name: 'A', type: 'exe', exe: ['   '] }, [])).toThrow(/^VALIDATION:/); // E3 全空串
    expect(() => qlSave(p, null, { name: 'A', type: 'exe', exe: [] }, [])).toThrow(/^VALIDATION:/); // E3 空数组
    expect(() => qlSave(p, null, { name: 'A', type: 'exe', exe: ['  ', '', ' \t '] }, [])).toThrow(/^VALIDATION:/); // E3 混空元素，归一后仍为空
    expect(() => qlSave(p, null, { name: 'A', type: 'exe' }, [])).toThrow(/^VALIDATION:/);
    // 保存路径也不做旧格式兼容：标量载荷 → VALIDATION:（§4-8 / G6）
    expect(() => qlSave(p, null, { name: 'A', type: 'exe', exe: 'a.exe' as unknown as string[] }, [])).toThrow(/^VALIDATION:/);
    const missing = 'D:\\no-such-dir\\no-such.exe';
    const id = qlSave(p, null, { name: 'A', type: 'exe', exe: [missing] }, []);
    expect(qlLoad(p).items[id].exe).toEqual([missing]); // 不判存在性：照样落盘、读回（R-06）
    rm(p);
  });

  // E11（规格 §5.3-2）：重名按 trim 后精确比较、区分大小写；覆盖保存自身不算重名
  it('ql_save_rejects_duplicate_name_compared_trimmed_case_sensitive', () => {
    const p = tmpPath('ql_dup_name.yaml');
    rm(p);
    const first = qlSave(p, null, { name: 'A', type: 'exe', exe: ['a.exe'] }, []);
    expect(() => qlSave(p, null, { name: 'A', type: 'exe', exe: ['b.exe'] }, [])).toThrow(/^VALIDATION:/);
    expect(() => qlSave(p, null, { name: '  A  ', type: 'exe', exe: ['b.exe'] }, [])).toThrow(/^VALIDATION:/);
    const lower = qlSave(p, null, { name: 'a', type: 'exe', exe: ['c.exe'] }, []); // 区分大小写 → 允许
    expect(lower).toBeTruthy();
    const again = qlSave(p, first, { name: 'A', type: 'exe', exe: ['a2.exe'] }, []); // 与自身同名不算重名
    expect(again).toBe(first);
    expect(qlLoad(p).items[first].exe).toEqual(['a2.exe']);
    rm(p);
  });

  // E12（规格 §5.3-6）：只写该类型字段——用 readText 做字节级断言
  it('ql_save_writes_only_the_fields_of_that_kind', () => {
    const p = tmpPath('ql_field_filter.yaml');
    rm(p);
    const shellId = qlSave(p, null, {
      name: 'sh', type: 'shell', shell: 'pwsh', cmd: 'python -m webui', exe: 'D:\\should\\drop.exe',
    }, ['pwsh']);
    const rawShell = readText(p);
    expect(rawShell).toMatch(/^ql[0-9a-z]+:$/m);
    expect(rawShell).not.toMatch(/^\s*exe:/m); // 字节级：exe 键没有落盘
    expect(qlLoad(p).items[shellId]).toEqual({ name: 'sh', type: 'shell', shell: 'pwsh', cmd: 'python -m webui', admin: false });
    expect(qlLoad(p).items[shellId]).not.toHaveProperty('exe');
    rm(p);
    const exeId = qlSave(p, null, {
      name: 'ex', type: 'exe', exe: ['D:\\Tools\\LM Studio.exe'], shell: 'pwsh', cmd: 'ignored',
    }, ['pwsh']);
    const rawExe = readText(p);
    expect(rawExe).not.toMatch(/^\s*shell:/m);
    expect(rawExe).not.toMatch(/^\s*cmd:/m);
    expect(qlLoad(p).items[exeId]).toEqual({ name: 'ex', type: 'exe', exe: ['D:\\Tools\\LM Studio.exe'], admin: false });
    expect(qlLoad(p).items[exeId]).not.toHaveProperty('shell');
    expect(qlLoad(p).items[exeId]).not.toHaveProperty('cmd');
    rm(p);
  });

  // E13（规格 §5.4 / §8）：id === null → ql 前缀且通过 validateConfigId；显式 id 原样沿用并返回
  it('ql_save_generates_ql_prefixed_valid_id_or_keeps_explicit_id', () => {
    const p = tmpPath('ql_id.yaml');
    rm(p);
    const generated = qlSave(p, null, { name: 'A', type: 'exe', exe: ['a.exe'] }, []);
    expect(generated).toMatch(/^ql/);
    expect(validateConfigId(generated)).toBe(true);
    expect(Object.keys(qlLoad(p).items)).toEqual([generated]);
    const kept = qlSave(p, 'qlkeep01', { name: 'B', type: 'exe', exe: ['b.exe'] }, []);
    expect(kept).toBe('qlkeep01');
    // 显式 id 就是 yaml 的 key，仍须通过 validateConfigId（与 config.ts:129 同一口径）
    expect(() => qlSave(p, 'Bad ID', { name: 'C', type: 'exe', exe: ['c.exe'] }, [])).toThrow(/^VALIDATION:/);
    expect(Object.keys(qlLoad(p).items).sort()).toEqual([generated, 'qlkeep01'].sort());
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) ids.add(qlSave(p, null, { name: 'n' + i, type: 'exe', exe: ['x.exe'] }, []));
    expect(ids.size).toBe(5); // 生成的 id 互不相同
    rm(p);
  });

  // E14（规格 §8）：删除不存在的 id → VALIDATION:；删除存在的 id → 读回该键消失
  it('ql_delete_unknown_id_throws_validation_and_removes_existing_key', () => {
    const p = tmpPath('ql_delete.yaml');
    rm(p);
    const id = qlSave(p, null, { name: 'A', type: 'exe', exe: ['a.exe'] }, []);
    const other = qlSave(p, null, { name: 'B', type: 'exe', exe: ['b.exe'] }, []);
    expect(() => qlDelete(p, 'no-such-id')).toThrow(/^VALIDATION:/);
    expect(() => qlDelete(p, 'no-such-id')).toThrow(/^VALIDATION:/); // 重复删除仍是 VALIDATION，不是 MISSING
    qlDelete(p, id);
    expect(Object.keys(qlLoad(p).items)).toEqual([other]);
    expect(readText(p)).not.toMatch(new RegExp('^' + id + ':', 'm')); // 字节级：键已从文件消失
    rm(p);
    expect(() => qlDelete(p, 'anything')).toThrow(/^VALIDATION:/); // 文件不存在时仍是 VALIDATION
  });

  // E15（计划接口）：validateQuickLaunchName = trim 后 1..64
  it('validate_quick_launch_name_accepts_trimmed_length_1_to_64', () => {
    expect(validateQuickLaunchName('A')).toBe(true);
    expect(validateQuickLaunchName('  A  ')).toBe(true);
    expect(validateQuickLaunchName('x'.repeat(64))).toBe(true);
    expect(validateQuickLaunchName('  ' + 'x'.repeat(64) + '  ')).toBe(true);
    expect(validateQuickLaunchName('')).toBe(false);
    expect(validateQuickLaunchName('   ')).toBe(false);
    expect(validateQuickLaunchName(NL + '\t')).toBe(false);
    expect(validateQuickLaunchName('x'.repeat(65))).toBe(false);
  });

  // 整表写回（check D3）：保存不得抹掉文件里的其它条目，包括 qlLoad 判为 invalid 的那些
  it('ql_save_preserves_other_entries_including_invalid_ones', () => {
    const p = tmpPath('ql_preserve.yaml');
    rm(p);
    writeText(p, lines(
      'bad01:',
      '  name: 坏的',
      '  shell: pwsh',
    ));
    const id = qlSave(p, null, { name: 'good', type: 'exe', exe: ['a.exe'] }, []);
    const list = qlLoad(p);
    expect(list.invalid).toEqual(['bad01']); // 坏条目仍在文件里、仍报 invalid，而不是被保存动作静默删除
    expect(Object.keys(list.items)).toEqual([id]);
    rm(p);
  });

  // ── 2026-10-14-quick-launch-admin 任务 1：admin 字段（规格 §6.1 / §4-1 / §4-4 / §8-K4；check E1–E4）──

  // E1（规格 §4-4「老配置里没有这个字段 = 与今天逐字节一致」/ §6.1「缺字段规整为 false」）
  // 夹具沿用 :81-82（规格 §5.1 的示例形状），断言里多出 admin: false
  it('entry_without_admin_loads_as_false', () => {
    const p = tmpPath('ql_admin_absent.yaml');
    rm(p);
    writeText(p, lines(
      'qlx1a2b3c4:',
      '  name: 启动 webui',
      '  type: shell',
      '  shell: pwsh',
      '  cmd: python -m webui',
      'qlp9q8r7s6:',
      '  name: LM Studio',
      '  type: exe',
      '  exe:',
      '    - D:\\Tools\\LM Studio.exe',
    ));
    const list = qlLoad(p);
    expect(list.invalid).toEqual([]);
    expect(list.items['qlx1a2b3c4']).toEqual({ name: '启动 webui', type: 'shell', shell: 'pwsh', cmd: 'python -m webui', admin: false });
    expect(list.items['qlp9q8r7s6']).toEqual({ name: 'LM Studio', type: 'exe', exe: ['D:\\Tools\\LM Studio.exe'], admin: false });
    rm(p);
  });

  // E2（规格 §4-1「值随条目持久化」/ §6.1 两个返回字面量都带 admin）：true 经保存→加载往返不变
  it('admin_true_round_trips_through_save_and_load', () => {
    const p = tmpPath('ql_admin_round_trip.yaml');
    rm(p);
    const shellId = qlSave(p, null, { name: '提权 cmd', type: 'shell', shell: 'cmd', cmd: 'echo HI', admin: true }, ['cmd']);
    const exeId = qlSave(p, null, { name: '提权 exe', type: 'exe', exe: ['D:\\Tools\\LM Studio.exe'], admin: true }, []);
    const list = qlLoad(p);
    expect(list.invalid).toEqual([]);
    expect(list.items[shellId]).toEqual({ name: '提权 cmd', type: 'shell', shell: 'cmd', cmd: 'echo HI', admin: true });
    expect(list.items[exeId]).toEqual({ name: '提权 exe', type: 'exe', exe: ['D:\\Tools\\LM Studio.exe'], admin: true });
    // 编辑回填再保存：validateEntry 的规整不得把 true 丢掉（任务 8 弹窗回填靠的就是这个值）
    expect(qlSave(p, shellId, list.items[shellId], ['cmd'])).toBe(shellId);
    expect(qlLoad(p).items[shellId]).toEqual({ name: '提权 cmd', type: 'shell', shell: 'cmd', cmd: 'echo HI', admin: true });
    rm(p);
  });

  // E3（规格 §6.1「只有字面量 true 算真，其它任何值规整为 false」）：'yes' / 1 / null 两条路径都规整
  it('non_boolean_admin_values_normalize_to_false', () => {
    const p = tmpPath('ql_admin_non_boolean.yaml');
    rm(p);
    writeText(p, lines(
      'str01:',
      '  name: s',
      '  type: exe',
      '  exe:',
      '    - a.exe',
      '  admin: "yes"',
      'num01:',
      '  name: n',
      '  type: exe',
      '  exe:',
      '    - b.exe',
      '  admin: 1',
      'nul01:',
      '  name: u',
      '  type: exe',
      '  exe:',
      '    - c.exe',
      '  admin: null',
    ));
    const list = qlLoad(p);
    expect(list.invalid).toEqual([]); // admin 不参与 VALIDATION:（规格 §6.1 末条 / check E5）
    for (const id of ['str01', 'num01', 'nul01']) expect(list.items[id].admin).toBe(false);
    // 保存路径同样只认字面量 true
    const id = qlSave(p, 'bool01', { name: 'b', type: 'shell', shell: 'cmd', cmd: 'x', admin: 'yes' as unknown as boolean }, ['cmd']);
    expect(id).toBe('bool01');
    expect(qlLoad(p).items['bool01']).toEqual({ name: 'b', type: 'shell', shell: 'cmd', cmd: 'x', admin: false });
    rm(p);
  });

  // E4（规格 §8-K4「yaml 里总是显式 true|false」；实现点 = qlSave:138 整表写回）：字节级断言原文含 admin 键
  it('saved_yaml_contains_an_explicit_admin_key', () => {
    const p = tmpPath('ql_admin_explicit.yaml');
    rm(p);
    const offId = qlSave(p, null, { name: '不勾', type: 'shell', shell: 'pwsh', cmd: 'python -m webui' }, ['pwsh']);
    const rawOff = readText(p);
    expect(rawOff).toMatch(/^ {2}admin: false$/m); // 调用方没写 admin，落盘仍显式写 false
    expect(qlLoad(p).items[offId].admin).toBe(false);
    const onId = qlSave(p, null, { name: '勾选', type: 'exe', exe: ['a.exe'], admin: true }, []);
    const rawOn = readText(p);
    expect(rawOn).toMatch(/^ {2}admin: true$/m);
    expect(qlLoad(p).items[onId].admin).toBe(true);
    rm(p);
  });
});
