import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { scanPage } from '../scan-page.js';
async function scanFixture(pages, options = {}) {
  let page = 0, observer, finish, failed = false, scrolls = 0;
  let clockNow = 100000;
  const waits = [], steps = [], timers = new Map();
  let timerId = 0, pumping = false, loadQueued = false, delayedOnce = false, transientOnce = false;
  function pump() {
    if (pumping || !timers.size) return;
    pumping = true;
    setTimeout(() => {
      pumping = false;
      const entry = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
      if (entry) { const [id, timer] = entry; timers.delete(id); clockNow = Math.max(clockNow, timer.due); timer.callback(); }
      pump();
    }, 0);
  }
  function later(callback, delay) {
    waits.push(delay); const id = ++timerId;
    timers.set(id, { callback, due: clockNow + delay }); pump(); return id;
  }
  class FixtureDate extends Date { static now() { return clockNow; } }
  const messages = [], listeners = new Set();
  const cardCache = new Map(), parses = new Map();
  const finished = new Promise(resolve => { finish = resolve; });
  const location = { protocol: 'https:', hostname: 'x.com', pathname: '/owner/followers' };
  const node = () => ({ style: {}, append() {}, setAttribute() {}, attachShadow: () => node(), remove() {} });
  const card = item => {
    if (cardCache.has(item)) return cardCache.get(item);
    const person = typeof item === 'string' ? { handle: item } : item;
    const image = person.avatarUrl ? { src: person.avatarUrl, currentSrc: person.avatarUrl } : null;
    let cell;
    const description = Object.hasOwn(person, 'bio') ? { get innerText() { return person.bio; }, get textContent() { return person.bio; }, closest: () => options.clickableCard ? cell : null, contains: () => false, querySelector: () => null } : null;
    if (description && person.emoji) description.childNodes = [{ nodeType: 3, nodeValue: person.bio }, { nodeType: 1, tagName: 'IMG', getAttribute: () => person.emoji }];
    const links = [
      { textContent: `@${person.handle}`, getAttribute: () => `/${person.handle}`, querySelectorAll: () => [] },
      { textContent: `Name ${person.handle}`, getAttribute: () => `/${person.handle}`, querySelectorAll: () => options.fallbackAvatar && image ? [image] : [] }
    ];
    cell = { outside: person.outside,
      querySelectorAll: selector => { if (selector === 'a[href]') { parses.set(person.handle, (parses.get(person.handle) || 0) + 1); return links; } return selector === 'div[dir="auto"]' && description ? [description] : []; },
      closest: () => cell, contains: other => other === cell || other === description,
      querySelector: selector => selector.includes('UserAvatar') ? (options.fallbackAvatar ? null : image) : selector.includes('UserDescription') ? (options.fallbackBio ? null : description) : null
    };
    cardCache.set(item, cell); return cell;
  };
  const timeline = { querySelectorAll: () => pages[page].map(card), contains: node => !node.outside, querySelector: () => options.loading || loadQueued ? {} : null };
  const notify = (records) => observer?.(options.realMutations ? (records || []) : undefined);
  const scroller = { scrollTop: 0, clientHeight: 500, scrollHeight: (pages.length - 1) * 325 + 500,
    scrollTo() { page = 0; this.scrollTop = 0; },
    scrollBy(optionsStep) {
      steps.push(optionsStep.top);
      const previousPage = page;
      if (options.delayedLoad && !delayedOnce && pages.length > 1) {
        delayedOnce = true; loadQueued = true;
        later(() => { loadQueued = false; page = 1; this.scrollTop = 325; notify([{ target: timeline, addedNodes: pages[page].map(card), removedNodes: [] }]); }, options.delayedLoad);
        return;
      }
      if (loadQueued) return;
      page = optionsStep.top < 0 ? Math.max(0, page - 1) : Math.min(page + 1, pages.length - 1); this.scrollTop = page * 325;
      if (options.transient && previousPage !== page && !transientOnce) {
        transientOnce = true;
        const transient = card({ handle: 'transient', bio: 'Removed before parsing' });
        notify([{ target: timeline, addedNodes: [transient], removedNodes: [] }, { target: timeline, addedNodes: [], removedNodes: [transient] }]);
      }
      notify(page !== previousPage ? [{ target: timeline, addedNodes: pages[page].map(card), removedNodes: [] }] : []);
      if (options.outsideMutation) notify([{ target: { outside: true, contains: () => true }, addedNodes: [card({ handle: 'outside', outside: true })], removedNodes: [] }]);
      if (options.stopDuringWait && previousPage === 0) later(() => { for (const listener of listeners) listener({ type: 'XRB_STOP_PAGE', id: 'fixture' }, {}, () => {}); }, 100);
      if (options.stopAfterScroll && ++scrolls === options.stopAfterScroll) for (const listener of listeners) listener({ type: 'XRB_STOP_PAGE', id: 'fixture' }, {}, () => {});
      if (options.redirect) location.pathname = '/home';
    }
  };
  const context = vm.createContext({
    Date: FixtureDate, clearTimeout: id => timers.delete(id), queueMicrotask, URL, location, document: { createElement: () => { throw new Error('Scanner must not create page overlays'); }, documentElement: node(), scrollingElement: scroller, querySelector: selector => selector.startsWith('main a[') ? (options.pageTotal ? { textContent: options.pageTotal, querySelector: () => null } : null) : timeline },
    MutationObserver: class { constructor(callback) { observer = callback; } observe() {} disconnect() { observer = null; } },
    setTimeout: later,
    chrome: { runtime: { onMessage: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) },
      async sendMessage(message) {
        messages.push(structuredClone(message));
        if (options.failFirstBatch && message.type === 'XRB_SCAN_BATCH' && !failed) { failed = true; return { ok: false, error: 'storage failed' }; }
        if (options.duringAck && messages.length === 1) { pages[page].push('late_user'); notify([{ target: timeline, addedNodes: [card('late_user')], removedNodes: [] }]); }
        if (options.duringAckProfile && messages.length === 1) { pages[page][0].bio = 'updated biography'; notify([{ target: card(pages[page][0]), addedNodes: [], removedNodes: [] }]); }
        if (message.type === 'XRB_SCAN_DONE') finish(structuredClone(message));
        return { ok: true, stop: options.stop && message.type === 'XRB_SCAN_BATCH' };
      }
    } }
  });
  vm.runInContext(`(${scanPage.toString()})({id:'fixture',owner:'owner',kind:'followers'})`, context);
  const result = await finished;
  await new Promise(resolve => setImmediate(resolve));
  return { result, messages, listeners, parses, waits, steps, elapsed: clockNow - 100000 };
}
test('auto scrolling retains users from virtualized cards and deduplicates overlaps', async () => {
  const { result, messages, listeners } = await scanFixture([['alice'], ['alice', 'bob'], ['carol']]);
  assert.equal(result.outcome, 'review');
  assert.deepEqual(messages.flatMap(m => m.users).map(u => u.handle).sort(), ['alice', 'bob', 'carol']);
  assert.equal(listeners.size, 0);
  assert.equal(messages.some(m => m.complete === true), false);
});
test('cards observed during a storage acknowledgement are retained for next batch', async () => {
  const { messages } = await scanFixture([['alice']], { duringAck: true });
  assert.deepEqual(messages.flatMap(m => m.users).map(u => u.handle), ['alice', 'late_user']);
});
test('stopping saves collected users and sends a terminal status', async () => {
  const { result, messages } = await scanFixture([['alice'], ['bob']], { stop: true });
  assert.equal(result.outcome, 'stopped');
  assert.deepEqual(messages.flatMap(m => m.users).map(u => u.handle), ['alice']);
});
test('storage failure retains unacknowledged batch for terminal retry', async () => {
  const { result } = await scanFixture([['alice']], { failFirstBatch: true });
  assert.equal(result.outcome, 'error'); assert.equal(result.reason, 'storage failed');
  assert.deepEqual(result.users.map(u => u.handle), ['alice']);
});
test('route changes interrupt instead of collecting a different account', async () => {
  const { result } = await scanFixture([['alice'], ['bob']], { redirect: true });
  assert.equal(result.outcome, 'interrupted');
});
test('unrecognized or empty list is stalled rather than a complete empty list', async () => {
  const { result } = await scanFixture([[]]);
  assert.equal(result.outcome, 'stalled'); assert.deepEqual(result.users, []);
});
test('scanner reads profile avatars and biographies from cards, including fallback markup', async () => {
  const avatar = 'https://pbs.twimg.com/profile_images/123/avatar_normal.jpg';
  for (const fallback of [false, true]) {
    const { messages } = await scanFixture([[{ handle: 'alice', avatarUrl: avatar, bio: 'Builder · 中文介绍 https://example.com' }]], { fallbackAvatar: fallback, fallbackBio: fallback });
    const user = messages.flatMap(message => message.users)[0];
    assert.equal(user.avatarUrl, avatar); assert.equal(user.bio, 'Builder · 中文介绍 https://example.com');
  }
});
test('a profile updated during acknowledgement is sent again instead of being discarded', async () => {
  const { messages } = await scanFixture([[{ handle: 'alice', bio: 'first biography' }]], { duringAckProfile: true });
  assert.deepEqual(messages.flatMap(message => message.users).map(user => user.bio), ['first biography', 'updated biography']);
});
test('biography image emoji is retained as text', async () => {
  const { messages } = await scanFixture([[{ handle: 'alice', bio: 'Builder ', emoji: '🚀' }]]);
  assert.equal(messages.flatMap(message => message.users)[0].bio, 'Builder 🚀');
});

test('fallback biography inside a clickable UserCell is still collected', async () => {
  const { messages } = await scanFixture([[{ handle: 'alice', bio: '中文 Crypto Builder' }]], { fallbackBio: true, clickableCard: true });
  assert.equal(messages.flatMap(message => message.users)[0].bio, '中文 Crypto Builder');
});

test('only exact page totals are sent; abbreviated counts are not treated as exact', async () => {
  for (const [text, expected] of [['1,234 Followers', 1234], ['1.2K Followers', null]]) {
    const { messages } = await scanFixture([['alice']], { pageTotal: text });
    assert.equal(messages[0].total, expected);
  }
});

test('unchanged cards are only revisited for the single bottom rescan', async () => {
  const { messages, parses } = await scanFixture([['alice']], { realMutations: true });
  assert.equal(parses.get('alice'), 2);
  assert.equal(messages.filter(message => message.type === 'XRB_SCAN_BATCH' && message.users.length).length, 1);
});
test('multiple mutations of one transient card are coalesced without losing its profile', async () => {
  const { messages, parses } = await scanFixture([['alice'], ['bob']], { realMutations: true, transient: true });
  assert.equal(parses.get('transient'), 1);
  assert.equal(messages.flatMap(message => message.users).find(user => user.handle === 'transient').bio, 'Removed before parsing');
});
test('queued changes during a write are saved by terminal flush in a merged small batch', async () => {
  const { messages } = await scanFixture([[{ handle: 'alice', bio: 'old' }]], { realMutations: true, duringAckProfile: true, stopAfterScroll: 1 });
  const terminal = messages.at(-1);
  assert.equal(terminal.type, 'XRB_SCAN_DONE');
  assert.equal(terminal.users[0].bio, 'updated biography');
  assert.equal(messages.filter(message => message.type === 'XRB_SCAN_BATCH' && message.users.length).length, 1);
});

test('100 queued profiles flush before the small-batch interval expires', async () => {
  const many = Array.from({ length: 100 }, (_, index) => `user${index}`);
  const { messages } = await scanFixture([['alice'], many], { realMutations: true });
  const batches = messages.filter(message => message.type === 'XRB_SCAN_BATCH' && message.users.length);
  assert.equal(batches.length, 2); assert.equal(batches[1].users.length, 100);
});
test('stop immediately commits a pending small batch without waiting for the interval', async () => {
  const { messages, result } = await scanFixture([['alice'], ['bob']], { realMutations: true, stopAfterScroll: 1 });
  assert.equal(result.outcome, 'stopped'); assert.deepEqual(result.users.map(user => user.handle), ['bob']);
  assert.deepEqual(messages.flatMap(message => message.users).map(user => user.handle), ['alice', 'bob']);
});

test('ancestor mutations cannot collect sidebar cards outside the target timeline', async () => {
  const { messages } = await scanFixture([['alice']], { realMutations: true, outsideMutation: true });
  assert.deepEqual(messages.flatMap(message => message.users).map(user => user.handle), ['alice']);
});

test('smooth loading increases the scroll overlap step and wakes before a fixed 1.5-second wait', async () => {
  const pages = Array.from({ length: 8 }, (_, index) => [`user${index}`]);
  const { steps, waits, messages } = await scanFixture(pages, { realMutations: true });
  assert.equal(steps[0], 400);
  assert.equal(steps.slice(0, 7).includes(450), true);
  assert.equal(waits.includes(400), true);
  assert.equal(steps.every(step => step < 0 || step <= 450), true);
  assert.equal(new Set(messages.flatMap(message => message.users).map(user => user.handle)).size, 8);
});
test('visible loading reduces scrolling to half a viewport', async () => {
  const { steps, waits } = await scanFixture([['alice'], ['bob'], ['carol']], { realMutations: true, loading: true });
  assert.equal(steps[0], 250); assert.equal(waits.includes(1500), true);
});
test('idle lists back off and use a real thirty-second stall deadline', async () => {
  const { result, elapsed, waits } = await scanFixture([[]], { realMutations: true });
  assert.equal(result.outcome, 'stalled'); assert.ok(elapsed >= 30000); assert.ok(elapsed < 34000);
  assert.equal(waits.includes(3000), true);
});
test('bottom review waits at least twelve seconds and performs exactly one overlapping rescan', async () => {
  const { result, elapsed, steps } = await scanFixture([['alice']], { realMutations: true });
  assert.equal(result.outcome, 'review'); assert.ok(elapsed >= 12000); assert.ok(elapsed < 17000);
  assert.equal(steps.filter(step => step < 0).length, 1);
});
test('delayed content is retained and restarts the quiet deadline', async () => {
  const { result, messages, elapsed } = await scanFixture([['alice'], ['bob']], { realMutations: true, delayedLoad: 5000 });
  assert.equal(result.outcome, 'review'); assert.ok(elapsed >= 17000);
  assert.deepEqual([...new Set(messages.flatMap(message => message.users).map(user => user.handle))], ['alice', 'bob']);
});
test('stop interrupts an active wait immediately and flushes the new users', async () => {
  const { result, elapsed, messages } = await scanFixture([['alice'], ['bob']], { realMutations: true, stopDuringWait: true });
  assert.equal(result.outcome, 'stopped'); assert.equal(elapsed, 100);
  assert.deepEqual(messages.flatMap(message => message.users).map(user => user.handle), ['alice', 'bob']);
});
