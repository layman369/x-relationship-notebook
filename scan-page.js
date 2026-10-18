// Self-contained: Chrome serializes this function into the X tab's isolated world.
export function scanPage(config) {
  const expected = `/${config.owner}/${config.kind}`;
  const atExpectedPage = () => location.protocol === 'https:' && ['x.com', 'www.x.com'].includes(location.hostname) && location.pathname.toLowerCase().replace(/\/$/, '') === expected;
  if (!atExpectedPage()) throw new Error('页面不是目标名单，请确认已登录且有访问权限');
  if (globalThis.__xrbScan?.id === config.id && globalThis.__xrbScan?.kind === config.kind) return;
  if (globalThis.__xrbScan?.running) throw new Error('此页面已有扫描任务');
  const token = { id: config.id, kind: config.kind, running: true, stopped: false };
  globalThis.__xrbScan = token;
  let interruptWait = null, contentChanged = null;
  const onMessage = (message, _sender, respond) => {
    if (message.type === 'XRB_STOP_PAGE' && message.id === config.id) { token.stopped = true; interruptWait?.(); respond({ ok: true }); }
  };
  chrome.runtime.onMessage.addListener(onMessage);
  const users = new Map();
  let pending = new Map();
  let observer, timeline, queued = false, discover = true;
  const dirtyCells = new Set();
  const cellSelector = '[data-testid="UserCell"]';
  let lastSavedAt = 0, lastMessageAt = 0;
  const getTimeline = () => document.querySelector('main [data-testid="primaryColumn"] [aria-label^="Timeline:"]')
    || document.querySelector('main [data-testid="primaryColumn"] section') || document.querySelector('main section');
  function markNode(node, descendants, scope, removed = false) {
    const element = node?.nodeType === 3 ? node.parentElement : node;
    const cell = element?.closest?.(cellSelector);
    if (cell && (removed || scope.contains(cell))) dirtyCells.add(cell);
    if (descendants) for (const child of element?.querySelectorAll?.(cellSelector) || []) {
      if (removed || scope.contains(child)) dirtyCells.add(child);
    }
  }
  function changed(records) {
    const current = getTimeline();
    if (current !== timeline) discover = true;
    if (!records) discover = true;
    for (const record of records || []) {
      if (!current || !(current === record.target || current.contains(record.target) || record.target.contains?.(current))) continue;
      markNode(record.target, false, current);
      for (const node of record.addedNodes || []) markNode(node, true, current);
      // Removed cards can still contain profiles never painted in the viewport.
      const removedFromList = current === record.target || current.contains(record.target);
      for (const node of record.removedNodes || []) markNode(node, true, current, removedFromList);
    }
    if (!queued) { queued = true; queueMicrotask(() => { queued = false; collect(); }); }
  }
  function biographyText(node) {
    if (!node.childNodes?.length) return node.innerText || node.textContent || '';
    let text = '';
    for (const child of node.childNodes) {
      if (child.nodeType === 3) text += child.nodeValue || '';
      else if (child.tagName === 'IMG') text += child.getAttribute('alt') || '';
      else if (child.tagName === 'BR') text += '\n';
      else text += biographyText(child);
    }
    return text;
  }
  function collect() {
    if (!atExpectedPage()) return;
    const current = getTimeline();
    if (discover || current !== timeline) {
      for (const cell of current?.querySelectorAll(cellSelector) || []) dirtyCells.add(cell);
      discover = false; timeline = current;
    }
    const cells = [...dirtyCells]; dirtyCells.clear();
    for (const cell of cells) {
      const links = [...cell.querySelectorAll('a[href]')];
      const profileLinks = links.filter(a => /^\/[a-zA-Z0-9_]{1,15}\/?$/.test(a.getAttribute('href') || ''));
      const link = profileLinks.find(a => /@[a-zA-Z0-9_]+/.test(a.textContent));
      if (!link) continue;
      const handle = link.getAttribute('href').replace(/^\/|\/$/g, '').toLowerCase();
      if (!users.has(handle) && users.size >= 10000) continue;
      const nameLink = profileLinks.find(a => a.getAttribute('href').replace(/\/$/, '').toLowerCase() === `/${handle}` && a.textContent.trim() && !a.textContent.includes('@'));
      const previous = users.get(handle);
      const user = { ...previous, handle, name: (nameLink?.textContent.trim() || previous?.name || handle).slice(0, 100) };
      const avatar = cell.querySelector('[data-testid^="UserAvatar-Container"] img')
        || profileLinks.flatMap(a => [...a.querySelectorAll('img')]).find(img => {
          try { const url = new URL(img.currentSrc || img.src); return url.hostname === 'pbs.twimg.com' && /^\/(profile_images|default_profile_images)\//.test(url.pathname); } catch { return false; }
        });
      if (avatar) {
        try {
          const url = new URL(avatar.currentSrc || avatar.src);
          if (url.protocol === 'https:' && url.hostname === 'pbs.twimg.com' && !url.username && !url.password && !url.port && /^\/(profile_images|default_profile_images)\//.test(url.pathname)) user.avatarUrl = url.href.slice(0, 2048);
        } catch { /* Leave the previous avatar when the page image is not ready. */ }
      }
      const description = cell.querySelector('[data-testid="UserDescription"]')
        || [...cell.querySelectorAll('div[dir="auto"]')].filter(node => {
          const text = biographyText(node).trim();
          const interactive = node.closest('a,button,[role="button"]');
          const insideControl = interactive && interactive !== cell && cell.contains(interactive);
          return text && !insideControl && !node.contains(link) && !(nameLink && node.contains(nameLink))
            && !node.querySelector('button,[role="button"]') && !/^(Follows you|关注了你|跟隨你)$/i.test(text);
        }).sort((a, b) => biographyText(b).length - biographyText(a).length)[0];
      if (description) user.bio = biographyText(description).trim().slice(0, 1000);
      if (previous && previous.name === user.name && previous.avatarUrl === user.avatarUrl && previous.bio === user.bio) continue;
      users.set(handle, user); pending.set(handle, user);
      if (!previous) contentChanged?.();
    }
  }
  async function send(type, extra = {}) {
    const now = Date.now();
    const terminal = type === 'XRB_SCAN_DONE';
    // Small batches share a write; no-data cycles only send a 10-second heartbeat.
    if (!terminal && lastMessageAt && (pending.size ? pending.size < 100 && now - lastSavedAt < 2500 : now - lastMessageAt < 10000)) return;
    const batch = [...pending.values()];
    const countLink = document.querySelector(`main a[href="/${config.owner}/${config.kind}"]`);
    const countText = countLink?.querySelector('[title]')?.getAttribute('title') || countLink?.textContent || '';
    const match = countText.trim().match(/^([\d,，\s]+)(?:\s*(?:Followers|Following|关注者|正在关注|粉丝|关注))?$/i);
    const total = match ? Number(match[1].replace(/[,，\s]/g, '')) : null;
    const response = await chrome.runtime.sendMessage({ type, id: config.id, kind: config.kind, users: batch, total, ...extra });
    if (!response?.ok) throw new Error(response?.error || '扩展已断开，请重新加载扩展后再试');
    // Remove only acknowledged items: the observer may add cards while awaiting storage.
    for (const user of batch) if (pending.get(user.handle) === user) pending.delete(user.handle);
    lastMessageAt = Date.now();
    if (batch.length) lastSavedAt = lastMessageAt;
    if (response.stop) token.stopped = true;
  }
  function waitForContent(maxWait) {
    if (token.stopped) return Promise.resolve();
    return new Promise(resolve => {
      const started = Date.now();
      let settled;
      const finish = () => {
        clearTimeout(deadline); clearTimeout(settled);
        interruptWait = null; contentChanged = null; resolve();
      };
      const deadline = setTimeout(finish, maxWait);
      interruptWait = finish;
      contentChanged = () => {
        clearTimeout(settled);
        // Let a burst of cards settle, retaining at least 400 ms between scrolls.
        settled = setTimeout(finish, Math.max(120, 400 - (Date.now() - started)));
      };
    });
  }
  async function run() {
    let outcome = 'error', reason = '';
    try {
      if (!atExpectedPage()) throw new Error('页面不是目标名单，可能需要登录或没有访问权限');
      const scroller = document.scrollingElement;
      scroller.scrollTo({ top: 0, behavior: 'instant' });
      observer = new MutationObserver(changed);
      observer.observe(document.querySelector('main') || document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src', 'srcset', 'href'] });
      let previousCount = 0, previousHeight = scroller.scrollHeight, fastRounds = 0;
      let lastProgressAt = Date.now(), bottomSince = null, bottomRescanned = false;
      const started = Date.now();
      for (;;) {
        if (!atExpectedPage()) { outcome = 'interrupted'; reason = '页面已切换，保留已采集的部分名单'; break; }
        collect();
        await send('XRB_SCAN_BATCH');

        if (token.stopped) { outcome = 'stopped'; reason = '已停止，已保存部分名单'; break; }
        if (users.size >= 10000 || Date.now() - started > 10 * 60 * 1000) { outcome = 'limit'; reason = '达到单份名单 10000 人或 10 分钟上限，已保存部分名单'; break; }
        const now = Date.now();
        const gained = users.size - previousCount;
        const progressed = gained > 0 || scroller.scrollHeight !== previousHeight;
        if (progressed) { lastProgressAt = now; bottomSince = null; bottomRescanned = false; }
        const idleMs = now - lastProgressAt;
        const bottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 8;
        if (bottom && bottomSince === null) bottomSince = now;
        if (bottom && users.size > 0 && now - bottomSince >= 12000) { outcome = 'review'; reason = '到达页面底部且约 12 秒无新增，已补扫，请核对名单完整性'; break; }
        if (idleMs >= 30000) { outcome = 'stalled'; reason = users.size ? '列表约 30 秒没有新增，可能加载受限；已保存部分名单' : '没有识别到用户卡片：可能为零用户、权限限制、登录失效或页面结构变化；未覆盖旧名单'; break; }
        fastRounds = gained > 0 ? fastRounds + 1 : 0;
        let delay = fastRounds >= 4 ? 450 : fastRounds >= 2 ? 600 : 800;
        let distance = fastRounds >= 4 ? 0.9 : fastRounds >= 2 ? 0.85 : 0.8;
        if (!gained) {
          delay = idleMs >= 10000 ? 3000 : idleMs >= 4000 ? 2200 : idleMs >= 1500 ? 1500 : 900;
          distance = idleMs >= 4000 ? 0.5 : 0.65;
        }
        if (timeline?.querySelector?.('[role="progressbar"]')) { delay = Math.max(delay, 1500); distance = 0.5; fastRounds = 0; }
        previousCount = users.size; previousHeight = scroller.scrollHeight;
        if (bottom && users.size && now - bottomSince >= 6000 && !bottomRescanned) {
          // One overlapping pass near the bottom, without restarting the quiet deadline.
          bottomRescanned = true; discover = true;
          scroller.scrollBy({ top: -Math.max(50, scroller.clientHeight * 0.3), behavior: 'instant' });
          await waitForContent(1200);
        } else {
          scroller.scrollBy({ top: Math.max(100, scroller.clientHeight * distance), behavior: 'instant' });
          await waitForContent(bottom ? Math.max(1500, delay) : delay);
        }
      }
      changed(observer?.takeRecords?.() || []); collect(); observer?.disconnect();
      await send('XRB_SCAN_DONE', { outcome, reason });

    } catch (error) {
      collect(); observer?.disconnect();

      try { await send('XRB_SCAN_DONE', { outcome: 'error', reason: error.message }); } catch { /* Visible panel reports disconnection. */ }
    } finally {
      observer?.disconnect(); token.running = false;
      chrome.runtime.onMessage.removeListener(onMessage);

    }
  }
  void run();
}
