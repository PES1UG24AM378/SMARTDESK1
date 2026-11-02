// Scheduled SLA Scanner for background detection of overdue tickets.
// Runs safely as a single background task (guarded against duplicate workers).
import { runSlaScan } from './adminService.js';

export function startSlaScheduler({ intervalMs = 60000, initialDelayMs = 5000 } = {}) {
  if (globalThis._sdSlaScheduler) {
    return globalThis._sdSlaScheduler;
  }

  let timer = null;
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      await runSlaScan();
    } catch (err) {
      console.error('[smartdesk] Background SLA scheduler error:', err.message);
    } finally {
      running = false;
    }
  }

  const initialTimer = setTimeout(() => {
    tick();
    timer = setInterval(tick, intervalMs);
    // Allow process to exit cleanly if this is the only timer
    if (timer?.unref) timer.unref();
  }, initialDelayMs);
  if (initialTimer?.unref) initialTimer.unref();

  globalThis._sdSlaScheduler = {
    stop: () => {
      clearTimeout(initialTimer);
      if (timer) clearInterval(timer);
      globalThis._sdSlaScheduler = null;
    },
    tick,
  };

  console.log(`[smartdesk] SLA background scheduler started (interval: ${Math.round(intervalMs / 1000)}s)`);
  return globalThis._sdSlaScheduler;
}
