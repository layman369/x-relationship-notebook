import { analyze } from './core.js';
export function queryUsers(data, view, search = '', filters = {}) {
  if (!data) return [];
  const following = new Set(data.following.users.map(user => user.handle));
  const followers = new Set(data.followers.users.map(user => user.handle));
  const query = search.trim().toLowerCase();
  const ignored = new Set(data.ignored || []);
  const relations = analyze(data);
  const known = new Map(relations.map(user => [user.handle, user]));
  // Keep absent users manageable after a new scan replaces the collected lists.
  const users = view === 'unfollowers' ? (filters.unfollowers || []) : view === 'ignored' ? [...ignored].map(handle => known.get(handle) || { handle, name: handle, relation: 'unrecorded' }) : relations;
  return users.filter(user => {
    if (view !== 'ignored' && data.hideIgnored !== false && ignored.has(user.handle)) return false;
    const matches = view === 'all' || view === 'ignored' || (view === 'following' ? following.has(user.handle) : view === 'followers' ? followers.has(user.handle) : user.relation === view);
    const note = data.notes[user.handle];
    const tag = String(note?.tag || '').trim();
    const memo = String(note?.note || '').trim();
    const tagFilter = filters.tag || '';
    if (tagFilter === 'has' && !tag) return false;
    if (tagFilter === 'none' && tag) return false;
    if (tagFilter.startsWith('tag:') && tag !== tagFilter.slice(4)) return false;
    if (filters.noteMode === 'has' && !memo) return false;
    if (filters.noteMode === 'none' && memo) return false;
    if (!memo.toLowerCase().includes(String(filters.noteQuery || '').trim().toLowerCase())) return false;
    return matches && [user.handle, user.name, user.bio, note?.tag, note?.note].join(' ').toLowerCase().includes(query);
  });
}
export function paginate(users, requestedPage = 1, pageSize = 20) {
  if (![20, 50, 100, 200].includes(pageSize)) throw new Error('不支持的每页条数');
  const total = users.length, pages = Math.max(1, Math.ceil(total / pageSize));
  const number = Number(requestedPage);
  const page = Math.min(pages, Math.max(1, Number.isFinite(number) ? Math.trunc(number) : 1));
  const offset = (page - 1) * pageSize;
  return { page, pages, total, start: total ? offset + 1 : 0, end: Math.min(offset + pageSize, total), rows: users.slice(offset, offset + pageSize) };
}
