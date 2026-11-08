import bcrypt from 'bcrypt';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { reportRanges, today } from '../src/dates.js';

if (config.nodeEnv === 'production') {
  console.error('Demo seed is disabled in production.');
  await pool.end();
  process.exitCode = 1;
} else {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash('SweetyDemo123!', 12);
    const user = await client.query(`INSERT INTO users(name,email,password_hash)
      VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING RETURNING id`,
    ['Demo Patient', 'demo@sweety.example', hash]);
    const userId = user.rows[0]?.id || (await client.query(
      'SELECT id FROM users WHERE email = $1', ['demo@sweety.example'],
    )).rows[0].id;
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const date = today();
    const ranges = reportRanges(date);
    const samples = [
      [date, 'morning', 96], [date, 'after_breakfast', 138],
      [ranges.monthToDate.startDate, 'after_lunch', 142],
      [ranges.monthly.startDate, 'morning', 102],
      [ranges.monthly.endDate, 'after_dinner', 151],
    ];
    for (const [sampleDate, slot, value] of samples) {
      await client.query(`INSERT INTO readings(user_id,date,slot,value) VALUES ($1,$2,$3,$4)
        ON CONFLICT (user_id,date,slot) DO NOTHING`, [userId, sampleDate, slot, value]);
    }
    await client.query('COMMIT');
    console.log('Demo data ready: demo@sweety.example / SweetyDemo123! (development only). Existing account passwords are unchanged.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', error.code || error.name);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}
