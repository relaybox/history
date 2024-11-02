import { getLogger } from '@/util/logger';
import { handler as historyBatchProcesser } from '@/handlers/history-batch-processer';
import Rmq, { BatchConsumerOptions } from '@/lib/rmq/rmq';
import { ParsedMessage } from './types';
import { RedisClient } from '@/lib/redis';
import { Pool } from 'pg';

const logger = getLogger('consumer');

const RABBIT_MQ_CONNECTION_STRING = process.env.RABBIT_MQ_CONNECTION_STRING || '';
const EXCHANGE_NAME = 'ds.persistence.durable';
const QUEUE_TYPE = 'direct';
const QUEUE_NAME = `0-global-persistence`;
const ROUTING_KEY = `message.persist`;
const BATCH_PREFETCH_COUNT = Number(process.env.BATCH_PREFETCH_COUNT || 20);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 20);
const BATCH_TIMEOUT_MS = Number(process.env.BATCH_TIMEOUT_MS || 5000);

let connection: Rmq | null = null;

export async function startConsumer(pgPool: Pool, redisClient: RedisClient): Promise<void> {
  connection = await Rmq.connect(RABBIT_MQ_CONNECTION_STRING);

  const batchConsumerOptions: BatchConsumerOptions = {
    amqpConnectionString: RABBIT_MQ_CONNECTION_STRING,
    exchange: {
      name: EXCHANGE_NAME,
      type: QUEUE_TYPE
    },
    queue: QUEUE_NAME,
    routingKey: ROUTING_KEY,
    prefetch: BATCH_PREFETCH_COUNT,
    batchSize: BATCH_SIZE,
    batchTimeoutMs: BATCH_TIMEOUT_MS
  };

  const batchConsumer = await connection.createBatchConsumer(
    batchConsumerOptions,
    (messages: ParsedMessage[]) => historyBatchProcesser(pgPool, redisClient, messages)
  );

  batchConsumer.start();
}

export async function stopConsumer(): Promise<void> {
  if (connection) {
    try {
      await connection.close();
    } catch (err) {
      logger.error('Error closing batch consumer:', { err });
    } finally {
      connection = null;
    }
  }
}
