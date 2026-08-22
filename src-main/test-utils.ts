import { rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function tmpPath(name: string): string {
  const dir = join(tmpdir(), 'lms_launch_test');
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

export function rm(p: string): void {
  rmSync(p, { force: true, recursive: true });
}
