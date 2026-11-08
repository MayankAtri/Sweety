import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import dotenv from 'dotenv';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('_test')) {
  throw new Error('Set TEST_DATABASE_URL to a dedicated database ending in _test.');
}
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');
const { config } = await import('../src/config.js');
const { today } = await import('../src/dates.js');
const app = createApp();
after(async () => { await pool.end(); });

test('public client config exposes only timezone and current calendar date without caching', async () => {
  // Establish that this test uses the configured real PostgreSQL environment;
  // the public endpoint itself does not require a database query or a session.
  await pool.query('SELECT 1');
  const response = await request(app).get('/api/config').expect(200);
  assert.deepEqual(Object.keys(response.body).sort(), ['timeZone', 'today']);
  assert.equal(response.body.timeZone, config.appTimezone);
  assert.equal(response.body.today, today());
  assert.match(response.body.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['set-cookie'], undefined);
});

test('client config calendar advances according to the server timezone', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2024-05-01T18:30:00Z') });
  try {
    const response = await request(app).get('/api/config').expect(200);
    assert.equal(response.body.today, today(config.appTimezone));
    assert.equal(response.body.timeZone, config.appTimezone);
  } finally { t.mock.timers.reset(); }
});
