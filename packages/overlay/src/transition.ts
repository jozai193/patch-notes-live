import { reducedMotion } from './tokens.js';

/** Explicit animation lifetime: changing display alone must never skip the transition. */
export async function revealGame(landing: HTMLElement, stage: HTMLElement): Promise<void> {
  const root = document.documentElement;
  root.classList.add('entering-game');
  const reduce = reducedMotion();
  const options: KeyframeAnimationOptions = {
    duration: reduce ? 240 : 360,
    easing: 'cubic-bezier(.22,.61,.36,1)',
    fill: 'both',
  };
  const outgoing = landing.animate(
    reduce
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 0 100%)' }],
    options,
  );
  const incoming = stage.animate([{ opacity: reduce ? 0 : 0.35 }, { opacity: 1 }], options);
  try {
    await Promise.all([outgoing.finished, incoming.finished]);
  } catch {
    // Navigation can cancel animations; cleanup still belongs to this transition.
  } finally {
    landing.hidden = true;
    outgoing.cancel();
    incoming.cancel();
    root.classList.remove('entering-game');
  }
}
