// Only announce document readiness. Never read cards or scroll without an active job.
void (async () => {
  try { await chrome.runtime.sendMessage({ type: 'XRB_SCAN_PAGE_READY' }); }
  catch { /* An extension reload may invalidate an existing tab's context. */ }
})();
