import pg from 'pg';
import { config } from './config.js';

// A glucose date is a calendar day, not a timestamp in the host machine's zone.
pg.types.setTypeParser(1082, (value) => value);
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});
pool.on('error', () => console.error('Unexpected idle database connection error.'));
export const query = (text, values) => pool.query(text, values);
