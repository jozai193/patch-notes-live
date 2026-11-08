import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import WebSocket from 'ws';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Real Chromium DOM tests using the already-allowlisted ws package, no browser-test dependency. */
export class BrowserDOM {
  private nextId = 0;
  private navigation = 0;
  private readonly pending = new Map<
    number,
    { resolve: (result: Record<string, unknown>) => void; reject: (error: Error) => void }
  >();
  private constructor(
    private readonly socket: WebSocket,
    private readonly process: ChildProcess,
    private readonly profile: string,
  ) {
    socket.on('message', (data) => {
      const response = JSON.parse(data.toString()) as {
        id?: number;
        result?: Record<string, unknown>;
        error?: { message: string };
      };
      if (response.id === undefined) return;
      const request = this.pending.get(response.id);
      this.pending.delete(response.id);
      if (response.error) request?.reject(Error(response.error.message));
      else request?.resolve(response.result ?? {});
    });
  }
  static async launch(): Promise<BrowserDOM> {
    const candidates = [
      process.env.BROWSER_PATH,
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ];
    const executable = candidates.find((path) => path && existsSync(path));
    if (!executable)
      throw Error('DOM regressions require Chrome/Chromium. Set BROWSER_PATH to its executable.');
    const profile = await mkdtemp(join(tmpdir(), 'patch-notes-dom-'));
    const child = spawn(
      executable,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { windowsHide: true, stdio: 'ignore' },
    );
    let port = '';
    for (let i = 0; i < 200; i++) {
      try {
        port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]!;
        break;
      } catch {
        await delay(50);
      }
    }
    if (!port) {
      child.kill();
      throw Error('Chromium did not start its local DOM-test debugger.');
    }
    const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
      type: string;
      webSocketDebuggerUrl: string;
    }[];
    const socket = new WebSocket(targets.find((t) => t.type === 'page')!.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    const browser = new BrowserDOM(socket, child, profile);
    await browser.call('Page.enable');
    await browser.call('Runtime.enable');
    await browser.call('Emulation.setFocusEmulationEnabled', { enabled: true });
    await browser.call('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await browser.call('Page.addScriptToEvaluateOnNewDocument', {
      source: "localStorage.removeItem('patch-notes-live:onboarded');",
    });
    return browser;
  }
  call(method: string, params: object = {}): Promise<Record<string, unknown>> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate<T>(expression: string): Promise<T> {
    const output = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (output.exceptionDetails) throw Error(JSON.stringify(output.exceptionDetails));
    return (output.result as { value: T }).value;
  }
  async wait(expression: string, timeout = 10000): Promise<void> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await this.evaluate<boolean>(expression)) return;
      await delay(50);
    }
    throw Error(`DOM condition timed out: ${expression}`);
  }
  async go(url: string): Promise<void> {
    const destination = `${url}&domTest=${++this.navigation}`;
    await this.call('Page.navigate', { url: destination });
    await this.call('Page.bringToFront');
    await this.wait(
      `location.href === ${JSON.stringify(destination)} && document.readyState === 'complete' && document.getElementById('game')?.dataset.tick !== undefined`,
    );
  }
  async close(): Promise<void> {
    await this.call('Browser.close').catch(() => {});
    this.socket.close();
    if (this.process.exitCode === null)
      await Promise.race([
        new Promise((resolve) => this.process.once('exit', resolve)),
        delay(3000),
      ]);
    if (this.process.exitCode === null) this.process.kill();
    const parent = resolve(tmpdir());
    if (dirname(this.profile) !== parent || !basename(this.profile).startsWith('patch-notes-dom-'))
      throw Error('Unsafe browser-test cleanup path');
    await rm(this.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
