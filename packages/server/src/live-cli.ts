import { readFile } from 'node:fs/promises';
import { liveRequest } from './live-client.js';

export async function main(args: string[]): Promise<number> {
  const [command, target, ...rest] = args;
  if (
    !target ||
    !['apply', 'revert'].includes(command ?? '') ||
    (command === 'revert' && rest.length) ||
    (command === 'apply' &&
      rest.length !== 0 &&
      (rest.length !== 2 || rest[0] !== '--author' || !rest[1]?.trim()))
  ) {
    console.error(
      'Usage: npm run patch:apply -- <file> [--author name] OR npm run patch:revert -- <patchId>',
    );
    return 2;
  }
  const result = await liveRequest(
    command === 'apply'
      ? { type: 'applyRequest', source: await readFile(target, 'utf8'), author: rest[1] ?? 'local' }
      : { type: 'revertRequest', patchId: target },
  );
  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 1;
}
