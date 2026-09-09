// 纯函数单测（spec 2026-09-09-gpu-card-design §7）：parseGpuStatsJson / mergeGpuStats / formatGb。
// fixture 与渲染端 GpuModule.test.ts 的 formatGb 断言共用同一组数值（防两份实现漂移）。
import { describe, it, expect } from 'vitest';
import { parseGpuStatsJson, mergeGpuStats, formatGb, canonicalLuid } from './gpu-stats';
import type { GpuDynamic, GpuStatic } from './gpu-stats';

const GB = 1073741824; // 1 GiB = 1024^3
// 动态层键 = 计数器实例名内 LUID 的小写原文（真机实测：两段各带 0x 前缀，0x{High}_0x{Low}）
const LUID_A = '0x0000edff_00000000';
const LUID_B = '0x00010f23_00000000';
// 动态层实例名键（与静态层 0x{Low}_{High} 写法不同，join 必须顺序无关）
const DYN_A = '0x00000000_0x0000edff';
const DYN_B = '0x00000000_0x00010f23';

// 构造动态层单行 JSON（键名模拟真实计数器实例名）
function sample(ded: Record<string, number> = {}, shr: Record<string, number> = {}, eng: Record<string, number> = {}): string {
  return JSON.stringify({ ded, shr, eng });
}
function dyn(luid: string, dedicatedUsed = 0, sharedUsed = 0, utilization = 0): GpuDynamic {
  return { luid, dedicatedUsed, sharedUsed, utilization };
}

describe('parseGpuStatsJson', () => {
  it('single_card_aggregates_mem_and_3d_utilization', () => {
    const raw = sample(
      { ['luid_' + LUID_A + '_phys_0']: 22 * GB },
      { ['luid_' + LUID_A + '_phys_0']: 1 * GB },
      { ['pid_4260_luid_' + LUID_A + '_phys_0_eng_0_engtype_3D']: 28 },
    );
    expect(parseGpuStatsJson(raw)).toEqual([dyn(LUID_A, 22 * GB, 1 * GB, 28)]);
  });

  it('multi_card_two_luids_and_luid_case_normalized', () => {
    // 实例名 LUID 大写（真实计数器见过 0x0000EDFF 与 0x0000edff 混用）
    const raw = sample(
      {
        ['luid_0x0000EDFF_00000000_phys_0']: 22 * GB,
        ['luid_' + LUID_B + '_phys_0']: 0,
      },
      {
        ['luid_0x0000EDFF_00000000_phys_0']: 1 * GB,
        ['luid_' + LUID_B + '_phys_0']: 2 * GB,
      },
      {
        ['pid_1_luid_0x0000EDFF_00000000_phys_0_eng_0_engtype_3D']: 28,
        ['pid_2_luid_' + LUID_B + '_phys_0_eng_0_engtype_3D']: 5,
      },
    );
    expect(parseGpuStatsJson(raw)).toEqual([
      dyn(LUID_A, 22 * GB, 1 * GB, 28),
      dyn(LUID_B, 0, 2 * GB, 5),
    ]);
  });

  it('real_counter_instance_names_dual_0x_prefix', () => {
    // 真机实测（任务 9，2026-09-10，4090 双卡）：实例名两段 LUID 各带 0x 前缀
    const raw = sample(
      { ['luid_0x00000000_0x00010fbf_phys_0']: 22 * GB, ['luid_0x00000000_0x000127db_phys_0']: 0 },
      { ['luid_0x00000000_0x00010fbf_phys_0']: 1 * GB, ['luid_0x00000000_0x000127db_phys_0']: 0 },
      { ['pid_8104_luid_0x00000000_0x00010fbf_phys_0_eng_0_engtype_3d']: 74 },
    );
    expect(parseGpuStatsJson(raw)).toEqual([
      { luid: '0x00000000_0x00010fbf', dedicatedUsed: 22 * GB, sharedUsed: 1 * GB, utilization: 74 },
      { luid: '0x00000000_0x000127db', dedicatedUsed: 0, sharedUsed: 0, utilization: 0 },
    ]);
  });

  it('empty_sample_returns_empty_array', () => {
    expect(parseGpuStatsJson(sample())).toEqual([]);
  });

  it('utilization_takes_max_across_pid_and_engine_instances_of_same_luid', () => {
    const raw = sample(
      { ['luid_' + LUID_A + '_phys_0']: 1 * GB },
      {},
      {
        ['pid_1_luid_' + LUID_A + '_phys_0_eng_0_engtype_3D']: 28,
        ['pid_2_luid_' + LUID_A + '_phys_0_eng_1_engtype_3D']: 60,
      },
    );
    expect(parseGpuStatsJson(raw)[0].utilization).toBe(60);
  });

  it('non_3d_engine_instances_are_ignored_for_utilization', () => {
    const raw = sample(
      { ['luid_' + LUID_A + '_phys_0']: 1 * GB },
      {},
      {
        ['pid_1_luid_' + LUID_A + '_phys_0_eng_1_engtype_Copy']: 99,
        ['pid_1_luid_' + LUID_A + '_phys_0_eng_2_engtype_VideoDecode']: 88,
      },
    );
    expect(parseGpuStatsJson(raw)).toEqual([dyn(LUID_A, 1 * GB, 0, 0)]);
  });
});

describe('mergeGpuStats', () => {
  const dyns = [dyn(LUID_A, 22 * GB, 1 * GB, 28), dyn(LUID_B, 0, 2 * GB, 5)];
  const statics: GpuStatic[] = [
    { luid: LUID_A, name: 'NVIDIA GeForce RTX 4090', dedicatedTotal: 24 * GB, sharedTotal: 48 * GB },
    { luid: LUID_B, name: 'Microsoft Basic Render Driver', dedicatedTotal: 0, sharedTotal: 48 * GB },
  ];

  it('joins_static_name_and_totals_by_lowercase_luid', () => {
    expect(mergeGpuStats(dyns, statics)).toEqual([
      { luid: LUID_A, name: 'NVIDIA GeForce RTX 4090', utilization: 28, dedicatedUsed: 22 * GB, dedicatedTotal: 24 * GB, sharedUsed: 1 * GB, sharedTotal: 48 * GB },
      { luid: LUID_B, name: 'Microsoft Basic Render Driver', utilization: 5, dedicatedUsed: 0, dedicatedTotal: 0, sharedUsed: 2 * GB, sharedTotal: 48 * GB },
    ]);
  });

  it('static_missing_falls_back_to_indexed_name_and_zero_totals', () => {
    expect(mergeGpuStats(dyns, [])).toEqual([
      { luid: LUID_A, name: 'GPU 1', utilization: 28, dedicatedUsed: 22 * GB, dedicatedTotal: 0, sharedUsed: 1 * GB, sharedTotal: 0 },
      { luid: LUID_B, name: 'GPU 2', utilization: 5, dedicatedUsed: 0, dedicatedTotal: 0, sharedUsed: 2 * GB, sharedTotal: 0 },
    ]);
  });

  it('joins_across_luid_segment_order_difference_between_layers', () => {
    // 真机实测（任务 9）：动态层键 0x{High}_0x{Low}，静态层键 0x{Low}_{High}，
    // 顺序不同的同一 LUID 必须 join 上（canonicalLuid 顺序无关键）
    // 静态侧用 0x{Low}_{High} 写法（0x00010fbf_00000000），动态侧 0x{High}_0x{Low} 写法（0x00000000_0x00010fbf），
    // 同一 LUID（真机实测值，见 real_counter_instance_names_dual_0x_prefix 用例）段序相反
    const out = mergeGpuStats([dyn('0x00000000_0x00010fbf', 22 * GB, 1 * GB, 74)], [
      { luid: '0x00010fbf_00000000', name: 'NVIDIA GeForce RTX 4090', dedicatedTotal: 24 * GB, sharedTotal: 48 * GB },
    ] as GpuStatic[]).map((g) => ({ name: g.name, dedicatedTotal: g.dedicatedTotal, sharedTotal: g.sharedTotal }));
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('NVIDIA GeForce RTX 4090'); // 静态层卡名，非 'GPU 1' 回退名
    expect(out[0].dedicatedTotal).toBeGreaterThan(0);
    expect(out[0]).toEqual({ name: 'NVIDIA GeForce RTX 4090', dedicatedTotal: 24 * GB, sharedTotal: 48 * GB });
  });

  it('luid_only_in_static_layer_is_filtered_out', () => {
    const extra: GpuStatic = { luid: '0x0002ab45_00000000', name: 'Virtual Adapter', dedicatedTotal: 0, sharedTotal: 16 * GB };
    expect(mergeGpuStats(dyns, [...statics, extra])).toHaveLength(2); // 动态层没有的 LUID 不显示
  });

  it('dynamic_order_is_preserved', () => {
    const out = mergeGpuStats([dyns[1], dyns[0]], statics);
    expect(out.map((g) => g.luid)).toEqual([LUID_B, LUID_A]);
  });
});

describe('formatGb', () => {
  it('zero_or_negative_returns_dash', () => {
    expect(formatGb(0)).toBe('–');
    expect(formatGb(-1)).toBe('–');
  });
  it('whole_and_fractional_gib_with_one_decimal', () => {
    expect(formatGb(22 * GB)).toBe('22.0 GB');
    expect(formatGb(24 * GB)).toBe('24.0 GB');
    expect(formatGb(1610612736)).toBe('1.5 GB'); // 1.5 GiB
  });
  it('rounds_to_one_decimal', () => {
    // 22 GiB + 880 MiB = 22.859375 GiB → '22.9 GB'
    expect(formatGb(22 * GB + 880 * 1048576)).toBe('22.9 GB');
  });
});

describe('canonicalLuid', () => {
  it('is_order_independent_across_layer_formats', () => {
    expect(canonicalLuid('0x00000000_0x00010fbf')).toBe(canonicalLuid('0x00010fbf_00000000'));
    expect(canonicalLuid('0x00000000_0x000127DB')).toBe(canonicalLuid('0x000127db_00000000'));
  });
  it('normalizes_case_and_optional_0x_prefixes', () => {
    expect(canonicalLuid('0x0000EDFF_00000000')).toBe('00000000_0000edff');
    expect(canonicalLuid('luid_0x00000000_0x0000edff')).toBe('00000000_0000edff');
  });
  it('returns_lowercase_input_when_not_two_hex8_segments', () => {
    expect(canonicalLuid('not-a-luid')).toBe('not-a-luid');
  });
});
