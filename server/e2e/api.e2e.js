import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must name a dedicated disposable database ending in _test.');
}
const origin = 'http://localhost:5173';
let server, base, serverPort;
const environment = { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'test', CLIENT_ORIGIN: origin };
const script = name => fileURLToPath(new URL(`../${name}`, import.meta.url));

async function startServer() {
  const reserve = net.createServer();
  reserve.listen(0, '127.0.0.1');
  await once(reserve, 'listening');
  serverPort = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  base = `http://127.0.0.1:${serverPort}/api`;
  server = spawn(process.execPath, [script('src/index.js')], {
    env: { ...environment, PORT: String(serverPort) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Exercise the real startup entrypoint and TCP listener, not createApp/Supertest.
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('API did not start within 10 seconds')), 10_000);
    function ready(chunk) {
      if (chunk.toString().includes('Sweety API listening')) {
        clearTimeout(timeout);
        server.stdout.off('data', ready);
        resolve();
      }
    }
    server.stdout.on('data', ready);
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`API exited before ready: ${code}`)); });
    server.stderr.resume();
  });
}
async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const exited = once(server, 'exit');
  server.kill('SIGTERM');
  const timeout = setTimeout(() => server.kill('SIGKILL'), 12_000);
  const [code, signal] = await exited;
  clearTimeout(timeout);
  assert.equal(signal, null, 'server should finish graceful shutdown without being force-killed');
  assert.equal(code, 0);
}
function browser() {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    async send(path, { method = 'GET', body, status = 200, headers = {} } = {}) {
      const response = await fetch(`${base}${path}`, {
        method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10_000),
      });
      const text = await response.text();
      assert.equal(response.status, status, `${method} ${path}: ${text}`);
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      return { body: text ? JSON.parse(text) : null, headers: response.headers };
    },
  };
}
before(async () => {
  execFileSync(process.execPath, [script('scripts/migrate.js')], { env: environment, stdio: 'pipe' });
  execFileSync(process.execPath, [script('scripts/seed.js')], { env: environment, stdio: 'pipe' });
  await startServer();
});
after(stopServer);

test('HTTP E2E: new patient → readings → reports → restart → isolation → logout', { timeout: 30_000 }, async () => {
  const alice = browser();
  const bob = browser();
  const email = `e2e-${crypto.randomUUID()}@example.com`;
  const password = 'E2E-password-2026';
  await alice.send('/health');
  await alice.send('/readings', { status: 401 });
  const registration = await alice.send('/auth/register', { method: 'POST', status: 201,
    body: { name: 'E2E Patient', email, password } });
  assert.match(registration.headers.get('set-cookie'), /HttpOnly/);
  assert.equal(registration.body.user.email, email);
  assert.deepEqual(Object.keys(registration.body.user).sort(), ['email', 'id', 'name']);
  assert.equal((await alice.send('/auth/me')).body.user.id, registration.body.user.id);
  const empty = (await alice.send('/reports?date=2024-05-15')).body;
  assert.equal(empty.daily.count, 0);
  assert.equal(empty.monthly.average, null);

  for (const value of ['', 39, 600.1, '100']) {
    await alice.send('/readings', { method: 'POST', body: { date: '2024-05-15', slot: 'morning', value }, status: 400 });
  }
  await alice.send('/readings', { method: 'POST', body: { date: '9999-12-31', slot: 'morning', value: 100 }, status: 400 });
  const readings = [];
  for (const [slot, value] of [['morning', 90], ['after_breakfast', 130], ['after_lunch', 150], ['after_dinner', 110]]) {
    readings.push((await alice.send('/readings', { method: 'POST', status: 201, body: { date: '2024-05-15', slot, value } })).body.reading);
  }
  const full = await alice.send('/readings', { method: 'POST', status: 409, body: { date: '2024-05-15', slot: 'morning', value: 99 } });
  assert.equal(full.body.error.code, 'DAILY_LIMIT');
  await alice.send('/readings', { method: 'POST', status: 201, body: { date: '2024-05-01', slot: 'morning', value: 100 } });
  await alice.send('/readings', { method: 'POST', status: 201, body: { date: '2024-04-30', slot: 'morning', value: 80 } });
  const reports = (await alice.send('/reports?date=2024-05-15')).body;
  assert.equal(reports.daily.average, 120);
  assert.equal(reports.daily.highest, 150);
  assert.equal(reports.daily.lowest, 90);
  assert.equal(reports.monthToDate.average, 116);
  assert.equal(reports.monthToDate.count, 5);
  assert.equal(reports.monthly.average, 80);
  assert.equal(reports.monthly.count, 1);
  const page1 = (await alice.send('/readings?page=1&limit=2')).body;
  const page2 = (await alice.send('/readings?page=2&limit=2')).body;
  assert.equal(page1.total, 6);
  assert.ok(page1.readings.every(a => page2.readings.every(b => a.id !== b.id)));

  await alice.send(`/readings/${readings[0].id}`, { method: 'PUT', body: { date: '2024-05-15', slot: 'morning', value: 100 } });
  await alice.send(`/readings/${readings[3].id}`, { method: 'DELETE', status: 204 });
  assert.equal((await alice.send('/reports?date=2024-05-15')).body.daily.average, 126.7);
  // Restart the actual process: records and sessions must survive in PostgreSQL.
  await stopServer();
  await startServer();
  assert.equal((await alice.send('/auth/me')).body.user.id, registration.body.user.id);
  assert.equal((await alice.send('/reports?date=2024-05-15')).body.daily.count, 3);

  await bob.send('/auth/register', { method: 'POST', status: 201,
    body: { name: 'Other E2E Patient', email: `e2e-${crypto.randomUUID()}@example.com`, password } });
  assert.equal((await bob.send('/readings')).body.total, 0);
  assert.equal((await bob.send('/reports?date=2024-05-15')).body.daily.count, 0);
  await bob.send(`/readings/${readings[0].id}`, { method: 'PUT', status: 404, body: { date: '2024-05-15', slot: 'morning', value: 200 } });
  await bob.send(`/readings/${readings[0].id}`, { method: 'DELETE', status: 404 });
  await alice.send('/readings', { method: 'POST', status: 403, headers: { Origin: 'https://foreign.example' }, body: { date: '2024-05-15', slot: 'after_dinner', value: 100 } });
  const oldCookie = alice.cookie;
  await alice.send('/auth/logout', { method: 'POST', status: 204 });
  await alice.send('/auth/me', { status: 401 });
  await browser().send('/readings', { status: 401, headers: { Cookie: oldCookie } });
  await alice.send('/auth/login', { method: 'POST', status: 401, body: { email, password: 'wrong-password' } });
  await alice.send('/auth/login', { method: 'POST', body: { email, password } });
  assert.equal((await alice.send('/readings')).body.total, 5);
  await alice.send('/auth/logout', { method: 'POST', status: 204 });
  await bob.send('/auth/logout', { method: 'POST', status: 204 });
});
