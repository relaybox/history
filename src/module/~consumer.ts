import { getLogger } from '@/util/logger';
import { AsyncMessage, Connection, Consumer, ConsumerProps, Envelope } from 'rabbitmq-client';

const logger = getLogger('consumer');

const RABBIT_MQ_CONNECTION_STRING = process.env.RABBIT_MQ_CONNECTION_STRING;
const EXCHANGE_NAME = 'ds.persistence.durable';
const QUEUE_TYPE = 'direct';
const QUEUE_NAME = `persist`;
const ROUTING_KEY = `message.persist`;
const BATCH_SIZE = 5;
const CONCURRENCY = 10;
const PRFETCH_COUNT = 20;

const connection = new Connection(RABBIT_MQ_CONNECTION_STRING);

let consumer: Consumer | null = null;

export function startConsumer(): Consumer {
  if (consumer) {
    logger.error(`Consumer already started`);
    return consumer;
  }

  logger.info('Creating amqp consumer');

  const batch: any[] = [];
  let batchTimeout: NodeJS.Timeout | null = null;

  const consumerOptions: ConsumerProps = {
    queue: QUEUE_NAME,
    concurrency: CONCURRENCY,
    noAck: false,
    queueOptions: {
      durable: true
    },
    qos: {
      prefetchCount: PRFETCH_COUNT
    },
    exchanges: [
      {
        exchange: EXCHANGE_NAME,
        type: QUEUE_TYPE,
        durable: true
      }
    ],
    queueBindings: [
      {
        exchange: EXCHANGE_NAME,
        routingKey: ROUTING_KEY
      }
    ]
  };

  consumer = connection.createConsumer(consumerOptions, (message: AsyncMessage) => {
    batch.push(message.body);

    if (batch.length === 1) {
      batchTimeout = setTimeout(() => processBatch(batch), 10000);
    } else if (batch.length >= BATCH_SIZE) {
      if (batchTimeout) {
        clearTimeout(batchTimeout);
      }

      processBatch(batch);
    }
  });

  consumer.on('error', (err) => {
    logger.error('Error handling message', { err });
  });

  return consumer;
}

export function processBatch(batch: any[]) {
  console.log(JSON.stringify(batch, null, 2));
  batch.length = 0;
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
