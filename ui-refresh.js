// Coalesce notifications and serialize asynchronous UI refreshes.
export function createRefreshScheduler(refresh, interval = 1000, clock = globalThis) {
  let timer = null, running = false, pending = false, lastStart = -Infinity;
  const schedule = () => {
    pending = true;
    if (timer !== null || running) return;
    const delay = Math.max(0, interval - (clock.Date.now() - lastStart));
    timer = clock.setTimeout(async () => {
      timer = null; pending = false; running = true; lastStart = clock.Date.now();
      try { await refresh(); }
      finally { running = false; if (pending) schedule(); }
    }, delay);
  };
  return schedule;
}
