import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function tmpPath(name: string): string {
  const dir = join(tmpdir(), 'lms_launcher_test');
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

export function rm(p: string): void {
  rmSync(p, { force: true, recursive: true });
}

export function writeText(p: string, s: string): void {
  writeFileSync(p, s);
}

export function mkDir(p: string): void {
  mkdirSync(p, { recursive: true });
}

export function jp(dir: string, name: string): string {
  return join(dir, name);
}
