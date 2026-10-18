import { mountScanControls } from './scan-controls.js';
document.querySelector('#open').onclick = async () => {
  try { await chrome.tabs.create({ url: chrome.runtime.getURL('app.html') }); }
  catch (error) { document.querySelector('#status').textContent = error.message; }
};
await mountScanControls();
try {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
    const match = location.pathname.match(/^\/([a-zA-Z0-9_]{1,15})(?:\/(?:following|followers))?\/?$/);
    const excluded = ['home', 'explore', 'notifications', 'messages', 'settings', 'search', 'i'];
    return match && !excluded.includes(match[1].toLowerCase()) ? match[1] : '';
  }});
  const input = document.querySelector('#scan-owner');
  if (result && !input.value && !input.disabled) input.value = result;
} catch { /* On non-X tabs the user enters the target handle instead. */ }
