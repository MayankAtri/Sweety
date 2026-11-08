import { Router } from 'express';
import { pool } from '../db.js';
import { AppError } from '../errors.js';
import reportsRouter from './reports.js';
import trendsRouter from './trends.js';

const router = Router();
router.use((req, res, next) => {
  if (req.user.role !== 'doctor') {
    throw new AppError(403, 'DOCTOR_REQUIRED', 'This action is available to doctor accounts only.');
  }
  next();
});

function positiveInteger(value, fallback, maximum) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)
    || !Number.isSafeInteger(number) || number > maximum) {
    throw new AppError(400, 'INVALID_PAGINATION', 'Please provide valid positive page and limit values.');
  }
  return number;
}

router.get('/patients', async (req, res) => {
  const limit = positiveInteger(req.query.limit, 20, 100);
  const page = positiveInteger(req.query.page, 1, Math.floor(Number.MAX_SAFE_INTEGER / limit));
  const { rows: [result] } = await pool.query(
    `WITH assigned AS (
       SELECT u.id, u.name, u.email FROM users u
       JOIN doctor_patients a ON a.patient_id = u.id
       WHERE a.doctor_id = $1
     ), page_rows AS (
       SELECT * FROM assigned ORDER BY name, id LIMIT $2 OFFSET $3
     )
     SELECT (SELECT count(*)::int FROM assigned) AS total,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id::text, 'name', name, 'email', email)
          ORDER BY name, id) FROM page_rows), '[]'::jsonb) AS patients`,
    [req.user.id, limit, (page - 1) * limit],
  );
  res.json({ patients: result.patients, page, limit, total: result.total });
});

async function assignedPatient(req, res, next) {
  const id = req.params.patientId;
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) {
    throw new AppError(400, 'INVALID_ID', 'Please provide a valid patient ID.');
  }
  // Check assignment before any cached report is accessed. Do not turn the
  // authenticated doctor into the patient or allow patient ID query overrides.
  const assignment = await pool.query(
    'SELECT 1 FROM doctor_patients WHERE doctor_id = $1 AND patient_id = $2',
    [req.user.id, id],
  );
  if (!assignment.rowCount) throw new AppError(404, 'NOT_FOUND', 'Patient not found.');
  req.reportUserId = id;
  next();
}
router.use('/patients/:patientId/reports', assignedPatient, reportsRouter);
router.use('/patients/:patientId/trends', assignedPatient, trendsRouter);
export default router;
