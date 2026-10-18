import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, account, setList, compareNotBack, validateState } from '../core.js';
const day = 86400000;
function fixture(at) {
  const state = emptyState();
  setList(state, 'owner', 'following', ['alice', 'bob', 'carol'], true);
  setList(state, 'owner', 'followers', ['carol'], true);
  const data = account(state, 'owner');
  for (const kind of ['following', 'followers']) data[kind].updatedAt = new Date(at).toISOString();
  return { state, data };
}
const start = Date.parse('2026-10-12T12:00:00Z');
test('duration boundaries use actual collection times, not wall clock or filename', () => {
  for (const [elapsed, level] of [[1, 'green'], [day, 'green'], [day + 1, 'yellow'], [3 * day, 'yellow'], [3 * day + 1, 'red']]) {
    const before = fixture(start).data, current = fixture(start + elapsed).data;
    const result = compareNotBack(current, before);
    assert.equal(result.durationMs, elapsed);
    assert.equal(result.users.get('alice').level, level);
  }
});
test('only users not following back in both observations receive a duration', () => {
  const before = fixture(start).data, current = fixture(start + 4 * day).data;
  before.following.users = before.following.users.filter(user => user.handle !== 'bob');
  before.followers.users.push({ handle: 'alice' });
  const result = compareNotBack(current, before);
  assert.equal(result.users.get('alice'), null); // Previously mutual.
  assert.equal(result.users.get('bob'), null); // Newly followed, start unknown.
  assert.equal(result.users.has('carol'), false); // Currently mutual.
});
test('conservative interval excludes mismatch between list acquisition dates', () => {
  const before = fixture(start).data, current = fixture(start + 4 * day).data;
  before.following.updatedAt = new Date(start + day).toISOString();
  current.following.updatedAt = new Date(start + 3 * day).toISOString();
  assert.equal(compareNotBack(current, before).durationMs, 2 * day);
});
test('rejects missing account, incomplete followers and missing or reversed times', () => {
  const before = fixture(start).data, current = fixture(start + day).data;
  assert.throws(() => compareNotBack(current, undefined), /当前账号/);
  for (const data of [before, current]) {
    data.followers.complete = false;
    assert.throws(() => compareNotBack(current, before), /完整/);
    data.followers.complete = true;
    for (const value of [null, '', 'invalid']) {
      const old = data.following.updatedAt; data.following.updatedAt = value;
      assert.throws(() => compareNotBack(current, before), /采集时间/);
      data.following.updatedAt = old;
    }
  }
  assert.throws(() => compareNotBack(before, current), /更早/);
  assert.throws(() => compareNotBack(current, current), /更早/);
  before.following.updatedAt = current.following.updatedAt;
  assert.throws(() => compareNotBack(current, before), /更早/);
});
test('comparison preserves original data, notes, ignored users and backup compatibility', () => {
  const before = fixture(start), current = fixture(start + 4 * day);
  current.data.notes.alice = { tag: '朋友', note: '保留备注' };
  current.data.ignored = ['alice'];
  const original = JSON.stringify([current.state, before.state]);
  assert.equal(compareNotBack(current.data, before.data).users.get('alice').level, 'red');
  assert.equal(JSON.stringify([current.state, before.state]), original);
  assert.deepEqual(validateState(current.state), current.state);
});


test('fansOnly observes the reverse direction and excludes new and previously mutual followers', () => {
  const before = fixture(start).data, current = fixture(start + 4 * day).data;
  before.followers.users.push({handle:'waiting_fan'}, {handle:'carol'});
  current.followers.users.push({handle:'waiting_fan'}, {handle:'new_fan'});
  current.following.users = current.following.users.filter(user => user.handle !== 'carol');
  const result = compareNotBack(current, before, 'fansOnly');
  assert.equal(result.users.get('waiting_fan').durationMs, 4 * day);
  assert.equal(result.users.get('waiting_fan').level, 'red');
  assert.equal(result.users.get('new_fan'), null);
  assert.equal(result.users.get('carol'), null);
  assert.equal(result.users.has('alice'), false);
});
test('each direction requires its own opposite list completeness independently', () => {
  const before = fixture(start).data, current = fixture(start + day).data;
  current.followers.complete = false;
  assert.doesNotThrow(() => compareNotBack(current, before, 'fansOnly'));
  assert.throws(() => compareNotBack(current, before), /粉丝/);
  current.followers.complete = true;
  for (const data of [current, before]) {
    data.following.complete = false;
    assert.doesNotThrow(() => compareNotBack(current, before));
    assert.throws(() => compareNotBack(current, before, 'fansOnly'), /关注名单/);
    data.following.complete = true;
  }
  assert.throws(() => compareNotBack(current, before, 'mutual'), /类型/);
});
test('reverse duration colors share the exact one and three day boundaries', () => {
  for (const [elapsed, level] of [[1, 'green'], [day, 'green'], [day+1, 'yellow'], [3*day, 'yellow'], [3*day+1, 'red']]) {
    const before = fixture(start).data, current = fixture(start+elapsed).data;
    before.followers.users.push({handle:'waiting_fan'});
    current.followers.users.push({handle:'waiting_fan'});
    assert.equal(compareNotBack(current, before, 'fansOnly').users.get('waiting_fan').level, level);
  }
});
