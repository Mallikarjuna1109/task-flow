import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase, prisma } from './config/prisma';
import { redisConnection } from './config/redis';
import { emailQueue, emailDeadLetterQueue } from './jobs/queues';

async function main(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`TaskFlow API listening on port ${env.port} (env=${env.nodeEnv})`);
    logger.info(`Swagger UI available at http://localhost:${env.port}/docs`);
  });

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully...`);

    server.close(async () => {
      try {
        await emailQueue.close();
        await emailDeadLetterQueue.close();
        await redisConnection.quit();
        await disconnectDatabase();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    });

    // Force-exit if connections don't close in time.
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch(async (err) => {
  logger.error({ err }, 'Fatal error during startup');
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
