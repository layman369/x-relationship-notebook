import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, account, setList, setStarred, validateState } from '../core.js';
import { queryUsers, paginate } from '../list-view.js';

test('stars are account-specific, idempotent and survive scans and backup restore', () => {
  const state = emptyState(), data = account(state, 'owner');
  setStarred(data, '@Alice', true); setStarred(data, 'alice', true);
  assert.deepEqual(data.starred, ['alice']);
  assert.deepEqual(account(state, 'other').starred, []);
  setList(state, 'owner', 'followers', ['bob'], true);
  const restored = validateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.accounts.owner.starred, ['alice']);
  assert.equal(queryUsers(restored.accounts.owner, 'starred')[0].handle, 'alice');
  setStarred(data, 'alice', false); assert.deepEqual(data.starred, []);
});
test('starred management includes ignored and absent users and supports search, tags and pagination', () => {
  const state = emptyState(), data = account(state, 'owner');
  setList(state, 'owner', 'following', [{handle:'alice', name:'Alice', bio:'Profile'}], true);
  for (let i=0; i<25; i++) setStarred(data, `user${i}`, true);
  setStarred(data, 'alice', true); data.ignored = ['alice'];
  data.notes.alice = {tag:'朋友', note:'备注'};
  assert.equal(queryUsers(data, 'starred').length, 26);
  assert.equal(queryUsers(data, 'starred', 'profile', {tag:'tag:朋友'})[0].handle, 'alice');
  assert.equal(queryUsers(data, 'all').length, 0);
  assert.equal(paginate(queryUsers(data, 'starred'), 2, 20).rows.length, 6);
});
test('legacy backups default to no stars and malformed starred records are rejected', () => {
  const state = emptyState(), data = account(state, 'owner'); delete data.starred;
  assert.deepEqual(validateState(state).accounts.owner.starred, []);
  data.starred = 'alice'; assert.throws(() => validateState(state), /星标/);
  data.starred = ['invalid handle']; assert.throws(() => validateState(state), /用户名/);
});
