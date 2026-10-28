import type { ModHost } from '@patch-notes-live/engine';
export type HookName = keyof ModHost;
export type FaultKind =
  'throw' | 'interrupt' | 'memory' | 'invalid-result' | 'emergency' | 'disabled' | 'dispose';
export interface Fault {
  modName: string;
  hook: HookName | 'load' | 'dispose';
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
  consecutiveFaults: number;
  disabled: boolean;
  disabledReason: string | undefined;
  disposed: boolean;
  tick: number;
  timeThisTickMs: number;
  interruptsThisTick: number;
  maxInterruptsPerTick: number;
}
export interface LogEntry {
  modName: string;
  tick: number;
  message: string;
}
export class InvalidResult extends Error {}
export class SandboxFailure extends Error {
  constructor(
    readonly kind: FaultKind,
    message: string,
  ) {
    super(message);
  }
}
export const now = (): number =>
  (globalThis as typeof globalThis & { performance: { now(): number } }).performance.now();
