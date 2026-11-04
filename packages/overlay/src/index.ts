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
import './style.css';

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing #${id}`);
  return result as T;
}

const options = readOptions(window.location.search);
document.documentElement.classList.toggle('obs', options.obs);
const stage = element('stage');
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
element('seed-label').textContent = `SEED ${options.seed}`;
const feedback = new Feedback(element('toasts'), element('tint'));
const perf = options.perf ? new PerfReadout(element('perf')) : undefined;
let effects = new Effects();
let connection: HubConnection | undefined;
let noticeUntil = 0;
let revertUntil = 0;
let pendingNotice: { patchId: string; text: string; notes: string | undefined } | undefined;

function notice(text: string, reverted = false, notes?: string): void {
  const node = element(reverted ? 'patch-reverted' : 'patch-notice');
  const title = document.createElement('strong');
  title.textContent = text;
  node.replaceChildren(title);
  if (notes) {
    const detail = document.createElement('span');
    detail.textContent = notes;
    node.append(detail);
  }
  node.classList.toggle('reverted', reverted);
  node.hidden = false;
  if (reverted) revertUntil = performance.now() + 8000;
  else noticeUntil = performance.now() + 6000;
}
const params = new URLSearchParams(location.search);
const seconds = Number(params.get('patchLifetime') ?? 120);
const manager = await PatchManager.create(
  {
    applied(patch, version) {
      effects.rewrite(patch.name);
      pendingNotice = {
        patchId: patch.patchId,
        text: `PATCH NOTES ${version}: ${patch.name} by ${patch.author}`,
        notes: patch.patchNotes,
      };

      connection?.send({ v: 1, type: 'patchApplied', patchId: patch.patchId, version });
    },
    reverted(patchId, reason) {
      if (pendingNotice?.patchId === patchId) pendingNotice = undefined;
      effects.rewrite(reason, true);
      notice(`PATCH REVERTED: ${reason}`, true);
      connection?.send({ v: 1, type: 'patchReverted', patchId, reason });
    },
  },
  {
    lifetimeMs:
      (Number.isFinite(seconds) && seconds >= 1 && seconds <= 3600 ? seconds : 120) * 1000,
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
    composeHosts(manager.host, {
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
let bot = options.bot;

function toggleBot(): void {
  bot = !bot;
  updateBot();
  world.applyCommands([
    {
      type: 'toast',
      text: bot ? 'Autopilot online. Sit back and watch.' : 'Autopilot off. The arena is yours.',
    },
  ]);
}

function updateBot(): void {
  botButton.setAttribute('aria-pressed', String(bot));
  botLabel.textContent = bot ? 'On · Bot has the controls' : "Off · You're in control";
}

async function restart(): Promise<void> {
  if (restarting) return;
  restarting = true;
  controls.reset();
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
  manager.dispose();
  connection?.close();
  clearInterval(telemetryTimer);
});
document.addEventListener('visibilitychange', () => {
  lastFrame = undefined;
  accumulator = 0;
});
resize();

function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function updateHUD(): void {
  if (pendingNotice && !effects.rewriting) {
    notice(pendingNotice.text, false, pendingNotice.notes);
    pendingNotice = undefined;
  }
  hp.textContent = `${Math.ceil(current.player.hp)} / ${current.player.maxHp}`;
  hpMeter.setAttribute('aria-valuemax', String(current.player.maxHp));
  hpMeter.setAttribute('aria-valuenow', String(current.player.hp));
  hpFill.style.width = `${(current.player.hp / current.player.maxHp) * 100}%`;
  hpFill.style.backgroundColor =
    current.player.hp <= current.player.maxHp * 0.3 ? '#ff617a' : '#48eaff';
  wave.textContent = String(Math.max(1, current.wave)).padStart(2, '0');
  score.textContent = String(current.score).padStart(4, '0');
  time.textContent = clock(current.time);
  element('version').textContent = manager.version;
  const active = manager.active;
  element('patch-count').textContent = `${active.length} / 3`;
  const signature = JSON.stringify(active);
  const list = element('active-patches');
  if (list.dataset.signature !== signature) {
    list.dataset.signature = signature;
    list.replaceChildren();
    if (!active.length) {
      const p = document.createElement('p');
      p.textContent = 'No active patches. The base rules are in play.';
      list.append(p);
    }
    for (const patch of active) {
      const row = document.createElement('div');
      row.className = 'active-patch';
      row.dataset.patchId = patch.patchId;
      const name = document.createElement('strong');
      name.textContent = patch.name;
      const author = document.createElement('span');
      author.textContent = `by ${patch.author}`;
      const countdown = document.createElement('small');
      countdown.textContent = `${patch.remainingSeconds}s remaining`;
      row.append(name, author, countdown);
      list.append(row);
    }
  }
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
  const elapsed =
    lastFrame === undefined ? 0 : Math.min(MAX_FRAME_SECONDS, (now - lastFrame) / 1000);
  if (lastFrame !== undefined) perf?.frame(now - lastFrame);
  if (lastFrame !== undefined) frameSamples.push(now - lastFrame);
  lastFrame = now;
  const plan = planFrame(accumulator, elapsed);
  accumulator = plan.accumulator;
  manager.update();
  for (let i = 0; i < plan.ticks; i++) {
    if (current.gameOver) break;
    previous = current;
    world.tick(bot ? botIntent(current) : controls.intent(current.arena));
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
  const intent = bot ? botIntent(current) : controls.intent(current.arena);
  const visible = current.gameOver ? current : interpolateSnapshots(previous, current, plan.alpha);
  render(ctx, visible, effects, { x: intent.aimX, y: intent.aimY }, options.obs, visualTime);
  updateHUD();
  perf?.update(now, current.entities.length, manager.active.length);
  requestAnimationFrame(frame);
}
const frameSamples = new RollingSamples(60),
  tickSamples = new RollingSamples(180);
async function receive(message: ServerMessage): Promise<void> {
  if (message.type === 'hello') {
    const desired = new Set(message.patches.map((p) => p.patchId));
    for (const patch of manager.active)
      if (patch.patchId !== 'local-demo' && !desired.has(patch.patchId))
        manager.revert(patch.patchId, 'server reset');
    for (const patch of message.patches) {
      const reason = manager.removedReason(patch.patchId);
      if (reason) connection?.send({ v: 1, type: 'patchReverted', patchId: patch.patchId, reason });
      else await manager.apply(patch);
    }
  } else if (message.type === 'applyPatch') {
    const reason = manager.removedReason(message.patchId);
    if (reason) connection?.send({ v: 1, type: 'patchReverted', patchId: message.patchId, reason });
    else await manager.apply(message);
  } else if (message.type === 'revertPatch') manager.revert(message.patchId, message.reason);
}
const server = params.get('server') ?? 'ws://localhost:8787';
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
