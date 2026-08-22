import IORedis, { Redis } from 'ioredis';
import { env } from './env';
import { logger } from './logger';

// BullMQ requires `maxRetriesPerRequest: null` on the connection it is
// given, otherwise ioredis will give up retrying commands and BullMQ's
// blocking connections misbehave.
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
