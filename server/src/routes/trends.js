import { Router } from 'express';
import { reportCache } from '../cache.js';
import { pool } from '../db.js';
import { selectedDate } from './readings.js';
import { SLOTS } from '../validation.js';

const router = Router();

router.get('/', async (req, res) => {
  const endDate = selectedDate(req.query.date);
  const userId = req.reportUserId ?? req.user.id;
  res.json(await reportCache.read(userId, 'trends', endDate, () => loadTrends(userId, endDate)));
});

export async function loadTrends(userId, endDate) {
  const startDate = `${endDate.slice(0, 7)}-01`;
  // The four-slot unique constraint bounds one calendar month to 124 rows.
  // Return every individual measurement; chart clients must not invent missing data.
  const { rows } = await pool.query(
    `SELECT id::text, date, slot, value FROM readings
     WHERE user_id = $1 AND date BETWEEN $2::date AND $3::date
     ORDER BY date ASC, array_position($4::text[], slot)`,
    [userId, startDate, endDate, SLOTS],
  );
  return { startDate, endDate, readings: rows };
}

export default router;
