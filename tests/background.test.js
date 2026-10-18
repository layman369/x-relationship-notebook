import test from 'node:test';
import assert from 'node:assert/strict';
const local = {}, session = {}, events = {}, navigations = [], injections = [];
let accessGranted = true;
let zoom = 1.25, zoomSettings = { mode: 'automatic', scope: 'per-origin' }, zoomFails = false;
const zoomCalls = [];
const area = backing => ({ async get(key) { return { [key]: structuredClone(backing[key]) }; }, async set(value) { Object.assign(backing, structuredClone(value)); } });
globalThis.chrome = {
  runtime: { id: 'fixture', getURL: path => `chrome-extension://fixture/${path}`, onMessage: { addListener: listener => { events.message = listener; } } },
  storage: { local: area(local), session: area(session) },
  permissions: { async contains() { return accessGranted; } },
  tabs: { async create(options) { return { id: options.active === false ? 42 : 41 }; }, async remove() {}, async update(id, value) { navigations.push({ id, ...value }); zoom = 1.25; zoomSettings = { mode: 'automatic', scope: 'per-origin' }; }, async sendMessage() {},
    async getZoom() { return zoom; }, async getZoomSettings() { return structuredClone(zoomSettings); },
    async setZoomSettings(id, settings) { zoomCalls.push({ settings }); zoomSettings = structuredClone(settings); },
    async setZoom(id, factor) { zoomCalls.push({ factor, scope: zoomSettings.scope }); if (zoomFails && factor === 0.25) throw new Error('zoom unavailable'); zoom = factor; },
    onUpdated: { addListener: listener => { events.updated = listener; } }, onRemoved: { addListener: listener => { events.removed = listener; } } },
  scripting: { async executeScript(value) { injections.push(value); } }
};
await import('../background.js');
const ui = { id: 'fixture', url: 'chrome-extension://fixture/app.html', tab: { id: 15 } };
const pageSender = kind => ({ id: 'fixture', url: `https://x.com/owner/${kind}`, tab: { id: 41 }, frameId: 0, documentId: `doc-${kind}` });
const send = (message, sender = ui) => new Promise(resolve => events.message(message, sender, resolve));
const flush = () => navigator.locks.request('xrb-scan-control', () => {});
const ready = (kind = 'followers') => send({ type: 'XRB_SCAN_PAGE_READY' }, pageSender(kind));
const job = () => session['xrb-scan-job'];
const data = () => local['x-relationship-notebook-v1'];
test('finished scan summaries persist profile metrics and collected counts', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'followers' });
  const profile = { ...pageSender('followers'), url: 'https://x.com/owner', tab: { id: 42 }, documentId: 'profile-doc' };
  await send({ type: 'XRB_SCAN_PAGE_READY' }, profile);
  await send({ type: 'XRB_SCAN_PROFILE_TOTALS', id: job().id, totals: { followers: { count: 100, approximate: false }, following: { count: 200, approximate: true } } }, profile);
  await ready();
  await send({ type: 'XRB_SCAN_DONE', id: job().id, kind: 'followers', users: ['alice', 'bob'], outcome: 'review', reason: 'review' }, pageSender('followers'));
  const record = data().accounts.owner.scanHistory[0];
  assert.equal(record.profileTotals.followers.count, 100); assert.equal(record.profileTotals.following.approximate, true);
  assert.equal(record.results[0].count, 2); assert.ok(record.durationMs >= 0); assert.ok(record.results[0].durationMs >= 0);
  assert.equal(record.phase, 'review'); assert.equal(record.results.length, 1);
});
test('closing scan tabs persists interrupted partial scan summaries', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'followers' }); await ready();
  await send({ type: 'XRB_SCAN_BATCH', id: job().id, kind: 'followers', users: ['alice'] }, pageSender('followers'));
  events.removed(41); await flush();
  const record = data().accounts.owner.scanHistory[0]; assert.equal(record.phase, 'interrupted'); assert.equal(record.results[0].count, 1);
});
function reset() { for (const obj of [local, session]) for (const key of Object.keys(obj)) delete obj[key]; navigations.length = 0; injections.length = 0; accessGranted = true; zoom = 1.25; zoomSettings = { mode: 'automatic', scope: 'per-origin' }; zoomFails = false; zoomCalls.length = 0; }

test('scan batches missing profile fields preserve previously stored biographies', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'followers' }); await ready();
  const batch = users => send({ type: 'XRB_SCAN_BATCH', id: job().id, kind: 'followers', users }, pageSender('followers'));
  await batch([{ handle: 'alice', bio: 'Saved biography', avatarUrl: 'https://pbs.twimg.com/profile_images/123/avatar.jpg' }]);
  await batch([{ handle: 'alice', name: 'Alice' }]);
  assert.equal(data().accounts.owner.followers.users[0].bio, 'Saved biography');
  assert.equal(data().accounts.owner.followers.users[0].avatarUrl, 'https://pbs.twimg.com/profile_images/123/avatar.jpg');
});
test('blank bootstrap completion must not inject the scanner before X is ready', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'followers' });
  events.updated(41, { status: 'complete' }, { id: 41, url: 'about:blank' }); await flush();
  assert.equal(injections.length, 0); assert.equal(job().phase, 'loading');
});
test('withheld X permission is reported before creating a scan tab', async () => {
  reset(); accessGranted = false;
  const response = await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'followers' });
  assert.equal(response.ok, false); assert.match(response.error, /网站访问权限/);
  assert.equal(job(), undefined); assert.equal(navigations.length, 0);
});
test('only a matching X document handshake can start injection', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'followers' });
  await send({ type: 'XRB_SCAN_PAGE_READY' }, { ...pageSender('followers'), tab: { id: 99 } });
  assert.equal(job().phase, 'loading'); assert.equal(injections.length, 0);
  await ready();
  assert.deepEqual(injections[0].target, { tabId: 41, documentIds: ['doc-followers'] });
  await ready(); assert.equal(injections.length, 1);
  const wrongDocument = await send({ type: 'XRB_SCAN_BATCH', id: job().id, kind: 'followers', users: ['wrong'] }, { ...pageSender('followers'), documentId: 'old-doc' });
  assert.equal(wrongDocument.stop, true); assert.equal(data(), undefined);
});
test('login redirects end with a readable error without injecting into the login page', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'followers' });
  await send({ type: 'XRB_SCAN_PAGE_READY' }, { ...pageSender('followers'), url: 'https://x.com/i/flow/login' });
  assert.equal(job().phase, 'error'); assert.match(job().reason, /已登录/); assert.equal(injections.length, 0);
});
test('one click scans followers then following and saves separate partial lists', async () => {
  reset();
  const start = await send({ type: 'XRB_SCAN_START', owner: '@Owner', kind: 'both' }); assert.equal(start.ok, true);
  assert.equal(navigations[0].url, 'https://x.com/owner/followers');
  const duplicate = await send({ type: 'XRB_SCAN_START', owner: 'other', kind: 'both' }); assert.equal(duplicate.ok, false);
  await ready(); assert.equal(injections.length, 1);
  const id = job().id;
  await send({ type: 'XRB_SCAN_BATCH', id, kind: 'followers', users: ['alice'] }, pageSender('followers'));
  assert.equal(data().accounts.owner.followers.complete, false);
  await send({ type: 'XRB_SCAN_DONE', id, kind: 'followers', users: [], outcome: 'review', reason: 'bottom' }, pageSender('followers'));
  assert.equal(job().index, 1); assert.equal(navigations.at(-1).url, 'https://x.com/owner/following');
  const stale = await send({ type: 'XRB_SCAN_BATCH', id, kind: 'followers', users: ['wrong'] }, pageSender('followers')); assert.equal(stale.stop, true);
  await ready('following');
  await send({ type: 'XRB_SCAN_BATCH', id, kind: 'following', users: ['bob'] }, pageSender('following'));
  await send({ type: 'XRB_SCAN_DONE', id, kind: 'following', users: [], outcome: 'review', reason: 'bottom' }, pageSender('following'));
  assert.equal(job().phase, 'review'); assert.equal(job().results.length, 2);
  assert.equal(data().accounts.owner.followers.users[0].handle, 'alice'); assert.equal(data().accounts.owner.following.users[0].handle, 'bob');
});
test('stop survives missed page messages and prevents second-list navigation', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'both' }); await ready();
  const id = job().id; await send({ type: 'XRB_SCAN_STOP' });
  const response = await send({ type: 'XRB_SCAN_BATCH', id, kind: 'followers', users: ['alice'] }, pageSender('followers')); assert.equal(response.stop, true);
  await send({ type: 'XRB_SCAN_DONE', id, kind: 'followers', users: [], outcome: 'review' }, pageSender('followers'));
  assert.equal(job().phase, 'stopped'); assert.equal(navigations.filter(nav => nav.id === 41).length, 1);
});
test('closing the scanner tab ends the job; messages from another tab cannot write data', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'followers' }); await ready();
  const response = await send({ type: 'XRB_SCAN_BATCH', id: job().id, kind: 'followers', users: ['wrong'] }, { ...pageSender('followers'), tab: { id: 999 } });
  assert.equal(response.stop, true); assert.equal(data(), undefined);
  events.removed(41); await flush(); assert.equal(job().phase, 'interrupted');
});
test('worker reads persisted session state and a new scan replaces stale list membership', async () => {
  reset();
  local['x-relationship-notebook-v1'] = { version: 1, accounts: {} };
  const { setList } = await import('../core.js'); setList(data(), 'owner', 'followers', ['old_user'], true);
  session['xrb-scan-job'] = { id: 'resumed', tabId: 41, owner: 'owner', kinds: ['followers'], index: 0, phase: 'running', counts: {}, results: [], written: false, updatedAt: Date.now() };
  await send({ type: 'XRB_SCAN_BATCH', id: 'resumed', kind: 'followers', users: [] }, pageSender('followers'));
  assert.equal(data().accounts.owner.followers.users[0].handle, 'old_user');
  await send({ type: 'XRB_SCAN_BATCH', id: 'resumed', kind: 'followers', users: ['new_user'] }, pageSender('followers'));
  assert.deepEqual(data().accounts.owner.followers.users.map(u => u.handle), ['new_user']);
  assert.equal(data().accounts.owner.followers.complete, false);
  session['xrb-scan-job'].updatedAt = Date.now() - 130000;
  await send({ type: 'XRB_SCAN_STATUS' }); assert.equal(job().phase, 'error');
});
test('a stalled first list does not block scanning the second and reports partial outcome', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'both' }); await ready();
  const id = job().id;
  await send({ type: 'XRB_SCAN_DONE', id, kind: 'followers', users: [], outcome: 'stalled', reason: 'no cards' }, pageSender('followers'));
  assert.equal(job().index, 1); await ready('following');
  await send({ type: 'XRB_SCAN_DONE', id, kind: 'following', users: ['alice'], outcome: 'review', reason: 'bottom' }, pageSender('following'));
  assert.equal(job().phase, 'partial'); assert.match(job().reason, /no cards/);
});
test('SPA navigation can report interruption without allowing unrelated page batches', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'followers' }); await ready();
  const sender = { ...pageSender('followers'), url: 'https://x.com/home' };
  const rejected = await send({ type: 'XRB_SCAN_BATCH', id: job().id, kind: 'followers', users: ['wrong'] }, sender);
  assert.equal(rejected.stop, true); assert.equal(data(), undefined);
  await send({ type: 'XRB_SCAN_DONE', id: job().id, kind: 'followers', users: [], outcome: 'interrupted', reason: 'route changed' }, sender);
  assert.equal(job().phase, 'interrupted');
});
test('serial data mutations preserve notes while scan batches are being saved', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'followers' }); await ready();
  const { updateState } = await import('../storage.js'); const { account } = await import('../core.js');
  await Promise.all([
    send({ type: 'XRB_SCAN_BATCH', id: job().id, kind: 'followers', users: ['alice'] }, pageSender('followers')),
    updateState(async state => { const owner = account(state, 'owner'); await new Promise(resolve => setTimeout(resolve, 5)); owner.notes.alice = { tag: 'friend', note: 'keep me' }; })
  ]);
  assert.equal(data().accounts.owner.followers.users[0].handle, 'alice');
  assert.equal(data().accounts.owner.notes.alice.note, 'keep me');
});
test('default scanning zoom is 25 percent and restores the original 125 percent at completion', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'followers' }); await ready();
  assert.equal(zoom, 0.25); assert.equal(zoomSettings.scope, 'per-tab');
  await send({ type: 'XRB_SCAN_DONE', id: job().id, kind: 'followers', users: ['alice'], outcome: 'review', reason: 'bottom' }, pageSender('followers'));
  assert.equal(zoom, 1.25); assert.equal(job().zoomRestore, null);
  assert.ok(zoomCalls.filter(call => 'factor' in call).every(call => call.scope === 'per-tab'));
});
test('stop restores zoom immediately even before the page acknowledges stopping', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'followers', zoomFactor: 0.67 }); await ready();
  assert.equal(zoom, 0.67); await send({ type: 'XRB_SCAN_STOP' }); assert.equal(zoom, 1.25);
});
test('both lists reapply temporary zoom after navigation and restore at the end', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'both', zoomFactor: 0.8 }); await ready();
  const id = job().id;
  await send({ type: 'XRB_SCAN_DONE', id, kind: 'followers', users: ['alice'], outcome: 'review', reason: 'bottom' }, pageSender('followers'));
  await ready('following'); assert.equal(zoom, 0.8);
  await send({ type: 'XRB_SCAN_DONE', id, kind: 'following', users: ['bob'], outcome: 'review', reason: 'bottom' }, pageSender('following'));
  assert.equal(zoom, 1.25);
  assert.equal(zoomCalls.filter(call => call.factor === 0.8).length, 2);
});
test('keep original zoom does not call zoom setters', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'followers', zoomFactor: 0 }); await ready();
  assert.equal(zoom, 1.25); assert.equal(zoomCalls.length, 0);
});
test('zoom errors fall back to the original scale without blocking card scanning', async () => {
  reset(); zoomFails = true; await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'followers' }); await ready();
  assert.equal(zoom, 1.25); assert.equal(injections.length, 1); assert.match(job().zoomWarning, /原比例扫描/);
});
test('a timeout restores zoom, while navigation never writes to per-origin zoom', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'followers' }); await ready();
  session['xrb-scan-job'].updatedAt = Date.now() - 130000; await send({ type: 'XRB_SCAN_STATUS' }); assert.equal(zoom, 1.25);
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'followers' }); await ready();
  zoomSettings = { mode: 'automatic', scope: 'per-origin' }; zoom = 0.9;
  const count = zoomCalls.length; events.updated(41, { status: 'loading' }); await flush();
  assert.equal(zoomCalls.length, count); assert.equal(zoom, 0.9);
});

test('profile totals are read in a separate tab and applied to both lists without resetting scan counts', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'both' });
  assert.equal(job().totalTabId, 42);
  assert.equal(navigations[0].url, 'https://x.com/owner/followers');
  assert.equal(navigations[1].url, 'https://x.com/owner');
  const profile = { ...pageSender('followers'), url: 'https://x.com/owner', tab: { id: 42 }, documentId: 'profile-doc' };
  await send({ type: 'XRB_SCAN_PAGE_READY' }, profile);
  assert.equal(injections[0].func.name, 'readProfileCounts');
  const totals = { followers: { count: 1563, approximate: false }, following: { count: 1800, approximate: true } };
  await send({ type: 'XRB_SCAN_PROFILE_TOTALS', id: job().id, totals }, { ...profile, documentId: 'wrong-document' });
  assert.equal(job().totals.followers, undefined);
  await send({ type: 'XRB_SCAN_PROFILE_TOTALS', id: job().id, totals }, profile);
  assert.deepEqual(job().totals, { followers: 1563, following: 1800 });
  assert.equal(job().totalApproximate.following, true);
  assert.equal(job().totalTabId, null); assert.deepEqual(job().counts, {});
  await ready(); assert.equal(job().phase, 'running');
});
test('stopping a scan closes the temporary totals reader and ignores its late response', async () => {
  reset(); await send({ type: 'XRB_SCAN_START', owner: 'owner', kind: 'followers' });
  const id = job().id;
  await send({ type: 'XRB_SCAN_STOP' }); assert.equal(job().totalTabId, null);
  await send({ type: 'XRB_SCAN_PROFILE_TOTALS', id, totals: { followers: { count: 99, approximate: false } } }, { ...pageSender('followers'), url: 'https://x.com/owner', tab: { id: 42 } });
  assert.deepEqual(job().totals, {});
});
