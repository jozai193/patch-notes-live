import type { ModHost } from '@patch-notes-live/engine';
/** Overlay-only assistance. The verifier and deterministic engine rules stay unchanged. */
export class DemoSession {
  typing = false;
  connected = false;
  private protectedUntil = -1;
  constructor(public autopilot = false) {}
  get drivesPlayer(): boolean {
    return this.autopilot || this.typing;
  }
  patchApplied(tick: number): void {
    if (!this.connected) this.protectedUntil = tick + 180;
  }
  protected(tick: number): boolean {
    return !this.connected && tick < this.protectedUntil;
  }
  reset(): void {
    this.protectedUntil = -1;
  }
  readonly host: ModHost = {
    onHit: (g, event) => {
      if (event.target.kind === 'player' && this.protected(Math.round(g.time * 60)))
        return { cancel: true };
    },
  };
}
export function bindTypingAssist(session: DemoSession, changed: () => void): void {
  const inputs = [document.getElementById('rule-input'), document.getElementById('rule-author')];
  const sync = (target: EventTarget | null) => {
    session.typing = inputs.some((input) => input === target);
    changed();
  };
  document.addEventListener('focusin', (event) => sync(event.target));
  document.addEventListener('focusout', (event) => sync(event.relatedTarget));
  window.addEventListener('blur', () => sync(null));
  window.addEventListener('focus', () => sync(document.activeElement));
  sync(document.activeElement);
}
