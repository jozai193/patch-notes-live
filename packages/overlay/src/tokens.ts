import type { Entity } from '@patch-notes-live/engine';
const names = [
  'background',
  'surface',
  'text',
  'muted',
  'you',
  'danger',
  'good',
  'change',
  'ai',
  'patch-1',
  'patch-2',
  'patch-3',
  'patch-4',
  'patch-5',
  'patch-6',
  'engine-player',
  'engine-enemy',
  'engine-pickup',
  'engine-drop',
  'engine-hazard',
  'engine-projectile',
] as const;
type Palette = Record<(typeof names)[number], string>;
let cached: Palette | undefined;
let motion: MediaQueryList | undefined;
export function theme(): Palette {
  if (!cached) {
    const style = getComputedStyle(document.documentElement);
    cached = Object.fromEntries(
      names.map((name) => [name, style.getPropertyValue(`--${name}`).trim()]),
    ) as Palette;
  }
  return cached;
}
export function alpha(color: string, opacity: number): string {
  return `color-mix(in srgb, ${color} ${Math.max(0, Math.min(1, opacity)) * 100}%, transparent)`;
}
export function entityColor(entity: Entity): string {
  if (typeof document === 'undefined') return entity.color;
  const t = theme();
  const defaults: Record<string, string> = {
    player: t['engine-player'],
    enemy: t['engine-enemy'],
    pickup: t['engine-pickup'],
    hazard: t['engine-hazard'],
    projectile: t['engine-projectile'],
  };
  if (
    entity.color.toLowerCase() !== defaults[entity.kind] &&
    !(entity.kind === 'pickup' && entity.color.toLowerCase() === t['engine-drop'])
  )
    return entity.color;
  return entity.kind === 'enemy'
    ? t.danger
    : entity.kind === 'hazard'
      ? t.change
      : entity.kind === 'pickup'
        ? t.good
        : t.you;
}
export function reducedMotion(): boolean {
  if (typeof matchMedia === 'undefined') return false;
  motion ??= matchMedia('(prefers-reduced-motion: reduce)');
  return motion.matches;
}
