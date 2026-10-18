import test from 'node:test';
import assert from 'node:assert/strict';
import { createRefreshScheduler } from '../ui-refresh.js';
function timers() {
  let now = 0, next = 0;
  const tasks = new Map();
  return {
    Date: { now: () => now }, tasks,
    setTimeout(fn, delay) { const id = ++next; tasks.set(id, { fn, at: now + delay }); return id; },
    async run() { const [id, task] = [...tasks][0]; tasks.delete(id); now = task.at; await task.fn(); }
  };
}
test('many UI notifications produce at most one refresh per second', async () => {
  const clock = timers(); let count = 0;
  const schedule = createRefreshScheduler(async () => count++, 1000, clock);
  for (let i = 0; i < 100; i++) schedule();
  assert.equal(clock.tasks.size, 1); await clock.run(); assert.equal(count, 1);
  for (let i = 0; i < 100; i++) schedule();
  assert.equal([...clock.tasks.values()][0].at, 1000);
  await clock.run(); assert.equal(count, 2);
});
test('notifications during an asynchronous refresh merge into one serial follow-up', async () => {
  const clock = timers(); let count = 0, finish;
  const schedule = createRefreshScheduler(async () => { count++; if (count === 1) await new Promise(resolve => { finish = resolve; }); }, 1000, clock);
  schedule(); const inFlight = clock.run();
  for (let i = 0; i < 50; i++) schedule();
  assert.equal(clock.tasks.size, 0); assert.equal(count, 1);
  finish(); await inFlight;
  assert.equal(clock.tasks.size, 1); await clock.run(); assert.equal(count, 2);
});
