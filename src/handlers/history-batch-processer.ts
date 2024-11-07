import { Pool } from 'pg';
import {
  bulkInsertMessageHistory,
  invalidateCachedMessages,
  parseMessageHistoryDbEntries,
  putFirehoseRecords
} from '@/module/service';
import { ParsedMessage } from '@/module/types';
import { getLogger } from '@/util/logger';
import { RedisClient } from '@/lib/redis';
import { FirehoseClient } from '@aws-sdk/client-firehose';

const logger = getLogger('history-batch-processer');

export async function handler(
  pgPool: Pool,
  redisClient: RedisClient,
  firehoseClient: FirehoseClient,
  messages: ParsedMessage[]
): Promise<void> {
  logger.debug(`Processing batch of ${messages.length} message(s)`);

  const pgClient = await pgPool.connect();

  try {
    const messageDbEntries = parseMessageHistoryDbEntries(logger, messages);
    await bulkInsertMessageHistory(logger, pgClient, messageDbEntries);
    await invalidateCachedMessages(logger, redisClient, messages);
    await putFirehoseRecords(logger, firehoseClient, messages);
  } catch (err: unknown) {
    logger.error('Failed to process batch', { err });
    throw err;
  } finally {
    pgClient.release();
  }
}
