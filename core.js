export const emptyState = () => ({ version: 1, accounts: {} });
export function handle(value) {
  const result = String(value ?? '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(result)) throw new Error('用户名须为 1–15 位英文字母、数字或下划线');
  return result;
}
export function avatarUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname === 'pbs.twimg.com' && !url.username && !url.password && !url.port && /^\/(profile_images|default_profile_images)\//.test(url.pathname) ? url.href.slice(0, 2048) : '';
  } catch { return ''; }
}
export function normalizeUsers(users) {
  if (!Array.isArray(users)) throw new Error('用户列表必须是数组');
  const map = new Map();
  for (const item of users) {
    const user = typeof item === 'string' ? { handle: item } : item;
    if (!user || typeof user !== 'object') throw new Error('用户格式错误');
    const key = handle(user.handle);
    const previous = map.get(key);
    map.set(key, {
      handle: key, name: String(user.name || previous?.name || key).slice(0, 100),
      avatarUrl: Object.hasOwn(user, 'avatarUrl') ? avatarUrl(user.avatarUrl) : previous?.avatarUrl || '',
      bio: Object.hasOwn(user, 'bio') ? String(user.bio ?? '').slice(0, 1000) : previous?.bio || ''
    });
  }
  return [...map.values()];
}
export function account(state, owner) {
  const key = handle(owner);
  if (!Object.hasOwn(state.accounts, key)) Object.defineProperty(state.accounts, key, { enumerable: true, configurable: true, writable: true, value: {
    following: { users: [], complete: false, updatedAt: null },
    followers: { users: [], complete: false, updatedAt: null },
    notes: Object.create(null), snapshots: [], ignored: [], hideIgnored: true, scanHistory: []
  } });
  return state.accounts[key];
}
export function setList(state, owner, kind, users, complete, merge = false) {
  if (!['following', 'followers'].includes(kind)) throw new Error('列表类型错误');
  const target = account(state, owner);
  const normalized = normalizeUsers(users);
  const other = kind === 'following' ? 'followers' : 'following';
  const profiles = new Map(normalizeUsers([...target[other].users, ...target[kind].users, ...users]).map(user => [user.handle, user]));
  const keys = [...new Set([...(merge ? target[kind].users.map(user => user.handle) : []), ...normalized.map(user => user.handle)])];
  target[kind] = {
    users: keys.map(key => profiles.get(key)),
    complete: merge ? false : complete === true,
    updatedAt: new Date().toISOString()
  };
  return target;
}
export function analyze(data) {
  const following = new Map(data.following.users.map(u => [u.handle, u]));
  const followers = new Map(data.followers.users.map(u => [u.handle, u]));
  return [...new Set([...following.keys(), ...followers.keys()])].map(key => ({
    ...(following.get(key) || followers.get(key)),
    avatarUrl: following.get(key)?.avatarUrl || followers.get(key)?.avatarUrl || '',
    bio: following.get(key)?.bio || followers.get(key)?.bio || '',
    relation: following.has(key) && followers.has(key) ? 'mutual' : following.has(key)
      ? (data.followers.complete ? 'notBack' : 'followingUnknown')
      : (data.following.complete ? 'fansOnly' : 'followerUnknown')
  }));
}
export function setIgnored(data, username, ignored) {
  const key = handle(username);
  const users = new Set(data.ignored || []);
  if (ignored) users.add(key); else users.delete(key);
  data.ignored = [...users];
}
export function isFilteredOut(data, username) {
  return data?.hideIgnored !== false && (data?.ignored || []).includes(username);
}
export function saveSnapshot(data) {
  if (!data.followers.complete) throw new Error('请先确认粉丝列表完整，再保存粉丝快照');
  const snapshot = { id: crypto.randomUUID(), at: new Date().toISOString(), users: structuredClone(data.followers.users) };
  data.snapshots.push(snapshot);
  data.snapshots = data.snapshots.slice(-30);
  return snapshot;
}
export function diffSnapshots(before, after) {
  const previous = new Set(before.users.map(u => u.handle));
  const current = new Set(after.users.map(u => u.handle));
  return { added: after.users.filter(u => !previous.has(u.handle)), removed: before.users.filter(u => !current.has(u.handle)) };
}
// Conservative observation interval: both old lists precede both current lists.
// This does not establish an uninterrupted relationship between the observations.
export function compareNotBack(current, before, relation = 'notBack') {
  if (!['notBack', 'fansOnly'].includes(relation)) throw new Error('对比关系类型错误');
  if (!current || !before) throw new Error('所选备份中没有当前账号，请选择同一账号的备份');
  const required = relation === 'notBack' ? 'followers' : 'following';
  if (!current[required].complete || !before[required].complete) throw new Error(`当前数据与备份的${required === 'followers' ? '粉丝' : '关注'}名单均需确认完整，才能判断${relation === 'notBack' ? '未回关我的' : '我未回关的'}`);
  const dates = data => ['following', 'followers'].map(kind => {
    const value = data[kind].updatedAt;
    const ms = typeof value === 'string' ? Date.parse(value) : NaN;
    if (!Number.isFinite(ms)) throw new Error('名单缺少有效采集时间，无法计算未回关时长');
    return ms;
  });
  const oldDates = dates(before), newDates = dates(current);
  const startedAt = Math.max(...oldDates), endedAt = Math.min(...newDates);
  if (endedAt <= startedAt) throw new Error('请选择更早的备份：两份备份名单的时间均须早于当前两份名单');
  const durationMs = endedAt - startedAt;
  const level = durationMs <= 86400000 ? 'green' : durationMs <= 3 * 86400000 ? 'yellow' : 'red';
  const previous = new Set(analyze(before).filter(user => user.relation === relation).map(user => user.handle));
  const users = new Map(analyze(current).filter(user => user.relation === relation).map(user => [user.handle,
    previous.has(user.handle) ? { durationMs, level, startedAt, endedAt } : null]));
  return { users, startedAt, endedAt, durationMs };
}
function normalizeScanRecord(raw) {
  if (!raw || typeof raw.id !== 'string' || !Number.isFinite(Date.parse(raw.startedAt)) || !Number.isFinite(Date.parse(raw.finishedAt))) throw new Error('扫描记录格式错误');
  const startedAt = new Date(raw.startedAt).toISOString(), finishedAt = new Date(raw.finishedAt).toISOString();
  if (Date.parse(finishedAt) < Date.parse(startedAt) || !Array.isArray(raw.results)) throw new Error('扫描记录时间或结果错误');
  const profileTotals = {};
  for (const kind of ['following', 'followers']) {
    const metric = raw.profileTotals?.[kind];
    if (!metric) continue;
    if (!Number.isSafeInteger(metric.count) || metric.count < 0 || typeof metric.approximate !== 'boolean') throw new Error('扫描主页人数格式错误');
    profileTotals[kind] = { count: metric.count, approximate: metric.approximate, readAt: Number.isFinite(Date.parse(metric.readAt)) ? new Date(metric.readAt).toISOString() : null };
  }
  return {
    id: raw.id.slice(0, 100), startedAt, finishedAt, durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    phase: String(raw.phase || '').slice(0, 32), reason: String(raw.reason || '').slice(0, 1000), profileTotals,
    results: raw.results.map(result => {
      if (!['following', 'followers'].includes(result.kind) || !Number.isSafeInteger(result.count) || result.count < 0) throw new Error('扫描结果人数格式错误');
      return { kind: result.kind, count: result.count, outcome: String(result.outcome || '').slice(0, 32), reason: String(result.reason || '').slice(0, 500), durationMs: Number.isFinite(result.durationMs) ? Math.max(0, result.durationMs) : null };
    })
  };
}
export function recordScan(state, owner, job, endedAt = Date.now()) {
  const started = job.startedAt || job.kindStartedAt || endedAt;
  const finished = Math.max(started, endedAt);
  const results = [...(job.results || [])];
  const kind = job.kinds?.[job.index];
  if (kind && !results.some(result => result.kind === kind) && job.kindStartedAt) results.push({ kind, count: job.counts?.[kind] || 0, outcome: job.phase, reason: job.reason, durationMs: Math.max(0, finished - job.kindStartedAt) });
  const record = normalizeScanRecord({ id: job.id, startedAt: new Date(started).toISOString(), finishedAt: new Date(finished).toISOString(), phase: job.phase, reason: job.reason, profileTotals: job.profileTotals || {}, results });
  const data = account(state, owner);
  data.scanHistory = [...(data.scanHistory || []).filter(item => item.id !== record.id), record].slice(-30);
  return record;
}
export function validateState(input) {
  if (!input || input.version !== 1 || !input.accounts || typeof input.accounts !== 'object' || Array.isArray(input.accounts)) throw new Error('备份格式或版本不支持');
  const result = emptyState();
  for (const [owner, raw] of Object.entries(input.accounts)) {
    if (!raw || typeof raw !== 'object') throw new Error('账号数据错误');
    const data = account(result, owner);
    if (raw.ignored !== undefined && !Array.isArray(raw.ignored)) throw new Error('忽略名单必须是数组');
    if (raw.hideIgnored !== undefined && typeof raw.hideIgnored !== 'boolean') throw new Error('忽略过滤开关格式错误');
    data.ignored = [...new Set((raw.ignored || []).map(handle))];
    data.hideIgnored = raw.hideIgnored !== false;
    if (raw.scanHistory !== undefined && !Array.isArray(raw.scanHistory)) throw new Error('扫描历史格式错误');
    data.scanHistory = (raw.scanHistory || []).slice(-30).map(normalizeScanRecord);
    for (const kind of ['following', 'followers']) {
      if (!raw[kind] || typeof raw[kind].complete !== 'boolean') throw new Error('列表完整性字段缺失');
      data[kind] = { users: normalizeUsers(raw[kind].users), complete: raw[kind].complete, updatedAt: typeof raw[kind].updatedAt === 'string' ? raw[kind].updatedAt : null };
    }
    if (raw.notes && typeof raw.notes === 'object') for (const [key, value] of Object.entries(raw.notes)) {
      if (value && typeof value === 'object') data.notes[handle(key)] = { tag: String(value.tag || '').slice(0, 40), note: String(value.note || '').slice(0, 500) };
    }
    if (!Array.isArray(raw.snapshots)) throw new Error('快照格式错误');
    data.snapshots = raw.snapshots.slice(-30).map(s => {
      if (!s || !Number.isFinite(Date.parse(s.at))) throw new Error('快照日期错误');
      return { id: crypto.randomUUID(), at: s.at, users: normalizeUsers(s.users) };
    });
  }
  return result;
}
