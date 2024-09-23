import { Pool } from 'pg';
import { RedisClient } from '@/lib/redis';
import { handler as historyTtlHandler } from '@/handlers/history-ttl';

export enum JobName {
  HISTORY_TTL = 'history:ttl'
}

const handlerMap = {
  [JobName.HISTORY_TTL]: historyTtlHandler
};

export async function router(
  pgPool: Pool,
  redisClient: RedisClient,
  jobName: JobName,
  data: any
): Promise<void> {
  return handlerMap[jobName](pgPool, redisClient, data);
}
