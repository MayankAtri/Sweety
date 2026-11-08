import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';
import { today } from './dates.js';
import { pool } from './db.js';
import { AppError } from './errors.js';
import { requireAuth } from './auth.js';
import authRouter from './routes/auth.js';
import readingsRouter from './routes/readings.js';
import reportsRouter from './routes/reports.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  // Patient records and session identity should never be retained by HTTP caches.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  // Cookie authentication is intended for same-site deployments. Reject foreign
  // browser origins before route handling, including authentication endpoints.
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && origin !== config.clientOrigin) {
      return next(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed.'));
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('sec-fetch-site') === 'cross-site') {
      return next(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Cross-site requests are not allowed.'));
    }
    next();
  });
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());
  // Date limits are owned by the server timezone, including for browser clients.
  app.get('/api/config', (req, res) => {
    res.json({ timeZone: config.appTimezone, today: today() });
  });
  app.get('/api/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable.' } });
    }
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please try again later.' } },
  });
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/readings', requireAuth, readingsRouter);
  app.use('/api/reports', requireAuth, reportsRouter);
  app.use((req, res, next) => next(new AppError(404, 'NOT_FOUND', 'Endpoint not found.')));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Please send valid JSON.' } });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: 'Request body is too large.' } });
    }
    if (err.type === 'charset.unsupported' || err.type === 'encoding.unsupported') {
      return res.status(415).json({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Please send JSON with a supported charset and content encoding.' } });
    }
    if (err instanceof URIError && err.status === 400) {
      return res.status(400).json({ error: { code: 'INVALID_URL', message: 'Please send a valid URL.' } });
    }
    // Body-parser can also reject corrupt compressed input or a truncated body.
    // Return a fixed message instead of exposing parser details or raw input.
    if (err.status === 400 && err.expose === true) {
      return res.status(400).json({ error: { code: 'INVALID_BODY', message: 'The request body could not be read.' } });
    }
    // Log only error type/code: request bodies and session tokens may be sensitive.
    console.error('Unhandled request error', { name: err.name, code: err.code });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
  });
  return app;
}
