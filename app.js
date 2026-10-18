import { createRefreshScheduler } from './ui-refresh.js';
import { account, handle, setList, saveSnapshot, diffSnapshots, validateState, setIgnored, isFilteredOut, compareNotBack } from './core.js';
import { readState, updateState, isExtension } from './storage.js';
import { mountScanControls } from './scan-controls.js';
import { queryUsers, paginate } from './list-view.js';
import { renderAvatar } from './profile-ui.js';
const $ = s => document.querySelector(s);
let state = await readState();
let owner = Object.keys(state.accounts)[0] || '';
let view = 'all';
let editing = '', editingOwner = '';
let visible = [];
let scanBusy = false;
let comparisonBackup = null, comparisonFilename = '', comparison = null;
let currentPage = 1, pageSize = 20;
const labels = { mutual: '互相关注', notBack: '未回关我', fansOnly: '我未回关', followingUnknown: '我已关注 · 回关待确认', followerUnknown: '关注了我 · 关系待确认', unrecorded: '暂无当前名单记录' };
const viewNames = { all: '全部关系', following: '已收集关注', followers: '已收集粉丝', mutual: '互相关注', notBack: '未回关我的', fansOnly: '我未回关的', ignored: '已忽略用户', changes: '粉丝变化' };
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function status(message) { $('#status').textContent = message; }
async function persist(message, mutate) { state = await updateState(mutate); render(); if (message) status(message); }
async function safely(action) {
  try { await action(); } catch (error) { status(error.message); alert(error.message); }
}
function current() { return owner ? account(state, owner) : null; }
function resetListScroll() { $('#user-list-scroll').scrollTop = 0; }
function backToTop() {
  $('#title').setAttribute('tabindex', '-1');
  $('#title').focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}
function switchView(next) {
  view = next; currentPage = 1; $('#search').value = ''; render(); resetListScroll();
  if (next === 'all') { backToTop(); return; }
  const panel = $(next === 'changes' ? '#changes-panel' : '#list-panel');
  panel.setAttribute('tabindex', '-1');
  panel.focus({ preventScroll: true });
  $('#results-workspace').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}
function scanDuration(ms) {
  if (ms === null || ms === undefined) return '未记录';
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分 ${seconds % 60} 秒` : seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
}
function renderScanSummary(data) {
  const target = $('#scan-summary'); const wasOpen = target.querySelector('.scan-report')?.open ?? true; target.replaceChildren();
  const history = data?.scanHistory || [];
  if (!history.length) { target.append(element('p', '尚无已保存的扫描记录；下次扫描结束后将记录用时、主页人数与实际采集人数。', 'scan-summary-empty')); return; }
  const record = history.at(-1);
  const phases = { review: '已结束 · 待核对', stopped: '已停止', stalled: '加载停滞', limit: '达到上限', interrupted: '已中断', error: '扫描失败', partial: '部分结束' };
  const header = element('div', undefined, 'scan-summary-heading');
  header.append(element('strong', '最近一次扫描'), element('strong', `总用时 ${scanDuration(record.durationMs)}`, 'scan-duration'), element('span', phases[record.phase] || '已结束'));
  const range = element('p', `${new Date(record.startedAt).toLocaleString('zh-CN')} → ${new Date(record.finishedAt).toLocaleString('zh-CN')}`, 'scan-time-range');
  const comparison = element('div', undefined, 'scan-comparison');
  const metricText = metric => metric ? `${metric.approximate ? '约 ' : ''}${metric.count.toLocaleString('zh-CN')} 人` : '未获取';
  for (const [kind, label] of [['following', '正在关注'], ['followers', '关注者 / 粉丝']]) {
    const result = record.results.find(item => item.kind === kind), metric = record.profileTotals[kind];
    const card = element('div', undefined, 'scan-comparison-card');
    card.append(element('strong', label), element('p', `主页人数：${metricText(metric)}`), element('p', `实际采集：${result ? `${result.count.toLocaleString('zh-CN')} 人` : '本次未扫描'}`));
    if (metric?.readAt) card.append(element('small', `主页读取：${new Date(metric.readAt).toLocaleString('zh-CN')}`));
    if (result) {
      let difference = '主页人数未获取';
      if (metric) difference = metric.approximate ? '主页为缩写约数' : result.count === metric.count ? '人数一致，仍需核对完整性' : `比主页${result.count < metric.count ? '少' : '多'} ${Math.abs(result.count - metric.count).toLocaleString('zh-CN')} 人`;
      card.append(element('small', `用时 ${scanDuration(result.durationMs)} · ${phases[result.outcome] || '已结束'}`), element('small', difference));
    }
    comparison.append(card);
  }
  const report = element('details', undefined, 'scan-report'); report.open = wasOpen;
  report.append(element('summary', '查看人数对比与扫描记录'), range, comparison);
  target.append(header, report);
  if (record.reason) report.append(element('p', record.reason, 'scan-summary-reason'));
  if (history.length > 1) {
    const details = element('details', undefined, 'scan-history'); details.append(element('summary', `查看此前 ${history.length - 1} 次记录（最多保留 30 次）`));
    for (const past of history.slice(0, -1).reverse()) {
      const entry = element('div', undefined, 'scan-history-entry');
      entry.append(element('strong', `${new Date(past.finishedAt).toLocaleString('zh-CN')} · ${scanDuration(past.durationMs)} · ${phases[past.phase] || '已结束'}`));
      for (const [kind, label] of [['following', '正在关注'], ['followers', '粉丝']]) {
        const result = past.results.find(item => item.kind === kind);
        entry.append(element('p', `${label}：主页 ${metricText(past.profileTotals[kind])}；采集 ${result ? `${result.count} 人` : '未扫描'}${result ? `；用时 ${scanDuration(result.durationMs)}` : ''}`));
      }
      details.append(entry);
    }
    report.append(details);
  }
}
function renderCollectionTime(data) {
  const formatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short' });
  const dates = ['following', 'followers'].map(kind => {
    const value = data?.[kind]?.updatedAt;
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? date : null;
  });
  const knownDates = dates.filter(Boolean);
  const latest = knownDates.length ? new Date(Math.max(...knownDates.map(date => date.getTime()))) : null;
  const time = date => {
    const node = element('time', formatter.format(date)); node.dateTime = date.toISOString(); return node;
  };
  renderScanSummary(data);
  $('#collection-latest').replaceChildren(latest ? time(latest) : element('span', data ? '暂无可用采集时间' : '尚未采集数据'));
  $('#collection-details').replaceChildren();
  ['following', 'followers'].forEach((kind, index) => {
    const detail = element('div'); detail.append(element('strong', kind === 'following' ? '关注名单更新时间' : '粉丝名单更新时间'));
    detail.append(dates[index] ? time(dates[index]) : element('span', data?.[kind]?.users.length ? '历史数据未记录时间' : '尚无更新时间'));
    $('#collection-details').append(detail);
  });
}
function memoFilters() { return { tag: $('#tag-filter').value }; }
function resetMemoFilters() { $('#tag-filter').value = ''; }
function openMemo(username) {
  editing = username; editingOwner = owner;
  const memo = current()?.notes[username];
  $('#note-title').textContent = `@${username} 的标签与备注`;
  $('#note-tag').value = memo?.tag || ''; $('#note-text').value = memo?.note || '';
  $('#note-dialog').showModal(); $('#note-tag').focus();
}
function observationText(item) {
  return item ? `${Math.floor(item.durationMs / 86400000)} day` : '—';
}
function compareBothDirections(data, before) {
  const results = [], warnings = [];
  for (const relation of ['notBack', 'fansOnly']) {
    try { results.push(compareNotBack(data, before, relation)); }
    catch (error) { warnings.push(error.message); }
  }
  if (!results.length) throw new Error([...new Set(warnings)].join('；'));
  return { ...results[0], users: new Map(results.flatMap(result => [...result.users])), warnings };
}
function renderBackupComparison(data) {
  comparison = null;
  $('#backup-comparison').hidden = !comparisonBackup;
  $('#compare-backup').disabled = $('#select-comparison').disabled = !data || scanBusy;
  if (!comparisonBackup) return;
  const description = $('#comparison-description');
  try {
    if (scanBusy) throw new Error('扫描进行中，时间对比暂不可用；请在扫描结束并核对名单完整性后查看');
    comparison = compareBothDirections(data, comparisonBackup.accounts[owner]);
    const count = [...comparison.users].filter(([username, item]) => item && !isFilteredOut(data, username)).length;
    description.textContent = `${comparisonFilename} · @${owner} · ${new Date(comparison.startedAt).toLocaleString('zh-CN')} → ${new Date(comparison.endedAt).toLocaleString('zh-CN')} · 两次关系相同 ${count} 人（未回关我的 / 我未回关的，按忽略设置过滤）。${comparison.warnings.join("；")}`;
  } catch (error) { description.textContent = `${comparisonFilename} · ${error.message}`; }
}
function render() {
  $('#owner').replaceChildren();
  for (const key of Object.keys(state.accounts)) { const option = element('option', `@${key}`); option.value = key; $('#owner').append(option); }
  if (!owner) { const option = element('option', '尚未添加账号'); option.value = ''; $('#owner').append(option); }
  $('#owner').value = owner;
  const data = current();
  renderCollectionTime(data);
  renderBackupComparison(data);
  $('#ignored-nav-count').textContent = data?.ignored?.length || 0;
  const subtitles = { following: 'following', followers: 'followers', notBack: 'not following back', mutual: 'mutual connections', fansOnly: 'not followed back by me', ignored: 'ignored users' };
  $('#stats').replaceChildren();
  document.querySelectorAll('nav .nav[data-view]').forEach(nav => {
    const target = nav.dataset.view;
    if (!Object.hasOwn(subtitles, target)) return;
    const label = nav.querySelector('span').textContent;
    const missingList = target === 'notBack' && !data?.followers.complete ? '粉丝' : target === 'fansOnly' && !data?.following.complete ? '关注' : '';
    const value = missingList ? '—' : queryUsers(data, target).length;
    const badge = nav.querySelector('.nav-count');
    if (badge) { badge.textContent = String(value); badge.setAttribute('aria-label', missingList ? '人数待确认' : `${value} 人`); }
    const card = element('button', undefined, 'stat'); card.type = 'button'; card.dataset.view = target;
    card.classList.toggle('is-selected', view === target); card.setAttribute('aria-pressed', String(view === target));
    card.setAttribute('aria-label', `查看${label}`);
    card.onclick = () => switchView(target);
    card.append(element('div', label, 'stat-label'), element('strong', String(value)), element('span', missingList ? `需完整${missingList}名单` : subtitles[target], 'stat-sub'));
    $('#stats').append(card);
  });
  $('#health-text').textContent = '互关可据已有记录确认；判断未回关需要另一侧名单完整。完整性由你核对。';
  $('#completeness').replaceChildren();
  for (const [kind, title] of [['following', '关注'], ['followers', '粉丝']]) {
    const label = element('label', undefined, 'check');
    const check = element('input'); check.type = 'checkbox'; check.checked = data?.[kind].complete || false; check.disabled = !data || scanBusy;
    check.onchange = () => safely(async () => {
      const complete = check.checked;
      await persist(`${title}名单已标记为${complete ? '完整' : '部分'}列表`, latest => { account(latest, owner)[kind].complete = complete; });
    });
    label.append(check, document.createTextNode(`${title}名单完整`)); $('#completeness').append(label);
  }
  const ignoreLabel = element('label', undefined, 'check ignore-filter');
  const ignoreCheck = element('input'); ignoreCheck.type = 'checkbox'; ignoreCheck.checked = data?.hideIgnored !== false; ignoreCheck.disabled = !data;
  ignoreCheck.setAttribute('aria-label', '过滤忽略用户');
  ignoreCheck.onchange = () => safely(async () => {
    const checked = ignoreCheck.checked; currentPage = 1;
    await persist(checked ? '已过滤忽略用户' : '已显示忽略用户，可在列表中取消忽略', latest => { account(latest, owner).hideIgnored = checked; }); resetListScroll();
  });
  ignoreLabel.append(ignoreCheck, document.createTextNode(`过滤忽略用户（${data?.ignored?.length || 0}）`)); $('#completeness').append(ignoreLabel);
  const changes = view === 'changes';
  $('#list-panel').hidden = changes; $('#changes-panel').hidden = !changes;
  $('#list-title').textContent = viewNames[view];
  const filters = memoFilters();
  const tags = [...new Set(Object.values(data?.notes || {}).map(memo => String(memo.tag || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (filters.tag.startsWith('tag:') && !tags.includes(filters.tag.slice(4))) { filters.tag = ''; currentPage = 1; }
  $('#tag-filter').replaceChildren();
  for (const [value, title] of [['', '全部标签'], ...tags.map(tag => [`tag:${tag}`, tag])]) {
    const option = element('option', title); option.value = value; $('#tag-filter').append(option);
  }
  $('#tag-filter').value = filters.tag;
  const filtered = !!(filters.tag || $('#search').value.trim());
  $('#tag-filter').classList.toggle('is-filtered', !!filters.tag);
  visible = queryUsers(data, view, $('#search').value, filters);
  const pagination = paginate(visible, currentPage, pageSize); currentPage = pagination.page;
  $('#result-count').textContent = `共 ${visible.length} 位用户${filtered ? ' · 已筛选' : ''}${view === 'ignored' ? ' · 此页始终显示忽略名单，可直接取消忽略' : ''}`;
  $('#page-range').textContent = `第 ${pagination.start}–${pagination.end} 条，共 ${pagination.total} 条`;
  $('#page-info').textContent = `第 ${pagination.page} / ${pagination.pages} 页`;
  $('#page-number').value = currentPage; $('#page-number').max = pagination.pages; $('#page-number').disabled = !visible.length;
  $('#page-size').value = pageSize;
  $('#first-page').disabled = $('#prev-page').disabled = currentPage === 1;
  $('#next-page').disabled = $('#last-page').disabled = currentPage === pagination.pages;
  $('#rows').replaceChildren();
  for (const user of pagination.rows) {
    const row = element('tr');
    const ignored = (data.ignored || []).includes(user.handle); row.classList.toggle('ignored-user', ignored);
    const profile = element('td'); const identity = element('div', undefined, 'identity');
    const avatar = renderAvatar(user);
    const name = element('div'); name.append(element('strong', user.name), element('small', `@${user.handle}`)); identity.append(avatar, name); profile.append(identity);
    const bio = element('span', user.bio || '暂无简介', `user-bio${user.bio ? ' is-collapsed' : ' is-empty'}`); name.append(bio);
    if (user.bio && (user.bio.length > 40 || /[\r\n]/.test(user.bio))) {
      const expand = element('button', '展开简介', 'user-bio-toggle'); let expanded = false;
      expand.setAttribute('aria-expanded', 'false');
      expand.onclick = () => { expanded = !expanded; bio.classList.toggle('is-collapsed', !expanded); expand.textContent = expanded ? '收起简介' : '展开简介'; expand.setAttribute('aria-expanded', String(expanded)); };
      name.append(expand);
    }
    const relation = element('td'); relation.append(element('span', labels[user.relation], `relation ${user.relation}`));
    if (comparison && ['notBack', 'fansOnly'].includes(user.relation) && comparison.users.has(user.handle)) {
      const observation = comparison.users.get(user.handle);
      const badge = element('span', observationText(observation), `duration-badge duration-${observation?.level || 'unknown'}`);
      badge.title = observation ? '仅代表两次记录均未回关的观察间隔，无法确认期间变化或真实关注时间。' : '未回关时长未知：备份中没有相同关系记录。';
      relation.append(badge);
    }
    const notes = element('td', undefined, 'memo-cell'); const memo = data.notes[user.handle];
    const memoButton = element('button', undefined, 'memo-editor'); memoButton.type = 'button';
    memoButton.dataset.noteHandle = user.handle;
    memoButton.setAttribute('aria-label', `编辑 @${user.handle} 的标签与备注`);
    if (memo?.tag) memoButton.append(element('span', memo.tag, 'tag'));
    if (ignored) memoButton.append(element('span', '已忽略', 'ignored-label'));
    memoButton.append(element('span', memo?.note || (memo?.tag ? '添加备注' : '添加标签或备注'), 'memo'), element('span', '点击编辑', 'memo-edit-hint'));
    notes.append(memoButton); notes.onclick = () => openMemo(user.handle);
    const actions = element('td', undefined, 'user-actions'); const edit = element('button', '备注'); edit.onclick = () => openMemo(user.handle);
    const link = element('a', '主页 ↗', 'profile-link'); link.href = `https://x.com/${user.handle}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
    const ignore = element('button', ignored ? '取消忽略' : '忽略', 'ignore-action');
    ignore.setAttribute('aria-label', `${ignored ? '取消忽略' : '忽略'} @${user.handle}`);
    ignore.onclick = () => safely(async () => {
      await persist(ignored ? `已取消忽略 @${user.handle}` : `已忽略 @${user.handle}`, latest => setIgnored(account(latest, owner), user.handle, !ignored));
    });
    actions.append(edit, ignore, link); row.append(profile, relation, notes, actions); $('#rows').append(row);
  }
  $('#empty').hidden = visible.length > 0;
  $('#empty h3').textContent = !data || (!data.following.users.length && !data.followers.users.length) ? '从第一份名单开始' : '暂无符合条件的用户';
  $('#empty p').textContent = (view === 'notBack' && !data?.followers.complete) || (view === 'fansOnly' && !data?.following.complete) ? '需要确认对应名单完整，才能判断这一关系。' : '在 X 列表页使用扩展收集，或导入关注与粉丝名单。';
  if (view === 'ignored') {
    $('#empty h3').textContent = filtered ? '暂无符合条件的已忽略用户' : '暂无已忽略用户';
    $('#empty p').textContent = filtered ? '请调整搜索条件后重试。' : '在其他用户名单中点击“忽略”，即可在这里统一管理。';
  }
  if (!visible.length && filtered && view !== 'ignored' && !((view === 'notBack' && !data?.followers.complete) || (view === 'fansOnly' && !data?.following.complete))) $('#empty p').textContent = '请在列头选择其他标签或全部标签，或调整搜索条件。';
  $('#snapshot').disabled = !data?.followers.complete || scanBusy;
  for (const selector of ['#show-import', '#restore']) $(selector).disabled = scanBusy;
  renderChanges(data);
  document.querySelectorAll('.nav').forEach(button => button.classList.toggle('active', button.dataset.view === view));
}
function renderChanges(data) {
  const target = $('#changes-content'); target.replaceChildren();
  const snapshots = data?.snapshots || [];
  target.append(element('p', `已保存 ${snapshots.length} 次快照。`));
  if (snapshots.length < 2) { target.append(element('h3', snapshots.length ? '基线已建立，等待下一次完整名单。' : '从今天开始记录变化。')); return; }
  const before = snapshots.at(-2), after = snapshots.at(-1);
  target.append(element('p', `${new Date(before.at).toLocaleString('zh-CN')} → ${new Date(after.at).toLocaleString('zh-CN')}`));
  const diff = diffSnapshots(before, after);
  diff.added = diff.added.filter(user => !isFilteredOut(data, user.handle));
  diff.removed = diff.removed.filter(user => !isFilteredOut(data, user.handle));
  const grid = element('div', undefined, 'diff-grid');
  for (const [key, title] of [['added', '新增粉丝'], ['removed', '从名单中消失']]) {
    const card = element('div', undefined, 'diff-card'); card.append(element('h3', `${title} · ${diff[key].length}`));
    if (!diff[key].length) card.append(element('p', '暂无变化'));
    for (const user of diff[key]) { const a = element('a', `${user.name} @${user.handle}`); a.href = `https://x.com/${user.handle}`; a.target = '_blank'; a.rel = 'noopener noreferrer'; card.append(a); }
    grid.append(card);
  }
  target.append(grid);
}
$('#preview-notice').hidden = isExtension;
$('#owner').onchange = event => { owner = event.target.value; resetMemoFilters(); currentPage = 1; render(); resetListScroll(); };
function clearAccountError() { $('#account-error').hidden = true; $('#account-handle').removeAttribute('aria-invalid'); }
$('#add-owner').onclick = () => {
  $('#account-form').reset(); clearAccountError(); $('#account-dialog').showModal(); $('#account-handle').focus();
};
$('#close-account').onclick = $('#cancel-account').onclick = () => $('#account-dialog').close();
$('#account-dialog').addEventListener('close', () => $('#add-owner').focus());
$('#account-handle').oninput = clearAccountError;
$('#account-form').onsubmit = async event => {
  event.preventDefault();
  if ($('#submit-account').disabled) return;
  clearAccountError();
  let nextOwner;
  try { nextOwner = handle($('#account-handle').value); }
  catch (error) {
    $('#account-error').textContent = error.message; $('#account-error').hidden = false;
    $('#account-handle').setAttribute('aria-invalid', 'true'); $('#account-handle').focus(); return;
  }
  $('#submit-account').disabled = true; $('#submit-account').textContent = '正在添加…';
  try {
    state = await updateState(latest => account(latest, nextOwner));
    owner = nextOwner; resetMemoFilters(); currentPage = 1; $('#search').value = ''; render(); resetListScroll();
    status(`已切换至 @${owner}`); $('#account-dialog').close();
  } catch (error) {
    $('#account-error').textContent = `添加失败：${error.message}`; $('#account-error').hidden = false;
  } finally { $('#submit-account').disabled = false; $('#submit-account').textContent = '添加账号'; }
};
document.querySelectorAll('.nav').forEach(button => button.onclick = () => switchView(button.dataset.view));
$('#back-to-top').onclick = backToTop;
$('#search').oninput = () => { currentPage = 1; render(); resetListScroll(); };
$('#tag-filter').onchange = () => { currentPage = 1; render(); resetListScroll(); };
$('#page-size').onchange = event => { pageSize = Number(event.target.value); currentPage = 1; render(); resetListScroll(); };
function goToPage(page) { currentPage = page; render(); resetListScroll(); }
$('#first-page').onclick = () => goToPage(1);
$('#prev-page').onclick = () => goToPage(currentPage - 1);
$('#next-page').onclick = () => goToPage(currentPage + 1);
$('#last-page').onclick = () => goToPage(Math.ceil(visible.length / pageSize));
$('#page-number').onchange = event => goToPage(Number(event.target.value));
$('#page-number').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); goToPage(Number(event.target.value)); } };
$('#show-import').onclick = () => { if (!owner) return status('请先添加要管理的账号'); $('#import-dialog').showModal(); };
$('#close-import').onclick = () => $('#import-dialog').close();
$('#import-form').onsubmit = event => { event.preventDefault(); safely(async () => {
  if (scanBusy) throw new Error('请先停止扫描，再导入名单');
  const text = $('#import-text').value.trim();
  const users = text.startsWith('[') ? JSON.parse(text) : text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  await persist('名单已导入', latest => setList(latest, owner, $('#import-kind').value, users, $('#import-complete').checked, $('#import-merge').checked)); $('#import-dialog').close();
}); };
$('#cancel-note').onclick = () => $('#note-dialog').close();
$('#note-dialog').addEventListener('close', () => {
  const target = document.querySelector(`.memo-editor[data-note-handle="${editing}"]`) || $('#tag-filter');
  target.focus({ preventScroll: true });
});
$('#note-form').onsubmit = event => { event.preventDefault(); safely(async () => {
  const memo = { tag: $('#note-tag').value.trim(), note: $('#note-text').value.trim() };
  await persist('备注已保存', latest => { account(latest, editingOwner).notes[editing] = memo; }); $('#note-dialog').close();
}); };
$('#snapshot').onclick = () => safely(async () => { await persist('粉丝快照已保存', latest => saveSnapshot(account(latest, owner))); });
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })); const a = element('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
}
$('#backup').onclick = () => {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  download(`x-relationships-backup-${timestamp}.json`, JSON.stringify(state, null, 2), 'application/json');
};
$('#select-comparison').onclick = () => $('#compare-backup').click();
$('#compare-backup').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  const selectedOwner = owner;
  $('#comparison-error').hidden = true;
  try {
    if (scanBusy) throw new Error('请先停止扫描再对比备份');
    if (file.size > 20 * 1024 * 1024) throw new Error('备份请控制在 20MB 内');
    const backup = validateState(JSON.parse(await file.text()));
    if (selectedOwner !== owner || scanBusy) throw new Error('当前账号或扫描状态已变化，请重新选择备份');
    compareBothDirections(current(), backup.accounts[owner]);
    comparisonBackup = backup; comparisonFilename = file.name;
    switchView(view === 'fansOnly' ? 'fansOnly' : 'notBack'); status('备份时间对比已完成，当前数据未被替换');
  } catch (error) {
    $('#comparison-error').textContent = `无法对比：${error.message}`; $('#comparison-error').hidden = false;
    $('#results-workspace').scrollIntoView({ block: 'start' });
  } finally { event.target.value = ''; }
};
$('#clear-comparison').onclick = () => {
  comparisonBackup = null; comparisonFilename = ''; $('#comparison-error').hidden = true; render(); status('已清除备份对比');
};
$('#restore').onchange = event => safely(async () => {
  if (scanBusy) throw new Error('请先停止扫描，再恢复备份');
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('备份请控制在 20MB 内');
    const restored = validateState(JSON.parse(await file.text()));
    if (!confirm('恢复将替换全部本机关系数据。请确保已经备份，是否继续？')) return;
    state = await updateState(latest => { latest.accounts = restored.accounts; }); owner = Object.keys(state.accounts)[0] || ''; render(); status('备份已恢复');
  } finally { event.target.value = ''; }
});
$('#export-csv').onclick = () => {
  const safe = value => { let s = String(value || ''); if (/^[\s]*[=+\-@]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"`; };
  const rows = [['用户名', '昵称', '关系', '标签', '备注', '已忽略', '头像链接', '简介', '未回关观察时长', '观察起点', '观察终点'], ...visible.map(u => [u.handle, u.name, labels[u.relation], current().notes[u.handle]?.tag, current().notes[u.handle]?.note, (current().ignored || []).includes(u.handle) ? '是' : '否', u.avatarUrl, u.bio, comparison && ['notBack', 'fansOnly'].includes(u.relation) && comparison.users.has(u.handle) ? observationText(comparison.users.get(u.handle)) : '', comparison?.users.get(u.handle) ? new Date(comparison.startedAt).toISOString() : '', comparison?.users.get(u.handle) ? new Date(comparison.endedAt).toISOString() : ''])];
  download(`x-${owner || 'empty'}-${view}.csv`, '\uFEFF' + rows.map(row => row.map(safe).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
};
const scheduleDataRefresh = createRefreshScheduler(async () => {
  try {
    state = await readState();
    if (!owner || !Object.hasOwn(state.accounts, owner)) owner = Object.keys(state.accounts)[0] || '';
    render();
  } catch (error) { status(error.message); }
});
if (isExtension) chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes['x-relationship-notebook-v1']) scheduleDataRefresh(); });
render();
document.addEventListener('xrb-scan-status', event => { if (scanBusy !== event.detail.busy) { scanBusy = event.detail.busy; render(); } });
await mountScanControls(() => owner);
