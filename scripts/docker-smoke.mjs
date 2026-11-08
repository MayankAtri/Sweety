import assert from 'node:assert/strict';

// Run against an already healthy local Compose stack. Only a unique synthetic
// account is mutated, so this can run without touching the seeded demo user.
const origin = process.env.APP_BASE_URL || 'http://localhost:8080';
let cookie = '';
async function request(path, { method = 'GET', body, status = 200 } = {}) {
  const response = await fetch(`${origin}/api${path}`, {
    method,
    headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  assert.equal(response.status, status, `${method} ${path}: ${text}`);
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  return text ? JSON.parse(text) : null;
}
const page = await fetch(origin);
assert.equal(page.status, 200);
assert.match(await page.text(), /\/assets\/index-/);
await request('/health');
const { today } = await request('/config');
await request('/auth/register', { method: 'POST', status: 201, body: { name: 'Docker Smoke', email: `docker-${crypto.randomUUID()}@example.com`, password: 'DockerSmoke123!' } });
const { reading } = await request('/readings', { method: 'POST', status: 201, body: { date: today, slot: 'morning', value: 100 } });
let trend = await request(`/trends?date=${today}`);
assert.equal(trend.readings.length, 1);
assert.equal(trend.readings[0].value, 100);
await request(`/readings/${reading.id}`, { method: 'PUT', body: { date: today, slot: 'morning', value: 120 } });
assert.equal((await request(`/reports?date=${today}`)).daily.average, 120);
await request(`/readings/${reading.id}`, { method: 'DELETE', status: 204 });
assert.equal((await request(`/trends?date=${today}`)).readings.length, 0);
await request('/auth/logout', { method: 'POST', status: 204 });
await request('/auth/me', { status: 401 });
console.log('Docker smoke passed: built frontend, health/config, signup, cookie auth, reading CRUD, reports/trends and logout.');
// The documented development seed also provides a read-only assigned doctor.
const doctor = await request('/auth/login', { method: 'POST', body: { email: 'doctor@sweety.example', password: 'SweetyDoctor123!' } });
assert.equal(doctor.user.role, 'doctor');
const patients = await request('/doctor/patients');
const patient = patients.patients.find(item => item.email === 'demo@sweety.example');
assert.ok(patient, 'Seeded doctor must be assigned the demo patient.');
const reports = await request(`/doctor/patients/${patient.id}/reports?date=${today}`);
assert.ok(reports.daily.count >= 2);
await request(`/doctor/patients/${patient.id}/trends?date=${today}`);
await request('/readings', { status: 403 });
await request('/auth/logout', { method: 'POST', status: 204 });
console.log('Docker doctor smoke passed: assigned patient list, reports/trends and denied self-reading access.');
