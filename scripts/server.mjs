import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
    '-b',
    fileURLToPath(new URL('../packages/server', import.meta.url)),
  ],
  { cwd: root, encoding: 'utf8', windowsHide: true },
);
if (result.error || result.status !== 0) {
  console.error(result.error?.message ?? result.stdout + result.stderr);
  process.exitCode = 2;
} else {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (process.argv[2] === 'hub') await import('../packages/server/dist/start.js');
  else {
    const { main } = await import('../packages/server/dist/live-cli.js');
    try {
      process.exitCode = await main(process.argv.slice(2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 2;
    }
  }
}
