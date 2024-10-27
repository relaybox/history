import 'dotenv/config';

import { startWorker, stopWorker } from '@/module/worker';
import { getLogger } from '@/util/logger';
import { cleanupRedisClient } from '@/lib/redis';
import { cleanupPgPool } from '@/lib/pg';
import { cleanupConsumer, startConsumer } from '@/module/consumer';

const logger = getLogger('history-service');

startWorker();
startConsumer();

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down session worker`);

  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000);

  try {
    await Promise.all([stopWorker(), cleanupRedisClient(), cleanupPgPool(), cleanupConsumer()]);

    clearTimeout(shutdownTimeout);

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (err) {
    logger.error('Error during graceful shutdown', { err });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
