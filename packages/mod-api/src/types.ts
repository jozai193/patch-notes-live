import type { ModHost } from '@patch-notes-live/engine';
export type HookName = keyof ModHost;
export type FaultKind = 'throw' | 'interrupt' | 'memory' | 'invalid-result';
export interface Fault {
  modName: string;
  hook: HookName | 'load';
  kind: FaultKind;
  message: string;
  tick: number;
}
export interface ModInfo {
  id: number;
  name: string;
  description: string;
  hooks: HookName[];
  faultCount: number;
  tick: number;
  timeThisTickMs: number;
}
export interface LogEntry {
  modName: string;
  tick: number;
  message: string;
}
export class InvalidResult extends Error {}
export const now = (): number =>
  (globalThis as typeof globalThis & { performance: { now(): number } }).performance.now();
