import IORedis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

// BullMQ requires maxRetriesPerRequest: null on the connection it manages.
export const redisConnection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: (attempt) => Math.min(attempt * 250, 5_000),
});

redisConnection.on('error', (err) => {
  logger.warn({ err: err?.message || err }, 'Redis connection unavailable; background queues will retry');
});
