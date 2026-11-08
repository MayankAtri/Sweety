import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { config } from './config.js';
import { pool } from './db.js';

// Cache entries are private internal data; never use this cache for authorization.
// Revisions change in the same PostgreSQL transaction as each reading mutation.
export function createReportCache({
  url,
  database = pool,
  ttlSeconds = 300,
  prefix = 'sweety:reports',
} = {}) {
  let redis;
  if (url) {
    redis = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 500,
      commandTimeout: 500,
      retryStrategy: () => 2000,
    });
    // Redis failure is intentionally silent here: reports still come from PG.
    redis.on('error', () => {});
    redis.connect().catch(() => {});
  }
  return {
    redis,
    async read(userId, kind, date, load) {
      if (!redis || redis.status !== 'ready') return load();
      const { rows } = await database.query(
        'SELECT readings_version::text, created_at::text FROM users WHERE id = $1',
        [userId],
      );
      if (!rows.length) return load();
      // created_at separates accounts even after a test database identity reset.
      const version = createHash('sha256')
        .update(`${rows[0].created_at}/${rows[0].readings_version}`)
        .digest('hex');
      const key = `${prefix}:${userId}:${version}:${kind}:${date}`;
      try {
        const cached = await redis.get(key);
        if (cached) return JSON.parse(cached);
      } catch {
        /* Cache outages or corrupt entries must not break reports. */
      }
      const value = await load();
      try {
        await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      } catch {
        /* The database response remains valid when Redis is unavailable. */
      }
      return value;
    },
    async close() {
      redis?.disconnect();
    },
  };
}

const databaseNamespace = createHash('sha256')
  .update(config.databaseUrl)
  .digest('hex')
  .slice(0, 16);
export const reportCache = createReportCache({
  url: config.redisUrl,
  ttlSeconds: config.cacheTtlSeconds,
  prefix: `sweety:reports:${databaseNamespace}`,
});
export const closeReportCache = () => reportCache.close();
