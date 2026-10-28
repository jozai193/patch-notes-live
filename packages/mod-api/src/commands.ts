import { validateEntityFields } from '@patch-notes-live/engine';
import type { Arena, Entity, Game, Physics, SpawnKind } from '@patch-notes-live/engine';
import { InvalidResult } from './types.js';

export const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const id = (v: unknown): v is number => number(v) && Number.isSafeInteger(v) && v !== 0;

export function decode(text: string, onHit: boolean, playerId?: number) {
  if (text.length > 262144) throw new InvalidResult('Result exceeds 256 KB');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InvalidResult('Malformed JSON result');
  }
  if (!object(value) || !Array.isArray(value.commands) || value.commands.length > 1000)
    throw new InvalidResult('Invalid command list');
  const commands = value.commands.map((cmd: unknown) => {
    if (!object(cmd)) throw new InvalidResult('Invalid command');
    switch (cmd.type) {
      case 'spawn':
      case 'setEntity': {
        const fields = validateEntityFields(cmd.type === 'spawn' ? cmd.opts : cmd.fields);
        if (!fields || !id(cmd.id)) throw new InvalidResult('Invalid entity fields');
        if (cmd.type === 'spawn') {
          if (!['enemy', 'pickup', 'hazard'].includes(String(cmd.kind)) || cmd.id >= 0)
            throw new InvalidResult('Invalid spawn');
          return { type: 'spawn' as const, id: cmd.id, kind: cmd.kind as SpawnKind, opts: fields };
        }
        return { type: 'setEntity' as const, id: cmd.id, fields };
      }
      case 'remove':
        if (!id(cmd.id)) throw new InvalidResult('Invalid removal');
        if (cmd.id === playerId) throw new InvalidResult('Cannot remove player');
        return { type: 'remove' as const, id: cmd.id };
      case 'setPhysics': {
        const p = cmd.physics;
        if (
          !object(p) ||
          Object.keys(p).some((k) => !['gravity', 'friction', 'timeScale'].includes(k)) ||
          !object(p.gravity) ||
          !number(p.gravity.x) ||
          !number(p.gravity.y) ||
          !number(p.friction) ||
          !number(p.timeScale)
        )
          throw new InvalidResult('Invalid physics');
        return { type: 'setPhysics' as const, physics: p as unknown as Physics };
      }
      case 'setArena': {
        const a = cmd.arena;
        if (
          !object(a) ||
          Object.keys(a).some((k) => !['width', 'height', 'wrap'].includes(k)) ||
          !number(a.width) ||
          !number(a.height) ||
          typeof a.wrap !== 'boolean'
        )
          throw new InvalidResult('Invalid arena');
        return { type: 'setArena' as const, arena: a as unknown as Arena };
      }
      case 'toast':
        if (typeof cmd.text !== 'string') throw new InvalidResult('Invalid toast');
        return { type: 'toast' as const, text: cmd.text };
      case 'tint':
        if (typeof cmd.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(cmd.color) || !number(cmd.ms))
          throw new InvalidResult('Invalid tint');
        return { type: 'tint' as const, color: cmd.color, ms: cmd.ms };
      default:
        throw new InvalidResult('Unknown command');
    }
  });
  let result: { damage?: number; cancel?: boolean } | undefined;
  if (value.result !== null) {
    if (
      !onHit ||
      !object(value.result) ||
      Object.keys(value.result).some((k) => !['damage', 'cancel'].includes(k)) ||
      ('damage' in value.result && !number(value.result.damage)) ||
      ('cancel' in value.result && typeof value.result.cancel !== 'boolean')
    )
      throw new InvalidResult('Invalid hook return');
    result = value.result as { damage?: number; cancel?: boolean };
  }
  return { commands, result };
}

export function replay(
  g: Game,
  decoded: ReturnType<typeof decode>,
  known: Map<number, Entity>,
  aliases: Map<number, number>,
): [number, number][] {
  const ids: [number, number][] = [];
  let listed = false;
  const find = (id: number) => {
    const real = aliases.get(id) ?? id;
    if (!known.has(real) && !listed) {
      for (const e of g.entities()) known.set(e.id, e);
      listed = true;
    }
    return known.get(real);
  };
  for (const cmd of decoded.commands) {
    switch (cmd.type) {
      case 'spawn': {
        const entity = g.spawn(cmd.kind, cmd.opts);
        aliases.set(cmd.id, entity.id);
        known.set(entity.id, entity);
        ids.push([cmd.id, entity.id]);
        if (aliases.size > 1000) aliases.delete(aliases.keys().next().value!);
        break;
      }
      case 'setEntity': {
        const entity = find(cmd.id);
        if (entity) g.set(entity, cmd.fields);
        break;
      }
      case 'remove': {
        const entity = find(cmd.id);
        if (entity) g.remove(entity);
        break;
      }
      case 'setPhysics':
        Object.assign(g.physics, cmd.physics);
        break;
      case 'setArena':
        Object.assign(g.arena, cmd.arena);
        break;
      case 'toast':
        g.ui.toast(cmd.text);
        break;
      case 'tint':
        g.ui.tint(cmd.color, cmd.ms);
        break;
    }
  }
  return ids;
}
