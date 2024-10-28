import { getLogger } from '@/util/logger';
import amqplib, { Channel, Connection, ConsumeMessage } from 'amqplib';
import { handler as historyBatchProcesser } from '@/handlers/history-batch-processer';
import { getPgPool } from '@/lib/pg';

const logger = getLogger('consumer');
const pgPool = getPgPool();

const RABBIT_MQ_CONNECTION_STRING = process.env.RABBIT_MQ_CONNECTION_STRING || '';
const EXCHANGE_NAME = 'ds.persistence.durable';
const QUEUE_TYPE = 'direct';
const QUEUE_NAME = `persist`;
const ROUTING_KEY = `message.persist`;
const BATCH_SIZE = 2;
const PRFETCH_COUNT = 20;
const BUFFER_TIMEOUT_MS = 10000;

let connection: Connection | null = null;
let channel: Channel | null = null;
let batchTimeout: NodeJS.Timeout | null = null;

async function initializeConnections(): Promise<void> {
  if (!pgPool) {
    throw new Error('Failed to initialize PG pool');
  }
}

export async function startConsumer(): Promise<void> {
  await initializeConnections();

  const batch: any[] = [];

  connection = await amqplib.connect(RABBIT_MQ_CONNECTION_STRING);
  channel = await connection.createChannel();

  await channel.assertExchange(EXCHANGE_NAME, QUEUE_TYPE, {
    durable: true
  });

  await channel.assertQueue(QUEUE_NAME, {
    durable: true
  });

  await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_KEY);

  channel.prefetch(PRFETCH_COUNT);

  channel.consume(QUEUE_NAME, (message: ConsumeMessage | null) => {
    if (!message || !pgPool) {
      return;
    }

    batch.push(message);

    if (batch.length === 1) {
      batchTimeout = setTimeout(
        () => historyBatchProcesser(pgPool, channel!, batch),
        BUFFER_TIMEOUT_MS
      );
    } else if (batch.length >= BATCH_SIZE) {
      if (batchTimeout) {
        clearTimeout(batchTimeout);
      }

      historyBatchProcesser(pgPool, channel!, batch);
    }
  });
}

export async function cleanupConsumer() {
  logger.info('Cleaning up resources...');

  try {
    if (batchTimeout) {
      clearTimeout(batchTimeout);
    }

    if (channel) {
      await channel.close();
      logger.info('Channel closed');
    }

    if (connection) {
      await connection.close();
      logger.info('Connection closed');
    }
  } catch (err) {
    logger.error('Error cleaning up resources:', err);
  } finally {
    logger.info('Resources cleaned up.');
    channel = null;
    connection = null;
    batchTimeout = null;
  }
}
