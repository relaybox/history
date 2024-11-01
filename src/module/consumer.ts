import { getLogger } from '@/util/logger';
import { handler as historyBatchProcesser } from '@/handlers/history-batch-processer';
import { getPgPool } from '@/lib/pg';
import { ConsumeMessage } from 'amqplib';
import Rmq, { BatchConsumerEvent, BatchConsumerOptions } from '@/lib/rmq/rmq';
import { ParsedMessage } from './types';

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

  const batchConsumer = await connection.createBatchConsumer(
    batchConsumerOptions,
    (messages: ParsedMessage[]) => historyBatchProcesser(pgPool, messages)
  );

  // batchConsumer.on(BatchConsumerEvent.MESSAGE_ACKNOWLEDGED, (message: ConsumeMessage) => {
  //   console.log('Message acknowledged', Buffer.from(message.content).toString());
  // });

  // batchConsumer.on(BatchConsumerEvent.BATCH_PROCESSED, (messages: ParsedMessage[]) => {
  //   // const parsedMessages = messages.map((message) => Buffer.from(message.content).toString());
  //   console.log('Parsed messages', messages);
  // });
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
