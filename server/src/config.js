import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

const nodeEnv = process.env.NODE_ENV || 'development';
if (!['development', 'test', 'production'].includes(nodeEnv)) {
  throw new Error('NODE_ENV must be development, test, or production.');
}
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
const databaseUrl = process.env.DATABASE_URL;
try {
  if (!['postgres:', 'postgresql:'].includes(new URL(databaseUrl).protocol)) throw new Error();
} catch {
  throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
}
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
try {
  const url = new URL(clientOrigin);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== clientOrigin) throw new Error();
  if (nodeEnv === 'production' && url.protocol !== 'https:') throw new Error();
} catch {
  throw new Error('CLIENT_ORIGIN must be an exact HTTP(S) origin without a trailing slash; production requires HTTPS.');
}
const appTimezone = process.env.APP_TIMEZONE || 'Asia/Kolkata';
try {
  new Intl.DateTimeFormat('en', { timeZone: appTimezone }).format();
} catch {
  throw new Error('APP_TIMEZONE must be a valid IANA time zone.');
}

export const config = Object.freeze({ port, databaseUrl, clientOrigin, appTimezone, nodeEnv });
