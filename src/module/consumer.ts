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
const BATCH_SIZE = 10;
const PRFETCH_COUNT = 20;
const BUFFER_TIMEOUT_MS = 10000;

let connection: Connection | null = null;
let channel: Channel | null = null;
let batchTimeout: NodeJS.Timeout | null = null;

const batch: any[] = [];

async function createConnection(): Promise<Connection> {
  logger.debug('Connecting to RabbitMQ');

  try {
    const connection = await amqplib.connect(RABBIT_MQ_CONNECTION_STRING);

    connection.on('error', (err) => {
      logger.error('Connection error:', { err });
    });

    connection.on('close', () => {
      logger.info('Connection closed');
    });

    return connection;
  } catch (err) {
    logger.error('Error connecting to RabbitMQ:', { err });
    throw err;
  }
}

async function createChannel(connection: Connection): Promise<Channel> {
  logger.debug('Creating channel');

  try {
    const channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE_NAME, QUEUE_TYPE, {
      durable: true
    });

    await channel.assertQueue(QUEUE_NAME, {
      durable: true
    });

    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_KEY);

    channel.prefetch(PRFETCH_COUNT);

    return channel;
  } catch (err) {
    logger.error('Error creating channel:', { err });
    throw err;
  }
}

export async function startConsumer(): Promise<void> {
  try {
    connection = await createConnection();
    channel = await createChannel(connection);

    channel.consume(QUEUE_NAME, handleMessage);
  } catch (err) {
    logger.error('Error starting consumer:', { err });
    throw err;
  }
}

export function handleMessage(message: ConsumeMessage | null): void {
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
