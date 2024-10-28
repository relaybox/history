import { getLogger } from '@/util/logger';
import { Channel, ConsumeMessage } from 'amqplib';
import { Logger } from 'winston';
import { eventBus } from './event-bus';
import { AmqpEvents } from './amqp';

const DEFAULT_PREFETCH_COUNT = 20;
const DEFAUL_BATCH_SIZE = 10;
const DEFAULT_BATCH_TIMEOUT_MS = 3000;

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
  private channel: Channel;
  private options: BatchConsumerOptions;
  private logger: Logger;
  private batchhandler: BatchHandler;
  private consuming: boolean = false;
  public ready: Promise<void>;

  constructor(channel: Channel, options: BatchConsumerOptions, batchHandler: BatchHandler) {
    this.logger = getLogger(`batch-consumer`);

    this.options = {
      prefetch: DEFAULT_PREFETCH_COUNT,
      batchSize: DEFAUL_BATCH_SIZE,
      batchTimeoutMs: DEFAULT_BATCH_TIMEOUT_MS,
      ...options
    };

    this.batchhandler = batchHandler;
    this.channel = channel;

    eventBus.on(AmqpEvents.AMQP_READY, this.start.bind(this));
    eventBus.on(AmqpEvents.AMQP_CLOSE, this.stop.bind(this));
  }

  public async start(): Promise<void> {
    this.logger.debug('Starting batch consumer');

    try {
      const exchange = this.options.exchange;

      this.bindQueue(exchange);

      await this.consume();
    } catch (err) {
      this.logger.error('Failed to connect', { err });
      throw err;
    }
  }

  public stop(): void {
    this.consuming = false;
  }

  private async bindQueue(exchange: ExchangeConfig): Promise<void> {
    this.logger.debug('Binding queue');

    await this.channel.assertExchange(exchange.name, exchange.type, {
      durable: exchange.durable ?? true
    });

    await this.channel.assertQueue(this.options.queue, { durable: true });
    await this.channel.bindQueue(this.options.queue, exchange.name, this.options.routingKey);
    await this.channel.prefetch(this.options.prefetch!);
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
    this.logger.debug(`Handling message`);

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

    this.batchTimeout = setTimeout(() => this.processBatch(), this.options.batchTimeoutMs);
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
}
