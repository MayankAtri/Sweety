import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import request from 'supertest';
import dotenv from 'dotenv';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('_test')) {
  throw new Error('Set TEST_DATABASE_URL to a dedicated database whose name ends in _test.');
}
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');
const { config } = await import('../src/config.js');
const app = createApp();
const password = 'Security-test-42';
const cookieOf = response => response.headers['set-cookie'][0].split(';')[0];
const login = (cookie) => {
  const req = request(app).post('/api/auth/login');
  if (cookie) req.set('Cookie', cookie);
  return req.send({ email: 'security@example.com', password });
};
let initialCookie;
before(async () => {
  execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/migrate.js', import.meta.url))], { env: process.env, stdio: 'pipe' });
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  const response = await request(app).post('/api/auth/register').send({ name: 'Security User', email: 'security@example.com', password }).expect(201);
  initialCookie = cookieOf(response);
});
after(async () => { await pool.end(); });

test('login rotates the supplied session while a separate device remains authenticated', async () => {
  const separate = cookieOf(await login().expect(200));
  const rotated = cookieOf(await login(initialCookie).expect(200));
  assert.notEqual(rotated, initialCookie);
  await request(app).get('/api/auth/me').set('Cookie', initialCookie).expect(401);
  await request(app).get('/api/auth/me').set('Cookie', separate).expect(200);
  await request(app).get('/api/auth/me').set('Cookie', rotated).expect(200);
  await request(app).post('/api/auth/logout').set('Cookie', rotated).expect(204);
  await request(app).get('/api/auth/me').set('Cookie', rotated).expect(401);
  await request(app).get('/api/auth/me').set('Cookie', separate).expect(200);
});

test('registration rotates a current session and never returns internal account fields', async () => {
  const old = cookieOf(await login().expect(200));
  const registered = await request(app).post('/api/auth/register').set('Cookie', old).send({ name: 'Second Account', email: 'second@example.com', password }).expect(201);
  assert.deepEqual(Object.keys(registered.body.user).sort(), ['email', 'id', 'name']);
  await request(app).get('/api/auth/me').set('Cookie', old).expect(401);
  const current = await request(app).get('/api/auth/me').set('Cookie', cookieOf(registered)).expect(200);
  assert.equal(current.body.user.email, 'second@example.com');
});

test('concurrent normalized duplicate registration creates exactly one user and session', async () => {
  const attempts = await Promise.all(['race@example.com', ' RACE@example.com '].map(email => request(app).post('/api/auth/register').send({ name: 'Race', email, password })));
  assert.deepEqual(attempts.map(r => r.status).sort(), [201, 409]);
  const result = await pool.query("SELECT count(*)::int AS count FROM sessions JOIN users ON users.id=sessions.user_id WHERE users.email='race@example.com'");
  assert.equal(result.rows[0].count, 1);
});

test('bcrypt UTF-8 boundary accepts 72 bytes but rejects longer passwords without truncation', async () => {
  const boundary = '🙂'.repeat(18);
  await request(app).post('/api/auth/register').send({ name: 'Unicode', email: 'unicode@example.com', password: boundary }).expect(201);
  await request(app).post('/api/auth/login').send({ email: 'unicode@example.com', password: boundary }).expect(200);
  await request(app).post('/api/auth/login').send({ email: 'unicode@example.com', password: `${boundary}x` }).expect(400);
  await request(app).post('/api/auth/register').send({ name: 'Long', email: 'long@example.com', password: 'a'.repeat(73) }).expect(400);
  await request(app).post('/api/auth/register').send({ name: 'Short', email: 'short@example.com', password: '🙂'.repeat(7) }).expect(400);
});

test('unknown and wrong-password logins share an error and failed login preserves current session', async () => {
  const current = cookieOf(await login().expect(200));
  const wrong = await request(app).post('/api/auth/login').set('Cookie', current).send({ email: 'security@example.com', password: 'incorrect-password' }).expect(401);
  const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'incorrect-password' }).expect(401);
  assert.deepEqual(wrong.body, unknown.body);
  assert.equal(wrong.headers['set-cookie'], undefined);
  await request(app).get('/api/auth/me').set('Cookie', current).expect(200);
});

test('tampered, malformed and expired cookies never authenticate', async () => {
  for (const token of ['bad', 'a'.repeat(64), '%ZZ', 'j:%7B%22test%22%3Atrue%7D']) {
    await request(app).get('/api/auth/me').set('Cookie', `sweety_session=${token}`).expect(401);
  }
  const current = cookieOf(await login().expect(200));
  const tokenHash = createHash('sha256').update(current.split('=')[1]).digest('hex');
  await pool.query("UPDATE sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=$1", [tokenHash]);
  const response = await request(app).get('/api/auth/me').set('Cookie', current).expect(401);
  assert.match(response.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/);
});

test('allowed browser origin supports credentialed preflight; foreign and null origins are denied', async () => {
  const preflight = await request(app).options('/api/readings').set('Origin', config.clientOrigin).set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type').expect(204);
  assert.equal(preflight.headers['access-control-allow-origin'], config.clientOrigin);
  assert.equal(preflight.headers['access-control-allow-credentials'], 'true');
  for (const origin of ['null', `${config.clientOrigin}.evil.example`, 'https://evil.example']) {
    const denied = await request(app).post('/api/auth/logout').set('Origin', origin).expect(403);
    assert.equal(denied.headers['access-control-allow-origin'], undefined);
  }
  await request(app).post('/api/auth/logout').set('Sec-Fetch-Site', 'cross-site').expect(403);
});

test('JSON parser rejects malformed, oversized and unsupported encodings as client errors', async () => {
  await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{').expect(400);
  await request(app).post('/api/auth/login').send({ padding: 'x'.repeat(17000) }).expect(413);
  const charset = await request(app).post('/api/auth/login').set('Content-Type', 'application/json; charset=iso-8859-1').send('{}').expect(415);
  assert.equal(charset.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
  const encoding = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').set('Content-Encoding', 'unsupported').send('{}').expect(415);
  assert.equal(encoding.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
  const compressed = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').set('Content-Encoding', 'gzip').send('invalid-gzip').expect(400);
  assert.equal(compressed.body.error.code, 'INVALID_BODY');
});

test('malformed URL encoding returns JSON 400 instead of an internal error', async () => {
  const current = cookieOf(await login().expect(200));
  const response = await request(app).delete('/api/readings/%E0%A4%A').set('Cookie', current).expect(400);
  assert.equal(response.body.error.code, 'INVALID_URL');
});

test('sensitive API responses disable caching and have security headers', async () => {
  const current = cookieOf(await login().expect(200));
  for (const path of ['/api/auth/me', '/api/readings', '/api/reports?date=2024-01-01']) {
    const response = await request(app).get(path).set('Cookie', current).expect(200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-powered-by'], undefined);
  }
});

test('production session and clearing cookies retain Secure HttpOnly and SameSite flags', () => {
  const script = `
    const { setSessionCookie, clearSessionCookie } = await import('./server/src/auth.js');
    const observed = [];
    const response = { cookie(name,value,options) { observed.push(options); }, clearCookie(name,options) { observed.push(options); } };
    setSessionCookie(response, 'test'); clearSessionCookie(response);
    console.log(JSON.stringify(observed));
    const { pool } = await import('./server/src/db.js'); await pool.end();
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ...process.env, NODE_ENV: 'production', CLIENT_ORIGIN: 'https://sweety.example' }, encoding: 'utf8',
  });
  const flags = JSON.parse(output);
  for (const value of flags) {
    assert.equal(value.secure, true);
    assert.equal(value.httpOnly, true);
    assert.equal(value.sameSite, 'lax');
    assert.equal(value.path, '/');
  }
  assert.equal(flags[0].maxAge, 7 * 24 * 60 * 60 * 1000);
});
