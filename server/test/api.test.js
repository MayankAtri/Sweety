import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import request from 'supertest';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

// Never fall back to the development database: integration tests erase their DB.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('_test')) {
  throw new Error('Set TEST_DATABASE_URL to a dedicated database whose name ends in _test.');
}
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');
const { today, reportRanges } = await import('../src/dates.js');
const app = createApp();
const password = 'Testing-password-42';
let owner, outsider, ownerId;
const cookieOf = response => response.headers['set-cookie'][0].split(';')[0];
const call = cookie => ({
  get: path => request(app).get(path).set('Cookie', cookie),
  post: path => request(app).post(path).set('Cookie', cookie),
  put: path => request(app).put(path).set('Cookie', cookie),
  delete: path => request(app).delete(path).set('Cookie', cookie),
});
before(async () => {
  execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/migrate.js', import.meta.url))], {
    env: { ...process.env, DATABASE_URL: testUrl }, stdio: 'pipe',
  });
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  const a = await request(app).post('/api/auth/register').send({ name: 'Demo Patient', email: ' OWNER@example.com ', password }).expect(201);
  owner = call(cookieOf(a));
  ownerId = a.body.user.id;
  const b = await request(app).post('/api/auth/register').send({ name: 'Other Patient', email: 'other@example.com', password }).expect(201);
  outsider = call(cookieOf(b));
});
after(async () => { await pool.end(); });

test('health checks the real database', async () => {
  const response = await request(app).get('/api/health').expect(200);
  assert.equal(response.body.status, 'ok');
});
test('registration normalizes email and stores bcrypt, never plaintext', async () => {
  const response = await owner.get('/api/auth/me').expect(200);
  assert.deepEqual(response.body.user, { id: ownerId, name: 'Demo Patient', email: 'owner@example.com', role: 'patient' });
  const { rows: [user] } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [ownerId]);
  assert.notEqual(user.password_hash, password);
  assert.ok(await bcrypt.compare(password, user.password_hash));
});
test('registration rejects duplicate email and invalid fields', async () => {
  await request(app).post('/api/auth/register').send({ name: 'Duplicate', email: 'OWNER@example.com', password }).expect(409);
  for (const body of [
    { name: '', email: 'valid@example.com', password },
    { name: 'User', email: 'broken', password },
    { name: 'Bad\0Name', email: 'valid@example.com', password },
    { name: 'User', email: 'bad\0@example.com', password },
    { name: 'User', email: 'valid@example.com', password: 'short' },
    { name: 'User', email: 'valid@example.com', password: '🙂'.repeat(19) },
  ]) await request(app).post('/api/auth/register').send(body).expect(400);
});
test('login, cookie flags, digest storage, logout revocation and expiry', async () => {
  await request(app).post('/api/auth/login').send({ email: 'owner@example.com', password: 'incorrect-password' }).expect(401);
  await request(app).post('/api/auth/login').send({ email: 'missing@example.com', password }).expect(401);
  const response = await request(app).post('/api/auth/login').send({ email: 'owner@example.com', password }).expect(200);
  assert.match(response.headers['set-cookie'][0], /HttpOnly/);
  assert.match(response.headers['set-cookie'][0], /SameSite=Lax/);
  const cookie = cookieOf(response);
  const token = cookie.split('=')[1];
  const digest = createHash('sha256').update(token).digest('hex');
  assert.equal((await pool.query('SELECT 1 FROM sessions WHERE token_hash=$1', [digest])).rowCount, 1);
  assert.equal((await pool.query('SELECT 1 FROM sessions WHERE token_hash=$1', [token])).rowCount, 0);
  await call(cookie).get('/api/auth/me').expect(200);
  await call(cookie).post('/api/auth/logout').expect(204);
  await call(cookie).get('/api/auth/me').expect(401);
  await call(cookie).post('/api/auth/logout').expect(204);
  const expired = await request(app).post('/api/auth/login').send({ email: 'owner@example.com', password }).expect(200);
  const expiredToken = cookieOf(expired).split('=')[1];
  await pool.query("UPDATE sessions SET expires_at=NOW()-INTERVAL '1 minute' WHERE token_hash=$1", [createHash('sha256').update(expiredToken).digest('hex')]);
  await call(cookieOf(expired)).get('/api/auth/me').expect(401);
});
test('all reading and report operations require authentication', async () => {
  await request(app).get('/api/readings').expect(401);
  await request(app).post('/api/readings').send({}).expect(401);
  await request(app).put('/api/readings/1').send({}).expect(401);
  await request(app).delete('/api/readings/1').expect(401);
  await request(app).get('/api/reports?date=2024-01-01').expect(401);
});
test('rejects foreign origins and malformed JSON without internal errors', async () => {
  await request(app).post('/api/auth/logout').set('Origin', 'https://evil.example').expect(403);
  await request(app).post('/api/auth/logout').set('Sec-Fetch-Site', 'cross-site').expect(403);
  await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{broken').expect(400);
  await request(app).get('/api/unknown').expect(404);
});
test('reading validation rejects missing, fractional, invalid, out-of-range values and dates', async () => {
  for (const value of [undefined, null, '', '100', 39, 601, 100.5, true]) {
    const response = await owner.post('/api/readings').send({ date: '2024-01-01', slot: 'morning', value }).expect(400);
    assert.ok(response.body.error.message);
  }
  for (const date of ['2024-02-30', '2023-02-29', '01-01-2024', '9999-01-01', '', '2024-1-1']) {
    await owner.post('/api/readings').send({ date, slot: 'morning', value: 100 }).expect(400);
  }
  await owner.post('/api/readings').send({ date: '2024-01-01', slot: 'snack', value: 100 }).expect(400);
});
test('CRUD, boundary values, duplicate slots, full day and edit exclusion', async () => {
  const date = '2024-02-29';
  const created = await owner.post('/api/readings').send({ date, slot: 'morning', value: 40 }).expect(201);
  const id = created.body.reading.id;
  assert.equal(typeof id, 'string');
  assert.equal(created.body.reading.date, date);
  await owner.post('/api/readings').send({ date, slot: 'morning', value: 100 }).expect(409);
  await owner.put(`/api/readings/${id}`).send({ date, slot: 'morning', value: 600 }).expect(200);
  for (const slot of ['after_breakfast', 'after_lunch', 'after_dinner']) {
    await owner.post('/api/readings').send({ date, slot, value: 123 }).expect(201);
  }
  const full = await owner.post('/api/readings').send({ date, slot: 'morning', value: 100 }).expect(409);
  assert.equal(full.body.error.message, 'You can add only 4 readings per day.');
  await owner.put(`/api/readings/${id}`).send({ date, slot: 'after_lunch', value: 100 }).expect(409);
  const list = await owner.get(`/api/readings?date=${date}`).expect(200);
  assert.equal(list.body.total, 4);
  assert.deepEqual(list.body.readings.map(r => r.slot), ['morning', 'after_breakfast', 'after_lunch', 'after_dinner']);
  await owner.delete(`/api/readings/${id}`).expect(204);
  await owner.delete(`/api/readings/${id}`).expect(404);
});
test('ownership isolation on reads, reports, updates and deletion', async () => {
  const response = await owner.post('/api/readings').send({ date: '2024-03-15', slot: 'morning', value: 111 }).expect(201);
  const id = response.body.reading.id;
  assert.equal((await outsider.get('/api/readings').expect(200)).body.total, 0);
  assert.equal((await outsider.get('/api/reports?date=2024-03-15').expect(200)).body.daily.count, 0);
  await outsider.put(`/api/readings/${id}`).send({ date: '2024-03-15', slot: 'morning', value: 120 }).expect(404);
  await outsider.delete(`/api/readings/${id}`).expect(404);
});
test('validates IDs and pagination without SQL errors', async () => {
  for (const id of ['abc', '-1', '0', '9223372036854775808', '1.5']) {
    await owner.delete(`/api/readings/${id}`).expect(400);
  }
  for (const query of ['page=0', 'page=abc', 'page=1.5', 'limit=0', 'limit=101', 'limit=20x', 'page=1&page=2', 'date=2024-02-31']) {
    await owner.get(`/api/readings?${query}`).expect(400);
  }
  const first = (await owner.get('/api/readings?page=1&limit=2').expect(200)).body;
  const second = (await owner.get('/api/readings?page=2&limit=2').expect(200)).body;
  assert.equal(first.readings.length, 2);
  assert.equal(first.total, second.total);
  assert.ok(!first.readings.some(a => second.readings.some(b => b.id === a.id)));
});
test('parallel creates cannot bypass duplicate slot or daily limit', async () => {
  const date = '2024-04-01';
  const results = await Promise.all(Array.from({ length: 6 }, () => owner.post('/api/readings').send({ date, slot: 'morning', value: 100 })));
  assert.equal(results.filter(r => r.status === 201).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 5);
  const additions = await Promise.all(['after_breakfast', 'after_lunch', 'after_dinner', 'after_dinner'].map(slot => owner.post('/api/readings').send({ date, slot, value: 110 })));
  assert.equal(additions.filter(r => r.status === 201).length, 3);
  assert.equal((await owner.get(`/api/readings?date=${date}`)).body.total, 4);
});
test('reports aggregate exact selected windows, rounding and slot order', async () => {
  for (const [date, slot, value] of [
    ['2023-12-01', 'morning', 80], ['2023-12-31', 'morning', 120],
    ['2024-01-01', 'morning', 100], ['2024-01-15', 'after_lunch', 151],
    ['2024-01-15', 'morning', 100], ['2024-01-16', 'morning', 600],
    ['2023-11-30', 'morning', 600],
  ]) await owner.post('/api/readings').send({ date, slot, value }).expect(201);
  const { body } = await owner.get('/api/reports?date=2024-01-15').expect(200);
  assert.deepEqual({ count: body.daily.count, highest: body.daily.highest, lowest: body.daily.lowest, average: body.daily.average }, { count: 2, highest: 151, lowest: 100, average: 125.5 });
  assert.deepEqual(body.daily.readings.map(r => r.slot), ['morning', 'after_lunch']);
  assert.equal(body.monthToDate.average, 117);
  assert.equal(body.monthToDate.count, 3);
  assert.equal(body.monthly.startDate, '2023-12-01');
  assert.equal(body.monthly.endDate, '2023-12-31');
  assert.equal(body.monthly.average, 100);
  assert.equal(body.monthly.count, 2);
  await owner.post('/api/readings').send({ date: '2024-01-15', slot: 'after_dinner', value: 101 }).expect(201);
  assert.equal((await owner.get('/api/reports?date=2024-01-15')).body.daily.average, 117.3);
});
test('empty reports return null statistics, zero count and empty daily readings', async () => {
  const { body } = await outsider.get('/api/reports?date=2024-01-01').expect(200);
  for (const report of Object.values(body)) {
    assert.equal(report.count, 0);
    assert.equal(report.highest, null);
    assert.equal(report.lowest, null);
    assert.equal(report.average, null);
  }
  assert.deepEqual(body.daily.readings, []);
  for (const date of ['', 'wrong', '2024-02-30', '9999-01-01']) await owner.get(`/api/reports?date=${date}`).expect(400);
});
test('calendar ranges handle leap years, month ends and timezone', () => {
  assert.deepEqual(reportRanges('2024-03-01').monthly, { startDate: '2024-02-01', endDate: '2024-02-29' });
  assert.deepEqual(reportRanges('2023-03-31').monthly, { startDate: '2023-02-01', endDate: '2023-02-28' });
  assert.match(today('Asia/Kolkata'), /^\d{4}-\d{2}-\d{2}$/);
});
test('database constraints reject invalid values and unknown slots independently of API', async () => {
  await assert.rejects(pool.query("INSERT INTO readings(user_id,date,slot,value) VALUES($1,'2020-01-01','morning',39)", [ownerId]), { code: '23514' });
  await assert.rejects(pool.query("INSERT INTO readings(user_id,date,slot,value) VALUES($1,'2020-01-01','snack',100)", [ownerId]), { code: '23514' });
});
test('migrations and demo seed are repeatable', async () => {
  const env = { ...process.env, DATABASE_URL: testUrl };
  execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/migrate.js', import.meta.url))], { env, stdio: 'pipe' });
  const seed = fileURLToPath(new URL('../scripts/seed.js', import.meta.url));
  execFileSync(process.execPath, [seed], { env, stdio: 'pipe' });
  const before = (await pool.query('SELECT COUNT(*)::int AS count FROM readings')).rows[0].count;
  execFileSync(process.execPath, [seed], { env, stdio: 'pipe' });
  assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM readings')).rows[0].count, before);
});

test('bigint IDs stay exact in CRUD lists and daily reports', async () => {
  const id = '9007199254740993';
  await pool.query("INSERT INTO readings(id,user_id,date,slot,value) OVERRIDING SYSTEM VALUE VALUES($1,$2,'2020-01-02','morning',100)", [id, ownerId]);
  const list = (await owner.get('/api/readings?date=2020-01-02').expect(200)).body;
  assert.equal(list.readings[0].id, id);
  const report = (await owner.get('/api/reports?date=2020-01-02').expect(200)).body;
  assert.equal(report.daily.readings[0].id, id);
  await owner.put(`/api/readings/${id}`).send({ date: '2020-01-02', slot: 'morning', value: 101 }).expect(200);
  await owner.delete(`/api/readings/${id}`).expect(204);
});

test('moving a reading into a full date is rejected without changing the original', async () => {
  const created = await owner.post('/api/readings').send({ date: '2024-04-02', slot: 'morning', value: 130 }).expect(201);
  await owner.put(`/api/readings/${created.body.reading.id}`).send({ date: '2024-04-01', slot: 'morning', value: 140 }).expect(409);
  const original = (await owner.get('/api/readings?date=2024-04-02')).body.readings[0];
  assert.equal(original.value, 130);
  assert.equal(original.date, '2024-04-02');
});
test('earliest supported report is valid and year-zero boundary is rejected', async () => {
  await owner.get('/api/reports?date=0001-01-01').expect(400);
  const { body } = await owner.get('/api/reports?date=0001-02-01').expect(200);
  assert.equal(body.monthly.startDate, '0001-01-01');
  assert.equal(body.monthly.endDate, '0001-01-31');
});
test('failed authentication attempts are rate-limited', async () => {
  const isolatedApp = createApp();
  for (let i = 0; i < 30; i++) {
    await request(isolatedApp).post('/api/auth/login').send({}).expect(400);
  }
  const blocked = await request(isolatedApp).post('/api/auth/login').send({}).expect(429);
  assert.equal(blocked.body.error.code, 'TOO_MANY_REQUESTS');
});
