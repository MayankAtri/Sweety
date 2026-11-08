import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('Set TEST_DATABASE_URL to a disposable database ending in _test.');
}
const baseEnv = { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'test', CLIENT_ORIGIN: 'http://localhost:5173', APP_TIMEZONE: 'Asia/Kolkata', PORT: '3001' };
process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = 'test';
const { pool } = await import('../src/db.js');
const { runMigrations } = await import('../scripts/migrate.js');
const src = name => fileURLToPath(new URL(`../${name}`, import.meta.url));

function run(args, overrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env: { ...baseEnv, ...overrides }, cwd: fileURLToPath(new URL('../', import.meta.url)) });
    let stdout = '', stderr = '';
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    child.on('error', reject);
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Child process timed out')); }, 15000);
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
  });
}
const configArgs = ['--input-type=module', '-e', `await import(${JSON.stringify(new URL('../src/config.js', import.meta.url).href)});`];
async function freePort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}
before(async () => { await runMigrations(); });
after(async () => { await pool.end(); });

test('runtime config rejects invalid environment values and requires production HTTPS', async () => {
  for (const overrides of [
    { REDIS_URL: 'http://invalid.example' }, { CACHE_TTL_SECONDS: '0' }, { CACHE_TTL_SECONDS: '3601' }, { CACHE_TTL_SECONDS: '1.5' },
    { NODE_ENV: 'staging' }, { PORT: '0' }, { PORT: '65536' }, { PORT: '1.5' },
    { DATABASE_URL: 'https://example.com/db' }, { DATABASE_URL: 'broken' },
    { APP_TIMEZONE: 'Mars/Nowhere' }, { CLIENT_ORIGIN: 'http://localhost:5173/' },
    { CLIENT_ORIGIN: 'https://example.com/path' }, { NODE_ENV: 'production', CLIENT_ORIGIN: 'http://example.com' },
  ]) {
    const result = await run(configArgs, overrides);
    assert.notEqual(result.code, 0, JSON.stringify(overrides));
  }
  assert.equal((await run(configArgs, { NODE_ENV: 'production', CLIENT_ORIGIN: 'https://example.com' })).code, 0);
});

test('concurrent migration processes are idempotent with a single ledger entry', async () => {
  const results = await Promise.all(Array.from({ length: 3 }, () => run([src('scripts/migrate.js')])));
  results.forEach(result => assert.equal(result.code, 0, result.stderr));
  const { rows } = await pool.query('SELECT name,count(*)::int AS count FROM schema_migrations GROUP BY name');
  assert.ok(rows.length >= 1);
  assert.ok(rows.every(row => row.count === 1));
});

test('a failing migration rolls back schema creation and its migration ledger', async () => {
  // A conflicting pre-existing table forces the real SQL migration to fail in
  // an isolated schema, without editing tracked migrations or other test data.
  await pool.query('CREATE SCHEMA foundation_rollback');
  const isolated = new pg.Pool({ connectionString: databaseUrl, options: '-c search_path=foundation_rollback' });
  try {
    await isolated.query('CREATE TABLE readings (sentinel integer)');
    await assert.rejects(runMigrations(isolated), { code: '42P07' });
    const { rows: [row] } = await isolated.query("SELECT to_regclass('foundation_rollback.users') AS users, to_regclass('foundation_rollback.schema_migrations') AS ledger");
    assert.equal(row.users, null);
    assert.equal(row.ledger, null);
    assert.equal((await isolated.query('SELECT * FROM readings')).rowCount, 0);
  } finally {
    await isolated.end();
    await pool.query('DROP SCHEMA foundation_rollback CASCADE');
  }
});

test('seed preserves existing demo password and readings and refuses production', async () => {
  const first = await run([src('scripts/seed.js')]);
  assert.equal(first.code, 0, first.stderr);
  const { rows: [user] } = await pool.query("SELECT id,password_hash FROM users WHERE email='demo@sweety.example'");
  const { rows: [reading] } = await pool.query('SELECT id FROM readings WHERE user_id=$1 ORDER BY id LIMIT 1', [user.id]);
  await pool.query('UPDATE readings SET value=177 WHERE id=$1', [reading.id]);
  const count = (await pool.query('SELECT count(*)::int AS count FROM readings WHERE user_id=$1', [user.id])).rows[0].count;
  assert.equal((await run([src('scripts/seed.js')])).code, 0);
  assert.equal((await pool.query('SELECT password_hash FROM users WHERE id=$1', [user.id])).rows[0].password_hash, user.password_hash);
  assert.equal((await pool.query('SELECT value FROM readings WHERE id=$1', [reading.id])).rows[0].value, 177);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM readings WHERE user_id=$1', [user.id])).rows[0].count, count);
  const production = await run([src('scripts/seed.js')], { NODE_ENV: 'production', CLIENT_ORIGIN: 'https://example.com' });
  assert.equal(production.code, 1);
  assert.match(production.stderr, /disabled in production/);
});

test('database-unavailable seed and startup fail clearly without connection details', async () => {
  const closedPort = await freePort();
  const inaccessible = `postgres://sensitive_user:sensitive_password@127.0.0.1:${closedPort}/sensitive_database`;
  for (const script of ['scripts/seed.js', 'src/index.js']) {
    const result = await run([src(script)], { DATABASE_URL: inaccessible });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /(?:Seed|Startup) failed:/);
    assert.doesNotMatch(result.stderr, /sensitive_|node_modules|at /);
  }
});

test('server starts over TCP, health works, and SIGTERM exits cleanly', async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [src('src/index.js')], { env: { ...baseEnv, PORT: String(port) } });
  const exited = once(child, 'exit');
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  try {
    const deadline = Date.now() + 10000;
    while (!stdout.includes('Sweety API listening')) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${stderr}`);
      if (Date.now() > deadline) throw new Error('Server startup timed out');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    child.kill('SIGTERM');
    const [code, signal] = await exited;
    assert.equal(code, 0, stderr);
    assert.equal(signal, null);
  } finally { if (child.exitCode === null) child.kill('SIGKILL'); }
});

test('occupied API port exits with a handled bind error', async () => {
  const listener = createServer();
  listener.listen(0);
  await once(listener, 'listening');
  try {
    const result = await run([src('src/index.js')], { PORT: String(listener.address().port) });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Startup failed: EADDRINUSE/);
    assert.doesNotMatch(result.stderr, /Unhandled|node_modules/);
  } finally { await new Promise(resolve => listener.close(resolve)); }
});
