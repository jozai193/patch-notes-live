import { now } from './types.js';

// QuickJS polls periodically; this fixed count is shared across every hook in a tick.
export const INSTRUCTION_BUDGET = 64;
export const EMERGENCY_MS = 50;

export class InstructionBudget {
  used = 0;
  exhausted = false;
  emergency = false;
  private tick = -2;
  private callStarted = Infinity;

  constructor(private readonly clock: () => number = now) {}

  beginTick(tick: number): void {
    if (this.tick === tick) return;
    this.tick = tick;
    this.used = 0;
    this.exhausted = false;
    this.emergency = false;
  }

  startCall(): void {
    this.callStarted = this.clock();
  }
  endCall(): void {
    this.callStarted = Infinity;
  }

  checkEmergency(): boolean {
    this.emergency ||= this.clock() - this.callStarted >= EMERGENCY_MS;
    return this.emergency;
  }

  poll = (): boolean => {
    this.used++;
    this.exhausted ||= this.used > INSTRUCTION_BUDGET;
    return this.checkEmergency() || this.exhausted;
  };
}
