import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, account, recordScan, validateState, setList } from '../core.js';
const start = Date.parse('2026-10-18T10:00:00Z');
function job(id = 'scan-1') {
  return { id, startedAt: start, kindStartedAt: start + 1000, phase: 'review', kinds: ['followers', 'following'], index: 1, reason: 'review',
    profileTotals: { followers: { count: 1568, approximate: false, readAt: new Date(start + 500).toISOString() }, following: { count: 1800, approximate: true } },
    results: [{ kind: 'followers', count: 1563, outcome: 'review', durationMs: 30000 }, { kind: 'following', count: 1827, outcome: 'review', durationMs: 29000 }] };
}
test('scan summaries survive backup restore alongside profiles, notes and ignore metadata', () => {
  const state = emptyState(); setList(state, 'owner', 'following', [{ handle: 'alice', bio: 'Builder' }], false);
  const data = account(state, 'owner'); data.notes.alice = { tag: 'friend', note: 'memo' }; data.ignored = ['alice'];
  recordScan(state, 'owner', job(), start + 61000);
  const restored = validateState(JSON.parse(JSON.stringify(state))).accounts.owner;
  const record = restored.scanHistory[0];
  assert.equal(record.durationMs, 61000); assert.equal(record.results[0].count, 1563); assert.equal(record.results[1].durationMs, 29000);
  assert.equal(record.profileTotals.followers.count, 1568); assert.equal(record.profileTotals.following.approximate, true);
  assert.equal(restored.following.users[0].bio, 'Builder'); assert.equal(restored.notes.alice.note, 'memo'); assert.deepEqual(restored.ignored, ['alice']);
});
test('history upserts retried jobs and retains the most recent thirty per account', () => {
  const state = emptyState(); recordScan(state, 'owner', job(), start + 61000); recordScan(state, 'owner', job(), start + 62000);
  assert.equal(account(state, 'owner').scanHistory.length, 1);
  for (let i = 0; i < 35; i++) recordScan(state, 'owner', job(`scan-${i}`), start + 63000 + i);
  assert.equal(account(state, 'owner').scanHistory.length, 30); assert.equal(account(state, 'owner').scanHistory[0].id, 'scan-5');
  assert.equal(account(state, 'other').scanHistory.length, 0);
});
test('interruption includes partial current counts but not unstarted lists', () => {
  const state = emptyState(), partial = job(); partial.phase = 'interrupted'; partial.results = []; partial.index = 0; partial.counts = { followers: 12 };
  const record = recordScan(state, 'owner', partial, start + 5000);
  assert.equal(record.results.length, 1); assert.equal(record.results[0].count, 12); assert.equal(record.results[0].outcome, 'interrupted');
  partial.kindStartedAt = null; partial.results = [{ kind: 'followers', count: 12, outcome: 'review' }]; partial.index = 1;
  assert.equal(recordScan(state, 'owner', partial, start + 6000).results.length, 1);
});
test('legacy backups gain empty history without invented timestamps', () => {
  const state = emptyState(); delete account(state, 'owner').scanHistory;
  assert.deepEqual(validateState(state).accounts.owner.scanHistory, []);
});
test('invalid histories and negative counts are rejected', () => {
  const state = emptyState(); recordScan(state, 'owner', job(), start + 61000);
  state.accounts.owner.scanHistory[0].results[0].count = -1;
  assert.throws(() => validateState(state), /扫描结果人数/);
  state.accounts.owner.scanHistory = {};
  assert.throws(() => validateState(state), /扫描历史/);
});
