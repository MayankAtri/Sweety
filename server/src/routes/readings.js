import { Router } from 'express';
import { pool } from '../db.js';
import { AppError } from '../errors.js';
import { today, validateDate } from '../dates.js';
import { validateReading, SLOT_LABELS, SLOTS } from '../validation.js';

const router = Router();
const MAX_BIGINT = 9223372036854775807n;

export function serializeReading(row) {
  return {
    id: String(row.id),
    date: row.date,
    slot: row.slot,
    value: row.value,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function selectedDate(value) {
  if (!validateDate(value)) {
    throw new AppError(400, 'INVALID_DATE', 'Please enter a valid date in YYYY-MM-DD format.');
  }
  if (value > today()) {
    throw new AppError(400, 'FUTURE_DATE', 'Date cannot be in the future.');
  }
  return value;
}

function readingId(value) {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > MAX_BIGINT) {
    throw new AppError(400, 'INVALID_ID', 'Please provide a valid reading ID.');
  }
  return value;
}

function positiveInteger(value, fallback, maximum, field) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new AppError(400, 'INVALID_PAGINATION', `${field} must be a positive whole number.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > maximum) {
    throw new AppError(400, 'INVALID_PAGINATION', `${field} must be between 1 and ${maximum}.`);
  }
  return number;
}

// All mutations for a user acquire the same lock, including edits and deletes.
// This makes duplicate/full-day checks reliable when requests arrive together.
async function withUserLock(userId, action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await client.query('SELECT id, role FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!user.rowCount) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue.');
    if (user.rows[0].role !== 'patient') throw new AppError(403, 'PATIENT_REQUIRED', 'This action is available to patient accounts only.');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function checkSlot(client, userId, reading, excludedId = null) {
  const { rows } = await client.query(
    'SELECT slot FROM readings WHERE user_id = $1 AND date = $2 AND ($3::bigint IS NULL OR id <> $3)',
    [userId, reading.date, excludedId],
  );
  if (rows.length >= 4) {
    throw new AppError(409, 'DAILY_LIMIT', 'You can add only 4 readings per day.');
  }
  if (rows.some((row) => row.slot === reading.slot)) {
    throw new AppError(409, 'DUPLICATE_SLOT', `You already have ${reading.slot === 'morning' ? 'a' : 'an'} ${SLOT_LABELS[reading.slot]} reading for this date.`);
  }
}

router.get('/', async (req, res) => {
  const date = req.query.date === undefined ? null : selectedDate(req.query.date);
  const limit = positiveInteger(req.query.limit, 20, 100, 'limit');
  // Keep multiplication and PostgreSQL OFFSET safely inside JavaScript's integer range.
  const page = positiveInteger(req.query.page, 1, Math.floor(Number.MAX_SAFE_INTEGER / limit), 'page');
  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `WITH matching AS (
       SELECT * FROM readings WHERE user_id = $1 AND ($2::date IS NULL OR date = $2)
     ), paged AS (
       SELECT * FROM matching
       ORDER BY date DESC, array_position($3::text[], slot)
       LIMIT $4 OFFSET $5
     )
     SELECT (SELECT count(*)::int FROM matching) AS total,
       COALESCE(jsonb_agg(to_jsonb(paged) || jsonb_build_object('id', paged.id::text) ORDER BY date DESC, array_position($3::text[], slot))
         FILTER (WHERE id IS NOT NULL), '[]'::jsonb) AS readings
     FROM paged`,
    [req.user.id, date, SLOTS, limit, offset],
  );
  res.json({ readings: rows[0].readings.map(serializeReading), page, limit, total: rows[0].total });
});

router.post('/', async (req, res) => {
  const reading = validateReading(req.body);
  const saved = await withUserLock(req.user.id, async (client) => {
    await checkSlot(client, req.user.id, reading);
    const { rows } = await client.query(
      'INSERT INTO readings (user_id, date, slot, value) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, reading.date, reading.slot, reading.value],
    );
    return rows[0];
  });
  res.status(201).json({ reading: serializeReading(saved) });
});

router.put('/:id', async (req, res) => {
  const id = readingId(req.params.id);
  const reading = validateReading(req.body);
  const saved = await withUserLock(req.user.id, async (client) => {
    const existing = await client.query('SELECT id FROM readings WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!existing.rowCount) throw new AppError(404, 'NOT_FOUND', 'Reading not found.');
    await checkSlot(client, req.user.id, reading, id);
    const { rows } = await client.query(
      'UPDATE readings SET date = $1, slot = $2, value = $3, updated_at = now() WHERE id = $4 AND user_id = $5 RETURNING *',
      [reading.date, reading.slot, reading.value, id, req.user.id],
    );
    return rows[0];
  });
  res.json({ reading: serializeReading(saved) });
});

router.delete('/:id', async (req, res) => {
  const id = readingId(req.params.id);
  await withUserLock(req.user.id, async (client) => {
    const result = await client.query('DELETE FROM readings WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!result.rowCount) throw new AppError(404, 'NOT_FOUND', 'Reading not found.');
  });
  res.status(204).end();
});

export default router;
