import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { logger } from './logger';

// Single shared PrismaClient instance (connection pool) for the whole
// process - this is the recommended Prisma usage pattern, avoiding pool
// exhaustion from creating a new client per request.
export const prisma = new PrismaClient({
  log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Connected to PostgreSQL');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Disconnected from PostgreSQL');
}
