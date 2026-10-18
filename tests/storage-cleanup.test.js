import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, setList, account, saveSnapshot } from '../core.js';
const stored = new Map();
globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)) };
const { readState, updateState } = await import('../storage.js');
const KEY = 'x-relationship-notebook-v1';
test('one-time cleanup removes demo data while preserving real account records exactly', async () => {
  stored.clear(); const seed = emptyState();
  setList(seed, 'demo_account', 'followers', ['fake_user'], true);
  setList(seed, 'real_owner', 'followers', ['friend'], true);
  const real = account(seed, 'real_owner'); real.notes.friend = { tag: 'friend', note: 'keep' }; saveSnapshot(real);
  const expectedReal = JSON.stringify(real); stored.set(KEY, JSON.stringify(seed));
  const result = await readState(); assert.equal(Object.hasOwn(result.accounts, 'demo_account'), false);
  assert.equal(JSON.stringify(JSON.parse(stored.get(KEY)).accounts.real_owner), expectedReal);
  assert.equal(stored.get('xrb-demo-cleanup-v1'), 'true');
  // The marker prevents a future intentionally added real account with this name from being removed.
  await updateState(state => setList(state, 'demo_account', 'following', ['real_friend'], false));
  assert.equal((await readState()).accounts.demo_account.following.users[0].handle, 'real_friend');
});
test('parallel reads and edits do not restore the removed account or lose real notes', async () => {
  stored.clear(); const seed = emptyState(); setList(seed, 'demo_account', 'following', ['fake_user'], true); account(seed, 'real_owner'); stored.set(KEY, JSON.stringify(seed));
  await Promise.all([readState(), readState(), updateState(state => { account(state, 'real_owner').notes.friend = { tag: '', note: 'preserved' }; })]);
  const result = await readState(); assert.equal(Object.hasOwn(result.accounts, 'demo_account'), false); assert.equal(result.accounts.real_owner.notes.friend.note, 'preserved');
});
