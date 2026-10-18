import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, account, setList, normalizeUsers, avatarUrl, analyze, saveSnapshot, validateState } from '../core.js';
import { queryUsers } from '../list-view.js';
import { renderAvatar } from '../profile-ui.js';
const image = 'https://pbs.twimg.com/profile_images/123/avatar_normal.jpg';
test('profile metadata survives merge, snapshot and backup while absent fields preserve known data', () => {
  const state = emptyState(); setList(state, 'owner', 'followers', [{ handle: 'alice', name: 'Alice', avatarUrl: image, bio: '中文 Builder' }], true);
  const data = account(state, 'owner'); saveSnapshot(data);
  setList(state, 'owner', 'followers', ['alice', 'bob'], false, true);
  assert.equal(data.followers.users[0].avatarUrl, image); assert.equal(data.followers.users[0].bio, '中文 Builder');
  const restored = validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.accounts.owner.snapshots[0].users[0].avatarUrl, image);
  assert.equal(queryUsers(data, 'followers', 'builder')[0].handle, 'alice');
  setList(state, 'owner', 'followers', [{ handle: 'alice', bio: '' }], false); assert.equal(data.followers.users[0].bio, '');
});
test('avatar URLs reject unsafe protocols, unrelated hosts and non-avatar images', () => {
  assert.equal(avatarUrl(image), image);
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,xxx', 'https://evil.test/a.png', 'https://pbs.twimg.com.evil.test/profile_images/a.png', 'https://pbs.twimg.com/media/a.png', 'http://pbs.twimg.com/profile_images/a.png']) assert.equal(avatarUrl(url), '');
  const [user] = normalizeUsers([{ handle: 'alice', bio: 'a'.repeat(2000), avatarUrl: 'javascript:alert(1)' }]);
  assert.equal(user.bio.length, 1000); assert.equal(user.avatarUrl, '');
});
test('a richer profile on the opposite list is available in the relationship view', () => {
  const state = emptyState(); setList(state, 'owner', 'following', ['alice'], true);
  setList(state, 'owner', 'followers', [{ handle: 'alice', bio: 'Designer', avatarUrl: image }], true);
  const user = analyze(account(state, 'owner'))[0]; assert.equal(user.bio, 'Designer'); assert.equal(user.avatarUrl, image);
});
test('avatar component loads lazily without referrer and keeps its initial fallback on image error', () => {
  globalThis.document = { createElement(tag) { return { tag, children: [], append(child) { this.children.push(child); }, remove() { this.removed = true; } }; } };
  const avatar = renderAvatar({ handle: 'alice', name: 'Alice', avatarUrl: image });
  assert.equal(avatar.textContent, 'A'); const img = avatar.children[0];
  assert.equal(img.src, image); assert.equal(img.loading, 'lazy'); assert.equal(img.referrerPolicy, 'no-referrer');
  img.onerror(); assert.equal(img.removed, true); assert.equal(avatar.textContent, 'A');
  assert.equal(renderAvatar({ handle: 'alice', name: 'Alice', avatarUrl: 'javascript:bad' }).children.length, 0);
});
