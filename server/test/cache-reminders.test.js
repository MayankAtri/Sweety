import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import request from 'supertest';
import { QueueEvents } from 'bullmq';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test'))
  throw new Error('A dedicated TEST_DATABASE_URL ending in _test is required.');
if (!redisUrl) throw new Error('TEST_REDIS_URL is required for real Redis/BullMQ tests.');
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL = redisUrl;
process.env.NODE_ENV = 'test';
const { pool } = await import('../src/db.js');
const { runMigrations } = await import('../scripts/migrate.js');
const { createReportCache, reportCache } = await import('../src/cache.js');
const { loadReports } = await import('../src/routes/reports.js');
const { createApp } = await import('../src/app.js');
const {
  createReminderQueue,
  createReminderWorker,
  scheduleReminders,
  redisConnection,
  REMINDER_SCHEDULER,
} = await import('../src/reminders.js');
const app = createApp();
const prefix = `sweety:test:${randomUUID()}`;
const cache = createReportCache({ url: redisUrl, prefix, ttlSeconds: 2 });
const queueName = `sweety-test-${randomUUID()}`;
let owner, other, cookie, queue, worker, events;
async function ready(redis) {
  if (redis.status !== 'ready') await once(redis, 'ready');
}
async function insert(value = 100, date = '2024-03-15', slot = 'morning', user = owner) {
  return (
    await pool.query(
      'INSERT INTO readings(user_id,date,slot,value) VALUES($1,$2,$3,$4) RETURNING id::text',
      [user, date, slot, value],
    )
  ).rows[0].id;
}
before(async () => {
  await runMigrations();
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  const registered = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Cache owner', email: 'cache@example.com', password: 'Cache-test-123' })
    .expect(201);
  owner = registered.body.user.id;
  cookie = registered.headers['set-cookie'][0].split(';')[0];
  other = (
    await pool.query(
      "INSERT INTO users(name,email,password_hash) VALUES('Other','cache-other@example.com','not-a-login') RETURNING id::text",
    )
  ).rows[0].id;
  await Promise.all([ready(cache.redis), ready(reportCache.redis)]);
  queue = createReminderQueue({ url: redisUrl, name: queueName });
  events = new QueueEvents(queueName, { connection: redisConnection(redisUrl, true) });
  events.on('error', () => {});
  worker = createReminderWorker({ url: redisUrl, name: queueName, log: () => {} });
  await Promise.all([queue.waitUntilReady(), events.waitUntilReady(), worker.waitUntilReady()]);
});
after(async () => {
  await worker?.close();
  await events?.close();
  if (queue) {
    await queue.obliterate({ force: true });
    await queue.close();
  }
  const keys = await cache.redis.keys(`${prefix}:*`);
  if (keys.length) await cache.redis.del(...keys);
  await cache.close();
  await reportCache.close();
  await pool.end();
});

test('real Redis caches per user/date/type with TTL, then revisions invalidate direct writes and date moves', async () => {
  let loads = 0;
  const read = (user = owner, date = '2024-03-15') =>
    cache.read(user, 'reports', date, async () => {
      loads++;
      return loadReports(user, date);
    });
  assert.equal((await read()).daily.count, 0);
  await read();
  assert.equal(loads, 1);
  const keys = await cache.redis.keys(`${prefix}:*`);
  assert.equal(keys.length, 1);
  assert.ok((await cache.redis.ttl(keys[0])) > 0);
  await read(other);
  await read(owner, '2024-03-14');
  assert.equal(loads, 3);
  const id = await insert(101);
  assert.equal((await read()).daily.average, 101);
  await pool.query("UPDATE readings SET date='2024-03-14', value=155 WHERE id=$1", [id]);
  assert.equal((await read()).daily.count, 0);
  assert.equal((await read(owner, '2024-03-14')).daily.average, 155);
  await pool.query('DELETE FROM readings WHERE id=$1', [id]);
  assert.equal((await read(owner, '2024-03-14')).daily.count, 0);
  await insert(123);
  await read();
  await pool.query('TRUNCATE readings RESTART IDENTITY');
  assert.equal((await read()).daily.count, 0);
});

test('TTL expiry recomputes reports and month moves invalidate both report windows', async () => {
  let loads = 0;
  const read = (date) =>
    cache.read(owner, 'expiry', date, async () => {
      loads++;
      return loadReports(owner, date);
    });
  await read('2024-03-15');
  await read('2024-03-15');
  assert.equal(loads, 1);
  await sleep(2100);
  await read('2024-03-15');
  assert.equal(loads, 2);
  const id = await insert(144, '2024-02-20');
  assert.equal((await read('2024-03-15')).monthly.average, 144);
  assert.equal((await read('2024-02-29')).monthToDate.average, 144);
  await pool.query("UPDATE readings SET date='2024-03-03' WHERE id=$1", [id]);
  const march = await read('2024-03-15');
  assert.equal(march.monthly.count, 0);
  assert.equal(march.monthToDate.average, 144);
  assert.equal((await read('2024-02-29')).monthToDate.count, 0);
  await pool.query('DELETE FROM readings WHERE id=$1', [id]);
});

test('in-flight stale cache fill cannot overwrite the new revision', async () => {
  let release, started;
  const start = new Promise((resolve) => {
    started = resolve;
  });
  const held = cache.read(owner, 'race', '2024-03-15', async () => {
    const snapshot = await loadReports(owner, '2024-03-15');
    started();
    await new Promise((resolve) => {
      release = resolve;
    });
    return snapshot;
  });
  await start;
  const id = await insert(177);
  release();
  assert.equal((await held).daily.count, 0);
  assert.equal(
    (await cache.read(owner, 'race', '2024-03-15', () => loadReports(owner, '2024-03-15'))).daily
      .average,
    177,
  );
  await pool.query('DELETE FROM readings WHERE id=$1', [id]);
});

test('actual HTTP reports and trends refresh after create, edit, and delete with Redis enabled', async () => {
  const get = (path) => request(app).get(path).set('Cookie', cookie).expect(200);
  await get('/api/reports?date=2024-03-15');
  await get('/api/trends?date=2024-03-15');
  const added = await request(app)
    .post('/api/readings')
    .set('Cookie', cookie)
    .send({ date: '2024-03-15', slot: 'morning', value: 112 })
    .expect(201);
  assert.equal((await get('/api/reports?date=2024-03-15')).body.daily.average, 112);
  assert.equal((await get('/api/trends?date=2024-03-15')).body.readings[0].value, 112);
  await request(app)
    .put(`/api/readings/${added.body.reading.id}`)
    .set('Cookie', cookie)
    .send({ date: '2024-03-14', slot: 'morning', value: 156 })
    .expect(200);
  assert.equal((await get('/api/reports?date=2024-03-15')).body.daily.count, 0);
  assert.equal((await get('/api/trends?date=2024-03-15')).body.readings[0].value, 156);
  await request(app)
    .delete(`/api/readings/${added.body.reading.id}`)
    .set('Cookie', cookie)
    .expect(204);
  assert.equal((await get('/api/trends?date=2024-03-15')).body.readings.length, 0);
});

test('cache fails open during a real Redis connection outage and reconnects without stale data', async () => {
  const target = new URL(redisUrl),
    sockets = new Set();
  const proxy = net.createServer((socket) => {
    const upstream = net.connect(Number(target.port || 6379), target.hostname);
    sockets.add(socket);
    sockets.add(upstream);
    socket.on('error', () => {});
    upstream.on('error', () => socket.destroy());
    socket.on('close', () => {
      sockets.delete(socket);
      upstream.destroy();
    });
    upstream.on('close', () => sockets.delete(upstream));
    socket.pipe(upstream).pipe(socket);
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const port = proxy.address().port;
  const proxyUrl = new URL(redisUrl);
  proxyUrl.hostname = '127.0.0.1';
  proxyUrl.port = String(port);
  const isolated = createReportCache({ url: proxyUrl.toString(), prefix: `${prefix}:outage` });
  try {
    await ready(isolated.redis);
    const read = () =>
      isolated.read(owner, 'reports', '2024-03-15', () => loadReports(owner, '2024-03-15'));
    assert.equal((await read()).daily.count, 0);
    const ended = once(isolated.redis, 'close');
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => proxy.close(resolve));
    await ended;
    const id = await insert(166);
    assert.equal((await read()).daily.average, 166);
    proxy.listen(port, '127.0.0.1');
    await once(proxy, 'listening');
    await ready(isolated.redis);
    assert.equal((await read()).daily.average, 166);
    await pool.query('DELETE FROM readings WHERE id=$1', [id]);
  } finally {
    await isolated.close();
    for (const socket of sockets) socket.destroy();
    if (proxy.listening) await new Promise((resolve) => proxy.close(resolve));
  }
});

test('BullMQ scheduler is idempotent and records the configured timezone and 08:00 schedule', async () => {
  await scheduleReminders(queue);
  await scheduleReminders(queue);
  const schedulers = await queue.getJobSchedulers();
  assert.equal(schedulers.length, 1);
  assert.equal(schedulers[0].key, REMINDER_SCHEDULER);
  assert.equal(schedulers[0].pattern, '0 8 * * *');
  assert.equal(schedulers[0].tz, process.env.APP_TIMEZONE || 'Asia/Kolkata');
  await queue.removeJobScheduler(REMINDER_SCHEDULER);
});

test('real worker logs missing patient slots once, skips full days and doctors, survives retries', async () => {
  await pool.query(
    "INSERT INTO users(name,email,password_hash,role) VALUES('Doctor','cache-doctor@example.com','not-a-login','doctor')",
  );
  for (const slot of ['morning', 'after_breakfast', 'after_lunch', 'after_dinner'])
    await insert(100, '2024-04-01', slot, other);
  await insert(110, '2024-04-01', 'morning');
  const job = await queue.add('daily-reminder', { date: '2024-04-01' });
  assert.equal((await job.waitUntilFinished(events, 10000)).logged, 1);
  let rows = (
    await pool.query('SELECT user_id::text,missing_slots FROM reminder_logs WHERE date=$1', [
      '2024-04-01',
    ])
  ).rows;
  assert.deepEqual(rows, [
    { user_id: owner, missing_slots: ['after_breakfast', 'after_lunch', 'after_dinner'] },
  ]);
  const duplicate = await queue.add('daily-reminder', { date: '2024-04-01' });
  assert.equal((await duplicate.waitUntilFinished(events, 10000)).logged, 0);
  await pool.query('ALTER TABLE reminder_logs RENAME TO reminder_logs_unavailable');
  try {
    const failed = once(worker, 'failed');
    const retried = await queue.add('daily-reminder', { date: '2024-04-02' });
    await failed;
    await pool.query('ALTER TABLE reminder_logs_unavailable RENAME TO reminder_logs');
    assert.equal((await retried.waitUntilFinished(events, 10000)).logged, 2);
    const completed = await queue.getJob(retried.id);
    assert.equal(completed.attemptsMade, 2);
  } finally {
    await pool.query(
      "DO $$ BEGIN IF to_regclass('reminder_logs_unavailable') IS NOT NULL THEN ALTER TABLE reminder_logs_unavailable RENAME TO reminder_logs; END IF; END $$",
    );
  }
});

test('worker and reminder CLI exit nonzero promptly when Redis cannot connect', async () => {
  const unavailable = net.createServer();
  unavailable.listen(0, '127.0.0.1');
  await once(unavailable, 'listening');
  const port = unavailable.address().port;
  await new Promise((resolve) => unavailable.close(resolve));
  async function run(script, args = []) {
    const started = Date.now();
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL(script, import.meta.url)), ...args],
      {
        env: { ...process.env, DATABASE_URL: databaseUrl, REDIS_URL: `redis://127.0.0.1:${port}` },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    let failureAt;
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
      if (!failureAt && /startup failed|Reminder command failed/.test(output))
        failureAt = Date.now();
    });
    // Module loading and the initial PG connection share CPU with CI/Docker.
    // Give startup room, but separately require prompt exit after the failure
    // message, which is emitted immediately before the 1s cleanup deadline.
    const kill = setTimeout(() => child.kill('SIGKILL'), 15000);
    const [code, signal] = await once(child, 'exit');
    clearTimeout(kill);
    assert.equal(signal, null, output);
    assert.equal(code, 1, output);
    assert.ok(Date.now() - started < 14500, output);
    assert.match(output, /startup failed|Reminder command failed/);
    assert.ok(failureAt && Date.now() - failureAt < 5000, output);
  }
  await Promise.all([
    run('../src/worker.js'),
    run('../scripts/reminders.js', ['enqueue', '2024-04-03']),
  ]);
});
