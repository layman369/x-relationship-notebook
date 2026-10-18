import { handle, normalizeUsers, setList, recordScan } from './core.js';
import { updateState, readState } from './storage.js';
import { scanPage } from './scan-page.js';
import { readProfileCounts } from './profile-counts.js';
const JOB_KEY = 'xrb-scan-job';
const active = job => job && ['loading', 'running'].includes(job.phase);
const readJob = async () => (await chrome.storage.session.get(JOB_KEY))[JOB_KEY];
const writeJob = async job => chrome.storage.session.set({ [JOB_KEY]: job });
const control = action => navigator.locks.request('xrb-scan-control', action);
const urlFor = job => `https://x.com/${job.owner}/${job.kinds[job.index]}`;
async function saveScanSummary(job) {
  const endedAt = Date.now(); job.updatedAt = endedAt;
  await updateState(state => recordScan(state, job.owner, job, endedAt));
}
async function closeTotalsTab(job) {
  const id = job.totalTabId; job.totalTabId = null;
  if (Number.isInteger(id)) { try { await chrome.tabs.remove(id); } catch { /* Already closed. */ } }
}
function isProfile(sender, job) {
  if (!job || sender.id !== chrome.runtime.id || sender.tab?.id !== job.totalTabId || sender.frameId !== 0) return false;
  try { const url = new URL(sender.url); return url.protocol === 'https:' && ['x.com', 'www.x.com'].includes(url.hostname) && url.pathname.toLowerCase().replace(/\/$/, '') === `/${job.owner}`; } catch { return false; }
}
function trustedUI(sender) { return sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL('')); }
function matchesTarget(sender, job) {
  if (!job || sender.id !== chrome.runtime.id || sender.tab?.id !== job.tabId || sender.frameId !== 0) return false;
  try {
    const url = new URL(sender.url);
    return url.protocol === 'https:' && ['x.com', 'www.x.com'].includes(url.hostname)
      && url.pathname.toLowerCase().replace(/\/$/, '') === `/${job.owner}/${job.kinds[job.index]}`;
  } catch { return false; }
}
function trustedPage(sender, job, message) {
  if (!active(job) || job.phase !== 'running' || sender.tab?.id !== job.tabId || sender.frameId !== 0 || message.id !== job.id || message.kind !== job.kinds[job.index]) return false;
  if (job.documentId && sender.documentId !== job.documentId) return false;
  const url = new URL(sender.url || 'https://invalid.local');
  return url.protocol === 'https:' && ['x.com', 'www.x.com'].includes(url.hostname)
    && (url.pathname.toLowerCase().replace(/\/$/, '') === `/${job.owner}/${message.kind}` || (message.type === 'XRB_SCAN_DONE' && message.outcome === 'interrupted'));
}
async function restoreZoom(job) {
  if (!job.zoomRestore) return;
  try {
    // Navigation resets per-tab zoom. Never write a zoom factor in per-origin mode.
    const settings = await chrome.tabs.getZoomSettings(job.tabId);
    if (settings.mode === 'automatic' && settings.scope === 'per-tab') await chrome.tabs.setZoom(job.tabId, job.zoomRestore.factor);
    job.zoomRestore = null;
  } catch (error) { job.zoomWarning = `原缩放恢复失败，可按 Ctrl+0 恢复默认比例：${error.message}`; }
}
async function prepareZoom(job) {
  if (!job.zoomFactor) return;
  try {
    const factor = await chrome.tabs.getZoom(job.tabId);
    await chrome.tabs.setZoomSettings(job.tabId, { mode: 'automatic', scope: 'per-tab' });
    job.zoomRestore = { factor };
    // Save restoration information before actually reducing the zoom.
    await writeJob(job);
    await chrome.tabs.setZoom(job.tabId, job.zoomFactor);
    job.zoomWarning = '';
  } catch (error) {
    await restoreZoom(job);
    job.zoomWarning = `临时缩放未生效，继续按原比例扫描：${error.message}`;
  }
}
async function fail(job, reason) {
  await restoreZoom(job);
  await closeTotalsTab(job);
  job.phase = 'error'; job.reason = reason; await saveScanSummary(job); await writeJob(job);
}
async function freshJob() {
  const job = await readJob();
  if (active(job) && Date.now() - job.updatedAt > 120000) await fail(job, '超过两分钟未收到进度，任务已中断；已保存的部分名单保留');
  return job;
}
async function receive(message, sender) {
  return control(async () => {
    if (message.type === 'XRB_SCAN_PROFILE_TOTALS') {
      const job = await readJob();
      if (!active(job) || !isProfile(sender, job) || message.id !== job.id || !job.totalDocumentId || sender.documentId !== job.totalDocumentId) return { ok: true };
      job.totals ||= {}; job.totalApproximate ||= {};
      for (const kind of ['followers', 'following']) {
        const metric = message.totals?.[kind];
        if (!Number.isSafeInteger(metric?.count) || metric.count < 0 || metric.count > 1000000000 || typeof metric.approximate !== 'boolean') continue;
        job.profileTotals ||= {};
        job.profileTotals[kind] = { count: metric.count, approximate: metric.approximate, readAt: new Date().toISOString() };
        if (job.totals[kind] !== undefined && !job.totalApproximate[kind] && metric.approximate) continue;
        job.totals[kind] = metric.count; job.totalApproximate[kind] = metric.approximate;
      }
      await closeTotalsTab(job); await writeJob(job); return { ok: true };
    }
    if (message.type === 'XRB_SCAN_PAGE_READY') {
      const job = await readJob();
      if (active(job) && sender.tab?.id === job.totalTabId) {
        if (!isProfile(sender, job) || !sender.documentId) { await closeTotalsTab(job); await writeJob(job); return { ok: true }; }
        if (job.totalDocumentId) return { ok: true };
        job.totalDocumentId = sender.documentId; await writeJob(job);
        try { await chrome.scripting.executeScript({ target: { tabId: job.totalTabId, documentIds: [sender.documentId] }, func: readProfileCounts, args: [{ id: job.id, owner: job.owner }] }); }
        catch { await closeTotalsTab(job); await writeJob(job); }
        return { ok: true };
      }
      if (!active(job) || sender.id !== chrome.runtime.id || sender.tab?.id !== job.tabId || sender.frameId !== 0) return { ok: true };
      if (job.phase === 'running') return { ok: true };
      if (!matchesTarget(sender, job)) {
        await fail(job, 'X 页面未进入目标名单，请确认已登录、可访问该名单，并完成页面上的验证后重试');
        return { ok: true };
      }
      if (!sender.documentId) throw new Error('无法识别目标文档，请更新 Chrome / Edge 后重试');
      job.phase = 'running'; job.documentId = sender.documentId; job.updatedAt = Date.now(); job.reason = '自动滚动采集中';
      job.kindStartedAt = Date.now();
      job.lastGrowthAt = null;
      await writeJob(job);
      try {
        await prepareZoom(job);
        await writeJob(job);
        await chrome.scripting.executeScript({ target: { tabId: job.tabId, documentIds: [sender.documentId] }, func: scanPage, args: [{ id: job.id, owner: job.owner, kind: job.kinds[job.index] }] });
      } catch (error) {
        await fail(job, `无法开始扫描。请确认扩展已重新加载并允许访问 x.com，保持目标名单页打开后重试。浏览器信息：${error.message}`);
      }
      return { ok: true };
    }
    if (['XRB_SCAN_START', 'XRB_SCAN_STOP', 'XRB_SCAN_STATUS'].includes(message.type)) {
      if (!trustedUI(sender)) throw new Error('只能从扩展界面操作扫描');
      const job = await freshJob();
      if (message.type === 'XRB_SCAN_STATUS') return { ok: true, job };
      if (message.type === 'XRB_SCAN_STOP') {
        if (active(job)) {
          await closeTotalsTab(job);
          job.stopRequested = true; job.updatedAt = Date.now();
          if (job.phase === 'loading') { job.phase = 'stopped'; job.reason = '已取消等待加载'; await saveScanSummary(job); }
          await writeJob(job);
          try { await chrome.tabs.sendMessage(job.tabId, { type: 'XRB_STOP_PAGE', id: job.id }); } catch { /* Loading tab has no listener. */ }
          await restoreZoom(job); await writeJob(job);
        }
        return { ok: true, job };
      }
      if (active(job)) throw new Error('已有扫描正在进行，请先停止');
      const owner = handle(message.owner);
      const kinds = message.kind === 'both' ? ['followers', 'following'] : [message.kind];
      if (kinds.some(k => !['followers', 'following'].includes(k))) throw new Error('名单类型错误');
      const zoomFactor = message.zoomFactor === undefined ? 0.25 : Number(message.zoomFactor);
      if (![0, 0.25, 0.5, 0.67, 0.8].includes(zoomFactor)) throw new Error('扫描缩放比例不支持');
      if (message.windowId !== undefined && (!Number.isInteger(message.windowId) || message.windowId < 0)) throw new Error('浏览器窗口编号无效');
      if (!await chrome.permissions.contains({ origins: ['https://x.com/*'] })) throw new Error('尚未获得 X 页面访问权限。请在扩展详情的“网站访问权限”中允许 x.com，然后重新扫描');
      const tab = await chrome.tabs.create({ url: 'about:blank', active: true, ...(message.windowId === undefined ? {} : { windowId: message.windowId }) });
      const previous = (await readState()).accounts[owner];
      const expectedCounts = Object.fromEntries(kinds.filter(kind => previous?.[kind]?.complete && previous[kind].users.length).map(kind => [kind, previous[kind].users.length]));
      const next = { id: crypto.randomUUID(), tabId: tab.id, owner, kinds, index: 0, phase: 'loading', zoomFactor, stopRequested: false, counts: {}, totals: {}, expectedCounts, results: [], written: false, startedAt: Date.now(), updatedAt: Date.now(), reason: '正在打开目标名单' };
      await writeJob(next);
      try { await chrome.tabs.update(tab.id, { url: urlFor(next) }); } catch (error) { await fail(next, error.message); throw error; }
      try {
        const profileTab = await chrome.tabs.create({ url: 'about:blank', active: false, ...(message.windowId === undefined ? {} : { windowId: message.windowId }) });
        next.totalTabId = profileTab.id; await writeJob(next);
        await chrome.tabs.update(profileTab.id, { url: `https://x.com/${owner}` });
      } catch { await closeTotalsTab(next); await writeJob(next); }
      return { ok: true, job: next };
    }
    if (!['XRB_SCAN_BATCH', 'XRB_SCAN_DONE'].includes(message.type)) throw new Error('未知扫描消息');
    const job = await readJob();
    if (!trustedPage(sender, job, message)) return { ok: true, stop: true };
    const kind = job.kinds[job.index];
    if (Number.isSafeInteger(message.total) && message.total > 0 && message.total <= 1000000000) {
      job.totals ||= {}; job.totals[kind] = message.total;
      job.totalApproximate ||= {}; job.totalApproximate[kind] = false;
    }
    const users = normalizeUsers(message.users);
    if (users.length > 10000) throw new Error('单次采集数据超过上限');
    if (users.length) {
      // Preserve absent profile fields; pre-normalization would turn them into empty strings.
      const state = await updateState(state => setList(state, job.owner, kind, message.users, false, job.written));
      const count = state.accounts[job.owner][kind].users.length;
      if (count > (job.counts[kind] || 0)) job.lastGrowthAt = Date.now();
      job.counts[kind] = count;
      job.written = true;
    }
    job.updatedAt = Date.now();
    if (message.type === 'XRB_SCAN_DONE') {
      await restoreZoom(job);
      const outcome = job.stopRequested ? 'stopped' : message.outcome;
      const reason = job.stopRequested ? '已停止，已保存部分名单' : String(message.reason || '').slice(0, 300);
      job.results.push({ kind, count: job.counts[kind] || 0, outcome, reason, durationMs: Math.max(0, Date.now() - (job.kindStartedAt || job.startedAt || Date.now())) });
      if (['review', 'stalled', 'limit'].includes(outcome) && job.index + 1 < job.kinds.length) {
        job.index++; job.kindStartedAt = null; job.lastGrowthAt = null; job.phase = 'loading'; job.documentId = null; job.written = false; job.reason = '正在打开下一份名单';
        await writeJob(job);
        try { await chrome.tabs.update(job.tabId, { url: urlFor(job) }); } catch (error) { await fail(job, error.message); }
      } else {
        await closeTotalsTab(job);
        job.phase = ['review', 'stopped', 'stalled', 'limit', 'interrupted', 'error'].includes(outcome) ? outcome : 'error';
        if (job.results.length > 1 && outcome === 'review' && job.results.some(result => result.outcome !== 'review')) job.phase = 'partial';
        job.reason = job.results.map(result => `${result.kind === 'followers' ? '关注者' : '正在关注'}：${result.reason}`).join('；'); await saveScanSummary(job); await writeJob(job);
      }
    } else await writeJob(job);
    return { ok: true, stop: job.stopRequested };
  });
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message?.type?.startsWith('XRB_SCAN_')) return;
  (async () => {
    try { respond(await receive(message, sender)); } catch (error) { respond({ ok: false, error: error.message }); }
  })();
  return true;
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== 'loading') return;
  void control(async () => {
    const job = await readJob();
    if (!active(job) || job.tabId !== tabId) return;
    if (job.phase === 'running') await fail(job, '扫描页面被刷新或跳转，已保留部分名单，请重新开始');
  }).catch(console.error);
});
chrome.tabs.onRemoved.addListener(tabId => {
  void control(async () => {
    const job = await readJob();
    if (active(job) && job.tabId === tabId) { await closeTotalsTab(job); job.zoomRestore = null; job.phase = 'interrupted'; job.reason = '扫描标签页已关闭，已保存部分名单'; await saveScanSummary(job); await writeJob(job); }
    else if (job?.totalTabId === tabId) { job.totalTabId = null; await writeJob(job); }
  }).catch(console.error);
});
