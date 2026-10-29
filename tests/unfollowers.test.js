import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, account, setList, compareUnfollowers, compareBackupRelations } from '../core.js';
import { queryUsers, paginate } from '../list-view.js';

function fixture(date, followers) {
  const state = emptyState();
  setList(state, 'owner', 'followers', followers, true);
  const data = account(state, 'owner');
  data.followers.updatedAt = date;
  return data;
}
const oldDate = '2026-10-20T00:00:00Z', newDate = '2026-10-30T00:00:00Z';

test('lost followers include absent profiles and ignore unrelated following changes', () => {
  const before = fixture(oldDate, [{handle:'lost', name:'Old name', bio:'Historical bio'}, 'kept']);
  const current = fixture(newDate, ['kept', 'new_fan']);
  current.following.users = [{handle:'other'}, {handle:'lost', name:'New name', bio:'New bio'}];
  const original = JSON.stringify([before, current]);
  const result = compareUnfollowers(current, before);
  assert.deepEqual(result.users.map(u => u.handle), ['lost']);
  assert.equal(result.users[0].name, 'New name');
  assert.equal(result.users[0].relation, 'unfollowers');
  current.following.users = [];
  assert.equal(compareUnfollowers(current, before).users[0].bio, 'Historical bio');
  current.following.users = [{handle:'other'}, {handle:'lost', name:'New name', bio:'New bio'}];
  assert.equal(JSON.stringify([before, current]), original);
});
test('requires a later complete current follower list but old partial observations still count', () => {
  const before = fixture(oldDate, ['lost']), current = fixture(newDate, []);
  before.followers.complete = false;
  assert.equal(compareUnfollowers(current, before).users.length, 1);
  current.followers.complete = false;
  assert.throws(() => compareUnfollowers(current, before), /完整/);
  current.followers.complete = true;
  for (const value of [null, '', 'bad', oldDate, '2026-10-19T00:00:00Z']) {
    current.followers.updatedAt = value;
    assert.throws(() => compareUnfollowers(current, before), /时间|更早/);
  }
  assert.throws(() => compareUnfollowers(current, undefined), /当前账号/);
});
test('follower-only comparison works independently of missing following dates and returns zero correctly', () => {
  const before = fixture(oldDate, ['kept']), current = fixture(newDate, ['kept']);
  const result = compareBackupRelations(current, before);
  assert.equal(result.unfollowers.users.length, 0);
  assert.equal(result.users.size, 0);
  assert.ok(result.warnings.length);
  current.followers.complete = false;
  assert.throws(() => compareBackupRelations(current, before), /完整/);
});
test('lost users retain search, notes, ignore filtering and pagination without entering normal lists', () => {
  const users = Array.from({length:61}, (_, i) => ({handle:`lost${i}`, bio:'history'}));
  const before = fixture(oldDate, users), current = fixture(newDate, []);
  const unfollowers = compareUnfollowers(current, before).users;
  current.notes.lost0 = {tag:'朋友', note:'memo'};
  current.ignored = ['lost0'];
  assert.equal(queryUsers(current, 'unfollowers', '', {unfollowers}).length, 60);
  assert.equal(queryUsers(current, 'unfollowers', 'memo', {unfollowers}).length, 0);
  current.hideIgnored = false;
  assert.equal(queryUsers(current, 'unfollowers', 'memo', {unfollowers, tag:'tag:朋友'})[0].handle, 'lost0');
  assert.equal(paginate(queryUsers(current, 'unfollowers', 'history', {unfollowers}), 4, 20).rows.length, 1);
  assert.deepEqual(queryUsers(current, 'all'), []);
  assert.deepEqual(queryUsers(current, 'unfollowers'), []);
});
