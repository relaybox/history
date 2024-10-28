import { getLogger } from '@/util/logger';
import amqp, { Channel, Connection, ConsumeMessage } from 'amqplib';
import { Logger } from 'winston';

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
  private connection!: Connection;
  private channel!: Channel;
  private options: BatchConsumerOptions;
  private logger: Logger;
  private batchhandler: BatchHandler;
  private consuming: boolean = false;
  public ready: Promise<void>;

  constructor(options: BatchConsumerOptions, batchHandler: BatchHandler) {
    this.options = {
      prefetch: 10,
      batchSize: 10,
      batchTimeoutMs: 10000,
      ...options
    };

    this.batchhandler = batchHandler;

    this.logger = getLogger(`batch-consumer`);

    this.ready = this.initialize().catch((err) => {
      this.logger.error('Error initializing batch consumer:', { err });
    });
  }

  public async initialize(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.options.amqpConnectionString);

      this.connection.on('error', (err) => {
        this.logger.error('Connection error:', err);
      });

      this.connection.on('close', () => {
        this.logger.warn('Connection closed');
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
          throw new Error('Routing key is required when an exchange is specified.');
        }
      } else {
        await this.channel.assertQueue(this.options.queue, { durable: true });
      }

      await this.channel.prefetch(this.options.prefetch!);

      console.log('Connected to RabbitMQ and channel is set up.');

      await this.consume();
    } catch (err) {
      console.error('Failed to connect to RabbitMQ:', { err });
      throw err; // Re-throw after logging
    }
  }

  public async close(): Promise<void> {
    try {
      await this.channel.close();
      await this.connection.close();
      this.logger.info('RabbitMQ connection closed gracefully.');
    } catch (err) {
      this.logger.error('Error closing RabbitMQ connection:', { err });
    }
  }

  public async consume(): Promise<void> {
    if (this.consuming) {
      throw new Error('Already consuming messages.');
    }

    this.consuming = true;

    await this.channel.consume(this.options.queue, this.onMessage.bind(this), {
      noAck: false
    });

    this.logger.debug(`Started consuming messages from queue: ${this.options.queue}`);
  }

  private onMessage(msg: ConsumeMessage | null): void {
    if (msg) {
      this.batch.push(msg);

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

    const messages = this.batch.map((msg) => this.parseMessage(msg));
    const originalMessages = [...this.batch];
    this.batch = [];

    try {
      await this.batchhandler(messages);

      originalMessages.forEach((msg) => {
        this.channel.ack(msg);
      });

      this.logger.debug(`Processed and acknowledged batch of ${messages.length} messages.`);
    } catch (err) {
      this.logger.error('Error processing batch:', { err });

      originalMessages.forEach((msg) => {
        this.channel.nack(msg, false, false);
      });
    }
  }

  private parseMessage(msg: ConsumeMessage): any {
    const content = msg.content.toString();

    try {
      return JSON.parse(content).data;
    } catch (err) {
      console.warn('Failed to parse message content as JSON:', content);
      return content;
    }
  }
}
