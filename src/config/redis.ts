import IORedis, { Redis } from 'ioredis';
import { env } from './env';
import { logger } from './logger';

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
