#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Resolve tools and code from this file, while leaving mod paths relative to the caller's cwd.
const root = fileURLToPath(new URL('../../', import.meta.url));
const tsc = fileURLToPath(new URL('../../node_modules/typescript/bin/tsc', import.meta.url));
const project = fileURLToPath(new URL('./', import.meta.url));
const build = spawnSync(process.execPath, [tsc, '-b', project], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
});
if (build.error || build.status !== 0) {
  process.stderr.write(
    `Harness build error: ${build.error?.message ?? build.stdout + build.stderr}. Fix: run npm install and npx tsc -b in the repository.\n`,
  );
  process.exitCode = 2;
} else {
  try {
    const { main } = await import('./dist/cli.js');
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `Harness error: ${error instanceof Error ? error.message : 'startup failed'}. Fix: reinstall workspace dependencies and rebuild.\n`,
    );
    process.exitCode = 2;
  }
}
