import { getLogger } from '@/util/logger';
import amqp, { Channel, Connection } from 'amqplib';
import { Logger } from 'winston';
import { eventBus } from '@/lib/event-bus';
import BatchConsumer, { BatchConsumerOptions } from './batch-consumer';

const INITIAL_RETRY_DELAY_MS = 5000;
const MAX_RETRY_DELAY_MS = 60000;
const MAX_RETRY_ATTEMPTS = 10;

export type BatchHandler = (messages: any[]) => Promise<void>;

enum ConnectionState {
  INITIAL = 'initial',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  SHUTTING_DOWN = 'shutting_down',
  CLOSED = 'closed'
}

export enum AmqpEvents {
  AMQP_READY = 'amqp:ready',
  AMQP_CLOSE = 'amqp:close'
}

export default class Rmq {
  private connectionString: string;
  private connection: Connection;
  private channel: Channel;
  private logger: Logger;
  public ready: Promise<void>;
  private connectionState: ConnectionState = ConnectionState.INITIAL;
  private retryCount: number = 0;
  private currentRetryDelay: number = INITIAL_RETRY_DELAY_MS;
  private batchConsumers: BatchConsumer[] = [];

  protected constructor(connectionString: string) {
    this.logger = getLogger(`amqp`);

    this.connectionString = connectionString;
  }

  public static async connect(connectionString: string): Promise<Rmq> {
    const connection = new Rmq(connectionString);
    await connection.initialize();
    return connection;
  }

  public async initialize(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.connectionString);

      this.connectionState = ConnectionState.CONNECTED;

      this.connection.on('error', (err) => {
        this.logger.error('Connection error', { err });
      });

      this.connection.on('close', () => {
        this.logger.warn('Connection closed');

        eventBus.emit(AmqpEvents.AMQP_CLOSE);

        if (this.connectionState !== ConnectionState.SHUTTING_DOWN) {
          this.attemptReconnect();
        }
      });

      this.channel = await this.connection.createChannel();

      for (const consumer of this.batchConsumers) {
        consumer.setChannel(this.channel);
      }

      this.resetReconnectOptions();

      eventBus.emit(AmqpEvents.AMQP_READY);
    } catch (err) {
      this.logger.error('Failed to connect', { err });
      throw err;
    }
  }

  private resetReconnectOptions(): void {
    this.connectionState = ConnectionState.CONNECTED;
    this.retryCount = 0;
    this.currentRetryDelay = INITIAL_RETRY_DELAY_MS;
  }

  public getChannel(): Channel {
    return this.channel;
  }

  private attemptReconnect(): void {
    this.connectionState = ConnectionState.RECONNECTING;

    const reconnect = async () => {
      if (this.retryCount >= MAX_RETRY_ATTEMPTS) {
        this.logger.error('Max reconnection attempts reached, exiting');
        return;
      }

      this.retryCount += 1;

      this.logger.info(
        `Reconnection attempt ${this.retryCount}/${MAX_RETRY_ATTEMPTS}) in ${
          this.currentRetryDelay / 1000
        } seconds...`
      );

      setTimeout(async () => {
        try {
          await this.initialize();
          this.logger.info('Reconnection successful');
        } catch (err) {
          this.logger.error('Reconnection attempt failed', { err });
          this.currentRetryDelay = Math.min(this.currentRetryDelay * 1.5, MAX_RETRY_DELAY_MS);
          reconnect();
        }
      }, this.currentRetryDelay);
    };

    reconnect();
  }

  public async createBatchConsumer(
    options: BatchConsumerOptions,
    batchHandler: BatchHandler
  ): Promise<BatchConsumer> {
    try {
      const batchConsumer = new BatchConsumer(this.channel, options, batchHandler);

      await batchConsumer.start();

      this.batchConsumers.push(batchConsumer);

      return batchConsumer;
    } catch (err) {
      this.logger.error('Error creating batch consumer', { err });
      throw err;
    }
  }

  public async close(): Promise<void> {
    if (this.connectionState === ConnectionState.SHUTTING_DOWN) {
      return;
    }

    this.connectionState = ConnectionState.SHUTTING_DOWN;

    try {
      await this.channel.close();
      await this.connection.close();
      this.connectionState = ConnectionState.CLOSED;
      this.logger.info('Rmq connection closed');
    } catch (err) {
      this.logger.error('Error closing rmq connection', { err });
    }
  }
}
