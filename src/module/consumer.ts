import BatchConsumer, { BatchConsumerOptions } from '@/lib/batch-consumer';
import { getLogger } from '@/util/logger';
import { handler as historyBatchProcesser } from '@/handlers/history-batch-processer';
import { getPgPool } from '@/lib/pg';
import { ConsumeMessage } from 'amqplib';
import Amqp from '@/lib/amqp';

const logger = getLogger('consumer');
const pgPool = getPgPool();

const RABBIT_MQ_CONNECTION_STRING = process.env.RABBIT_MQ_CONNECTION_STRING || '';
const EXCHANGE_NAME = 'ds.persistence.durable';
const QUEUE_TYPE = 'direct';
const QUEUE_NAME = `persist`;
const ROUTING_KEY = `message.persist`;
const PREFETCH_COUNT = 20;
const BATCH_SIZE = 10;
const BATCH_TIMEOUT_MS = 3000;

let connection: Amqp | null = null;

export async function startConsumer(): Promise<void> {
  if (!pgPool) {
    throw new Error('Pg pool not initialized');
  }

  connection = await Amqp.createClient(RABBIT_MQ_CONNECTION_STRING);

  const channel = connection.getChannel();

  const batchConsumerOptions: BatchConsumerOptions = {
    amqpConnectionString: RABBIT_MQ_CONNECTION_STRING,
    exchange: {
      name: EXCHANGE_NAME,
      type: QUEUE_TYPE
    },
    queue: QUEUE_NAME,
    routingKey: ROUTING_KEY,
    prefetch: PREFETCH_COUNT,
    batchSize: BATCH_SIZE,
    batchTimeoutMs: BATCH_TIMEOUT_MS
  };

  const batchConsumer = new BatchConsumer(
    channel,
    batchConsumerOptions,
    (messages: ConsumeMessage[]) => historyBatchProcesser(pgPool, messages)
  );

  await batchConsumer.start();
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
