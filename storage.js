import { emptyState, validateState } from './core.js';
const KEY = 'x-relationship-notebook-v1';
const CLEANUP_KEY = 'xrb-demo-cleanup-v1';
export const isExtension = !!globalThis.chrome?.storage?.local;
async function readStateUnlocked() {
  const raw = isExtension ? (await chrome.storage.local.get(KEY))[KEY] : JSON.parse(localStorage.getItem(KEY) || 'null');
  const cleaned = isExtension ? (await chrome.storage.local.get(CLEANUP_KEY))[CLEANUP_KEY] : localStorage.getItem(CLEANUP_KEY) === 'true';
  if (!cleaned) {
    // One-time removal of the account created by the former built-in demo button.
    // Preserve every other account, its notes, and its snapshots as stored.
    if (raw?.accounts && Object.hasOwn(raw.accounts, 'demo_account')) {
      delete raw.accounts.demo_account;
      await writeState(raw);
    }
    if (isExtension) await chrome.storage.local.set({ [CLEANUP_KEY]: true });
    else localStorage.setItem(CLEANUP_KEY, 'true');
  }
  return raw ? validateState(raw) : emptyState();
}
export async function readState() {
  return navigator.locks.request('xrb-data', readStateUnlocked);
}
export async function writeState(state) {
  if (isExtension) await chrome.storage.local.set({ [KEY]: state });
  else localStorage.setItem(KEY, JSON.stringify(state));
}
export async function updateState(mutate) {
  const operation = async () => {
    const state = await readStateUnlocked();
    await mutate(state);
    await writeState(state);
    return state;
  };
  return navigator.locks.request('xrb-data', operation);
}
