import { bulkInsertMessageHistory, parseMessageHistoryDbEntries } from '@/module/service';
import { getLogger } from '@/util/logger';
import { ConsumeMessage } from 'amqplib';
import { Pool } from 'pg';

const logger = getLogger('history-batch-processer');

export async function handler(pgPool: Pool, messages: ConsumeMessage[]): Promise<void> {
  logger.debug(`Processing batch of ${messages.length} message(s)`);

  const pgClient = await pgPool.connect();

  console.log(JSON.stringify(messages, null, 2));

  try {
    const messageDbEntries = parseMessageHistoryDbEntries(logger, messages);
    await bulkInsertMessageHistory(logger, pgClient, messageDbEntries);
  } catch (err: unknown) {
    logger.error('Failed to process batch', { err });
    throw err;
  } finally {
    pgClient.release();
  }
}
