import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, account, setList, setIgnored, isFilteredOut, validateState, saveSnapshot, diffSnapshots } from '../core.js';
import { queryUsers, paginate } from '../list-view.js';
function seed() {
  const state = emptyState(); setList(state, 'owner', 'following', ['alice', 'bob'], true); setList(state, 'owner', 'followers', ['alice', 'carol'], true);
  return { state, data: account(state, 'owner') };
}
test('ignoring filters every list before pagination, while switching off allows undo', () => {
  const { data } = seed(); setIgnored(data, '@ALICE', true); setIgnored(data, 'alice', true);
  assert.deepEqual(data.ignored, ['alice']);
  assert.deepEqual(queryUsers(data, 'following').map(u => u.handle), ['bob']); assert.equal(queryUsers(data, 'mutual').length, 0);
  assert.deepEqual(queryUsers(data, 'followers').map(u => u.handle), ['carol']); assert.equal(paginate(queryUsers(data, 'all')).total, 2);
  data.hideIgnored = false; assert.equal(queryUsers(data, 'mutual')[0].handle, 'alice');
  setIgnored(data, 'alice', false); data.hideIgnored = true; assert.equal(queryUsers(data, 'mutual').length, 1);
});
test('ignore metadata survives scanning and backup restore without affecting other accounts', () => {
  const { state, data } = seed(); setIgnored(data, 'alice', true); data.hideIgnored = false;
  setList(state, 'owner', 'followers', ['alice', 'new'], false); assert.deepEqual(data.ignored, ['alice']);
  const restored = validateState(JSON.parse(JSON.stringify(state))); assert.deepEqual(restored.accounts.owner.ignored, ['alice']); assert.equal(restored.accounts.owner.hideIgnored, false);
  const other = account(state, 'other'); assert.equal(isFilteredOut(other, 'alice'), false);
});
test('old backups receive compatible defaults and invalid ignore fields are rejected', () => {
  const { state } = seed(); delete state.accounts.owner.ignored; delete state.accounts.owner.hideIgnored;
  const restored = validateState(state); assert.deepEqual(restored.accounts.owner.ignored, []); assert.equal(restored.accounts.owner.hideIgnored, true);
  state.accounts.owner.ignored = 'alice'; assert.throws(() => validateState(state), /忽略名单/);
});
test('ignoring never removes stored list membership or snapshot evidence', () => {
  const { state, data } = seed(); const before = saveSnapshot(data); setIgnored(data, 'alice', true);
  setList(state, 'owner', 'followers', ['carol'], true); const after = saveSnapshot(data);
  const diff = diffSnapshots(before, after); assert.equal(diff.removed[0].handle, 'alice');
  assert.equal(diff.removed.filter(u => !isFilteredOut(data, u.handle)).length, 0);
  assert.equal(before.users.length, 2); assert.equal(data.following.users.length, 2);
});
test('ignored management view bypasses the active filter and only lists ignored handles', () => {
  const { data } = seed(); setIgnored(data, 'alice', true);
  assert.equal(queryUsers(data, 'all').some(user => user.handle === 'alice'), false);
  assert.deepEqual(queryUsers(data, 'ignored').map(user => user.handle), ['alice']);
  data.hideIgnored = false;
  assert.deepEqual(queryUsers(data, 'ignored').map(user => user.handle), ['alice']);
  setIgnored(data, 'alice', false); assert.deepEqual(queryUsers(data, 'ignored'), []);
});
test('ignored users absent from current scans remain searchable and can be unignored', () => {
  const { state, data } = seed(); setIgnored(data, 'alice', true); data.notes.alice = { tag: 'old_friend', note: 'keep visible here' };
  setList(state, 'owner', 'following', [], true); setList(state, 'owner', 'followers', [], true);
  const rows = queryUsers(data, 'ignored', 'old_friend'); assert.equal(rows[0].handle, 'alice'); assert.equal(rows[0].relation, 'unrecorded');
  setIgnored(data, rows[0].handle, false); assert.equal(queryUsers(data, 'ignored').length, 0);
});
test('ignored management supports normal pagination and stays scoped to the current account', () => {
  const { state, data } = seed();
  for (let index = 0; index < 55; index++) setIgnored(data, `ignored_${index}`, true);
  assert.equal(paginate(queryUsers(data, 'ignored'), 2, 20).rows.length, 20);
  assert.equal(paginate(queryUsers(data, 'ignored'), 3, 20).rows.length, 15);
  assert.equal(queryUsers(account(state, 'another'), 'ignored').length, 0);
});
