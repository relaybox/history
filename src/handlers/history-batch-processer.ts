import {
  bulkInsertMessageHistory,
  parseMessage,
  parseMessageHistoryDbEntries
} from '@/module/service';
import { getLogger } from '@/util/logger';
import { Channel, ConsumeMessage } from 'amqplib';
import { Pool } from 'pg';

const logger = getLogger('history-batch-processer');

export async function handler(
  pgPool: Pool,
  channel: Channel,
  batch: ConsumeMessage[]
): Promise<void> {
  logger.debug(`Processing batch of ${batch.length} message(s)`);

  const pgClient = await pgPool.connect();

  try {
    const parsedMessages = batch.map(parseMessage);
    console.log(JSON.stringify(parsedMessages, null, 2));
    const messageDbEntries = parseMessageHistoryDbEntries(logger, parsedMessages);
    await bulkInsertMessageHistory(logger, pgClient, messageDbEntries);
    batch.forEach((message) => channel.ack(message));
    batch.length = 0;
  } catch (err: unknown) {
  } finally {
    pgClient.release();
  }
}
