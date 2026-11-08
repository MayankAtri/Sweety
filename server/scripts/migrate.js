import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { pool } from '../src/db.js';

export async function runMigrations(database = pool) {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    // Serialize concurrent migration processes before creating the ledger.
    await client.query('SELECT pg_advisory_xact_lock(73501924)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const directory = new URL('../migrations/', import.meta.url);
    const files = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
    for (const name of files) {
      const existing = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (existing.rowCount) continue;
      await client.query(await readFile(new URL(name, directory), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
      console.log(`Applied ${name}`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    await runMigrations();
    console.log('Database migrations complete.');
  } catch (error) {
    console.error('Migration failed:', error.code || error.name);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
