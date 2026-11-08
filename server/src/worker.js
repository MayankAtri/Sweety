import { pool } from './db.js';
import {
  createReminderQueue,
  createReminderWorker,
  scheduleReminders,
  withTimeout,
} from './reminders.js';

let queue,
  worker,
  closing = false;
async function shutdown(code = 0, startupFailure = false) {
  if (closing) return;
  closing = true;
  // BullMQ close/disconnect can wait for an initial Redis connection forever.
  // Install the process deadline before awaiting any library cleanup.
  const timeout = setTimeout(() => process.exit(1), startupFailure ? 1000 : 10_000);
  try {
    await worker?.close();
    await queue?.close();
    await pool.end();
    clearTimeout(timeout);
    process.exitCode = code;
  } catch {
    console.error('Reminder worker shutdown failed.');
    process.exitCode = 1;
  }
}
try {
  await pool.query('SELECT 1');
  queue = createReminderQueue();
  await withTimeout(queue.waitUntilReady());
  await withTimeout(scheduleReminders(queue));
  worker = createReminderWorker();
  await withTimeout(worker.waitUntilReady());
  console.log('Reminder worker ready: daily at 08:00 in APP_TIMEZONE; logging only.');
  process.on('SIGINT', () => shutdown());
  process.on('SIGTERM', () => shutdown());
} catch {
  console.error('Reminder worker startup failed. Check database and REDIS_URL.');
  await shutdown(1, true);
}
