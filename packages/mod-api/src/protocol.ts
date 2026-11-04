export const PROTOCOL_VERSION = 1;
export interface Patch {
  patchId: string;
  name: string;
  description: string;
  patchNotes?: string | undefined;
  author: string;
  source: string;
}
export interface ActivePatch {
  patchId: string;
  name: string;
  author: string;
  remainingSeconds: number;
}
export type ServerMessage =
  | { v: 1; type: 'hello'; patches: Patch[] }
  | ({ v: 1; type: 'applyPatch' } & Patch)
  | { v: 1; type: 'revertPatch'; patchId: string; reason: string }
  | { v: 1; type: 'result'; requestId: string; ok: boolean; patchId?: string; reason?: string };
export type ClientMessage =
  | { v: 1; type: 'hello'; role: 'overlay' | 'controller' }
  | { v: 1; type: 'patchApplied'; patchId: string; version: string }
  | { v: 1; type: 'patchReverted'; patchId: string; reason: string }
  | {
      v: 1;
      type: 'telemetry';
      fps: number;
      frameP95: number;
      sandboxP95: number;
      activePatches: ActivePatch[];
    }
  | { v: 1; type: 'applyRequest'; requestId: string; author: string; source: string }
  | { v: 1; type: 'revertRequest'; requestId: string; patchId: string };

const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown, max: number) =>
  typeof x === 'string' &&
  x.length > 0 &&
  x.length <= max &&
  !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(x);
const id = (x: unknown) => text(x, 100) && /^[a-zA-Z0-9_-]+$/.test(x as string);
const number = (x: unknown) =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1_000_000;
const keys = (x: object, allowed: string[]) => Object.keys(x).every((key) => allowed.includes(key));
export function sourceValid(x: unknown): x is string {
  if (typeof x !== 'string' || !x.trim()) return false;
  let bytes = 0;
  for (const ch of x) {
    const cp = ch.codePointAt(0)!;
    bytes += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4;
  }
  return bytes <= 8192;
}
export function patchValid(x: unknown): x is Patch {
  return (
    record(x) &&
    id(x.patchId) &&
    text(x.name, 100) &&
    typeof x.description === 'string' &&
    x.description.length <= 500 &&
    !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(x.description) &&
    (x.patchNotes === undefined ||
      (typeof x.patchNotes === 'string' &&
        x.patchNotes.length <= 140 &&
        !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(x.patchNotes))) &&
    text(x.author, 80) &&
    sourceValid(x.source)
  );
}
const active = (x: unknown): x is ActivePatch =>
  record(x) &&
  keys(x, ['patchId', 'name', 'author', 'remainingSeconds']) &&
  id(x.patchId) &&
  text(x.name, 100) &&
  text(x.author, 80) &&
  number(x.remainingSeconds);
function parse(raw: string): Record<string, unknown> | undefined {
  if (raw.length > 196608) return;
  try {
    const x: unknown = JSON.parse(raw);
    return record(x) && x.v === 1 ? x : undefined;
  } catch {
    return;
  }
}
export function parseServerMessage(raw: string): ServerMessage | undefined {
  const x = parse(raw);
  if (!x) return;
  const common = ['v', 'type'];
  switch (x.type) {
    case 'hello':
      if (
        keys(x, [...common, 'patches']) &&
        Array.isArray(x.patches) &&
        x.patches.length <= 3 &&
        x.patches.every(
          (p) =>
            patchValid(p) &&
            keys(p, ['patchId', 'name', 'description', 'patchNotes', 'author', 'source']),
        ) &&
        new Set(x.patches.map((p) => p.patchId)).size === x.patches.length
      )
        return x as unknown as ServerMessage;
      break;
    case 'applyPatch':
      if (
        keys(x, [...common, 'patchId', 'name', 'description', 'patchNotes', 'author', 'source']) &&
        patchValid(x)
      )
        return x as unknown as ServerMessage;
      break;
    case 'revertPatch':
      if (keys(x, [...common, 'patchId', 'reason']) && id(x.patchId) && text(x.reason, 512))
        return x as unknown as ServerMessage;
      break;
    case 'result':
      if (
        keys(x, [...common, 'requestId', 'ok', 'patchId', 'reason']) &&
        id(x.requestId) &&
        typeof x.ok === 'boolean' &&
        (x.patchId === undefined || id(x.patchId)) &&
        (x.reason === undefined || text(x.reason, 512))
      )
        return x as unknown as ServerMessage;
  }
  return;
}
export function parseClientMessage(raw: string): ClientMessage | undefined {
  const x = parse(raw);
  if (!x) return;
  const common = ['v', 'type'];
  switch (x.type) {
    case 'hello':
      if (keys(x, [...common, 'role']) && (x.role === 'overlay' || x.role === 'controller'))
        return x as unknown as ClientMessage;
      break;
    case 'patchApplied':
      if (
        keys(x, [...common, 'patchId', 'version']) &&
        id(x.patchId) &&
        typeof x.version === 'string' &&
        /^v\d+\.\d$/.test(x.version) &&
        x.version.length < 20
      )
        return x as unknown as ClientMessage;
      break;
    case 'patchReverted':
      if (keys(x, [...common, 'patchId', 'reason']) && id(x.patchId) && text(x.reason, 512))
        return x as unknown as ClientMessage;
      break;
    case 'telemetry':
      if (
        keys(x, [...common, 'fps', 'frameP95', 'sandboxP95', 'activePatches']) &&
        number(x.fps) &&
        number(x.frameP95) &&
        number(x.sandboxP95) &&
        Array.isArray(x.activePatches) &&
        x.activePatches.length <= 3 &&
        x.activePatches.every(active) &&
        new Set(x.activePatches.map((p) => p.patchId)).size === x.activePatches.length
      )
        return x as unknown as ClientMessage;
      break;
    case 'applyRequest':
      if (
        keys(x, [...common, 'requestId', 'source', 'author']) &&
        id(x.requestId) &&
        sourceValid(x.source) &&
        text(x.author, 80)
      )
        return x as unknown as ClientMessage;
      break;
    case 'revertRequest':
      if (keys(x, [...common, 'requestId', 'patchId']) && id(x.requestId) && id(x.patchId))
        return x as unknown as ClientMessage;
  }
  return;
}
