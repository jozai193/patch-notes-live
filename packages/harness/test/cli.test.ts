import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import type { Report } from '../src/index.js';

const launcher = fileURLToPath(new URL('../verify.mjs', import.meta.url));
const samples = new URL('../../../mods/samples/', import.meta.url);

it('runs by absolute path from a separate directory, preserving relative mod paths and JSON/exit codes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'patch-notes-harness-'));
  try {
    await writeFile(
      join(directory, 'good.js'),
      await readFile(new URL('heal-on-kill.js', samples)),
    );
    await writeFile(join(directory, 'bad.js'), await readFile(new URL('does-nothing.js', samples)));
    const invoke = (...args: string[]) =>
      spawnSync(process.execPath, [launcher, ...args], {
        cwd: directory,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15000,
      });
    const good = invoke('good.js', '--json');
    expect(good.status, good.stderr).toBe(0);
    const report = JSON.parse(good.stdout) as Report;
    expect(report.ok).toBe(true);
    expect(good.stderr).toContain('PASS');
    const bad = invoke('verify', 'bad.js', '--json');
    expect(bad.status, bad.stderr).toBe(1);
    expect((JSON.parse(bad.stdout) as Report).ok).toBe(false);
    const missing = invoke('missing.js', '--json');
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('Fix:');
    const usage = invoke();
    expect(usage.status).toBe(2);
    expect(usage.stderr).toContain('Usage:');
  } finally {
    // mkdtemp returned this exact child of the OS temp directory; never remove a computed parent.
    expect(directory.startsWith(join(tmpdir(), 'patch-notes-harness-'))).toBe(true);
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
