import { Logger } from 'winston';
import { RedisClient } from '../lib/redis';
import { PoolClient } from 'pg';
import * as historyDb from './db';
import * as historyRepository from './repository';

export async function getHistoryTtlhours(
  logger: Logger,
  pgClient: PoolClient,
  nspRoomId: string
): Promise<number> {
  logger.info(`Getting history ttl`, { nspRoomId });

  try {
    const { rows } = await historyDb.getHistoryTtlhours(pgClient, nspRoomId);

    return rows[0].historyTtlHours;
  } catch (err: any) {
    logger.error(`Failed to get history ttl`, { err });
    throw err;
  }
}

export async function setHistoryTtl(
  logger: Logger,
  redisClient: RedisClient,
  key: any,
  historyTtlHours: number
): Promise<void> {
  logger.info(`Setting history ttl`, { key, historyTtlHours });

  try {
    await historyRepository.setHistoryTtl(redisClient, key, historyTtlHours);
  } catch (err: any) {
    logger.error(`Failed to set history ttl`, { err });
    throw err;
  }
}
