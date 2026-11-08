import bcrypt from 'bcrypt';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { reportRanges, today } from '../src/dates.js';

if (config.nodeEnv === 'production') {
  console.error('Demo seed is disabled in production.');
  await pool.end();
  process.exitCode = 1;
} else {
  let client;
  try {
    client = await pool.connect();
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
    const doctorHash = await bcrypt.hash('SweetyDoctor123!', 12);
    await client.query(`INSERT INTO users(name,email,password_hash,role)
      VALUES ($1,$2,$3,'doctor') ON CONFLICT (email) DO NOTHING`,
    ['Demo Doctor', 'doctor@sweety.example', doctorHash]);
    const { rows: [doctor] } = await client.query(
      'SELECT id,role FROM users WHERE email=$1', ['doctor@sweety.example'],
    );
    if (doctor.role !== 'doctor') throw new Error('DEMO_DOCTOR_ROLE_CONFLICT');
    await client.query(`INSERT INTO doctor_patients(doctor_id,patient_id)
      VALUES ($1,$2) ON CONFLICT DO NOTHING`, [doctor.id, userId]);
    await client.query('COMMIT');
    console.log('Demo doctor ready: doctor@sweety.example / SweetyDoctor123! (development only).');
    console.log('Demo data ready: demo@sweety.example / SweetyDemo123! (development only). Existing account passwords are unchanged.');
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Seed failed:', error.code || error.name);
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool.end();
  }
}
