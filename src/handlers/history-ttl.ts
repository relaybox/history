import { Pool } from 'pg';
import { RedisClient } from '@/lib/redis';
import { getLogger } from '@/util/logger.util';
import { getHistoryTtlhours, setHistoryTtl } from '@/module/service';

const logger = getLogger('history-ttl');

export async function handler(pgPool: Pool, redisClient: RedisClient, data: any): Promise<void> {
  const { key, nspRoomId } = data;

  logger.debug(`Handling history ttl message`, { key, nspRoomId });

  const pgClient = await pgPool.connect();

  try {
    const historyTtlHours = await getHistoryTtlhours(logger, pgClient, nspRoomId);
    await setHistoryTtl(logger, redisClient, key, historyTtlHours);
  } catch (err: any) {
    logger.error(`Failed to set history ttl`, { err });
    throw err;
  } finally {
    pgClient.release();
  }
}
