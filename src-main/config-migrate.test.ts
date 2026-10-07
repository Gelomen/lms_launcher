import { describe, it, expect } from 'vitest';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { migrateLegacyConfigs } from './config-migrate';
import { tmpPath, rm, writeText, mkDir, jp } from './test-utils';

// 老用户存量迁移（2026-10-08）：行为规格见 docs/superpowers/specs/2026-10-08-legacy-config-migration-design.md §4
const APP_YAML = 'lms_launcher.yaml';
const TPL_YAML = 'llama_launch_configs.yaml';
const PARAMS_YAML = 'llama_params.yaml';

/** 旧布局夹具：root = <dataDir>；withCfgDir=false 时连 configs/ 都不存在（§4-4） */
function legacyRoot(name: string, withCfgDir = true): { root: string; cfg: string } {
  const root = tmpPath(name);
  rm(root);
  mkDir(root);
  const cfg = jp(root, 'configs');
  if (withCfgDir) mkDir(cfg);
  return { root, cfg };
}

describe('config-migrate.ts', () => {
  it('moves_both_legacy_files_byte_identical', () => { // §4-1
    const { root, cfg } = legacyRoot('mig_both');
    const appText = 'llama_dir: D:\\llama.cpp\nlanguage: zh\n';
    const tplText = 'tpl_a:\n  values:\n    m: x\n';
    writeText(jp(root, APP_YAML), appText);
    writeText(jp(root, TPL_YAML), tplText);
    migrateLegacyConfigs(root, cfg);
    expect(existsSync(jp(root, APP_YAML))).toBe(false);
    expect(existsSync(jp(root, TPL_YAML))).toBe(false);
    expect(readFileSync(jp(cfg, APP_YAML), 'utf8')).toBe(appText); // 字节不变，不重排不改写
    expect(readFileSync(jp(cfg, TPL_YAML), 'utf8')).toBe(tplText);
    rm(root);
  });

  it('existing_target_wins_and_nothing_is_touched', () => { // §4-2 / S2
    const { root, cfg } = legacyRoot('mig_conflict');
    writeText(jp(root, APP_YAML), 'llama_dir: OLD\n');
    writeText(jp(cfg, APP_YAML), 'llama_dir: NEW\n');
    writeText(jp(root, TPL_YAML), 'tpl_root:\n  values: {}\n');
    writeText(jp(cfg, TPL_YAML), 'tpl_cfg:\n  values: {}\n');
    migrateLegacyConfigs(root, cfg);
    expect(readFileSync(jp(root, APP_YAML), 'utf8')).toBe('llama_dir: OLD\n');
    expect(readFileSync(jp(cfg, APP_YAML), 'utf8')).toBe('llama_dir: NEW\n');
    expect(readFileSync(jp(root, TPL_YAML), 'utf8')).toBe('tpl_root:\n  values: {}\n');
    expect(readFileSync(jp(cfg, TPL_YAML), 'utf8')).toBe('tpl_cfg:\n  values: {}\n');
    rm(root);
  });

  it('nothing_to_migrate_creates_no_files', () => { // §4-3
    const { root, cfg } = legacyRoot('mig_empty', false);
    expect(existsSync(cfg)).toBe(false);
    migrateLegacyConfigs(root, cfg);
    expect(existsSync(cfg)).toBe(false); // 无东西可搬时连 configs/ 都不该新建
    rm(root);
  });

  it('root_llama_params_yaml_is_never_touched', () => { // §4-9 / S4
    const { root, cfg } = legacyRoot('mig_params');
    writeText(jp(root, PARAMS_YAML), 'params: {}\nrequired: []\n');
    writeText(jp(root, TPL_YAML), 'tpl_a:\n  values: {}\n');
    migrateLegacyConfigs(root, cfg);
    expect(existsSync(jp(root, PARAMS_YAML))).toBe(true);
    expect(existsSync(jp(cfg, PARAMS_YAML))).toBe(false);
    expect(existsSync(jp(cfg, TPL_YAML))).toBe(true); // 同一次调用里另两份照常
    rm(root);
  });

  it('rename_failure_falls_back_to_copy_and_keeps_original', () => { // §4-5 / S3；顺带覆盖 §4-4（configs/ 不存在）
    const { root, cfg } = legacyRoot('mig_copy', false);
    const tplText = 'tpl_a:\n  values: {}\n';
    writeText(jp(root, TPL_YAML), tplText);
    migrateLegacyConfigs(root, cfg, {
      move: () => { throw new Error('EBUSY'); },
      copy: copyFileSync,
    });
    expect(existsSync(jp(root, TPL_YAML))).toBe(true); // 兜底保留原件（S3）
    expect(readFileSync(jp(cfg, TPL_YAML), 'utf8')).toBe(tplText);
    rm(root);
  });

  it('both_moves_fail_is_silent', () => { // §4-6 / S6：两份都失败 → 都不动，且一份失败不影响另一份
    const { root, cfg } = legacyRoot('mig_fail');
    writeText(jp(root, APP_YAML), 'llama_dir: OLD\n');
    writeText(jp(root, TPL_YAML), 'tpl_a:\n  values: {}\n');
    migrateLegacyConfigs(root, cfg, {
      move: () => { throw new Error('EPERM'); },
      copy: () => { throw new Error('EPERM'); },
    });
    expect(existsSync(jp(root, APP_YAML))).toBe(true); // 原件留在原位，下次启动重试
    expect(existsSync(jp(root, TPL_YAML))).toBe(true);
    expect(existsSync(jp(cfg, APP_YAML))).toBe(false);
    expect(existsSync(jp(cfg, TPL_YAML))).toBe(false);
    rm(root);
  });

  it('copy_failing_halfway_leaves_no_partial_target', () => { // §4-6「不留半成品」
    const { root, cfg } = legacyRoot('mig_partial');
    writeText(jp(root, APP_YAML), 'llama_dir: OLD\n');
    migrateLegacyConfigs(root, cfg, {
      move: () => { throw new Error('EBUSY'); },
      copy: (from, to) => { writeFileSync(to, 'PARTIAL'); throw new Error('ENOSPC'); }, // 写到一半才失败
    });
    expect(existsSync(jp(cfg, APP_YAML))).toBe(false); // 半份目标被清掉，否则下次启动把它当已迁移
    expect(existsSync(jp(root, APP_YAML))).toBe(true); // 根原件仍在，下次启动重试
    rm(root);
  });
});
