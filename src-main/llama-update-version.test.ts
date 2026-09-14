import { describe, it, expect } from 'vitest';
import { parseLlamaVersion } from './llama-update-version';

describe('llama-update-version.ts', () => {
  it('parses release version with build number', () => {
    const result = parseLlamaVersion('llama-server v0.4.0 (build b10852)');
    expect(result).toEqual({ type: 'release', version: '0.4.0', build: 10852 });
  });

  it('parses pre-release build number', () => {
    const result = parseLlamaVersion('llama-server b10952');
    expect(result).toEqual({ type: 'prerelease', build: 10952 });
  });

  it('returns null for unknown format', () => {
    expect(parseLlamaVersion('unknown format')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseLlamaVersion('')).toBeNull();
  });

  it('parses release version without build number', () => {
    const result = parseLlamaVersion('llama-server v0.5.0');
    expect(result).toEqual({ type: 'release', version: '0.5.0' });
  });

  it('handles whitespace around input', () => {
    const result = parseLlamaVersion('  llama-server b11000  ');
    expect(result).toEqual({ type: 'prerelease', build: 11000 });
  });

  it('rejects invalid release format with missing version', () => {
    expect(parseLlamaVersion('llama-server v (build b100)')).toBeNull();
  });

  it('rejects invalid pre-release format with non-numeric build', () => {
    expect(parseLlamaVersion('llama-server babc')).toBeNull();
  });

  it('rejects release with invalid version format', () => {
    expect(parseLlamaVersion('llama-server v1.0 (build b100)')).toBeNull();
  });
});
