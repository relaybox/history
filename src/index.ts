import 'dotenv/config';

import { getLogger } from '@/util/logger';
import { cleanupPgPool } from '@/lib/pg';
import { startConsumer, stopConsumer } from './module/consumer';

const logger = getLogger('history-service');

startConsumer();

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down session worker`);

  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000);

  try {
    await Promise.all([stopConsumer(), cleanupPgPool()]);

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
