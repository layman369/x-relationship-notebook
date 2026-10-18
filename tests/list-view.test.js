import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, account, setList } from '../core.js';
import { queryUsers, paginate } from '../list-view.js';
test('list membership filters include mutual users and work with incomplete opposite lists', () => {
  const state = emptyState(); setList(state, 'owner', 'following', ['alice', 'bob'], false); setList(state, 'owner', 'followers', ['alice', 'carol'], false);
  const data = account(state, 'owner');
  assert.deepEqual(queryUsers(data, 'following').map(u => u.handle), ['alice', 'bob']);
  assert.deepEqual(queryUsers(data, 'followers').map(u => u.handle), ['alice', 'carol']);
  assert.deepEqual(queryUsers(data, 'mutual').map(u => u.handle), ['alice']);
  assert.deepEqual(queryUsers(data, 'notBack'), []);
  data.followers.complete = true; assert.deepEqual(queryUsers(data, 'notBack').map(u => u.handle), ['bob']);
  data.notes.bob = { tag: '编程', note: 'KEEP' }; assert.equal(queryUsers(data, 'following', 'keep')[0].handle, 'bob');
});
test('all supported page sizes traverse the complete list beyond 200 users without overlap', () => {
  const users = Array.from({ length: 463 }, (_, index) => ({ handle: `user${index}` }));
  for (const size of [20, 50, 100, 200]) {
    const pages = Math.ceil(users.length / size), combined = [];
    for (let page = 1; page <= pages; page++) combined.push(...paginate(users, page, size).rows);
    assert.deepEqual(combined, users);
    const last = paginate(users, pages, size); assert.equal(last.end, 463); assert.ok(last.rows.length <= size);
  }
});
test('pagination clamps after data shrink and handles empty or invalid input', () => {
  const users = Array.from({ length: 61 }, (_, index) => index);
  assert.equal(paginate(users, 99, 20).page, 4); assert.equal(paginate(users, -2, 20).page, 1);
  assert.equal(paginate(users, NaN, 20).page, 1); assert.equal(paginate(users, 2.9, 20).page, 2);
  const empty = paginate([], 4, 50); assert.deepEqual(empty.rows, []); assert.equal(empty.page, 1); assert.equal(empty.start, 0); assert.equal(empty.end, 0);
  assert.throws(() => paginate(users, 1, 30));
});

test('tag and note filters combine with membership, search and ignored visibility', () => {
 const state = emptyState(); setList(state, 'owner', 'following', ['alice', 'bob', 'carol', 'dave'], true); setList(state, 'owner', 'followers', ['alice'], true);
 const data = account(state, 'owner');
 data.notes.alice = { tag: '朋友', note: 'KEEP 中文' }; data.notes.bob = { tag: '朋友', note: '' }; data.notes.carol = { tag: '工作', note: '项目' };
 const names = filters => queryUsers(data, 'following', '', filters).map(user => user.handle);
 assert.deepEqual(names({ tag: 'tag:朋友' }), ['alice', 'bob']);
 assert.deepEqual(names({ tag: 'has', noteMode: 'has' }), ['alice', 'carol']);
 assert.deepEqual(names({ tag: 'none', noteMode: 'none' }), ['dave']);
 assert.deepEqual(names({ tag: 'tag:朋友', noteMode: 'has', noteQuery: 'keep' }), ['alice']);
 assert.deepEqual(queryUsers(data, 'notBack', '', { tag: 'tag:朋友' }).map(user => user.handle), ['bob']);
 assert.deepEqual(queryUsers(data, 'following', 'bob', { noteMode: 'has' }), []);
 data.ignored = ['alice']; assert.deepEqual(names({ tag: 'tag:朋友', noteMode: 'has' }), []);
 assert.deepEqual(queryUsers(data, 'ignored', '', { noteQuery: '中文' }).map(user => user.handle), ['alice']);
});
test('filters treat whitespace as empty and exact tags cannot collide with filter commands', () => {
 const state = emptyState(); setList(state, 'owner', 'followers', ['alice', 'bob'], false); const data = account(state, 'owner');
 data.notes.alice = { tag: 'none', note: '   ' }; data.notes.bob = { tag: '  ', note: '内容' };
 assert.equal(queryUsers(data, 'all', '', { tag: 'tag:none', noteMode: 'none' })[0].handle, 'alice');
 assert.equal(queryUsers(data, 'all', '', { tag: 'none', noteMode: 'has' })[0].handle, 'bob');
});
test('filtered results paginate completely and changing notes updates the results', () => {
 const state = emptyState(); const users = Array.from({ length: 61 }, (_, index) => `user${index}`);
 setList(state, 'owner', 'following', users, true); const data = account(state, 'owner');
 for (const user of users) data.notes[user] = { tag: '朋友', note: '保留' };
 const filtered = queryUsers(data, 'all', '', { tag: 'tag:朋友' });
 assert.equal(paginate(filtered, 4, 20).rows.length, 1);
 data.notes.user60.tag = '工作'; assert.equal(queryUsers(data, 'all', '', { tag: 'tag:朋友' }).length, 60);
});
