// Standalone Scheduled SLA Scanner worker.
// Can run alongside the application or via an external task scheduler.
// Usage: node --env-file=.env.local scripts/sla-scheduler.js
import { runSlaScan } from '../lib/adminService.js';

const intervalMs = Number(process.env.SLA_SCAN_INTERVAL_MS || 60000);
console.log(`[smartdesk] Dedicated SLA scheduler starting... (interval: ${Math.round(intervalMs / 1000)}s)`);

async function run() {
  try {
    const result = await runSlaScan();
    console.log(`[${new Date().toISOString()}] Scan completed: ${result.ticketsChecked} overdue open tickets checked, ${result.newAlerts} new alerts created.`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] SLA scan error:`, err.message);
  }
}

// Initial run
await run();

// Recurring interval
setInterval(run, intervalMs);
