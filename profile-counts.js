// Self-contained reader injected only into the requested account's profile.
export function readProfileCounts(config) {
  const valid = () => location.protocol === 'https:' && ['x.com', 'www.x.com'].includes(location.hostname) && location.pathname.toLowerCase().replace(/\/$/, '') === `/${config.owner}`;
  if (!valid() || globalThis.__xrbCounts === config.id) return;
  globalThis.__xrbCounts = config.id;
  let finished = false, scheduled = false, observer, timer;
  function parse(text) {
    const value = String(text || '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
    const exact = value.match(/^([\d,，\s]+)(?:\s*(?:followers|following|关注者|正在关注|粉丝|关注|跟隨者|跟随者))?$/i);
    if (exact) { const count = Number(exact[1].replace(/[,，\s]/g, '')); if (Number.isSafeInteger(count)) return { count, approximate: false }; }
    const short = value.match(/^(\d+(?:\.\d+)?)\s*(K|M|B|万|萬|亿|億)(?:\s*(?:followers|following|关注者|正在关注|粉丝|关注|跟隨者|跟随者))?$/i);
    if (!short) return null;
    const unit = { k: 1000, m: 1000000, b: 1000000000, 万: 10000, 萬: 10000, 亿: 100000000, 億: 100000000 }[short[2].toLowerCase()];
    return { count: Math.round(Number(short[1]) * unit), approximate: true };
  }
  function counts() {
    const result = {};
    for (const link of document.querySelectorAll('main a[href]')) {
      if (link.closest('[data-testid="UserCell"],article')) continue;
      let path;
      try { const url = new URL(link.getAttribute('href'), location.href); if (url.origin !== location.origin) continue; path = url.pathname.toLowerCase().replace(/\/$/, ''); } catch { continue; }
      let kind = path === `/${config.owner}/following` ? 'following' : path === `/${config.owner}/followers` ? 'followers' : null;
      // Some X profiles route their total Followers metric to this tab.
      if (!kind && path === `/${config.owner}/verified_followers` && /followers|粉丝|关注者|跟隨者|跟随者/i.test(link.textContent) && !/verified|认证|認證/i.test(link.textContent)) kind = 'followers';
      if (!kind) continue;
      const candidates = [...link.querySelectorAll('[title],span')].map(node => node.getAttribute('title') || node.textContent);
      candidates.push(link.getAttribute('title'), link.getAttribute('aria-label'), link.textContent);
      for (const candidate of candidates) {
        const metric = parse(candidate);
        if (!metric || metric.count < 0 || metric.count > 1000000000) continue;
        if (!result[kind] || (result[kind].approximate && !metric.approximate)) result[kind] = metric;
      }
    }
    return result;
  }
  async function finish(values) {
    if (finished) return;
    finished = true; observer?.disconnect(); clearTimeout(timer);
    try { await chrome.runtime.sendMessage({ type: 'XRB_SCAN_PROFILE_TOTALS', id: config.id, totals: values }); } catch { /* Task may have ended. */ }
  }
  function inspect() {
    if (!valid()) { void finish({}); return; }
    const values = counts();
    if (values.followers && values.following) void finish(values);
  }
  observer = new MutationObserver(() => { if (!scheduled) { scheduled = true; queueMicrotask(() => { scheduled = false; if (!finished) inspect(); }); } });
  observer.observe(document.querySelector('main') || document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'href'] });
  timer = setTimeout(() => void finish(valid() ? counts() : {}), 6000);
  inspect();
}
