import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import request from 'supertest';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('A dedicated TEST_DATABASE_URL ending in _test is required.');
process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = 'test';
const { pool } = await import('../src/db.js');
const { runMigrations } = await import('../scripts/migrate.js');
const { createApp } = await import('../src/app.js');
const app = createApp();
let ownerId, otherId, cookie;
before(async () => {
  await runMigrations();
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  const own = await request(app).post('/api/auth/register').send({ name: 'Trend Owner', email: 'trend@example.com', password: 'Trend-test-123' }).expect(201);
  ownerId = own.body.user.id;
  cookie = own.headers['set-cookie'][0].split(';')[0];
  const other = await request(app).post('/api/auth/register').send({ name: 'Other', email: 'trend-other@example.com', password: 'Trend-test-123' }).expect(201);
  otherId = other.body.user.id;
});
beforeEach(async () => { await pool.query('TRUNCATE readings RESTART IDENTITY'); });
after(async () => { await pool.end(); });
const get = query => request(app).get(`/api/trends${query}`).set('Cookie', cookie);
async function insert(date, slot, value, userId = ownerId) {
  await pool.query('INSERT INTO readings(user_id,date,slot,value) VALUES($1,$2,$3,$4)', [userId, date, slot, value]);
}

test('trend requires authentication and validates selected date', async () => {
  await request(app).get('/api/trends?date=2024-03-15').expect(401);
  for (const query of ['', '?date=wrong', '?date=2023-02-29', '?date=9999-01-01', '?date=2024-01-01&date=2024-02-01']) await get(query).expect(400);
});

test('trend returns every own reading in calendar/slot order within selected month only', async () => {
  await insert('2024-03-15', 'after_dinner', 140);
  await insert('2024-03-15', 'morning', 100);
  await insert('2024-03-01', 'after_lunch', 120);
  await insert('2024-02-29', 'morning', 40);
  await insert('2024-03-16', 'morning', 600);
  await insert('2024-03-15', 'after_lunch', 500, otherId);
  const { body } = await get('?date=2024-03-15').expect(200);
  assert.equal(body.startDate, '2024-03-01');
  assert.equal(body.endDate, '2024-03-15');
  assert.deepEqual(body.readings.map(({ date, slot, value }) => ({ date, slot, value })), [
    { date: '2024-03-01', slot: 'after_lunch', value: 120 },
    { date: '2024-03-15', slot: 'morning', value: 100 },
    { date: '2024-03-15', slot: 'after_dinner', value: 140 },
  ]);
  for (const reading of body.readings) {
    assert.equal(typeof reading.id, 'string');
    assert.deepEqual(Object.keys(reading).sort(), ['date', 'id', 'slot', 'value']);
  }
});

test('empty/single-point trends preserve dates and exact bigint IDs', async () => {
  assert.deepEqual((await get('?date=2024-02-29').expect(200)).body, { startDate: '2024-02-01', endDate: '2024-02-29', readings: [] });
  await pool.query("INSERT INTO readings(id,user_id,date,slot,value) OVERRIDING SYSTEM VALUE VALUES('9007199254740993',$1,'2024-02-29','morning',99)", [ownerId]);
  const readings = (await get('?date=2024-02-29').expect(200)).body.readings;
  assert.deepEqual(readings, [{ id: '9007199254740993', date: '2024-02-29', slot: 'morning', value: 99 }]);
});

test('a full month returns all 124 readings without list pagination truncation', async () => {
  await pool.query(`INSERT INTO readings(user_id,date,slot,value)
    SELECT $1, day::date, slot, 100 FROM generate_series('2024-01-01'::date,'2024-01-31'::date,'1 day') day
    CROSS JOIN unnest(ARRAY['morning','after_breakfast','after_lunch','after_dinner']) slot`, [ownerId]);
  const { body } = await get('?date=2024-01-31').expect(200);
  assert.equal(body.readings.length, 124);
  assert.equal(body.readings[0].date, '2024-01-01');
  assert.equal(body.readings.at(-1).slot, 'after_dinner');
});
