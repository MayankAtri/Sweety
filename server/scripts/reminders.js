import { QueueEvents } from 'bullmq';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { today } from '../src/dates.js';
import { selectedDate } from '../src/routes/readings.js';
import {
  createReminderQueue,
  REMINDER_QUEUE,
  redisConnection,
  withTimeout,
} from '../src/reminders.js';

const [command, suppliedDate] = process.argv.slice(2);
let queue, events;
try {
  const date = selectedDate(suppliedDate || today());
  if (command === 'enqueue') {
    queue = createReminderQueue();
    events = new QueueEvents(REMINDER_QUEUE, {
      connection: redisConnection(config.redisUrl, true),
    });
    events.on('error', () => {});
    await withTimeout(Promise.all([queue.waitUntilReady(), events.waitUntilReady()]));
    const job = await queue.add('daily-reminder', { date });
    console.log('Reminder job queued', { jobId: job.id, date });
    const result = await job.waitUntilFinished(events, 20_000);
    console.log('Reminder job completed', result);
  } else if (command === 'logs') {
    const { rows } = await pool.query(
      'SELECT user_id::text AS "userId", date, missing_slots AS "missingSlots", created_at AS "createdAt" FROM reminder_logs WHERE date = $1 ORDER BY user_id',
      [date],
    );
    console.log(JSON.stringify(rows, null, 2));
  } else {
    throw new Error('Usage: reminders.js enqueue|logs [YYYY-MM-DD]');
  }
} catch (error) {
  console.error('Reminder command failed:', error.code || error.name);
  console.error(
    'Usage: reminders.js enqueue|logs [YYYY-MM-DD]. Enqueue requires a running worker.',
  );
  process.exitCode = 1;
} finally {
  // A disconnected BullMQ connection may still be awaiting its initial ready
  // promise. Bound cleanup itself so a failed command always exits promptly.
  const cleanupDeadline = setTimeout(() => process.exit(1), 1000);
  try {
    await Promise.all([events?.close(), queue?.close(), pool.end()]);
    clearTimeout(cleanupDeadline);
  } catch {
    process.exit(1);
  }
}
