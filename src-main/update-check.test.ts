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
});
