import type { Patch, PatchChange } from './protocol.js';
export interface ArchiveEntry {
  file: string;
  name: string;
  request: string;
  patchNotes: string;
  tags: string[];
  change: PatchChange;
}
export interface ArchivedMod extends ArchiveEntry {
  source: string;
}
const groups = [
  ['huge', 'big', 'giant', 'massive', 'enormous', 'large'],
  ['gravity', 'moon', 'fall', 'falling'],
  ['enemy', 'enemies', 'foe', 'foes', 'chasers'],
  ['player', 'ship', 'you'],
  ['away', 'flee', 'retreat', 'escape'],
  ['tiny', 'small', 'mini', 'smaller'],
  ['fast', 'faster', 'speed', 'quick'],
  ['slow', 'slower', 'slowmo', 'slomo'],
  ['bullet', 'bullets', 'projectile', 'projectiles', 'shot'],
  ['heal', 'healing', 'regenerate', 'regen', 'health'],
  ['lava', 'fire', 'molten'],
  ['rainbow', 'color', 'colour', 'colors'],
  ['split', 'divide', 'mitosis'],
  ['arena', 'map', 'screen'],
  ['wrap', 'asteroids', 'teleport'],
  ['orbit', 'circle', 'circling'],
  ['meteor', 'meteors', 'showers'],
  ['ghost', 'ghosts', 'revive', 'resurrect'],
];
const synonyms = new Map(
  groups.flatMap((group) => group.map((word) => [word, group[0]!] as const)),
);
const stop = new Set(
  'a an the make it please pls lol to of in on at for from into with and is are be now when every everything all them than do can i want my your just'.split(
    ' ',
  ),
);
export function tokens(text: string): Set<string> {
  return new Set(
    (
      text
        .normalize('NFKC')
        .toLowerCase()
        .match(/[a-z0-9]+/g) ?? []
    )
      .filter((w) => !stop.has(w))
      .map((w) => synonyms.get(w) ?? w),
  );
}
/** Conservative normalized overlap reduces weak matches without model or network calls. */
export function matchArchive<T extends ArchiveEntry>(
  request: string,
  entries: readonly T[],
): T | undefined {
  const q = tokens(request);
  if (!q.size) return;
  let best: T | undefined,
    bestScore = 0;
  for (const entry of entries) {
    const candidates = [tokens(entry.request), tokens(entry.name)];
    for (const words of candidates) {
      const overlap = [...q].filter((w) => words.has(w)).length;
      const coverage = overlap / q.size;
      const score = 0.75 * coverage + (0.25 * overlap) / Math.max(1, words.size);
      if (overlap >= Math.min(2, q.size) && coverage >= 0.65 && score >= 0.6 && score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }
  }
  return best;
}
/** Ranked alternatives are suggestions, never an automatic low-confidence match. */
export function closestArchive<T extends ArchiveEntry>(
  request: string,
  entries: readonly T[],
): T[] {
  const query = tokens(request);
  const ranked = entries
    .map((entry, index) => ({
      entry,
      index,
      score: Math.max(
        ...[entry.request, entry.name].map((text) => {
          const words = tokens(text);
          const overlap = [...query].filter((word) => words.has(word)).length;
          return overlap / Math.max(1, query.size + words.size - overlap);
        }),
      ),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const seen = new Set<string>();
  return ranked
    .filter(({ entry }) => {
      const key = entry.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3)
    .map(({ entry }) => entry);
}
export function moderateRule(
  text: string,
  author: string,
): { text: string; author: string } | { reason: string } {
  if (!text.trim() || text.length > 200 || author.length > 80)
    return { reason: 'Use a rule of 1–200 characters and a name of at most 80 characters.' };
  const clean = (s: string) =>
    s
      .normalize('NFKC')
      .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const rule = clean(text),
    name = clean(author) || 'You';
  if (!rule || rule.length > 200 || name.length > 80)
    return { reason: 'Keep the rule under 200 characters and the name under 80.' };
  if (/\b(fuck|shit|bitch|kill yourself|dox)\b/i.test(rule + ' ' + name))
    return { reason: 'Keep rules and names family-friendly.' };
  return { text: rule, author: name };
}
export function archivePatch(entry: ArchivedMod, patchId: string, author: string): Patch {
  return {
    patchId,
    name: entry.name,
    description: entry.request,
    patchNotes: entry.patchNotes,
    author,
    source: entry.source,
    origin: 'archive',
    change: entry.change,
  };
}
export const NO_ARCHIVE_MATCH =
  'No archived patch for that yet — run it locally for live AI patches.';
