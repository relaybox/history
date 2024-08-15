import { RedisClient } from '../lib/redis';

export function setHistoryTtl(
  redisClient: RedisClient,
  key: string,
  historyTtlHours: number
): Promise<boolean> {
  return redisClient.expire(key, historyTtlHours * 60 * 60);
}
