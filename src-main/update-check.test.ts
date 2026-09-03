import { describe, it, expect } from 'vitest';
import { compareVersions, parseVersion, parseLatestRelease } from './update-check';

describe('update-check.ts', () => {
  it('parseVersion_semver', () => {
    expect(parseVersion('0.1.0')).toEqual([0, 1, 0]);
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('v0.1.0')).toBeNull();
    expect(parseVersion('0.1')).toBeNull();
    expect(parseVersion('0.1.0-beta')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });

  it('compareVersions_equal_or_invalid_returns_0', () => {
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
    expect(compareVersions('x', '0.1.0')).toBe(0);
    expect(compareVersions('0.1.0', 'bad')).toBe(0);
  });

  it('compareVersions_newer_is_1', () => {
    expect(compareVersions('0.1.0', '0.2.0')).toBe(1);
    expect(compareVersions('0.1.0', '0.1.1')).toBe(1);
    expect(compareVersions('0.9.9', '1.0.0')).toBe(1);
  });

  it('compareVersions_older_is_-1', () => {
    expect(compareVersions('0.2.0', '0.1.0')).toBe(-1);
    expect(compareVersions('1.0.0', '0.9.9')).toBe(-1);
  });

  it('parseLatestRelease_valid_json_picks_win64_zip', () => {
    const json = {
      tag_name: 'v0.2.0',
      assets: [
        { name: 'other.zip', browser_download_url: 'https://x/other.zip' },
        { name: 'lms-launcher-0.2.0-win64.zip', browser_download_url: 'https://x/lms-launcher-0.2.0-win64.zip' },
      ],
    };
    expect(parseLatestRelease(json)).toEqual({
      tag: '0.2.0',
      zipUrl: 'https://x/lms-launcher-0.2.0-win64.zip',
    });
  });

  it('parseLatestRelease_tag_without_v_prefix_accepted', () => {
    const json = {
      tag_name: '0.2.0',
      assets: [{ name: 'a-win64.zip', browser_download_url: 'u' }],
    };
    expect(parseLatestRelease(json)).toEqual({ tag: '0.2.0', zipUrl: 'u' });
  });

  it('parseLatestRelease_bad_shapes_return_null', () => {
    expect(parseLatestRelease(null)).toBeNull();
    expect(parseLatestRelease({})).toBeNull();
    expect(parseLatestRelease({ tag_name: 'not-a-version', assets: [] })).toBeNull();
    expect(parseLatestRelease({ tag_name: 'v0.2.0', assets: [] })).toBeNull();
    expect(parseLatestRelease({ tag_name: 'v0.2.0', assets: [{ name: 'no-win64.zip' }] })).toBeNull();
  });

  // 兼容历史命名：2026-08-28 v0.1.0 实际上传 LMS-Launcher-v0.1.0.zip（无 -win64 后缀）。
  // 该资产名必须能被识别，否则「检查失败：无法解析 release 信息」。
  it('parseLatestRelease_legacy_lms_launcher_zip_accepted', () => {
    const json = {
      tag_name: 'v0.1.0',
      assets: [
        { name: 'LMS-Launcher-v0.1.0.zip', browser_download_url: 'https://gh/LMS-Launcher-v0.1.0.zip' },
      ],
    };
    expect(parseLatestRelease(json)).toEqual({
      tag: '0.1.0',
      zipUrl: 'https://gh/LMS-Launcher-v0.1.0.zip',
    });
  });

  it('parseLatestRelease_win64_preferred_over_legacy', () => {
    const json = {
      tag_name: 'v0.2.0',
      assets: [
        { name: 'LMS-Launcher-v0.2.0.zip', browser_download_url: 'https://gh/legacy.zip' },
        { name: 'lms-launcher-v0.2.0-win64.zip', browser_download_url: 'https://gh/win64.zip' },
      ],
    };
    expect(parseLatestRelease(json)).toEqual({
      tag: '0.2.0',
      zipUrl: 'https://gh/win64.zip',
    });
  });
  // 2026-09-03 bug: GitHub latest 为预发布 tag v0.2.0-rc.1 时,
  // TAG_RE/VERSION_RE 只认严格 semver -> 解析失败 -> 报「无法连接更新服务器或解析版本信息」。
  it('parseLatestRelease_prerelease_tag_accepted', () => {
    const json = {
      tag_name: 'v0.2.0-rc.1',
      assets: [
        { name: 'lms-launcher-v0.2.0-rc.1-win64.zip', browser_download_url: 'https://gh/rc.zip' },
      ],
    };
    expect(parseLatestRelease(json)).toEqual({
      tag: '0.2.0-rc.1',
      zipUrl: 'https://gh/rc.zip',
    });
  });

  it('parseLatestRelease_no_v_prefix_prerelease_accepted', () => {
    const json = {
      tag_name: '0.2.0-rc.1',
      assets: [
        { name: 'lms-launcher-v0.2.0-rc.1-win64.zip', browser_download_url: 'u' },
      ],
    };
    expect(parseLatestRelease(json)).toEqual({ tag: '0.2.0-rc.1', zipUrl: 'u' });
  });

  it('compareVersions_prerelease_is_newer_than_lower_base', () => {
    // 用户场景: 当前 0.1.0, latest 0.2.0-rc.1 -> 视为有新版
    expect(compareVersions('0.1.0', '0.2.0-rc.1')).toBe(1);
  });

  it('compareVersions_prerelease_not_newer_than_its_base', () => {
    // 0.2.0-rc.1 比基础版 0.2.0 更早 -> 不算「有新版」(0)
    expect(compareVersions('0.2.0', '0.2.0-rc.1')).toBe(0);
    expect(compareVersions('0.2.0-rc.1', '0.2.0-rc.1')).toBe(0);
  });

  it('compareVersions_invalid_prerelease_shape_consults_base', () => {
    // 非 semver 预发布(无版本数字): 解析失败 -> 0(保守不弹)
    expect(compareVersions('0.1.0', 'valpha')).toBe(0);
  });

  // 2026-09-05 下载完整性校验（spec 2026-09-05-download-integrity-check-design）：
  // parseLatestRelease 从 zip asset 提取 digest（仅 sha256: + 64 位 hex 合法；其他一律省略）
  it('parseLatestRelease_valid_sha256_digest_extracted', () => {
    const json = {
      tag_name: 'v0.2.0',
      assets: [
        {
          name: 'lms-launcher-v0.2.0-win64.zip',
          browser_download_url: 'https://gh/x.zip',
          digest: 'sha256:5fc386e6b292e1a1be9befd94f1b5914279e3ab6ef645fccb78b2fa7ebe765b7',
        },
      ],
    };
    const r = parseLatestRelease(json);
    expect(r).not.toBeNull();
    expect(r!.digest).toBe('sha256:5fc386e6b292e1a1be9befd94f1b5914279e3ab6ef645fccb78b2fa7ebe765b7');
  });

  it('parseLatestRelease_missing_or_invalid_digest_omitted', () => {
    const mk = (digest: unknown) => ({
      tag_name: 'v0.2.0',
      assets: [
        { name: 'a-win64.zip', browser_download_url: 'u', ...(digest !== undefined ? { digest } : {}) },
      ],
    });
    // 无 digest 字段
    expect(parseLatestRelease(mk(undefined))).toEqual({ tag: '0.2.0', zipUrl: 'u' });
    // 空串
    expect(parseLatestRelease(mk(''))).toEqual({ tag: '0.2.0', zipUrl: 'u' });
    // 非字符串
    expect(parseLatestRelease(mk(123))).toEqual({ tag: '0.2.0', zipUrl: 'u' });
    // 其他算法
    expect(parseLatestRelease(mk('sha1:abc'))).toEqual({ tag: '0.2.0', zipUrl: 'u' });
    // 长度不足
    expect(parseLatestRelease(mk('sha256:abc'))).toEqual({ tag: '0.2.0', zipUrl: 'u' });
    // 含非法字符
    expect(parseLatestRelease(mk('sha256:XYZ'))).toEqual({ tag: '0.2.0', zipUrl: 'u' });
  });
});
