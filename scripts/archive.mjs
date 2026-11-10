import { execFileSync } from 'node:child_process';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
execFileSync(
  process.execPath,
  [resolve(root, 'node_modules/typescript/bin/tsc'), '-b', 'packages/harness'],
  { cwd: root, stdio: 'inherit' },
);
const { verify } = await import('../packages/harness/dist/index.js');
const { SandboxHost } = await import('../packages/mod-api/dist/index.js');
const { tokens } = await import('../packages/mod-api/dist/archive.js');
const { changeValid } = await import('../packages/mod-api/dist/protocol.js');
const directory = resolve(root, 'mods/archive');
await mkdir(directory, { recursive: true });
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 75);
if (process.argv[2] === 'collect') {
  // Classification is reviewed data, not a guess from source names or viewer text.
  const reviewed = new Map(
    JSON.parse(await readFile(resolve(directory, 'index.json'), 'utf8')).map((entry) => [
      entry.file,
      entry,
    ]),
  );
  const ts = await import('typescript');
  const candidates = [];
  for (const file of [
    'split-on-hit',
    'gravity-flip-every-10s',
    'floor-is-lava',
    'enemies-tiny-and-fast',
    'heal-on-kill',
  ])
    candidates.push({
      path: `mods/samples/${file}.js`,
      request: file.replaceAll('-', ' '),
      prefix: 'sample',
    });
  for (const file of (await readdir(resolve(root, 'mods/generated')))
    .filter((f) => f.endsWith('.js'))
    .sort())
    candidates.push({
      path: `mods/generated/${file}`,
      request: file.replace(/-\d{4}-.*/, '').replaceAll('-', ' '),
      prefix: 'generated',
    });
  for (const folder of (await readdir(resolve(root, 'bench-results'))).sort()) {
    let summary;
    try {
      summary = JSON.parse(
        await readFile(resolve(root, 'bench-results', folder, 'summary.json'), 'utf8'),
      );
    } catch {
      continue;
    }
    for (const file of (await readdir(resolve(root, 'bench-results', folder)))
      .filter((f) => f.endsWith('.js'))
      .sort()) {
      const result = summary.results.find((r) => r.index === Number(basename(file, '.js')));
      if (result)
        candidates.push({
          path: `bench-results/${folder}/${file}`,
          request: result.request,
          prefix: `bench-${folder.slice(0, 10)}-${basename(file, '.js')}`,
        });
    }
  }
  const entries = [],
    provenance = [];
  for (const item of candidates) {
    const file = slug(item.prefix + '-' + item.request) + '.js';
    const review = reviewed.get(file);
    let source = await readFile(resolve(root, item.path), 'utf8');
    const original = await verify(source);
    if (!original.ok) {
      console.log(
        `EXCLUDED ${item.path}: ${original.checks
          .filter((c) => !c.ok)
          .map((c) => c.id)
          .join(', ')}`,
      );
      provenance.push({ ...item, included: false });
      continue;
    }
    if (!review || !changeValid(review.change))
      throw Error(
        `Read ${item.path} and add its name and change classification to index.json before collecting.`,
      );
    const host = await SandboxHost.create([source]);
    const info = host.mods[0];
    host.dispose();
    if (review.name !== info.name) {
      const ast = ts.createSourceFile(
        'mod.js',
        source,
        ts.ScriptTarget.ESNext,
        true,
        ts.ScriptKind.JS,
      );
      const exp = ast.statements.find((node) => ts.isExportAssignment(node));
      const name =
        exp &&
        ts.isObjectLiteralExpression(exp.expression) &&
        exp.expression.properties.find(
          (node) => ts.isPropertyAssignment(node) && node.name.getText(ast) === 'name',
        );
      if (!name || !ts.isPropertyAssignment(name))
        throw Error(`Cannot preserve reviewed name for ${item.path}`);
      source =
        source.slice(0, name.initializer.getStart(ast)) +
        JSON.stringify(review.name) +
        source.slice(name.initializer.end);
    }
    if (!info.patchNotes) {
      const funny = {
        huge: 'Player size increased. Doorways are no longer covered by the warranty.',
        away: 'Enemies have discovered self-preservation. We are deeply disappointed.',
        gravity: 'Gravity has been reassigned. Please direct complaints toward the ceiling.',
        lava: 'The floor is now a management decision. Please walk it off.',
        rainbow: 'Enemies now come in every color of the rage spectrum.',
        boss: 'A new manager has arrived. It has 500 HP and no open-door policy.',
        heal: 'One health point per second. Please form an orderly queue for immortality.',
      };
      const key = Object.keys(funny).find((k) => item.request.toLowerCase().includes(k));
      const note = key
        ? funny[key]
        : `${info.name.slice(0, 65)} is now official policy. Balance has been notified and is refusing to comment.`;
      const ast = ts.createSourceFile(
        'mod.js',
        source,
        ts.ScriptTarget.ESNext,
        true,
        ts.ScriptKind.JS,
      );
      const exp = ast.statements.find((n) => ts.isExportAssignment(n));
      if (!exp || !ts.isObjectLiteralExpression(exp.expression))
        throw Error(`Cannot add patchNotes to ${item.path}`);
      const at = exp.expression.getStart(ast) + 1;
      source =
        source.slice(0, at) +
        `\n  patchNotes: ${JSON.stringify(note.slice(0, 140))},` +
        source.slice(at);
    }
    const report = await verify(source);
    if (!report.ok) throw Error(`Enriched archive mod failed: ${item.path}`);
    const updated = await SandboxHost.create([source]);
    const mod = updated.mods[0];
    updated.dispose();
    if (entries.some((e) => e.file === file)) throw Error(`Duplicate archive filename ${file}`);
    await writeFile(resolve(directory, file), source);
    entries.push({
      file,
      name: mod.name,
      request: item.request,
      patchNotes: mod.patchNotes,
      tags: [...tokens(item.request)].slice(0, 12),
      change: review.change,
    });
    provenance.push({ ...item, file, included: true });
    console.log(`ARCHIVED ${file}: PASS ${report.durationMs.toFixed(0)} ms`);
  }
  await writeFile(resolve(directory, 'index.json'), JSON.stringify(entries, null, 2) + '\n');
  await writeFile(
    resolve(directory, 'provenance.json'),
    JSON.stringify(provenance, null, 2) + '\n',
  );
  console.log(`${entries.length} verified archive mods from ${candidates.length} candidates.`);
} else {
  const entries = JSON.parse(await readFile(resolve(directory, 'index.json'), 'utf8'));
  if (!Array.isArray(entries) || !entries.length) throw Error('Archive index is empty.');
  const files = new Set(),
    names = new Set();
  let failed = 0;
  const started = performance.now();
  for (const entry of entries) {
    if (!/^[a-z0-9-]+\.js$/.test(entry.file) || files.has(entry.file))
      throw Error('Invalid/duplicate archive file.');
    files.add(entry.file);
    if (
      typeof entry.name !== 'string' ||
      !entry.name.trim() ||
      names.has(entry.name.trim().toLowerCase()) ||
      typeof entry.request !== 'string' ||
      typeof entry.patchNotes !== 'string' ||
      entry.patchNotes.length > 140 ||
      !Array.isArray(entry.tags) ||
      !changeValid(entry.change)
    )
      throw Error('Invalid archive metadata.');
    names.add(entry.name.trim().toLowerCase());
    const source = await readFile(resolve(directory, entry.file), 'utf8');
    const report = await verify(source);
    const host = await SandboxHost.create([source]);
    const info = host.mods[0];
    host.dispose();
    const ok = report.ok && info.name === entry.name && info.patchNotes === entry.patchNotes;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${entry.file} (${report.durationMs.toFixed(0)} ms)${
        ok
          ? ''
          : ': ' +
            report.checks
              .filter((c) => !c.ok)
              .map((c) => c.id + ': ' + c.detail)
              .join('; ')
      }`,
    );
    if (!ok) failed++;
  }
  const loose = (await readdir(directory)).filter((f) => f.endsWith('.js') && !files.has(f));
  if (loose.length) throw Error('Unindexed archive files: ' + loose.join(', '));
  console.log(
    `Archive: ${entries.length - failed}/${entries.length} passed in ${((performance.now() - started) / 1000).toFixed(2)} s.`,
  );
  process.exitCode = failed ? 1 : 0;
}
