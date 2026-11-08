import { Queue, Worker } from 'bullmq';
import { config } from './config.js';
import { pool } from './db.js';
import { today } from './dates.js';
import { selectedDate } from './routes/readings.js';
import { SLOTS } from './validation.js';

export const REMINDER_QUEUE = 'sweety-reminders';
export const REMINDER_SCHEDULER = 'daily-patient-reminder';
export const reminderJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 100 },
};

export function redisConnection(url, worker = false) {
  if (!url) throw new Error('REDIS_URL is required for reminder jobs.');
  const parsed = new URL(url);
  if (!['redis:', 'rediss:'].includes(parsed.protocol))
    throw new Error('REDIS_URL must use redis or rediss.');
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    db: Number(parsed.pathname.slice(1) || 0),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: worker ? null : 1,
    ...(worker ? {} : { enableOfflineQueue: false, connectTimeout: 1000 }),
  };
}

export function createReminderQueue({ url = config.redisUrl, name = REMINDER_QUEUE } = {}) {
  const queue = new Queue(name, {
    connection: redisConnection(url),
    defaultJobOptions: reminderJobOptions,
  });
  queue.on('error', () => console.error('Reminder queue connection unavailable.'));
  return queue;
}

export async function scheduleReminders(queue) {
  return queue.upsertJobScheduler(
    REMINDER_SCHEDULER,
    { pattern: '0 8 * * *', tz: config.appTimezone },
    { name: 'daily-reminder', data: {}, opts: reminderJobOptions },
  );
}

// The durable log is the reminder's only side effect. The unique constraint
// makes retries and multiple workers safe; no email, SMS or push is sent.
export async function logDailyReminders(
  date = today(),
  { database = pool, log = console.log } = {},
) {
  selectedDate(date);
  const { rows } = await database.query(
    `
    INSERT INTO reminder_logs (user_id, date, missing_slots)
    SELECT u.id, $1::date, array_agg(slot ORDER BY ordinal)
    FROM users u CROSS JOIN unnest($2::text[]) WITH ORDINALITY AS slots(slot, ordinal)
    WHERE u.role = 'patient'
      AND NOT EXISTS (SELECT 1 FROM readings r WHERE r.user_id = u.id AND r.date = $1::date AND r.slot = slots.slot)
    GROUP BY u.id
    ON CONFLICT (user_id, date) DO NOTHING
    RETURNING user_id::text AS "userId", date, missing_slots AS "missingSlots"`,
    [date, SLOTS],
  );
  for (const row of rows) log('Daily reminder logged', row);
  return { date, logged: rows.length };
}

export function createReminderWorker({
  url = config.redisUrl,
  name = REMINDER_QUEUE,
  database = pool,
  log = console.log,
} = {}) {
  const worker = new Worker(
    name,
    async (job) => {
      if (job.name !== 'daily-reminder') throw new Error('Unsupported reminder job.');
      // Fix the date before the DB side effect, so retries spanning midnight keep
      // the same idempotency key. A delayed worker checks its current local day.
      if (!job.data.date) await job.updateData({ date: today() });
      return logDailyReminders(job.data.date, { database, log });
    },
    { connection: redisConnection(url, true), concurrency: 1 },
  );
  worker.on('error', () => console.error('Reminder worker connection unavailable.'));
  worker.on('failed', (job) =>
    console.error('Reminder job failed', { jobId: job?.id, attemptsMade: job?.attemptsMade }),
  );
  return worker;
}

export async function withTimeout(promise, milliseconds = 5000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Reminder operation timed out.')), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
