import { once } from 'node:events';
import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

let server;
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const timeout = setTimeout(() => process.exit(1), 10_000).unref();
  try {
    if (server?.listening) {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    await pool.end();
    clearTimeout(timeout);
    process.exit(0);
  } catch (error) {
    console.error('Shutdown failed:', error.code || error.name);
    process.exit(1);
  }
}

try {
  await pool.query('SELECT 1');
  server = createApp().listen(config.port);
  await once(server, 'listening');
  console.log(`Sweety API listening on http://localhost:${config.port}`);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  // Database errors can contain connection details; emit only a safe code.
  console.error('Startup failed:', error.code || error.name);
  await pool.end();
  process.exitCode = 1;
}
