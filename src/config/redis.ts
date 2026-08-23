import IORedis, { Redis, RedisOptions } from 'ioredis';
import { env } from './env';
import { logger } from './logger';

function buildRedisOptions(): RedisOptions {
  let parsed: URL;
  try {
    parsed = new URL(env.redisUrl);
  } catch {
    throw new Error('REDIS_URL is not a valid URL (expected redis:// or rediss://...)');
  }

  const isTls = parsed.protocol === 'rediss:';

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    tls: isTls ? {} : undefined,
    // Required by BullMQ: https://docs.bullmq.io/guide/going-to-production#maxretriesperrequest
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
}

export function createRedisConnection(): Redis {
  const options = buildRedisOptions();
  const connectionLabel = { redisHost: options.host, redisPort: options.port, redisTls: Boolean(options.tls) };

  const connection = new IORedis(options);

  connection.on('error', (err: NodeJS.ErrnoException) => {
    logger.error(
      { ...connectionLabel, code: err.code, message: err.message },
      'Redis connection error',
    );
  });

  connection.on('connect', () => {
    logger.info(connectionLabel, 'Redis connection established');
  });

  connection.on('ready', () => {
    logger.info(connectionLabel, 'Redis connection ready');
  });

  return connection;
}

// Created once at module load and reused for the lifetime of the process/container - this is
// intentional and appropriate for both the long-lived worker process and a Vercel serverless
// function's warm container (avoids reconnecting on every invocation). It does not block or
// throw on startup: ioredis connects asynchronously and retries on failure, surfacing failures
// via the 'error' listener above rather than crashing module import.
export const redisConnection = createRedisConnection();
