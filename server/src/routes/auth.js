import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db.js';
import { AppError } from '../errors.js';
import {
  clearSessionCookie, createSession, publicUser, requireAuth,
  revokeSession, setSessionCookie,
} from '../auth.js';

const router = Router();
const BCRYPT_ROUNDS = 12;
// A real bcrypt comparison also runs for an unknown email to reduce timing leaks.
const dummyHash = bcrypt.hash('unused-login-comparison', BCRYPT_ROUNDS);

function credentials(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_INPUT', 'Please provide an email and password.');
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.includes('\0') || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, 'INVALID_EMAIL', 'Please enter a valid email address.');
  }
  if (typeof body.password !== 'string'
      || [...body.password].length < 8
      || Buffer.byteLength(body.password, 'utf8') > 72) {
    throw new AppError(400, 'INVALID_PASSWORD', 'Password must have at least 8 characters and at most 72 UTF-8 bytes.');
  }
  return { email, password: body.password };
}

router.post('/register', async (req, res) => {
  const { email, password } = credentials(req.body);
  if (Object.hasOwn(req.body, 'role')) {
    throw new AppError(400, 'INVALID_ROLE', 'Public registration creates patient accounts only.');
  }
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.includes('\0') || [...name].length > 100) {
    throw new AppError(400, 'INVALID_NAME', 'Please enter a name between 1 and 100 characters.');
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const client = await pool.connect();
  let user;
  let token;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3) RETURNING id, name, email, role`,
      [name, email, passwordHash],
    );
    user = publicUser(rows[0]);
    await revokeSession(client, req);
    token = await createSession(client, user.id);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      throw new AppError(409, 'EMAIL_EXISTS', 'An account with this email already exists.');
    }
    throw error;
  } finally {
    client.release();
  }
  setSessionCookie(res, token);
  res.status(201).json({ user });
});

router.post('/login', async (req, res) => {
  const { email, password } = credentials(req.body);
  const { rows } = await pool.query(
    'SELECT id, name, email, role, password_hash FROM users WHERE email = $1',
    [email],
  );
  const user = rows[0];
  const matches = await bcrypt.compare(password, user?.password_hash ?? await dummyHash);
  if (!user || !matches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  const client = await pool.connect();
  let token;
  try {
    await client.query('BEGIN');
    await revokeSession(client, req);
    token = await createSession(client, user.id);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  setSessionCookie(res, token);
  res.json({ user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/logout', async (req, res) => {
  await revokeSession(pool, req);
  clearSessionCookie(res);
  res.status(204).end();
});

export default router;
