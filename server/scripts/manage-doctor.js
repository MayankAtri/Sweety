import { pathToFileURL } from 'node:url';
import { pool } from '../src/db.js';

function email(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('A valid account email is required.');
  }
  return normalized;
}

// Operator-only CLI: users cannot grant themselves clinical access over HTTP.
// Register an account first, then promote it explicitly on the server.
export async function manageDoctor(action, doctorEmail, patientEmail) {
  if (!['promote', 'assign', 'revoke'].includes(action)) {
    throw new Error('Usage: manage-doctor.js promote <email> | assign|revoke <doctor-email> <patient-email>');
  }
  const normalizedDoctor = email(doctorEmail);
  const normalizedPatient = action === 'promote' ? null : email(patientEmail);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Deterministic lock order avoids assign/promote races and opposite-pair deadlocks.
    const { rows } = await client.query(
      'SELECT id, role, email FROM users WHERE email = ANY($1::text[]) ORDER BY id FOR UPDATE',
      [[normalizedDoctor, normalizedPatient].filter(Boolean)],
    );
    const doctor = rows.find(user => user.email === normalizedDoctor);
    if (!doctor) throw new Error('Doctor account not found. Register the account first.');
    if (action === 'promote') {
      const existing = await client.query('SELECT 1 FROM readings WHERE user_id = $1 LIMIT 1', [doctor.id]);
      if (existing.rowCount) throw new Error('An account with patient readings cannot be promoted. Use a separate account.');
      const assigned = await client.query('SELECT 1 FROM doctor_patients WHERE patient_id = $1 LIMIT 1', [doctor.id]);
      if (assigned.rowCount) throw new Error('An assigned patient account cannot be promoted. Use a separate account.');
      await client.query("UPDATE users SET role = 'doctor' WHERE id = $1", [doctor.id]);
      // Role changes revoke active sessions rather than silently broadening access.
      await client.query('DELETE FROM sessions WHERE user_id = $1', [doctor.id]);
    } else {
      const patient = rows.find(user => user.email === normalizedPatient);
      if (doctor.role !== 'doctor') throw new Error('The first account must have the doctor role.');
      if (!patient || patient.role !== 'patient') throw new Error('Patient account not found.');
      if (action === 'assign') {
        await client.query('INSERT INTO doctor_patients(doctor_id,patient_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [doctor.id, patient.id]);
      } else {
        await client.query('DELETE FROM doctor_patients WHERE doctor_id=$1 AND patient_id=$2', [doctor.id, patient.id]);
      }
    }
    await client.query('COMMIT');
    return action;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const [action, doctorEmail, patientEmail, ...extra] = process.argv.slice(2);
    if (extra.length || (action === 'promote' && patientEmail)) throw new Error('Unexpected arguments.');
    await manageDoctor(action, doctorEmail, patientEmail);
    console.log(`Doctor management completed: ${action}.`);
  } catch (error) {
    console.error('Doctor management failed:', error.code || error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
