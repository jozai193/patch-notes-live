import { botIntent, composeHosts, World } from '@patch-notes-live/engine';
import { SandboxHost, SPLIT_ON_HIT } from '@patch-notes-live/mod-api';
import { Controls } from './controls.js';
import { Effects, Feedback } from './effects.js';
import { interpolateSnapshots, MAX_FRAME_SECONDS, planFrame } from './loop.js';
import { render } from './renderer.js';
import { PerfReadout } from './perf.js';
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
let sandbox: SandboxHost | undefined;
const createSandbox = async () => {
  sandbox?.dispose();
  sandbox = options.mod ? await SandboxHost.create([SPLIT_ON_HIT]) : undefined;
};
await createSandbox();
if (options.mod) {
  element('patch-count').textContent = '1 / 3';
  element('patch-title').textContent = 'Split on hit';
  element('patch-description').textContent = 'Enemies break into two smaller enemies when shot.';
  element('patch-mark').textContent = '[ ×2 ]';
}
const createWorld = () =>
  new World(
    options.seed,
    composeHosts(sandbox ?? {}, {
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
  if (!current.gameOver) return;
  if (restarting) return;
  restarting = true;
  controls.reset();
  effects = new Effects();
  feedback.clear();
  perf?.reset();
  await createSandbox();
  world = createWorld();
  previous = current = world.snapshot();
  accumulator = 0;
  lastFrame = undefined;
  gameOver.hidden = true;
  canvas.focus({ preventScroll: true });
  restarting = false;
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
window.addEventListener('pagehide', () => sandbox?.dispose());
document.addEventListener('visibilitychange', () => {
  lastFrame = undefined;
  accumulator = 0;
});
resize();

function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function updateHUD(): void {
  hp.textContent = `${Math.ceil(current.player.hp)} / ${current.player.maxHp}`;
  hpMeter.setAttribute('aria-valuemax', String(current.player.maxHp));
  hpMeter.setAttribute('aria-valuenow', String(current.player.hp));
  hpFill.style.width = `${(current.player.hp / current.player.maxHp) * 100}%`;
  hpFill.style.backgroundColor =
    current.player.hp <= current.player.maxHp * 0.3 ? '#ff886c' : '#85ead0';
  wave.textContent = String(Math.max(1, current.wave)).padStart(2, '0');
  score.textContent = String(current.score).padStart(4, '0');
  time.textContent = clock(current.time);
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
  lastFrame = now;
  const plan = planFrame(accumulator, elapsed);
  accumulator = plan.accumulator;
  for (let i = 0; i < plan.ticks; i++) {
    if (current.gameOver) break;
    previous = current;
    world.tick(bot ? botIntent(current) : controls.intent(current.arena));
    current = world.snapshot();
    perf?.tick(
      sandbox?.mods.reduce((sum, m) => sum + (m.tick === current.tick ? m.timeThisTickMs : 0), 0) ??
        0,
    );
    effects.observe(previous, current);
  }
  feedback.accept(world.drainEvents());
  feedback.update(elapsed);
  effects.update(elapsed);
  visualTime += elapsed;
  const intent = bot ? botIntent(current) : controls.intent(current.arena);
  const visible = current.gameOver ? current : interpolateSnapshots(previous, current, plan.alpha);
  render(ctx, visible, effects, { x: intent.aimX, y: intent.aimY }, options.obs, visualTime);
  updateHUD();
  perf?.update(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
