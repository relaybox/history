import { getLogger } from '@/util/logger';
import amqp, { Channel, Connection } from 'amqplib';
import { Logger } from 'winston';
import { eventBus } from './event-bus';

const INITIAL_RETRY_DELAY_MS = 5000;
const MAX_RETRY_DELAY_MS = 60000;
const MAX_RETRY_ATTEMPTS = 10;

export type BatchHandler = (messages: any[]) => Promise<void>;

export enum AmqpEvents {
  AMQP_READY = 'amqp:ready',
  AMQP_CLOSE = 'amqp:close'
}

export default class Amqp {
  private connectionString: string;
  private connection: Connection;
  private channel: Channel;
  private logger: Logger;
  public ready: Promise<void>;
  private isReconnecting: boolean = false;
  private retryCount: number = 0;
  private currentRetryDelay: number = INITIAL_RETRY_DELAY_MS;
  private shutdownInProgress: boolean = false;

  protected constructor(connectionString: string) {
    this.logger = getLogger(`amqp`);

    this.connectionString = connectionString;

    this.ready = this.initialize().catch((err) => {
      this.logger.error('Error initializing connection', { err });
    });
  }

  public static async createClient(connectionString: string): Promise<Amqp> {
    const client = new Amqp(connectionString);
    await client.initialize();
    return client;
  }

  public async initialize(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.connectionString);

      this.connection.on('error', (err) => {
        this.logger.error('Connection error', { err });
      });

      this.connection.on('close', () => {
        this.logger.warn('Connection closed');
        eventBus.emit(AmqpEvents.AMQP_CLOSE);

        if (!this.isReconnecting && !this.shutdownInProgress) {
          this.attemptReconnect();
        }
      });

      this.channel = await this.connection.createChannel();

      this.resetReconnectOptions();

      eventBus.emit(AmqpEvents.AMQP_READY);
    } catch (err) {
      this.logger.error('Failed to connect', { err });
      throw err;
    }
  }

  private resetReconnectOptions(): void {
    this.isReconnecting = false;
    this.retryCount = 0;
    this.currentRetryDelay = INITIAL_RETRY_DELAY_MS;
  }

  public getChannel(): Channel {
    return this.channel;
  }

  private attemptReconnect(): void {
    this.isReconnecting = true;

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
