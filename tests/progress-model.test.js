import test from 'node:test';
import assert from 'node:assert/strict';
import { progressModel, scanEstimate } from '../progress-model.js';
test('progress panel never presents an old list as newly collected users', () => {
  const job = { owner: 'alice', kinds: ['followers'], index: 0, counts: {}, results: [] };
  const state = { accounts: { alice: { followers: { users: [{ handle: 'old', name: 'Old' }] } } } };
  assert.deepEqual(progressModel(job, state).recent, []);
  assert.deepEqual(progressModel(null, state).recent, []);
});
test('current list takes priority, latest users come first and feed stays bounded', () => {
  const users = Array.from({ length: 80 }, (_, i) => ({ handle: `user${i}`, name: `User ${i}` }));
  const job = { owner: 'alice', kinds: ['followers', 'following'], index: 1, counts: { followers: 80, following: 1 }, results: [] };
  const state = { accounts: { alice: { followers: { users }, following: { users: [{ handle: 'new', name: 'New' }] } } } };
  const model = progressModel(job, state);
  assert.equal(model.recent.length, 50); assert.equal(model.recent[0].handle, 'new'); assert.equal(model.recent[1].handle, 'user79'); assert.equal(model.followers, 80);
});

test('estimate uses current list total and measured elapsed time', () => {
  const job = { kinds: ['followers', 'following'], index: 0, phase: 'running', counts: { followers: 25 }, totals: { followers: 100 }, kindStartedAt: 1000, lastGrowthAt: 11000 };
  const model = scanEstimate(job, 11000);
  assert.equal(model.percent, 25); assert.match(model.eta, /30 秒/); assert.match(model.detail, /页面总人数/);
  assert.match(model.label, /1 \/ 2/);
});
test('unknown totals remain indeterminate and historic totals are labeled estimates', () => {
  const job = { kinds: ['followers'], index: 0, phase: 'running', counts: { followers: 25 }, kindStartedAt: 1000 };
  assert.equal(scanEstimate(job, 11000).percent, null);
  assert.match(scanEstimate(job, 11000).eta, /无法估算/);
  job.expectedCounts = { followers: 100 };
  assert.match(scanEstimate(job, 11000).detail, /上次完整名单估算/);
});
test('stalls pause ETA and reaching a reference total never marks active scans complete', () => {
  const job = { kinds: ['followers'], index: 0, phase: 'running', counts: { followers: 20 }, totals: { followers: 100 }, kindStartedAt: 1000, lastGrowthAt: 2000 };
  assert.match(scanEstimate(job, 20000).eta, /预估暂停/);
  job.counts.followers = 120;
  assert.equal(scanEstimate(job, 20000).percent, 99);
  assert.match(scanEstimate(job, 20000).eta, /等待页面结束/);
});
test('finished estimates freeze elapsed time and never claim list completeness', () => {
  const model = scanEstimate({ kinds: ['followers'], index: 0, phase: 'stopped', counts: {}, kindStartedAt: 1000, updatedAt: 11000 }, 99000);
  assert.equal(model.elapsed, '本份已用时：10 秒'); assert.match(model.eta, /结果需核对/);
});

test('profile approximations are labeled and can drive ETA without claiming precision', () => {
 const model = scanEstimate({ kinds: ['followers'], index: 0, phase: 'running', counts: { followers: 600 }, totals: { followers: 1200 }, totalApproximate: { followers: true }, kindStartedAt: 1000 }, 21000);
 assert.equal(model.percent, 50); assert.match(model.detail, /约 1200/); assert.match(model.detail, /主页缩写人数估算/); assert.match(model.eta, /20 秒/);
});
test('zero profile totals do not fall back to stale history or create a false ETA', () => {
 const model = scanEstimate({ kinds: ['followers'], index: 0, phase: 'running', counts: {}, totals: { followers: 0 }, expectedCounts: { followers: 99 } }, 1000);
 assert.match(model.detail, /0 \/ 0 人/); assert.match(model.eta, /主页显示 0 人/); assert.equal(model.percent, null);
});
