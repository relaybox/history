import { Pool } from 'pg';
import { bulkInsertMessageHistory, parseMessageHistoryDbEntries } from '@/module/service';
import { ParsedMessage } from '@/module/types';
import { getLogger } from '@/util/logger';

const logger = getLogger('history-batch-processer');

export async function handler(pgPool: Pool, messages: ParsedMessage[]): Promise<void> {
  logger.debug(`Processing batch of ${messages.length} message(s)`);

  const pgClient = await pgPool.connect();

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
