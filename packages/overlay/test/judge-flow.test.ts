import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { parseClientMessage } from '@patch-notes-live/mod-api/protocol';
import { BrowserDOM } from './browser-dom.js';
let browser: BrowserDOM, server: ViteDevServer, base: string;
let hub: WebSocketServer, hubURL: string;
const observeTransition = `globalThis.transitionResult=new Promise(resolve=>{
  const root=document.documentElement,landing=document.getElementById('landing');
  let started,animation;
  const observer=new MutationObserver(()=>{
    if(started===undefined&&root.classList.contains('entering-game')){
      started=performance.now();
      const effect=landing.getAnimations()[0]?.effect;
      animation={duration:effect?.getTiming().duration,wipe:effect?.getKeyframes().some(f=>f.clipPath!==undefined)};
    }
    if(started!==undefined&&landing.hidden){observer.disconnect();resolve({elapsed:performance.now()-started,...animation});}
  });observer.observe(root,{attributes:true,subtree:true});
});true`;
beforeAll(async () => {
  server = await createServer({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
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
it('runs real archive patches in attract mode but leaves the playable world at tick zero until Enter', async () => {
  await browser.go(base + '?server=off&bot=1');
  await browser.wait("Number(document.getElementById('attract-game').dataset.tick)>10");
  await browser.wait("Number(document.getElementById('attract-game').dataset.patches)>=2", 12000);
  expect(await browser.evaluate("document.getElementById('game').dataset.tick")).toBe('0');
  expect(await browser.evaluate("document.getElementById('stage').hidden")).toBe(true);
  await browser.evaluate(observeTransition);
  await browser.call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  await browser.call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  await browser.wait("Number(document.getElementById('game').dataset.tick)>0");
  const transition = await browser.evaluate<{ elapsed: number; duration: number; wipe: boolean }>(
    'globalThis.transitionResult',
  );
  expect(transition.duration).toBe(360);
  expect(transition.wipe).toBe(true);
  expect(transition.elapsed).toBeGreaterThanOrEqual(300);
  expect(transition.elapsed).toBeLessThanOrEqual(450);
  expect(await browser.evaluate("document.getElementById('landing').hidden")).toBe(true);
  expect(await browser.evaluate("document.getElementById('patch-count').textContent")).toBe(
    '0 / 3',
  );
}, 18000);
it('fits a 390px phone and presents a static diff under reduced motion', async () => {
  await browser.call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await browser.call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  try {
    await browser.go(base + '?server=off');
    await browser.wait("document.getElementById('hero-headline').dataset.phase==='diff'");
    expect(
      await browser.evaluate<boolean>('document.documentElement.scrollWidth<=innerWidth'),
    ).toBe(true);
    expect(await browser.evaluate("document.querySelectorAll('#hero-lines del').length")).toBe(1);
    expect(await browser.evaluate("document.querySelectorAll('#hero-lines ins').length")).toBe(1);
    expect(
      await browser.evaluate(
        "getComputedStyle(document.getElementById('notes-ticker-track')).animationName",
      ),
    ).toBe('none');
    const gutters = await browser.evaluate<number[]>(
      "Array.from(document.querySelectorAll('.hero-gutter')).map(e=>{const r=e.getBoundingClientRect();return r.x+r.width/2})",
    );
    expect(Math.abs(gutters[0]! - gutters[1]!)).toBeLessThan(0.5);
    await browser.evaluate(observeTransition);
    await browser.evaluate("document.getElementById('play').click()");
    await browser.wait("Number(document.getElementById('game').dataset.tick)>0");
    const transition = await browser.evaluate<{ elapsed: number; duration: number; wipe: boolean }>(
      'globalThis.transitionResult',
    );
    expect(transition.duration).toBe(240);
    expect(transition.wipe).toBe(false);
    expect(transition.elapsed).toBeGreaterThanOrEqual(180);
    expect(transition.elapsed).toBeLessThanOrEqual(450);
  } finally {
    await browser.call('Emulation.setEmulatedMedia', { features: [] });
    await browser.call('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
}, 10000);
it('bypasses landing in OBS with transparent backgrounds and honors intentional mod colors', async () => {
  await browser.go(base + '?server=off&obs=1&bot=1');
  await browser.wait("Number(document.getElementById('game').dataset.tick)>0");
  expect(await browser.evaluate("document.getElementById('landing').hidden")).toBe(true);
  expect(
    await browser.evaluate("getComputedStyle(document.getElementById('stage')).backgroundColor"),
  ).toBe('rgba(0, 0, 0, 0)');
  expect(
    await browser.evaluate(
      "document.getElementById('game').getContext('2d').getImageData(0,0,1,1).data[3]",
    ),
  ).toBe(0);
  const colors = await browser.evaluate<{
    base: string;
    overridden: string;
    danger: string;
    ai: string;
  }>(
    `(async()=>{const {entityColor,theme}=await import('/src/tokens.ts');const t=theme();return {base:entityColor({kind:'enemy',color:t['engine-enemy']}),overridden:entityColor({kind:'enemy',color:t.ai}),danger:t.danger,ai:t.ai};})()`,
  );
  expect(colors.base).toBe(colors.danger);
  expect(colors.overridden).toBe(colors.ai);
}, 10000);
it('pauses actual game ticks and HP while onboarding is visible, with no catch-up on dismissal', async () => {
  await browser.go(base + '?play=1&server=off');
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
  await browser.go(base + '?play=1&server=off');
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
  await browser.go(base + '?play=1&server=off');
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
  expect(view).toEqual({ title: 'No match in archive', progress: 0, phases: 0, chips: 3 });
  await browser.evaluate("document.querySelector('.archive-suggestion').click()");
  await browser.wait("document.getElementById('patch-count').textContent==='1 / 3'");
  await browser.evaluate(
    "document.getElementById('rule-input').value='turn my keyboard into a submarine';document.getElementById('rule-form').requestSubmit()",
  );
  await browser.wait("document.getElementById('compile-panel').dataset.state==='no-match'");
  await browser.wait("document.getElementById('compile-panel').hidden", 8000);
}, 15000);
it('pages whole archive chips in two rows and makes every uniquely named entry reachable', async () => {
  await browser.go(base + '?play=1&server=off');
  const choices = await browser.evaluate<{ seen: string[]; total: number }>(`(async()=>{
    await document.fonts.ready;
    const seen=new Set(),total=document.querySelectorAll('.archive-item').length;
    for(let i=0;i<total&&seen.size<total;i++){
      for(const button of document.querySelectorAll('.archive-item:not([hidden])'))seen.add(button.textContent);
      document.getElementById('archive-more').click();
    }
    return {seen:[...seen],total};
  })()`);
  expect(choices.seen).toHaveLength(choices.total);
  expect(choices.seen).toContain('Split and replace');
  expect(choices.seen.filter((name) => name === 'Split on hit')).toHaveLength(1);
});
it('keeps the patch card below a simultaneous wave banner and dismisses applied archive feedback in two seconds', async () => {
  await browser.go(base + '?play=1&server=off&bot=1');
  await browser.evaluate(`(()=>{
    globalThis.waveCardChecks=[];
    const fill=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){
      fill.call(this,text,x,y,...rest);
      const card=document.getElementById('patch-notice');
      if(this.canvas.id!=='game'||!String(text).startsWith('Wave ')||card.hidden)return;
      const m=this.measureText(text),t=this.getTransform(),r=this.canvas.getBoundingClientRect(),scale=r.width/this.canvas.width,b=card.getBoundingClientRect();
      const top=r.top+((y-m.actualBoundingBoxAscent)*t.d+t.f)*scale,bottom=r.top+((y+m.actualBoundingBoxDescent)*t.d+t.f)*scale;
      globalThis.waveCardChecks.push({top,bottom,cardTop:b.top,cardBottom:b.bottom});
    };
    globalThis.archiveAppliedAt=undefined;globalThis.archiveHiddenAt=undefined;
    const panel=document.getElementById('compile-panel');
    const observer=new MutationObserver(()=>{
      if(document.getElementById('compile-time').textContent==='Applied')globalThis.archiveAppliedAt??=performance.now();
      if(globalThis.archiveAppliedAt!==undefined&&panel.hidden){globalThis.archiveHiddenAt=performance.now();observer.disconnect();}
    });observer.observe(panel,{attributes:true,childList:true,subtree:true,characterData:true});
    document.getElementById('first-run-dismiss').click();document.querySelector('.archive-item').click();
  })()`);
  await browser.wait(
    "document.querySelector('#patch-notice strong')?.textContent.startsWith('v1.1')",
  );
  expect(
    await browser.evaluate("document.querySelector('#patch-notice .your-author').textContent"),
  ).toBe('by you');
  expect(await browser.evaluate("document.querySelector('.patch-entry small').textContent")).toBe(
    'by you · archive',
  );
  await browser.wait('globalThis.archiveHiddenAt!==undefined', 3500);
  const measurements = await browser.evaluate<{
    elapsed: number;
    checks: { top: number; bottom: number; cardTop: number; cardBottom: number }[];
  }>(
    `({elapsed:globalThis.archiveHiddenAt-globalThis.archiveAppliedAt,checks:globalThis.waveCardChecks})`,
  );
  expect(measurements.elapsed).toBeGreaterThanOrEqual(1800);
  expect(measurements.elapsed).toBeLessThanOrEqual(2600);
  expect(measurements.checks.length).toBeGreaterThan(0);
  for (const box of measurements.checks)
    expect(box.cardTop >= box.bottom || box.cardBottom <= box.top).toBe(true);
  // A fourth apply expires the oldest patch. Its revert banner owns the slot first.
  for (const [name, count] of [
    ['Gravity flip every 10s', '2 / 3'],
    ['Enemies tiny and fast', '3 / 3'],
    ['Heal on kill', '3 / 3'],
  ]) {
    await browser.evaluate(
      `Array.from(document.querySelectorAll('.archive-item')).find(e=>e.textContent===${JSON.stringify(name)}).click()`,
    );
    await browser.wait(
      `document.getElementById('patch-count').textContent===${JSON.stringify(count)}`,
    );
  }
  await browser.wait("!document.getElementById('patch-reverted').hidden");
  await browser.evaluate('new Promise(resolve=>setTimeout(resolve,1000))');
  expect(await browser.evaluate("document.getElementById('patch-notice').hidden")).toBe(true);
  expect(await browser.evaluate("document.getElementById('patch-count').textContent")).toBe(
    '3 / 3',
  );
}, 10000);
it.each([
  { width: 1280, height: 720, state: 'no-match' },
  { width: 1024, height: 768, state: 'no-match' },
  { width: 800, height: 600, state: 'no-match' },
  { width: 1280, height: 720, state: 'compile' },
  { width: 1024, height: 768, state: 'compile' },
  { width: 800, height: 600, state: 'compile' },
])(
  'fits all $state content at $width × $height without scrolling or overlaps',
  async ({ width, height, state }) => {
    await browser.call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await browser.go(base + `?play=1&bot=1&server=${state === 'compile' ? hubURL : 'off'}`);
    if (state === 'compile')
      await browser.wait(
        "document.getElementById('rule-mode').textContent.startsWith('Live Codex')",
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
      composer: { x: number; y: number; width: number; height: number };
      disclosure: { x: number; y: number; width: number; height: number };
      footer: { x: number; y: number; width: number; height: number };
      choices: { x: number; y: number; width: number; height: number }[];
      choiceBounds: { x: number; y: number; width: number; height: number };
    }>(
      `(()=>{
      const panel=document.getElementById('compile-panel'),gameOver=document.getElementById('game-over'),banner=document.getElementById('patch-reverted'),applyBanner=document.getElementById('patch-notice'),request=document.getElementById('compile-request');
      const box=id=>document.getElementById(id).getBoundingClientRect().toJSON();
      const content={panel:panel.getBoundingClientRect().toJSON(),clientHeight:panel.clientHeight,scrollHeight:panel.scrollHeight,clientWidth:panel.clientWidth,scrollWidth:panel.scrollWidth,requestClientHeight:request.clientHeight,requestScrollHeight:request.scrollHeight,chips:document.querySelectorAll('.archive-suggestion').length,phases:document.getElementById('compile-steps').getClientRects().length,progress:document.getElementById('compile-progress').getClientRects().length,composer:document.querySelector('.composer').getBoundingClientRect().toJSON(),disclosure:box('demo-badge'),footer:document.querySelector('.game-footer').getBoundingClientRect().toJSON(),choices:Array.from(document.querySelectorAll('.archive-item:not([hidden])')).map(e=>e.getBoundingClientRect().toJSON()),choiceBounds:box('archive-list')};
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
    expect(overlap(bounds.composer, bounds.footer)).toBe(false);
    expect(overlap(bounds.disclosure, bounds.footer)).toBe(false);
    expect(bounds.footer.y + bounds.footer.height).toBeLessThanOrEqual(height);
    expect(new Set(bounds.choices.map((choice) => choice.y)).size).toBeLessThanOrEqual(2);
    expect(bounds.choices.length).toBeGreaterThan(0);
    for (const choice of bounds.choices) {
      expect(choice.x).toBeGreaterThanOrEqual(bounds.choiceBounds.x - 0.1);
      expect(choice.x + choice.width).toBeLessThanOrEqual(
        bounds.choiceBounds.x + bounds.choiceBounds.width + 0.1,
      );
      expect(choice.y + choice.height).toBeLessThanOrEqual(
        bounds.choiceBounds.y + bounds.choiceBounds.height + 0.1,
      );
    }
  },
  10000,
);
