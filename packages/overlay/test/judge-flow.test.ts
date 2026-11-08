import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { parseClientMessage } from '@patch-notes-live/mod-api/protocol';
import { BrowserDOM } from './browser-dom.js';
let browser: BrowserDOM, server: ViteDevServer, base: string;
let hub: WebSocketServer, hubURL: string;
beforeAll(async () => {
  server = await createServer({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  base = server.resolvedUrls!.local[0]!;
  // Only a protocol fixture: layout tests never start Codex or the patch pipeline.
  hub = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve) => hub.once('listening', resolve));
  const address = hub.address();
  if (!address || typeof address === 'string') throw Error('Missing test hub port');
  hubURL = `ws://127.0.0.1:${address.port}`;
  hub.on('connection', (socket) => {
    socket.on('message', (raw) => {
      const message = parseClientMessage(raw.toString());
      if (message?.type === 'hello')
        socket.send(JSON.stringify({ v: 1, type: 'hello', patches: [] }));
      if (message?.type === 'requestPatch')
        socket.send(
          JSON.stringify({
            v: 1,
            type: 'compileEvent',
            requestId: message.requestId,
            phase: 'testing',
            text: 'Independently verifying the rule across three seeds before applying the patch.',
            elapsedMs: 42000,
            request: message.text,
            author: message.author,
          }),
        );
    });
  });
  browser = await BrowserDOM.launch();
}, 20000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve, reject) => {
    hub?.clients.forEach((socket) => socket.terminate());
    hub?.close((error) => (error ? reject(error) : resolve()));
  });
  await server?.close();
}, 15000);
it('pauses actual game ticks and HP while onboarding is visible, with no catch-up on dismissal', async () => {
  await browser.go(base + '?server=off');
  await browser.wait("document.getElementById('game').dataset.paused==='true'");
  const ticks = await browser.evaluate<string>("document.getElementById('game').dataset.tick");
  await browser.evaluate('new Promise(r=>setTimeout(r,1200))');
  expect(await browser.evaluate("document.getElementById('game').dataset.tick")).toBe(ticks);
  expect(await browser.evaluate("document.getElementById('hp').textContent")).toBe('100 / 100');
  await browser.evaluate("document.getElementById('first-run-dismiss').click()");
  await browser.wait("Number(document.getElementById('game').dataset.tick)>0");
  expect(
    await browser.evaluate<number>("Number(document.getElementById('game').dataset.tick)"),
  ).toBeLessThan(30);
}, 10000);
it('focus drives the actual ship for 15s, transfers between fields, and blur restores manual control', async () => {
  await browser.go(base + '?server=off');
  await browser.evaluate(
    "document.getElementById('first-run-dismiss').click();document.getElementById('rule-input').focus()",
  );
  await browser.wait("document.getElementById('game').dataset.autopilot==='true'");
  expect(await browser.evaluate("document.getElementById('typing-assist').hidden")).toBe(false);
  await browser.evaluate('new Promise(r=>setTimeout(r,15000))');
  expect(await browser.evaluate("document.getElementById('game-over').hidden")).toBe(true);
  expect(
    await browser.evaluate<number>("Number(document.getElementById('game').dataset.tick)"),
  ).toBeGreaterThanOrEqual(850);
  await browser.evaluate("document.getElementById('rule-author').focus()");
  await browser.wait("document.getElementById('game').dataset.autopilot==='true'");
  await browser.evaluate("document.getElementById('game').focus()");
  await browser.wait("document.getElementById('game').dataset.autopilot==='false'");
  await browser.evaluate(
    "document.getElementById('bot-toggle').click();document.getElementById('rule-input').focus();document.getElementById('game').focus()",
  );
  await browser.wait("document.getElementById('game').dataset.autopilot==='true'");
}, 25000);
it('renders a distinct no-match state with clickable suggestions and dismisses it after six seconds', async () => {
  await browser.go(base + '?server=off');
  await browser.evaluate(
    "document.getElementById('first-run-dismiss').click();document.getElementById('rule-input').value='turn my keyboard into a submarine';document.getElementById('rule-form').requestSubmit()",
  );
  await browser.wait("document.getElementById('compile-panel').dataset.state==='no-match'");
  const view = await browser.evaluate<{
    title: string;
    progress: number;
    phases: number;
    chips: number;
  }>(
    `({title:document.querySelector('#compile-panel h2').textContent,progress:document.getElementById('compile-progress').getClientRects().length,phases:document.getElementById('compile-steps').getClientRects().length,chips:document.querySelectorAll('.archive-suggestion').length})`,
  );
  expect(view).toEqual({ title: 'NO MATCH IN ARCHIVE', progress: 0, phases: 0, chips: 3 });
  await browser.evaluate("document.querySelector('.archive-suggestion').click()");
  await browser.wait("document.getElementById('patch-count').textContent==='1 / 3'");
  await browser.evaluate(
    "document.getElementById('rule-input').value='turn my keyboard into a submarine';document.getElementById('rule-form').requestSubmit()",
  );
  await browser.wait("document.getElementById('compile-panel').dataset.state==='no-match'");
  await browser.wait("document.getElementById('compile-panel').hidden", 8000);
}, 15000);
it.each([
  { width: 1280, height: 720, state: 'no-match' },
  { width: 1024, height: 768, state: 'no-match' },
  { width: 1280, height: 720, state: 'compile' },
  { width: 1024, height: 768, state: 'compile' },
])(
  'fits all $state content at $width × $height without scrolling or overlaps',
  async ({ width, height, state }) => {
    await browser.call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await browser.go(base + `?bot=1&server=${state === 'compile' ? hubURL : 'off'}`);
    if (state === 'compile')
      await browser.wait(
        "document.getElementById('rule-mode').textContent.startsWith('LIVE CODEX')",
      );
    const request =
      state === 'no-match'
        ? 'submarine keyboard'
        : 'Make enemies change color and split into tiny triangles when hit, with bright trails and dramatic bursts. Keep the effect visible immediately and the arena survivable while the player types the next rule.'.slice(
            0,
            200,
          );
    await browser.evaluate(
      `document.getElementById('first-run-dismiss').click();document.getElementById('rule-input').value=${JSON.stringify(request)};document.getElementById('rule-author').value='Judge';document.getElementById('rule-form').requestSubmit()`,
    );
    await browser.wait("document.querySelector('.sidebar').classList.contains('has-feedback')");
    if (state === 'compile')
      await browser.wait(
        "document.querySelector('#compile-steps .current')?.textContent==='testing'",
      );
    const bounds = await browser.evaluate<{
      panel: { x: number; y: number; width: number; height: number };
      arena: { x: number; y: number; width: number; height: number };
      hiddenDuringGameOver: boolean;
      restart: { x: number; y: number; width: number; height: number };
      banner: { x: number; y: number; width: number; height: number };
      applyBanner: { x: number; y: number; width: number; height: number };
      clientHeight: number;
      scrollHeight: number;
      clientWidth: number;
      scrollWidth: number;
      requestClientHeight: number;
      requestScrollHeight: number;
      chips: number;
      phases: number;
      progress: number;
    }>(
      `(()=>{
      const panel=document.getElementById('compile-panel'),gameOver=document.getElementById('game-over'),banner=document.getElementById('patch-reverted'),applyBanner=document.getElementById('patch-notice'),request=document.getElementById('compile-request');
      const content={panel:panel.getBoundingClientRect().toJSON(),clientHeight:panel.clientHeight,scrollHeight:panel.scrollHeight,clientWidth:panel.clientWidth,scrollWidth:panel.scrollWidth,requestClientHeight:request.clientHeight,requestScrollHeight:request.scrollHeight,chips:document.querySelectorAll('.archive-suggestion').length,phases:document.getElementById('compile-steps').getClientRects().length,progress:document.getElementById('compile-progress').getClientRects().length};
      gameOver.hidden=false;banner.hidden=false;applyBanner.hidden=false;
      return {...content,arena:gameOver.getBoundingClientRect().toJSON(),hiddenDuringGameOver:panel.getClientRects().length===0,restart:document.getElementById('restart').getBoundingClientRect().toJSON(),banner:banner.getBoundingClientRect().toJSON(),applyBanner:applyBanner.getBoundingClientRect().toJSON()};
    })()`,
    );
    const overlap = (a: typeof bounds.panel, b: typeof bounds.panel) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    expect(bounds.panel.width).toBeGreaterThan(0);
    expect(bounds.arena.width).toBeGreaterThan(0);
    expect(bounds.restart.width).toBeGreaterThan(0);
    expect(bounds.scrollHeight).toBeLessThanOrEqual(bounds.clientHeight);
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth);
    expect(bounds.requestScrollHeight).toBeLessThanOrEqual(bounds.requestClientHeight);
    expect(bounds.chips).toBe(state === 'no-match' ? 3 : 0);
    expect(bounds.phases).toBe(state === 'compile' ? 1 : 0);
    expect(bounds.progress).toBe(state === 'compile' ? 1 : 0);
    expect(bounds.panel.y).toBeGreaterThanOrEqual(0);
    expect(bounds.panel.y + bounds.panel.height).toBeLessThanOrEqual(height);
    expect(bounds.panel.x + bounds.panel.width).toBeLessThanOrEqual(width);
    expect(overlap(bounds.panel, bounds.arena)).toBe(false);
    expect(overlap(bounds.panel, bounds.restart)).toBe(false);
    expect(overlap(bounds.panel, bounds.banner)).toBe(false);
    expect(overlap(bounds.panel, bounds.applyBanner)).toBe(false);
    expect(bounds.hiddenDuringGameOver).toBe(true);
  },
  10000,
);
