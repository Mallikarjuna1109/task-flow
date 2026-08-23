import IORedis, { Redis } from 'ioredis';
import { env } from './env';
import { logger } from './logger';

// BullMQ requires maxRetriesPerRequest: null on connections it uses.
export function createRedisConnection(): Redis {
  const connection = new IORedis(env.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  connection.on('error', (err) => {
    logger.error({ err }, 'Redis connection error');
  });

  return connection;
}

export const redisConnection = createRedisConnection();
