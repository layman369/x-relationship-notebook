import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readProfileCounts } from '../profile-counts.js';
async function readMetrics(items, options = {}) {
  let observer, finish, disconnected = false;
  const complete = new Promise(resolve => { finish = resolve; });
  const link = item => ({ textContent: item.text, closest: () => item.card ? {} : null,
    getAttribute: key => key === 'href' ? item.href : key === 'title' ? item.title : null,
    querySelectorAll: () => [...(item.title ? [{ getAttribute: () => item.title }] : []), ...(item.spans || []).map(text => ({ getAttribute: () => null, textContent: text }))]
  });
  let links = items.map(link);
  const context = vm.createContext({ URL, queueMicrotask, clearTimeout,
    location: { protocol: 'https:', hostname: 'x.com', origin: 'https://x.com', href: 'https://x.com/owner', pathname: '/owner' },
    document: { querySelectorAll: () => links, querySelector: () => ({}), documentElement: {} },
    MutationObserver: class { constructor(fn) { observer = fn; } observe() { if (options.late) setTimeout(() => { links = options.late.map(link); observer(); }, 0); } disconnect() { disconnected = true; } },
    setTimeout: fn => setTimeout(fn, 0),
    chrome: { runtime: { async sendMessage(message) { finish(structuredClone(message)); return { ok: true }; } } }
  });
  vm.runInContext(`(${readProfileCounts.toString()})({id:'job',owner:'owner'})`, context);
  const message = await complete;
  return { message, disconnected };
}
test('reads exact profile counts from titles and preserves both list kinds', async () => {
  const { message, disconnected } = await readMetrics([
    { href: '/owner/followers', text: '1.5K Followers', title: '1,563' },
    { href: '/owner/following', text: '1,827 Following' }
  ]);
  assert.deepEqual(message.totals, { followers: { count: 1563, approximate: false }, following: { count: 1827, approximate: false } });
  assert.equal(disconnected, true);
});
test('abbreviated counts are explicitly approximate, including Chinese units', async () => {
  const { message } = await readMetrics([{ href: '/owner/followers', text: '1.2K Followers' }, { href: '/owner/following', text: '2.5万 关注' }]);
  assert.deepEqual(message.totals, { followers: { count: 1200, approximate: true }, following: { count: 25000, approximate: true } });
});
test('numeric child spans work when the page label precedes the count', async () => {
  const { message } = await readMetrics([{ href: '/owner/followers', text: 'Followers 1,563', spans: ['1,563', 'Followers'] }, { href: '/owner/following', text: 'Following 0', spans: ['0'] }]);
  assert.equal(message.totals.followers.count, 1563); assert.equal(message.totals.following.count, 0);
});
test('public Followers metric can route to verified tab, but verified-only metrics are excluded', async () => {
  const { message } = await readMetrics([{ href: '/owner/verified_followers', text: '1,563 Followers' }, { href: '/owner/following', text: '20 Following' }]);
  assert.equal(message.totals.followers.count, 1563);
  const excluded = await readMetrics([{ href: '/owner/verified_followers', text: '12 Verified Followers' }]);
  assert.deepEqual(excluded.message.totals, {});
});
test('unrelated account, external host and user cards cannot supply totals', async () => {
  const { message } = await readMetrics([{ href: '/other/followers', text: '999' }, { href: 'https://example.com/owner/followers', text: '999' }, { href: '/owner/followers', text: '999', card: true }]);
  assert.deepEqual(message.totals, {});
});
test('waits for profile hydration and times out safely with whatever totals are available', async () => {
  const { message } = await readMetrics([], { late: [{ href: '/owner/followers', text: '10 Followers' }, { href: '/owner/following', text: '20 Following' }] });
  assert.equal(message.totals.followers.count, 10);
  const partial = await readMetrics([{ href: '/owner/following', text: '20 Following' }]);
  assert.deepEqual(partial.message.totals, { following: { count: 20, approximate: false } });
});
