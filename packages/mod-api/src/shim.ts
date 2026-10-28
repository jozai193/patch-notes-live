/** Trusted JS executed only inside QuickJS. Mod code is never evaluated in the host. */
export const SHIM = String.raw`
(() => {
  const rand = globalThis.__rand, list = globalThis.__list, log = globalThis.__log;
  delete globalThis.__rand; delete globalThis.__list; delete globalThis.__log;
  const parse = JSON.parse, stringify = JSON.stringify;
  const keys = Object.keys;
  const descriptor = Object.getOwnPropertyDescriptor;
  const prototype = Object.getPrototypeOf;
  const create = Object.create;
  const message = error => {
    if (typeof error === 'string') return error.slice(0,512);
    try {
      const own = descriptor(error, 'message');
      if (own && typeof own.value === 'string') return own.value.slice(0,512);
    } catch {}
    return 'Mod threw a non-string error';
  };
  const safe = fn => (...args) => {
    try { return fn(...args); }
    catch (error) {
      const result = create(null);
      result.ok = false;
      result.message = message(error);
      // Only own data descriptors are transported; getters and toJSON are never invoked.
      try {
        const ownStack = descriptor(error, 'stack');
        if (ownStack && typeof ownStack.value === 'string') result.stack = ownStack.value.slice(0,4096);
        const ownName = descriptor(error,'name');
        const parentName = descriptor(prototype(error),'name');
        const name = ownName?.value ?? parentName?.value;
        if (typeof name === 'string') result.errorName = name.slice(0,80);
      } catch {}
      return stringify(result);
    }
  };
  const clone = value => parse(stringify(value));
  const mutable = ['x','y','vx','vy','radius','hp','maxHp','speed','color','tags'];
  const hookNames = ['onStart','onTick','onHit','onSpawn','onKill'];
  let hooks, state = Object.create(null), gameTime = 0, nextId = -1;
  const spawned = new Map();
  Object.defineProperty(Math, 'random', { value: () => rand(), writable: false, configurable: false });
  const RealDate = Date;
  function GameDate(...args) {
    if (!new.target) return new RealDate(gameTime * 1000).toString();
    return new RealDate(...(args.length ? args : [gameTime * 1000]));
  }
  GameDate.prototype = RealDate.prototype;
  Object.defineProperty(RealDate.prototype, 'constructor', { value: GameDate });
  GameDate.now = () => gameTime * 1000;
  GameDate.parse = RealDate.parse; GameDate.UTC = RealDate.UTC;
  Object.defineProperty(globalThis, 'Date', { value: Object.freeze(GameDate), writable: false, configurable: false });
  const logger = (...args) => log(args.map(a => String(a).slice(0, 200)).join(' ').slice(0, 512));
  Object.defineProperty(globalThis, 'console', { value: Object.freeze({ log: logger, warn: logger, error: logger }), writable: false });
  for (const key of ['fetch','require','process','setTimeout','setInterval','WebAssembly'])
    Object.defineProperty(globalThis,key,{value:undefined,writable:false,configurable:false});
  // Freeze only after deterministic random/time and the log facade are installed.
  for (const intrinsic of [Object,Array,Function,String,Number,Boolean,Map,Set,WeakMap,WeakSet,RegExp,
      Error,TypeError,RangeError,SyntaxError,ReferenceError,Promise,Date]) {
    if (intrinsic.prototype) Object.freeze(intrinsic.prototype);
    Object.freeze(intrinsic);
  }
  for (const intrinsic of [JSON,Math,Reflect]) Object.freeze(intrinsic);
  return {
    install: safe(namespace => {
      const mod = namespace.default;
      const name = mod && descriptor(mod,'name')?.value;
      const description = mod && descriptor(mod,'description')?.value;
      const supplied = mod && descriptor(mod,'hooks')?.value;
      if (typeof name !== 'string' || !name.length || name.length > 80 || typeof description !== 'string' ||
          description.length > 256 || !supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw Error('Invalid mod export');
      hooks = create(null);
      for (const key of keys(supplied)) {
        const value = descriptor(supplied,key)?.value;
        if (!hookNames.includes(key) || typeof value !== 'function') throw Error('Invalid hook: ' + key);
        hooks[key] = value;
      }
      return stringify({ name, description, hooks: keys(hooks) });
    }),
    call: safe(text => {
      const payload = parse(text);
      gameTime = payload.time;
      for (const [temporary, real] of payload.ids) {
        const e = spawned.get(temporary);
        if (e) { e.id = real; spawned.delete(temporary); }
      }
      const commands = [], tracked = new Map(), identities = new Map();
      let spawnCount = 0;
      const push = command => { if (commands.length >= 1000) throw Error('Command limit exceeded'); commands.push(command); };
      const track = e => {
        const id = identities.get(e) ?? e.id;
        if (tracked.has(id)) return tracked.get(id).copy;
        const copy = { ...e, tags: Array.isArray(e.tags) ? [...e.tags] : e.tags };
        const before = { ...copy, tags: Array.isArray(copy.tags) ? [...copy.tags] : copy.tags };
        tracked.set(id, { copy, before }); identities.set(copy, id);
        return copy;
      };
      const player = track(payload.player);
      let enemies, entities;
      const g = {
        time: payload.time, rand: () => rand(), player,
        enemies: () => enemies ?? (enemies = parse(list('enemies')).map(track)),
        entities: () => entities ?? (entities = parse(list('entities')).map(track)),
        spawn(kind, opts = {}) {
          if (++spawnCount > 32) throw Error('Spawn limit exceeded');
          const id = nextId--;
          const copy = track({ id, kind, x: player.x, y: player.y, vx: 0, vy: 0, radius: 12,
            hp: 20, maxHp: 20, speed: kind === 'enemy' ? 65 : 0, color: '#ff7755', tags: [], ...clone(opts) });
          push({ type: 'spawn', id, kind, opts: clone(opts) }); spawned.set(id, copy);
          return copy;
        },
        remove(e) {
          const id = identities.get(e) ?? e.id;
          if (id === payload.player.id) throw Error('Cannot remove player');
          push({ type: 'remove', id });
        },
        set(e, fields) {
          const copy = track(e);
          push({ type: 'setEntity', id: identities.get(copy), fields: clone(fields) });
          Object.assign(copy, fields);
        },
        physics: payload.physics, arena: payload.arena,
        ui: {
          toast(text) {
            if (typeof text !== 'string' || text.length > 4096) throw Error('Toast limit exceeded');
            push({ type: 'toast', text });
          },
          tint(color, ms) { push({ type: 'tint', color, ms }); }
        },
        state,
      };
      const physicsBefore = stringify(g.physics), arenaBefore = stringify(g.arena);
      const event = payload.event;
      if (payload.hook === 'onSpawn') payload.event = track(event);
      if (payload.hook === 'onHit') payload.event = { ...event, attacker: track(event.attacker), target: track(event.target) };
      if (payload.hook === 'onKill') payload.event = { victim: track(event.victim), ...(event.killer ? { killer: track(event.killer) } : {}) };
      const result = hooks[payload.hook](g, payload.hook === 'onTick' ? payload.dt : payload.event);
      if (result && typeof result.then === 'function') throw Error('Hooks must be synchronous');
      state = g.state;
      for (const [id, { copy, before }] of tracked) {
        const fields = {};
        for (const key of mutable) {
          const unchanged = key === 'tags' ? Array.isArray(copy.tags) && Array.isArray(before.tags) && copy.tags.length === before.tags.length && copy.tags.every((tag, i) => tag === before.tags[i]) : Object.is(copy[key], before[key]);
          if (!unchanged) fields[key] = copy[key];
        }
        if (keys(fields).length) push({ type: 'setEntity', id, fields });
      }
      if (physicsBefore !== stringify(g.physics)) push({ type: 'setPhysics', physics: g.physics });
      if (arenaBefore !== stringify(g.arena)) push({ type: 'setArena', arena: g.arena });
      const output = stringify({ commands, result: result ?? null });
      if (output.length > 262144) throw Error('Result limit exceeded');
      return output;
    })
  };
})()
`;
