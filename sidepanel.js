import { createRefreshScheduler } from './ui-refresh.js';
import { mountScanControls } from './scan-controls.js';
import { readState, isExtension } from './storage.js';
import { progressModel, scanEstimate } from './progress-model.js';
import { renderAvatar } from './profile-ui.js';
let job = null, revision = 0, feedSignature = '';
const scheduleRefresh = createRefreshScheduler(refresh);
const $ = selector => document.querySelector(selector);
const node = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; };
function renderEstimate() {
  const model = scanEstimate(job);
  $('#meter-title').textContent = model.label;
  $('#meter-percent').textContent = model.percent === null ? '—' : `${model.percent}%`;
  if (model.percent === null) $('#scan-meter').removeAttribute('value'); else $('#scan-meter').value = model.percent;
  $('#scan-meter').classList.toggle('is-active', !!job && ['loading', 'running'].includes(job.phase));
  $('#meter-detail').textContent = model.detail; $('#meter-eta').textContent = model.eta; $('#meter-elapsed').textContent = model.elapsed;
}
async function refresh() {
  renderEstimate();
  const version = ++revision;
  try {
    const state = await readState(); if (version !== revision) return;
    const model = progressModel(job, state);
    $('#followers-count').textContent = model.followers.toLocaleString('zh-CN');
    $('#following-count').textContent = model.following.toLocaleString('zh-CN');
    $('#focus-scan').disabled = !isExtension || !job;
    $('#panel-state').textContent = job ? `@${model.owner} · 最近更新 ${new Date(job.updatedAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' })}` : '等待扫描任务';
    const signature = JSON.stringify([model.recent, model.results]);
    if (signature === feedSignature) return;
    feedSignature = signature;
    const feed = $('#recent-users'); feed.replaceChildren();
    if (!model.recent.length) feed.append(node('p', '采集到用户后会实时显示在这里。'));
    for (const user of model.recent) {
      const row = node('div', undefined, 'recent-user'); const identity = node('div');
      identity.append(node('strong', user.name), node('small', `@${user.handle}`));
      if (user.bio) { const bio = node('p', user.bio.slice(0, 120) + (user.bio.length > 120 ? '…' : ''), 'user-bio'); bio.title = user.bio; identity.append(bio); }
      row.append(renderAvatar(user), identity, node('span', user.kind === 'followers' ? '关注者' : '正在关注', 'list-kind')); feed.append(row);
    }
    $('#scan-results').replaceChildren(...model.results.map(result => node('div', `${result.kind === 'followers' ? '关注者' : '正在关注'} · ${result.count} 人：${result.reason}`, 'result-entry')));
  } catch (error) { $('#panel-state').textContent = error.message; }
}
await mountScanControls(() => job?.owner || '', next => { job = next || null; scheduleRefresh(); });
if (isExtension) chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local') scheduleRefresh(); });
$('#focus-scan').onclick = async () => { try { if (job) await chrome.tabs.update(job.tabId, { active: true }); } catch (error) { $('#panel-state').textContent = error.message; } };
$('#open-manager').onclick = async () => {
  try { if (isExtension) await chrome.tabs.create({ url: chrome.runtime.getURL('app.html') }); else location.href = 'app.html'; }
  catch (error) { $('#panel-state').textContent = error.message; }
};

setInterval(renderEstimate, 1000);
