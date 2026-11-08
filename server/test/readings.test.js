import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import request from 'supertest';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('_test')) throw new Error('A dedicated TEST_DATABASE_URL ending in _test is required.');
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
const { pool } = await import('../src/db.js');
const { runMigrations } = await import('../scripts/migrate.js');
const { createApp } = await import('../src/app.js');
const { today, validateDate, reportRanges } = await import('../src/dates.js');
const app = createApp();
let cookie, foreignCookie, userId, foreignId;
const api = (method, path, body, session = cookie) => {
  const req = request(app)[method](path).set('Cookie', session);
  return body === undefined ? req : req.send(body);
};
const create = (date, slot, value = 100, session = cookie) => api('post', '/api/readings', { date, slot, value }, session);
const slots = ['morning', 'after_breakfast', 'after_lunch', 'after_dinner'];
before(async () => {
  await runMigrations();
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  const register = email => request(app).post('/api/auth/register').send({ name: 'Test Reader', email, password: 'Reading-test-password' }).expect(201);
  const own = await register('reader@example.com');
  const foreign = await register('foreign@example.com');
  cookie = own.headers['set-cookie'][0].split(';')[0];
  foreignCookie = foreign.headers['set-cookie'][0].split(';')[0];
  userId = own.body.user.id;
  foreignId = foreign.body.user.id;
});
beforeEach(async () => { await pool.query('TRUNCATE readings RESTART IDENTITY'); });
after(async () => { await pool.end(); });

test('rejects whitespace and newline pollution in IDs and pagination', async () => {
  const made = await create('2024-05-01', 'morning').expect(201);
  for (const suffix of ['%0A', '%0D', '%20', '%09']) {
    await api('delete', `/api/readings/${made.body.reading.id}${suffix}`).expect(400);
    await api('get', `/api/readings?page=1${suffix}`).expect(400);
    await api('get', `/api/readings?limit=20${suffix}`).expect(400);
  }
  assert.equal((await api('get', '/api/readings')).body.total, 1);
});
test('calendar validity handles leap centuries and malformed date types', async () => {
  for (const date of ['1900-02-29', '2100-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-05-01\n', null, 20240501, [], {}]) {
    assert.equal(validateDate(date), false);
    await create(date, 'morning').expect(400);
  }
  assert.equal(validateDate('2000-02-29'), true);
  await create('2000-02-29', 'morning').expect(201);
});
test('today and future validation respect timezone midnight rather than host date', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2024-05-01T18:30:00.000Z') });
  assert.equal(today('Asia/Kolkata'), '2024-05-02');
  assert.equal(today('America/Los_Angeles'), '2024-05-01');
  assert.equal(today('Pacific/Kiritimati'), '2024-05-02');
  // APP_TIMEZONE can be supplied externally; derive dates from configured today.
  const current = today();
  await create(current, 'morning').expect(201);
  const next = new Date(`${current}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const future = next.toISOString().slice(0, 10);
  const rejected = await create(future, 'morning').expect(400);
  assert.equal(rejected.body.error.code, 'FUTURE_DATE');
  await api('get', `/api/readings?date=${future}`).expect(400);
  await api('get', `/api/reports?date=${future}`).expect(400);
  t.mock.timers.reset();
});
test('date-range helper preserves UTC calendar boundaries across DST and year rollovers', () => {
  for (const [selected, start, end] of [
    ['2024-03-10', '2024-02-01', '2024-02-29'],
    ['2024-11-03', '2024-10-01', '2024-10-31'],
    ['2025-01-01', '2024-12-01', '2024-12-31'],
    ['2000-03-01', '2000-02-01', '2000-02-29'],
    ['1900-03-01', '1900-02-01', '1900-02-28'],
  ]) assert.deepEqual(reportRanges(selected).monthly, { startDate: start, endDate: end });
});
test('server ignores injected ownership, IDs and timestamps and never exposes internal fields', async () => {
  const response = await api('post', '/api/readings', {
    date: '2024-05-01', slot: 'morning', value: 100,
    user_id: foreignId, userId: foreignId, id: '500', createdAt: '1900-01-01', updatedAt: '1900-01-01',
  }).expect(201);
  const reading = response.body.reading;
  assert.deepEqual(Object.keys(reading).sort(), ['createdAt', 'date', 'id', 'slot', 'updatedAt', 'value']);
  assert.notEqual(reading.id, '500');
  assert.match(reading.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal((await pool.query('SELECT user_id FROM readings WHERE id=$1', [reading.id])).rows[0].user_id, userId);
  assert.equal((await api('get', '/api/readings', undefined, foreignCookie)).body.total, 0);
});
test('PUT replaces all fields and preserves original on invalid or conflicting requests', async () => {
  const made = (await create('2024-05-01', 'morning', 100)).body.reading;
  const path = `/api/readings/${made.id}`;
  for (const body of [{ value: 120 }, { date: '2024-05-01', slot: 'morning' }, { date: '2024-05-01', slot: 'morning', value: [100] }, { date: '2024-05-01', slot: '__proto__', value: 100 }]) await api('put', path, body).expect(400);
  const moved = (await api('put', path, { date: '2024-05-02', slot: 'after_lunch', value: 150 }).expect(200)).body.reading;
  assert.equal(moved.createdAt, made.createdAt);
  assert.ok(Date.parse(moved.updatedAt) >= Date.parse(made.updatedAt));
  assert.equal((await api('get', '/api/readings?date=2024-05-01')).body.total, 0);
  assert.equal((await api('get', '/api/reports?date=2024-05-02')).body.daily.average, 150);
});
test('pagination is stable across days, preserves totals beyond final page, and permits limit 100', async () => {
  for (const date of ['2024-05-01', '2024-05-02']) {
    for (const slot of [...slots].reverse()) await create(date, slot).expect(201);
  }
  const first = (await api('get', '/api/readings?page=1&limit=3')).body;
  const second = (await api('get', '/api/readings?page=2&limit=3')).body;
  assert.deepEqual(first.readings.map(r => `${r.date}/${r.slot}`), slots.slice(0, 3).map(s => `2024-05-02/${s}`));
  assert.deepEqual(second.readings.map(r => `${r.date}/${r.slot}`), ['2024-05-02/after_dinner', '2024-05-01/morning', '2024-05-01/after_breakfast']);
  const absent = (await api('get', '/api/readings?page=100&limit=3')).body;
  assert.equal(absent.total, 8);
  assert.deepEqual(absent.readings, []);
  assert.equal((await api('get', '/api/readings?limit=100').expect(200)).body.readings.length, 8);
  for (const query of ['limit=1e2', 'page=01', 'page=9007199254740992', 'limit=20&limit=30', 'date=2024-05-01&date=2024-05-02']) await api('get', `/api/readings?${query}`).expect(400);
});
test('concurrent edits into one empty slot produce one winner and retain loser data', async () => {
  const one = (await create('2024-05-01', 'morning', 100)).body.reading;
  const two = (await create('2024-05-02', 'morning', 110)).body.reading;
  const result = await Promise.all([one, two].map(r => api('put', `/api/readings/${r.id}`, { date: '2024-05-03', slot: 'after_lunch', value: r.value })));
  assert.deepEqual(result.map(r => r.status).sort(), [200, 409]);
  const all = (await api('get', '/api/readings')).body;
  assert.equal(all.total, 2);
  assert.equal(all.readings.filter(r => r.date === '2024-05-03').length, 1);
});
test('delete/edit race is serializable and never resurrects a deleted record', async () => {
  for (let i = 1; i <= 8; i++) {
    const made = (await create(`2024-05-${String(i).padStart(2, '0')}`, 'morning')).body.reading;
    const path = `/api/readings/${made.id}`;
    const [deleted, edited] = await Promise.all([
      api('delete', path), api('put', path, { date: made.date, slot: 'after_lunch', value: 120 }),
    ]);
    assert.equal(deleted.status, 204);
    assert.ok([200, 404].includes(edited.status));
    assert.equal((await pool.query('SELECT 1 FROM readings WHERE id=$1', [made.id])).rowCount, 0);
  }
});
test('all slots may be created concurrently while same dates remain independent across users', async () => {
  const results = await Promise.all([cookie, foreignCookie].flatMap(session => slots.map(slot => create('2024-05-01', slot, 100, session))));
  assert.ok(results.every(r => r.status === 201));
  assert.equal((await api('get', '/api/readings')).body.total, 4);
  assert.equal((await api('get', '/api/readings', undefined, foreignCookie)).body.total, 4);
});
test('report boundaries exclude neighboring dates and other patients, then reflect edit and delete', async () => {
  for (const [date, value] of [['2024-01-31', 600], ['2024-02-01', 40], ['2024-02-29', 600], ['2024-03-01', 100], ['2024-03-15', 101], ['2024-03-16', 600]]) await create(date, 'morning', value).expect(201);
  await create('2024-03-15', 'after_lunch', 102).expect(201);
  await create('2024-03-15', 'morning', 600, foreignCookie).expect(201);
  let reports = (await api('get', '/api/reports?date=2024-03-15')).body;
  assert.deepEqual([reports.monthly.count, reports.monthly.lowest, reports.monthly.highest, reports.monthly.average], [2, 40, 600, 320]);
  assert.deepEqual([reports.monthToDate.count, reports.monthToDate.average], [3, 101]);
  assert.deepEqual([reports.daily.count, reports.daily.average], [2, 101.5]);
  const id = reports.daily.readings[0].id;
  await api('put', `/api/readings/${id}`, { date: '2024-03-15', slot: 'morning', value: 200 }).expect(200);
  reports = (await api('get', '/api/reports?date=2024-03-15')).body;
  assert.equal(reports.daily.average, 151);
  for (const reading of reports.daily.readings) await api('delete', `/api/readings/${reading.id}`).expect(204);
  reports = (await api('get', '/api/reports?date=2024-03-15')).body;
  assert.equal(reports.daily.count, 0);
  assert.equal(reports.daily.average, null);
  assert.equal(reports.monthToDate.average, 100);
});
