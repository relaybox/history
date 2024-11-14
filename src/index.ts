import 'dotenv/config';

import { getLogger } from '@/util/logger';
import { cleanupPgPool, getPgPool } from '@/lib/pg';
import { startConsumer, stopConsumer } from '@/module/consumer';
import { cleanupRedisClient, getRedisClient } from '@/lib/redis';
import { getQdrantVectorStore } from '@/lib/qdrant';
import { getOpenSearchClient } from './lib/opensearch';

const logger = getLogger('history-service');
const pgPool = getPgPool();
const redisClient = getRedisClient();
const qdrantVectorStore = getQdrantVectorStore('room-history');
const openSearchClient = getOpenSearchClient();

async function startService() {
  if (!pgPool) {
    throw new Error('Pg pool not initialized');
  }

  if (!redisClient) {
    throw new Error('Redis client not initialized');
  }

  await redisClient.connect();

  startConsumer(pgPool, redisClient, qdrantVectorStore, openSearchClient);
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down session worker`);

  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000);

  try {
    await stopConsumer();

    await Promise.all([cleanupPgPool(), cleanupRedisClient()]);

    clearTimeout(shutdownTimeout);

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (err) {
    logger.error('Error during graceful shutdown', { err });
    process.exit(1);
  }
}

startService();

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
