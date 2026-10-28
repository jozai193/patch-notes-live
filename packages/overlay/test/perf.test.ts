import { expect, it } from 'vitest';
import { RollingSamples } from '../src/perf.js';

it('expires old frame spikes and computes nearest-rank p95 over a bounded window', () => {
  const samples = new RollingSamples(3);
  samples.push(1000);
  samples.push(1);
  samples.push(2);
  samples.push(3);
  expect(samples.summary()).toEqual({ count: 3, mean: 2, p95: 3 });
  samples.push(NaN);
  samples.push(-1);
  samples.push(Infinity);
  expect(samples.summary()).toEqual({ count: 3, mean: 2, p95: 3 });
  samples.clear();
  expect(samples.summary()).toEqual({ count: 0, mean: 0, p95: 0 });
});

it('retains exactly the most recent 300 ticks', () => {
  const samples = new RollingSamples();
  for (let i = 0; i < 301; i++) samples.push(i);
  expect(samples.summary()).toEqual({ count: 300, mean: 150.5, p95: 285 });
});
