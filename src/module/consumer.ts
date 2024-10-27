import { getLogger } from '@/util/logger';
import { Connection, Consumer, ConsumerProps, Envelope } from 'rabbitmq-client';

const logger = getLogger('consumer');

const AMQP_CONNECTION_STRING = process.env.RABBIT_MQ_CONNECTION_STRING;
const AMQP_EXCHANGE_NAME = 'ds.persistence.durable';
const AMQP_QUEUE_TYPE = 'direct';
const AMQP_QUEUE_NAME = `persist`;
const AMQP_ROUTING_KEY = `message.persist`;

const connection = new Connection(AMQP_CONNECTION_STRING);

let consumer: Consumer | null = null;

export function startConsumer(): Consumer {
  if (consumer) {
    logger.error(`Consumer already initialized`);
    return consumer;
  }

  logger.info('Creating amqp consumer');

  const consumerOptions: ConsumerProps = {
    queue: AMQP_QUEUE_NAME,
    queueOptions: {
      durable: true
    },
    exchanges: [
      {
        exchange: AMQP_EXCHANGE_NAME,
        type: AMQP_QUEUE_TYPE
      }
    ],
    queueBindings: [
      {
        exchange: AMQP_EXCHANGE_NAME,
        routingKey: AMQP_ROUTING_KEY
      }
    ]
  };

  consumer = connection.createConsumer(consumerOptions, handleMessage);

  consumer.on('error', (err) => {
    logger.error('Error handling message', { err });
  });

  return consumer;
}

export async function handleMessage(message: Envelope): Promise<void> {
  console.log(message);
}

export async function cleanupConsumer() {
  if (consumer) {
    try {
      await consumer.close();
    } catch (err) {
      logger.error('Error ending amqp consumer', { err });
    } finally {
      logger.info('Amqp consumer disconnected through app termination');
      consumer = null;
    }
  }
}
