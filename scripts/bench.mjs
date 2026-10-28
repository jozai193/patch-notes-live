#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
const project = fileURLToPath(new URL('../packages/server', import.meta.url));
const build = spawnSync(process.execPath, [tsc, '-b', project], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
});
if (build.error || build.status !== 0) {
  process.stderr.write(
    `Benchmark build failed: ${build.error?.message ?? build.stdout + build.stderr}\n`,
  );
  process.exitCode = 2;
} else {
  try {
    try {
      process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const { buildTemplate } = await import('../packages/server/dist/patch/workspace.js');
    await buildTemplate();
    const { main } = await import('../packages/server/dist/bench/cli.js');
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `Benchmark error: ${error instanceof Error ? error.message : 'startup failed'}\n`,
    );
    process.exitCode = 2;
  }
}
