import { createHash, randomBytes } from 'node:crypto';
import { pool } from './db.js';
import { config } from './config.js';
import { AppError } from './errors.js';

export const SESSION_COOKIE = 'sweety_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.nodeEnv === 'production',
  path: '/',
});

export function sessionDigest(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function readSessionToken(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export function publicUser(user) {
  return { id: String(user.id), name: user.name, email: user.email };
}

// Accept a transaction client so registration and its first session are atomic.
export async function createSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
    [sessionDigest(token), userId],
  );
  return token;
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_DURATION_MS });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

export async function revokeSession(db, req) {
  const token = readSessionToken(req);
  if (token) {
    await db.query('DELETE FROM sessions WHERE token_hash = $1', [sessionDigest(token)]);
  }
}

export async function requireAuth(req, res, next) {
  const token = readSessionToken(req);
  if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue.');

  const { rows } = await pool.query(
    `SELECT users.id, users.name, users.email
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > NOW()`,
    [sessionDigest(token)],
  );
  if (!rows.length) {
    clearSessionCookie(res);
    throw new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue.');
  }
  req.user = publicUser(rows[0]);
  next();
}
