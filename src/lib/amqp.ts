import { getLogger } from '@/util/logger';
import { Channel, connect, Connection } from 'amqplib';

const logger = getLogger(`amqp`);

const RABBIT_MQ_CONNECTION_STRING = process.env.RABBIT_MQ_CONNECTION_STRING || '';
const EXCHANGE_NAME = 'ds.persistence.durable';
const QUEUE_TYPE = 'direct';
const QUEUE_NAME = `persist`;
const ROUTING_KEY = `message.persist`;
const PRFETCH_COUNT = 20;

let connection: Connection | null = null;
let channel: Channel | null = null;

export async function getConnection(): Promise<Connection> {
  if (connection) {
    return connection;
  }

  try {
    connection = await connect(RABBIT_MQ_CONNECTION_STRING);

    connection.on('error', (err) => {
      logger.error('AMQP connection error:', { err });
    });

    connection.on('close', () => {
      logger.info('AMQP connection closed');
    });

    return connection;
  } catch (err) {
    logger.error('Error connecting to RabbitMQ:', { err });
    throw err;
  }
}

export async function createChannel(connection: Connection): Promise<Channel> {
  logger.debug('Creating channel');

  try {
    channel = await connection.createChannel();

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

export async function cleanupAmqpConnection(): Promise<void> {
  if (connection) {
    try {
      await connection.close();
    } catch (err) {
      logger.error('Error closing amqp client', { err });
    } finally {
      connection = null;
    }
  }
}

export async function cleanupAmqpChannel(): Promise<void> {
  if (channel) {
    try {
      await channel.close();
    } catch (err) {
      logger.error('Error closing amqp channel', { err });
    } finally {
      connection = null;
    }
  }
}
