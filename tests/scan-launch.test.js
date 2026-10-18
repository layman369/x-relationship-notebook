import test from 'node:test';
import assert from 'node:assert/strict';
import { launchScan, openProgressPanel } from '../scan-launch.js';
test('panel opens before awaiting permissions so user activation is preserved', async () => {
  const calls = []; let allow;
  const permission = new Promise(resolve => { allow = resolve; });
  const api = { sidePanel: { async open(options) { calls.push(['panel', options]); } }, permissions: { request() { calls.push(['permission']); return permission; } }, runtime: { async sendMessage(message) { calls.push(['start', message]); return { ok: true, job: { id: 'test' } }; } } };
  const pending = launchScan({ owner: '@Alice', kind: 'both', zoomFactor: 0.25, windowId: 7 }, api);
  assert.deepEqual(calls.map(call => call[0]), ['panel', 'permission']);
  allow(true); const result = await pending;
  assert.equal(result.job.id, 'test'); assert.equal(calls[2][1].windowId, 7); assert.equal(calls[2][1].zoomFactor, 0.25);
});
test('a panel-opening failure does not lose the scan and is reported to the user', async () => {
  const api = { sidePanel: { async open() { throw new Error('gesture denied'); } }, permissions: { async request() { return true; } }, runtime: { async sendMessage() { return { ok: true, job: { id: 'scan' } }; } } };
  const result = await launchScan({ owner: 'alice', kind: 'both', zoomFactor: 0.25, windowId: 1 }, api);
  assert.equal(result.job.id, 'scan'); assert.match(result.panelWarning, /gesture denied/);
});
test('launching inside the existing panel does not reopen it; denied access never starts scanning', async () => {
  let opens = 0, starts = 0;
  const api = { sidePanel: { async open() { opens++; } }, permissions: { async request() { return false; } }, runtime: { async sendMessage() { starts++; } } };
  await assert.rejects(launchScan({ owner: 'alice', kind: 'both', zoomFactor: 0.25, windowId: 1, inPanel: true }, api), /没有允许/);
  assert.equal(opens, 0); assert.equal(starts, 0);
  assert.throws(() => openProgressPanel(undefined, api), /无法打开侧边栏/);
});
