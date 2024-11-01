import { getLogger } from '@/util/logger';
import { Channel, ConsumeMessage } from 'amqplib';
import { Logger } from 'winston';
import { eventBus } from '../event-bus';
import { AmqpEvent, BatchConsumerEvent, BatchConsumerOptions, ExchangeConfig } from './rmq';
import EventEmitter from 'events';

const DEFAULT_PREFETCH_COUNT = 20;
const DEFAUL_BATCH_SIZE = 10;
const DEFAULT_BATCH_TIMEOUT_MS = 10000;

export type BatchHandler = (messages: any[]) => Promise<void>;

export default class BatchConsumer extends EventEmitter {
  private batch: ConsumeMessage[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private channel: Channel;
  private options: BatchConsumerOptions;
  private logger: Logger;
  private batchhandler: BatchHandler;
  private consuming: boolean = false;
  private consumerTag: string | null = null;
  public ready: Promise<void>;

  constructor(channel: Channel, options: BatchConsumerOptions, batchHandler: BatchHandler) {
    super();

    this.logger = getLogger(`batch-consumer`);

    this.options = {
      prefetch: DEFAULT_PREFETCH_COUNT,
      batchSize: DEFAUL_BATCH_SIZE,
      batchTimeoutMs: DEFAULT_BATCH_TIMEOUT_MS,
      ...options
    };

    this.channel = channel;
    this.batchhandler = batchHandler;

    eventBus.on(AmqpEvent.AMQP_CLOSE, this.stop.bind(this));
  }

  public async start(): Promise<void> {
    this.logger.debug('Starting batch consumer');

    if (this.batch.length > 0) {
      this.startBatchTimeout();
    }

    try {
      const exchange = this.options.exchange;

      await this.bindQueue(exchange);

      await this.consume();
    } catch (err) {
      this.logger.error('Failed to connect', { err });
      throw err;
    }
  }

  public async stop(): Promise<void> {
    this.consuming = false;

    if (this.consumerTag) {
      await this.channel.cancel(this.consumerTag);
    }

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
  }

  public setChannel(channel: Channel): void {
    this.channel = channel;

    this.stop();
    this.start().catch((err) => this.logger.error('Failed to restart consumer', { err }));
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

    const { consumerTag } = await this.channel.consume(
      this.options.queue,
      this.handleMessage.bind(this),
      {
        noAck: false
      }
    );

    this.consumerTag = consumerTag;

    this.logger.info(`Started consuming messages from queue: ${this.options.queue}`);
  }

  private handleMessage(message: ConsumeMessage | null): void {
    this.logger.debug(`Handling message`);

    if (message) {
      this.batch.push(message);

      if (!this.batchTimeout) {
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
    if (this.batch.length === 0 || !this.consuming) {
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

      for (const message of originalMessages) {
        this.channel.ack(message);
        this.emit(BatchConsumerEvent.MESSAGE_ACKNOWLEDGED, message);
      }

      this.logger.info(`Processed and acknowledged ${messages.length} message(s)`);
    } catch (err) {
      this.logger.error('Error processing batch', { err });

      for (const message of originalMessages) {
        this.channel.nack(message, false, false);
        this.emit(BatchConsumerEvent.MESSAGE_FAILED, message);
      }
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
