import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = spawn(
  process.execPath,
  [fileURLToPath(new URL('./server.mjs', import.meta.url)), 'hub'],
  { cwd: root, stdio: 'inherit', windowsHide: true },
);
const overlay = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
    '--host',
    'localhost',
    '--port',
    '5173',
    '--strictPort',
  ],
  {
    cwd: fileURLToPath(new URL('../packages/overlay', import.meta.url)),
    stdio: 'inherit',
    windowsHide: true,
  },
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  server.kill();
  overlay.kill();
}
for (const child of [server, overlay]) {
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => stop(code ?? 1));
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
