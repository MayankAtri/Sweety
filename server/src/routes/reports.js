import { Router } from 'express';
import { reportCache } from '../cache.js';
import { pool } from '../db.js';
import { reportRanges } from '../dates.js';
import { SLOTS } from '../validation.js';
import { selectedDate, serializeReading } from './readings.js';

const router = Router();

router.get('/', async (req, res) => {
  const date = selectedDate(req.query.date);
  const userId = req.reportUserId ?? req.user.id;
  const reports = await reportCache.read(userId, 'reports', date, () => loadReports(userId, date));
  res.json(reports);
});

export async function loadReports(userId, date) {
  const ranges = reportRanges(date);
  // One statement gives all windows the same database snapshot during concurrent writes.
  const { rows } = await pool.query(
    `WITH windows (name, start_date, end_date) AS (
       VALUES ('daily', $2::date, $3::date),
              ('monthToDate', $4::date, $5::date),
              ('monthly', $6::date, $7::date)
     )
     SELECT w.name, max(r.value) AS highest, min(r.value) AS lowest,
       round(avg(r.value), 1)::float8 AS average, count(r.id)::int AS count,
       COALESCE(jsonb_agg(to_jsonb(r) || jsonb_build_object('id', r.id::text) ORDER BY array_position($8::text[], r.slot))
         FILTER (WHERE w.name = 'daily' AND r.id IS NOT NULL), '[]'::jsonb) AS readings
     FROM windows w
     LEFT JOIN readings r ON r.user_id = $1 AND r.date BETWEEN w.start_date AND w.end_date
     GROUP BY w.name`,
    [
      userId,
      ranges.daily.startDate,
      ranges.daily.endDate,
      ranges.monthToDate.startDate,
      ranges.monthToDate.endDate,
      ranges.monthly.startDate,
      ranges.monthly.endDate,
      SLOTS,
    ],
  );
  const reports = {};
  for (const row of rows) {
    reports[row.name] = {
      ...ranges[row.name],
      highest: row.highest,
      lowest: row.lowest,
      average: row.average,
      count: row.count,
      ...(row.name === 'daily' ? { readings: row.readings.map(serializeReading) } : {}),
    };
  }
  return reports;
}

export default router;
