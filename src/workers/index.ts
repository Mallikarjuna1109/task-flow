import { logger } from '../config/logger';
import { connectDatabase, disconnectDatabase } from '../config/prisma';
import { redisConnection } from '../config/redis';
import { createEmailWorker } from './email.worker';
import { scheduleReconciliationSweep, runNotificationReconciliationSweep } from '../jobs/reconciliation';
import { emailQueue, emailDeadLetterQueue } from '../jobs/queues';

async function main(): Promise<void> {
  await connectDatabase();

  const worker = createEmailWorker();
  logger.info('TaskFlow email worker started, listening for jobs on the email-notifications queue');

  await runNotificationReconciliationSweep().catch((err) => logger.error({ err }, 'Initial reconciliation sweep failed'));
  const sweepHandle = scheduleReconciliationSweep(60_000);

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Worker received ${signal}, shutting down gracefully...`);

    clearInterval(sweepHandle);

    try {
      await worker.close();
      await emailQueue.close();
      await emailDeadLetterQueue.close();
      await redisConnection.quit();
      await disconnectDatabase();
      logger.info('Worker shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during worker shutdown');
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during worker startup');
  process.exit(1);
});
