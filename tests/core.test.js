import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, account, setList, analyze, saveSnapshot, diffSnapshots, validateState, handle } from '../core.js';
test('incomplete lists never imply a negative relationship', () => {
  const state = emptyState(); setList(state, 'owner', 'following', ['@Alice', 'bob'], false); setList(state, 'owner', 'followers', ['alice', 'carol'], false);
  const data = account(state, 'owner');
  assert.deepEqual(analyze(data).map(u => u.relation), ['mutual', 'followingUnknown', 'followerUnknown']);
  data.followers.complete = true;
  assert.equal(analyze(data)[1].relation, 'notBack');
  assert.equal(analyze(data)[2].relation, 'followerUnknown');
});
test('collecting more cards deduplicates and invalidates completeness', () => {
  const state = emptyState(); setList(state, 'owner', 'followers', ['Alice'], true);
  setList(state, 'owner', 'followers', ['ALICE', 'bob'], true, true);
  assert.equal(account(state, 'owner').followers.users.length, 2);
  assert.equal(account(state, 'owner').followers.complete, false);
});
test('snapshots require completeness and preserve a separate baseline', () => {
  const state = emptyState(); const data = account(state, 'owner');
  assert.throws(() => saveSnapshot(data));
  setList(state, 'owner', 'followers', ['alice', 'bob'], true); const before = saveSnapshot(data);
  setList(state, 'owner', 'followers', ['alice', 'carol'], true); const after = saveSnapshot(data);
  const diff = diffSnapshots(before, after);
  assert.deepEqual(diff.added.map(u => u.handle), ['carol']); assert.deepEqual(diff.removed.map(u => u.handle), ['bob']);
  assert.deepEqual(before.users.map(u => u.handle), ['alice', 'bob']);
});
test('accounts are isolated and backup validation rejects malformed records', () => {
  const state = emptyState(); setList(state, 'alice', 'following', ['bob'], true); account(state, 'bob');
  assert.equal(state.accounts.bob.following.users.length, 0);
  assert.deepEqual(validateState(state), state);
  assert.throws(() => validateState({ version: 1, accounts: { owner: { following: { users: [], complete: 'yes' } } } }));
  assert.throws(() => handle('__proto__!'));
  assert.throws(() => setList(state, 'owner', 'followers', ['https://x.com/a'], true));
});
test('snapshot history retains at most 30 records', () => {
  const state = emptyState(); setList(state, 'owner', 'followers', [], true); const data = account(state, 'owner');
  for (let i=0; i<35; i++) saveSnapshot(data);
  assert.equal(data.snapshots.length, 30);
});
test('special valid handles remain data keys without changing object prototypes', () => {
  const state = emptyState(); const original = Object.getPrototypeOf(state.accounts);
  setList(state, '__proto__', 'followers', ['constructor'], true);
  assert.equal(Object.getPrototypeOf(state.accounts), original);
  assert.equal(Object.hasOwn(state.accounts, '__proto__'), true);
  assert.equal(validateState(state).accounts.__proto__.followers.users[0].handle, 'constructor');
});
