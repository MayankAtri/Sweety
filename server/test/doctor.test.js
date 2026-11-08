import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import request from 'supertest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('A dedicated TEST_DATABASE_URL ending in _test is required.');
process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = 'test';
const { pool } = await import('../src/db.js');
const { runMigrations } = await import('../scripts/migrate.js');
const { createApp } = await import('../src/app.js');
const { manageDoctor } = await import('../scripts/manage-doctor.js');
const app = createApp();
let doctor, patient, other, doctorCookie;
const password = 'Doctor-test-123';
async function register(name, email) {
  const result = await request(app).post('/api/auth/register').send({ name, email, password }).expect(201);
  return { ...result.body.user, cookie: result.headers['set-cookie'][0].split(';')[0] };
}
const get = (path, cookie = doctorCookie) => request(app).get(path).set('Cookie', cookie);
const reports = id => `/api/doctor/patients/${id}/reports?date=2024-03-15`;
before(async () => {
  await runMigrations();
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  doctor = await register('Doctor', 'doctor-test@example.com');
  patient = await register('Assigned Patient', 'assigned-test@example.com');
  other = await register('Unassigned Patient', 'unassigned-test@example.com');
  await manageDoctor('promote', doctor.email);
  const login = await request(app).post('/api/auth/login').send({ email: doctor.email, password }).expect(200);
  assert.equal(login.body.user.role, 'doctor');
  doctorCookie = login.headers['set-cookie'][0].split(';')[0];
  await manageDoctor('assign', doctor.email, patient.email);
  await pool.query("INSERT INTO readings(user_id,date,slot,value) VALUES ($1,'2024-03-15','morning',96),($1,'2024-03-15','after_breakfast',138),($2,'2024-03-15','morning',500)", [patient.id, other.id]);
});
after(async () => { await pool.end(); });

test('registration remains patient-only and session role comes from the database', async () => {
  assert.equal(patient.role, 'patient');
  await request(app).post('/api/auth/register').send({ name: 'Escalation', email: 'escalation@example.com', password, role: 'doctor' }).expect(400);
  assert.equal((await get('/api/auth/me')).body.user.role, 'doctor');
  await get('/api/auth/me', doctor.cookie).expect(401); // promotion revoked earlier session
});

test('doctor endpoints require an authenticated doctor and hide unassigned patients', async () => {
  await request(app).get('/api/doctor/patients').expect(401);
  await get('/api/doctor/patients', patient.cookie).expect(403);
  await get(reports(patient.id), patient.cookie).expect(403);
  await get(reports(other.id)).expect(404);
  await get(reports('999999')).expect(404);
  await get(reports('invalid')).expect(400);
  await get(reports('9223372036854775808')).expect(400);
});

test('doctor patient list is assignment scoped and paginated including empty pages', async () => {
  const { body } = await get('/api/doctor/patients?limit=1&page=1').expect(200);
  assert.deepEqual(body, { patients: [{ id: patient.id, name: patient.name, email: patient.email }], page: 1, limit: 1, total: 1 });
  assert.deepEqual((await get('/api/doctor/patients?limit=1&page=2').expect(200)).body.patients, []);
  for (const query of ['limit=0', 'limit=101', 'page=-1', 'page=1&page=2']) {
    await get(`/api/doctor/patients?${query}`).expect(400);
  }
});

test('assigned reports and trends use patient values and ignore query identity overrides', async () => {
  const result = await get(`${reports(patient.id)}&userId=${other.id}&patientId=${other.id}`).expect(200);
  assert.equal(result.body.daily.average, 117);
  assert.equal(result.body.daily.count, 2);
  const trend = await get(`/api/doctor/patients/${patient.id}/trends?date=2024-03-15`).expect(200);
  assert.deepEqual(trend.body.readings.map(row => row.value), [96, 138]);
  await get(`/api/doctor/patients/${other.id}/trends?date=2024-03-15`).expect(404);
  await get(`/api/doctor/patients/${patient.id}/reports`).expect(400);
  await get(`/api/doctor/patients/${patient.id}/trends?date=9999-01-01`).expect(400);
});

test('doctor access is read-only and cannot use normal patient routes', async () => {
  for (const path of ['/api/readings', '/api/reports?date=2024-03-15', '/api/trends?date=2024-03-15']) await get(path).expect(403);
  await request(app).post('/api/readings').set('Cookie', doctorCookie).send({ date: '2024-03-15', slot: 'morning', value: 123 }).expect(403);
  const { rows: [reading] } = await pool.query('SELECT id FROM readings WHERE user_id=$1 LIMIT 1', [patient.id]);
  await request(app).put(`/api/readings/${reading.id}`).set('Cookie', doctorCookie).send({ date: '2024-03-15', slot: 'morning', value: 123 }).expect(403);
  await request(app).delete(`/api/readings/${reading.id}`).set('Cookie', doctorCookie).expect(403);
  await request(app).post(`/api/doctor/patients/${patient.id}/reports`).set('Cookie', doctorCookie).send({}).expect(404);
});

test('assignment revoke immediately removes list and warmed report access', async () => {
  await get(reports(patient.id)).expect(200);
  await manageDoctor('revoke', doctor.email, patient.email);
  await get(reports(patient.id)).expect(404);
  await get(`/api/doctor/patients/${patient.id}/trends?date=2024-03-15`).expect(404);
  assert.equal((await get('/api/doctor/patients').expect(200)).body.total, 0);
  await manageDoctor('assign', doctor.email, patient.email);
  await manageDoctor('assign', doctor.email, patient.email); // idempotent
  assert.equal((await get('/api/doctor/patients').expect(200)).body.total, 1);
});

test('database enforces assignment roles and operator cannot promote an account with readings', async () => {
  await assert.rejects(pool.query('INSERT INTO doctor_patients(doctor_id,patient_id) VALUES($1,$2)', [patient.id, other.id]), { code: '23503' });
  await assert.rejects(pool.query('INSERT INTO doctor_patients(doctor_id,patient_id) VALUES($1,$2)', [doctor.id, doctor.id]), { code: '23503' });
  await assert.rejects(pool.query("UPDATE users SET role='patient' WHERE id=$1", [doctor.id]), { code: '23503' });
  await assert.rejects(manageDoctor('promote', patient.email), /patient readings/);
  await assert.rejects(manageDoctor('assign', patient.email, other.email), /doctor role/);
  await assert.rejects(manageDoctor('assign', doctor.email, doctor.email), /Patient account/);
});


test('operator rejects promotion of an assigned patient without readings', async () => {
  const emptyPatient = await register('Empty assigned', 'empty-assigned@example.com');
  await manageDoctor('assign', doctor.email, emptyPatient.email);
  await assert.rejects(manageDoctor('promote', emptyPatient.email), /assigned patient/);
  const me = await get('/api/auth/me', emptyPatient.cookie).expect(200);
  assert.equal(me.body.user.role, 'patient');
  await manageDoctor('revoke', doctor.email, emptyPatient.email);
});

test('demo seed never elevates an existing account and is repeatable for the new doctor', async () => {
  const occupied = await register('Existing patient', 'doctor@sweety.example');
  const seed = fileURLToPath(new URL('../scripts/seed.js', import.meta.url));
  const env = { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'test' };
  await assert.rejects(exec(process.execPath, [seed], { env }), { code: 1 });
  assert.equal((await get('/api/auth/me', occupied.cookie).expect(200)).body.user.role, 'patient');
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM users WHERE email='demo@sweety.example'")).rows[0].count, 0);
  await pool.query('DELETE FROM users WHERE id=$1', [occupied.id]);
  await exec(process.execPath, [seed], { env });
  const first = (await pool.query("SELECT id,password_hash FROM users WHERE email='doctor@sweety.example'")).rows[0];
  await exec(process.execPath, [seed], { env });
  const second = (await pool.query("SELECT id,password_hash,role FROM users WHERE email='doctor@sweety.example'")).rows[0];
  assert.equal(second.password_hash, first.password_hash);
  assert.equal(second.role, 'doctor');
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM doctor_patients WHERE doctor_id=$1', [first.id])).rows[0].count, 1);
});
