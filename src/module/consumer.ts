import { BatchConsumerOptions } from '@/lib/rmq/batch-consumer';
import { getLogger } from '@/util/logger';
import { handler as historyBatchProcesser } from '@/handlers/history-batch-processer';
import { getPgPool } from '@/lib/pg';
import { ConsumeMessage } from 'amqplib';
import Rmq from '@/lib/rmq/rmq';

const logger = getLogger('consumer');
const pgPool = getPgPool();

const RABBIT_MQ_CONNECTION_STRING = process.env.RABBIT_MQ_CONNECTION_STRING || '';
const EXCHANGE_NAME = 'ds.persistence.durable';
const QUEUE_TYPE = 'direct';
const QUEUE_NAME = `0-global-persistence`;
const ROUTING_KEY = `message.persist`;
const BATCH_PREFETCH_COUNT = Number(process.env.BATCH_PREFETCH_COUNT || 20);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 20);
const BATCH_TIMEOUT_MS = Number(process.env.BATCH_TIMEOUT_MS || 5000);

let connection: Rmq | null = null;

export async function startConsumer(): Promise<void> {
  if (!pgPool) {
    throw new Error('Pg pool not initialized');
  }

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

  await connection.createBatchConsumer(batchConsumerOptions, (messages: ConsumeMessage[]) =>
    historyBatchProcesser(pgPool, messages)
  );
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
