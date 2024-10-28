import BatchConsumer, { BatchConsumerOptions } from '@/lib/batch-consumer';
import { getLogger } from '@/util/logger';
import { handler as historyBatchProcesser } from '@/handlers/history-batch-processer';
import { getPgPool } from '@/lib/pg';
import { ConsumeMessage } from 'amqplib';

const logger = getLogger('consumer');
const pgPool = getPgPool();

const RABBIT_MQ_CONNECTION_STRING = process.env.RABBIT_MQ_CONNECTION_STRING || '';
const EXCHANGE_NAME = 'ds.persistence.durable';
const QUEUE_TYPE = 'direct';
const QUEUE_NAME = `persist`;
const ROUTING_KEY = `message.persist`;
const PRFETCH_COUNT = 20;

let batchConsumer: BatchConsumer | null = null;

export async function startConsumer(): Promise<void> {
  if (!pgPool) {
    throw new Error('Pg pool not initialized');
  }

  const batchConsumerOptions: BatchConsumerOptions = {
    amqpConnectionString: RABBIT_MQ_CONNECTION_STRING,
    exchange: {
      name: EXCHANGE_NAME,
      type: QUEUE_TYPE
    },
    queue: QUEUE_NAME,
    routingKey: ROUTING_KEY,
    prefetch: PRFETCH_COUNT,
    batchSize: 2,
    batchTimeoutMs: 10000
  };

  batchConsumer = new BatchConsumer(batchConsumerOptions, (messages: ConsumeMessage[]) =>
    historyBatchProcesser(pgPool, messages)
  );
}

async function handleMessageBatch(messages: any[]): Promise<void> {
  console.log(JSON.stringify(messages, null, 2));
}

export async function stopConsumer(): Promise<void> {
  if (batchConsumer) {
    try {
      await batchConsumer.close();
    } catch (err) {
      logger.error('Error closing batch consumer:', { err });
    } finally {
      batchConsumer = null;
    }
  }
}
