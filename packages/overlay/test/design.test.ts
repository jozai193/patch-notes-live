import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import { PatchFeed } from '../src/patch-feed.js';
import { headlineFrame } from '../src/landing.js';
it('keeps the headline valid when the first queued RAF predates initialization', () => {
  expect(headlineFrame(-1, false)).toEqual({ example: 0, diff: false, characters: 0 });
  expect(headlineFrame(1900, false).diff).toBe(true);
  expect(headlineFrame(1, true).diff).toBe(true);
  expect(headlineFrame(32000, false).example).toBe(0);
});
const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');
const tokens = Object.fromEntries(
  [...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/g)].map((m) => [m[1], m[2]!]),
);
const luminance = (hex: string) =>
  hex
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
it('keeps every reading/semantic/patch token above AA on the raised surface', () => {
  for (const key of [
    'text',
    'muted',
    'you',
    'danger',
    'good',
    'change',
    'ai',
    ...Array.from({ length: 6 }, (_, i) => `patch-${i + 1}`),
  ]) {
    expect(
      (luminance(tokens[key]!) + 0.05) / (luminance(tokens.surface!) + 0.05),
      key,
    ).toBeGreaterThanOrEqual(4.5);
  }
});
it('keeps literal UI/render colors confined to the token file', () => {
  const dir = new URL('../src/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => /\.(ts|css)$/.test(f) && f !== 'tokens.css'))
    expect(readFileSync(new URL(file, dir), 'utf8'), file).not.toMatch(
      /#[\da-fA-F]{3,8}\b|rgba?\(\s*\d/,
    );
});
it('screens patch identities under normal vision and three severity-1 CVD simulations', () => {
  // Machado matrices, independently documented in docs/design.md.
  const matrices = [
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [0.152286, 1.052583, -0.204868],
      [0.114503, 0.786281, 0.099216],
      [-0.003882, -0.048116, 1.051998],
    ],
    [
      [0.367322, 0.860646, -0.227968],
      [0.280085, 0.672501, 0.047413],
      [-0.01182, 0.04294, 0.968881],
    ],
    [
      [1.255528, -0.076749, -0.178779],
      [-0.078411, 0.930809, 0.147602],
      [0.004733, 0.691367, 0.3039],
    ],
  ];
  const lab = (rgb: number[]) => {
    const [r, g, b] = rgb as [number, number, number];
    const f = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
    const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047),
      y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b),
      z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const colors = Array.from({ length: 6 }, (_, i) =>
    tokens[`patch-${i + 1}`]!.slice(1)
      .match(/../g)!
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)),
  );
  for (const matrix of matrices) {
    const samples = colors.map((rgb) =>
      lab(
        matrix.map((row) =>
          Math.max(
            0,
            Math.min(
              1,
              row.reduce((sum, v, i) => sum + v * rgb[i]!, 0),
            ),
          ),
        ),
      ),
    );
    for (let i = 0; i < 6; i++)
      for (let j = i + 1; j < 6; j++)
        expect(Math.hypot(...samples[i]!.map((v, k) => v - samples[j]![k]!))).toBeGreaterThan(30);
  }
});
it('uses distinct free patch slots, retains them across redraws, and records reverts', () => {
  const feed = new PatchFeed();
  const patch = (id: string) => ({
    patchId: id,
    name: id,
    description: id,
    author: 'You',
    source: '',
  });
  for (const id of ['a', 'b', 'c']) feed.applied(patch(id), 'v1.1');
  expect(new Set(['a', 'b', 'c'].map((id) => feed.slot(id))).size).toBe(3);
  expect(feed.slot('a')).toBe(1);
  feed.reverted('a', 'expired');
  feed.applied(patch('d'), 'v1.4');
  expect(feed.entries[0]?.reason).toBe('expired');
  expect(new Set(['b', 'c', 'd'].map((id) => feed.slot(id))).size).toBe(3);
  expect(feed.slot('b')).toBe(2);
});
