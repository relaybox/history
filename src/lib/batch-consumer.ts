import { getLogger } from '@/util/logger';
import amqp, { Channel, Connection, ConsumeMessage } from 'amqplib';
import { Logger } from 'winston';

const DEFAULT_PREFETCH_COUNT = 20;
const DEFAUL_BATCH_SIZE = 10;
const DEFAULT_BATCH_TIMEOUT_MS = 10000;

const INITIAL_RETRY_DELAY_MS = 5000;
const MAX_RETRY_DELAY_MS = 60000;
const MAX_RETRY_ATTEMPTS = 10;

export interface ExchangeConfig {
  name: string;
  type: string;
  durable?: boolean;
}

export interface BatchConsumerOptions {
  amqpConnectionString: string;
  exchange: ExchangeConfig;
  queue: string;
  routingKey: string;
  prefetch?: number;
  batchSize?: number;
  batchTimeoutMs?: number;
}

export type BatchHandler = (messages: any[]) => Promise<void>;

export default class BatchConsumer {
  private batch: ConsumeMessage[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private connection: Connection;
  private channel: Channel;
  private options: BatchConsumerOptions;
  private logger: Logger;
  private batchhandler: BatchHandler;
  private consuming: boolean = false;
  public ready: Promise<void>;
  private isReconnecting: boolean = false;
  private retryCount: number = 0;
  private currentRetryDelay: number = INITIAL_RETRY_DELAY_MS;
  private shutdownInProgress: boolean = false;

  constructor(options: BatchConsumerOptions, batchHandler: BatchHandler) {
    this.logger = getLogger(`batch-consumer`);

    this.options = {
      prefetch: DEFAULT_PREFETCH_COUNT,
      batchSize: DEFAUL_BATCH_SIZE,
      batchTimeoutMs: DEFAULT_BATCH_TIMEOUT_MS,
      ...options
    };

    this.batchhandler = batchHandler;

    this.ready = this.initialize().catch((err) => {
      this.logger.error('Error initializing batch consumer', { err });
    });
  }

  public async initialize(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.options.amqpConnectionString);

      this.connection.on('error', (err) => {
        this.logger.error('Connection error', { err });
      });

      this.connection.on('close', () => {
        this.logger.warn('Connection closed');

        if (!this.isReconnecting && !this.shutdownInProgress) {
          this.attemptReconnect();
        }
      });

      this.channel = await this.connection.createChannel();

      if (this.options.exchange) {
        const exchange = this.options.exchange;

        await this.channel.assertExchange(exchange.name, exchange.type, {
          durable: exchange.durable ?? true
        });

        if (this.options.routingKey) {
          await this.channel.assertQueue(this.options.queue, { durable: true });
          await this.channel.bindQueue(this.options.queue, exchange.name, this.options.routingKey);
        } else {
          throw new Error('Routing key is required when an exchange is specified');
        }
      } else {
        await this.channel.assertQueue(this.options.queue, { durable: true });
      }

      await this.channel.prefetch(this.options.prefetch!);

      await this.consume();

      this.isReconnecting = false;
      this.retryCount = 0;
      this.currentRetryDelay = INITIAL_RETRY_DELAY_MS;
    } catch (err) {
      this.logger.error('Failed to connect', { err });
      throw err;
    }
  }

  public async consume(): Promise<void> {
    if (this.consuming) {
      throw new Error('Already consuming messages.');
    }

    this.consuming = true;

    await this.channel.consume(this.options.queue, this.handleMessage.bind(this), {
      noAck: false
    });

    this.logger.info(`Started consuming messages from queue: ${this.options.queue}`);
  }

  private handleMessage(message: ConsumeMessage | null): void {
    if (message) {
      this.batch.push(message);

      if (this.batch.length === 1) {
        this.startBatchTimeout();
      }

      if (this.batch.length >= this.options.batchSize!) {
        this.processBatch();
      }
    }
  }

  private startBatchTimeout(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.options.batchTimeoutMs);
  }

  private async processBatch(): Promise<void> {
    if (this.batch.length === 0) {
      return;
    }

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    const originalMessages = [...this.batch];
    const messages = this.batch.map((message) => this.parseMessage(message));
    this.batch = [];

    try {
      await this.batchhandler(messages);

      originalMessages.forEach((message) => {
        this.channel.ack(message);
      });

      this.logger.info(`Processed and acknowledged ${messages.length} message(s)`);
    } catch (err) {
      this.logger.error('Error processing batch', { err });

      originalMessages.forEach((message) => {
        this.channel.nack(message, false, false);
      });
    }
  }

  private parseMessage(message: ConsumeMessage): any {
    const content = message.content.toString();

    try {
      return JSON.parse(content).data;
    } catch (err) {
      this.logger.warn('Failed to parse message content as JSON', content);
      return content;
    }
  }

  private attemptReconnect(): void {
    this.isReconnecting = true;
    this.consuming = false;

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
          this.retryCount += 1;
          this.currentRetryDelay = Math.min(this.currentRetryDelay * 2, MAX_RETRY_DELAY_MS);
          reconnect();
        }
      }, this.currentRetryDelay);
    };

    reconnect();
  }

  public async close(): Promise<void> {
    this.shutdownInProgress = true;

    try {
      await this.channel.close();
      await this.connection.close();

      this.logger.info('batch consumer closed');
    } catch (err) {
      this.logger.error('Error closing batch consumer', { err });
    }
  }
}
