import { botIntent, composeHosts, World } from '@patch-notes-live/engine';
import { SPLIT_ON_HIT } from '@patch-notes-live/mod-api';
import type { ServerMessage } from '@patch-notes-live/mod-api/protocol';
import { PatchManager } from './patch-manager.js';
import { HubConnection } from './connection.js';
import { Controls } from './controls.js';
import { Effects } from './effects.js';
import { Feedback } from './feedback.js';
import { interpolateSnapshots, MAX_FRAME_SECONDS, planFrame } from './loop.js';
import { render } from './renderer.js';
import { PerfReadout, RollingSamples } from './perf.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, readOptions } from './view.js';
import { DemoSession, bindTypingAssist } from './demo-session.js';
import { RuleUI, firstRun } from './rules.js';
import { theme } from './tokens.js';
import { PatchFeed } from './patch-feed.js';
import { Landing } from './landing.js';
import { revealGame } from './transition.js';
import { authorLabel } from './changelog.js';
import '@fontsource/bricolage-grotesque/latin-600.css';
import '@fontsource/bricolage-grotesque/latin-800.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './tokens.css';
import './style.css';
import './rules.css';
import './landing.css';

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing #${id}`);
  return result as T;
}

const options = readOptions(window.location.search);
let playing = options.play || options.obs;
let entering = false;
let landing: Landing | undefined;
const feed = new PatchFeed();
document.documentElement.classList.toggle('playing', playing);
document.documentElement.classList.toggle('obs', options.obs);
const stage = element('stage');
stage.hidden = !playing;
element('landing').hidden = playing;
const canvas = element<HTMLCanvasElement>('game');
const context = canvas.getContext('2d');
if (!context) throw new Error('Canvas 2D is unavailable');
const ctx = context;
const botButton = element<HTMLButtonElement>('bot-toggle');
const botLabel = element('bot-label');
const gameOver = element('game-over');
const hp = element('hp'),
  hpMeter = element('hp-meter'),
  hpFill = element('hp-fill');
const wave = element('wave'),
  score = element('score'),
  time = element('time');
const finalTime = element('final-time'),
  finalScore = element('final-score');
element('seed-label').textContent = `Seed ${options.seed}`;
const feedback = new Feedback(element('toasts'), element('tint'));
const perf = options.perf ? new PerfReadout(element('perf')) : undefined;
const demo = new DemoSession(options.bot);
let effects = new Effects();
let connection: HubConnection | undefined;
let noticeUntil = 0;
let revertUntil = 0;
let pendingNotice:
  { patchId: string; text: string; author: string; notes: string | undefined } | undefined;

function notice(text: string, reverted = false, notes?: string, author?: string): void {
  if (!reverted && performance.now() < revertUntil) return;
  const node = element(reverted ? 'patch-reverted' : 'patch-notice');
  const title = document.createElement('strong');
  title.textContent = text;
  if (author) {
    const label = authorLabel(
      author,
      element<HTMLInputElement>('rule-author').value.trim() || 'You',
    );
    const by = document.createElement('span');
    by.textContent = label.text;
    by.className = `notice-author${label.yours ? ' your-author' : ''}`;
    title.append(' ', by);
  }
  node.replaceChildren(title);
  if (notes) {
    const detail = document.createElement('span');
    detail.textContent = notes;
    node.append(detail);
  }
  node.classList.toggle('reverted', reverted);
  node.hidden = false;
  if (reverted) {
    element('patch-notice').hidden = true;
    noticeUntil = 0;
    revertUntil = performance.now() + 8000;
  } else noticeUntil = performance.now() + 6000;
}
const params = new URLSearchParams(location.search);
const seconds = Number(params.get('patchLifetime') ?? 180);
const manager = await PatchManager.create(
  {
    applied(patch, version) {
      feed.applied(patch, version);
      element('patch-notice').style.setProperty(
        '--patch-color',
        `var(--patch-${feed.slot(patch.patchId)})`,
      );
      demo.patchApplied(current.tick);
      effects.rewrite(patch.name);
      pendingNotice = {
        patchId: patch.patchId,
        text: `${version} · ${patch.name}`,
        author: patch.author,
        notes: (patch.origin === 'archive' ? 'From the archive · ' : '') + (patch.patchNotes ?? ''),
      };

      connection?.send({ v: 1, type: 'patchApplied', patchId: patch.patchId, version });
    },
    reverted(patchId, reason) {
      feed.reverted(patchId, reason);
      if (pendingNotice?.patchId === patchId) pendingNotice = undefined;
      effects.rewrite(reason, true);
      notice(`Patch reverted: ${reason}`, true);
      connection?.send({ v: 1, type: 'patchReverted', patchId, reason });
    },
  },
  {
    lifetimeMs:
      (Number.isFinite(seconds) && seconds >= 1 && seconds <= 3600 ? seconds : 180) * 1000,
  },
);
if (options.mod)
  await manager.apply({
    patchId: 'local-demo',
    name: 'Split on hit',
    description: 'Enemies split when shot.',
    author: 'demo',
    source: SPLIT_ON_HIT,
  });
const createWorld = () =>
  new World(
    options.seed,
    composeHosts(manager.host, demo.host, {
      onKill: (_g, { victim }) => {
        effects.kill(victim);
      },
    }),
  );
let world = createWorld();
let previous = world.snapshot(),
  current = previous;
let accumulator = 0;
let lastFrame: number | undefined;
let visualTime = 0;

function toggleBot(): void {
  demo.autopilot = !demo.autopilot;
  updateBot();
  world.applyCommands([
    {
      type: 'toast',
      text: demo.autopilot
        ? 'Autopilot on. Keep the suggestions coming.'
        : 'Autopilot off. You have the controls.',
    },
  ]);
}

function updateBot(): void {
  botButton.setAttribute('aria-pressed', String(demo.autopilot));
  botLabel.textContent = demo.autopilot ? 'On' : demo.typing ? 'While you type' : 'Off';
  element('typing-assist').hidden = !demo.typing;
}

async function restart(): Promise<void> {
  if (restarting) return;
  restarting = true;
  controls.reset();
  demo.reset();
  effects = new Effects();
  feedback.clear();
  perf?.reset();
  try {
    await manager.restart();
    world = createWorld();
    previous = current = world.snapshot();
    accumulator = 0;
    lastFrame = undefined;
    gameOver.hidden = true;
    canvas.focus({ preventScroll: true });
  } catch (error) {
    notice(
      `Restart failed: ${error instanceof Error ? error.message : 'sandbox initialization failed'}`,
      true,
    );
  } finally {
    restarting = false;
  }
}

let restarting = false;

const controls = new Controls(canvas, { toggleBot, restart });
botButton.addEventListener('click', toggleBot);
element('restart').addEventListener('click', restart);
updateBot();
bindTypingAssist(demo, () => {
  controls.reset();
  updateBot();
});

function resize(): void {
  stage.style.setProperty(
    '--scale',
    String(Math.min(window.innerWidth / 1280, window.innerHeight / 720)),
  );
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(CANVAS_WIDTH * dpr);
  canvas.height = Math.round(CANVAS_HEIGHT * dpr);
}
window.addEventListener('resize', resize);
window.addEventListener('pagehide', () => {
  landing?.dispose();
  manager.dispose();
  connection?.close();
  clearInterval(telemetryTimer);
});
document.addEventListener('visibilitychange', () => {
  landing?.pause();
  lastFrame = undefined;
  accumulator = 0;
});
resize();

function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function updateHUD(): void {
  if (pendingNotice && !effects.rewriting && performance.now() >= revertUntil) {
    notice(pendingNotice.text, false, pendingNotice.notes, pendingNotice.author);
    pendingNotice = undefined;
  }
  hp.textContent = `${Math.ceil(current.player.hp)} / ${current.player.maxHp}`;
  hpMeter.setAttribute('aria-valuemax', String(current.player.maxHp));
  hpMeter.setAttribute('aria-valuenow', String(current.player.hp));
  hpFill.style.width = `${(current.player.hp / current.player.maxHp) * 100}%`;
  hpFill.style.backgroundColor =
    current.player.hp <= current.player.maxHp * 0.3 ? theme().danger : theme().you;
  wave.textContent = String(Math.max(1, current.wave));
  score.textContent = String(current.score);
  time.textContent = clock(current.time);
  element('version').textContent = manager.version;
  const active = manager.active;
  element('patch-count').textContent = `${active.length} / 3`;
  feed.update(
    element('active-patches'),
    active,
    element<HTMLInputElement>('rule-author').value.trim() || 'You',
  );
  if (performance.now() >= noticeUntil) element('patch-notice').hidden = true;
  if (performance.now() >= revertUntil) element('patch-reverted').hidden = true;
  gameOver.hidden = !current.gameOver;
  if (current.gameOver) {
    finalTime.textContent = clock(current.time);
    finalScore.textContent = String(current.score);
  }
}

function frame(now: number): void {
  if (document.hidden || restarting) {
    lastFrame = undefined;
    requestAnimationFrame(frame);
    return;
  }
  if (!playing && !entering) {
    landing?.update(now);
    canvas.dataset.tick = '0';
    canvas.dataset.paused = 'true';
    requestAnimationFrame(frame);
    return;
  }
  const elapsed =
    lastFrame === undefined ? 0 : Math.min(MAX_FRAME_SECONDS, (now - lastFrame) / 1000);
  if (lastFrame !== undefined) perf?.frame(now - lastFrame);
  if (lastFrame !== undefined) frameSamples.push(now - lastFrame);
  lastFrame = now;
  const paused = entering || !element('first-run').hidden;
  const plan = paused ? { ticks: 0, accumulator: 0, alpha: 1 } : planFrame(accumulator, elapsed);
  accumulator = plan.accumulator;
  manager.update();
  for (let i = 0; i < plan.ticks; i++) {
    if (current.gameOver) break;
    previous = current;
    world.tick(demo.drivesPlayer ? botIntent(current) : controls.intent(current.arena));
    current = world.snapshot();
    const duration = manager.host.mods.reduce(
      (sum, m) => sum + (m.tick === current.tick ? m.timeThisTickMs : 0),
      0,
    );
    perf?.tick(duration);
    tickSamples.push(duration);
    manager.observeTick(current.tick);
    effects.observe(previous, current);
  }
  const events = world.drainEvents();
  feedback.accept(events);
  effects.accept(events);
  feedback.update(elapsed);
  effects.update(elapsed);
  visualTime += elapsed;
  const intent = demo.drivesPlayer ? botIntent(current) : controls.intent(current.arena);
  const visible = current.gameOver ? current : interpolateSnapshots(previous, current, plan.alpha);
  render(
    ctx,
    visible,
    effects,
    { x: intent.aimX, y: intent.aimY },
    options.obs,
    visualTime,
    demo.protected(current.tick),
    (entityId) => {
      const owner = manager.host.spawnedBy(entityId);
      const slot = owner && feed.slot(owner);
      return slot ? theme()[`patch-${slot}` as 'patch-1'] : undefined;
    },
  );
  updateHUD();
  ruleUI.update(now, current.gameOver);
  canvas.dataset.tick = String(current.tick);
  canvas.dataset.autopilot = String(demo.drivesPlayer);
  canvas.dataset.paused = String(paused);
  canvas.dataset.protected = String(demo.protected(current.tick));
  perf?.update(now, current.entities.length, manager.active.length);
  requestAnimationFrame(frame);
}
const frameSamples = new RollingSamples(60),
  tickSamples = new RollingSamples(180);
async function receive(message: ServerMessage): Promise<void> {
  if (ruleUI.receive(message)) return;
  if (message.type === 'hello') {
    const desired = new Set(message.patches.map((p) => p.patchId));
    for (const patch of manager.active)
      if (
        patch.patchId !== 'local-demo' &&
        !patch.patchId.startsWith('archive-') &&
        !desired.has(patch.patchId)
      )
        manager.revert(patch.patchId, 'server reset');
    for (const patch of message.patches) {
      const reason = manager.removedReason(patch.patchId);
      if (reason) connection?.send({ v: 1, type: 'patchReverted', patchId: patch.patchId, reason });
      else await manager.apply(patch);
    }
  } else if (message.type === 'applyPatch') {
    const reason = manager.removedReason(message.patchId);
    if (reason) connection?.send({ v: 1, type: 'patchReverted', patchId: message.patchId, reason });
    else {
      if (current.gameOver) await restart();
      await manager.apply(message);
    }
  } else if (message.type === 'revertPatch') manager.revert(message.patchId, message.reason);
}
const ruleUI = new RuleUI({
  manager,
  send: (message) => connection?.send(message) ?? false,
  notice,
  ensurePlaying: async () => {
    if (current.gameOver) await restart();
    demo.patchApplied(current.tick);
  },
});
if (playing) firstRun();
else
  landing = new Landing(async () => {
    controls.reset();
    entering = true;
    stage.hidden = false;
    document.documentElement.classList.add('playing');
    element('first-run').hidden = true;
    window.scrollTo(0, 0);
    await revealGame(element('landing'), stage);
    playing = true;
    entering = false;
    try {
      localStorage.setItem('patch-notes-live:onboarded', '1');
    } catch {
      /* Optional storage. */
    }
    lastFrame = undefined;
    accumulator = 0;
    canvas.focus({ preventScroll: true });
  });
const server = params.get('server') ?? (import.meta.env.PROD ? 'off' : 'ws://localhost:8787');
let messages: Promise<unknown> = Promise.resolve();
if (server !== 'off' && /^wss?:\/\//.test(server) && server.length <= 2048)
  connection = new HubConnection(
    server,
    (message) => {
      messages = messages
        .then(() => receive(message))
        .catch((error) =>
          notice(`PATCH REVERTED: ${error instanceof Error ? error.message : 'load failed'}`, true),
        );
    },
    (connected) => {
      demo.connected = connected;
      ruleUI.setConnected(connected);
      element('server-status').textContent = connected
        ? 'Hub connected'
        : 'Standalone · reconnecting';
    },
  );
else element('server-status').textContent = 'Standalone';
const telemetryTimer = setInterval(() => {
  manager.update();
  const frames = frameSamples.summary();
  connection?.send({
    v: 1,
    type: 'telemetry',
    fps: frames.mean > 0 ? 1000 / frames.mean : 0,
    frameP95: frames.p95,
    sandboxP95: tickSamples.summary().p95,
    activePatches: manager.active,
  });
}, 1000);
requestAnimationFrame(frame);
