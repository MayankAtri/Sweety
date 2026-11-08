import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

await pool.query('SELECT 1');
const server = createApp().listen(config.port, () => {
  console.log(`Sweety API listening on http://localhost:${config.port}`);
});
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  const timeout = setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => {
    await pool.end();
    clearTimeout(timeout);
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
