import { Logger } from 'winston';
import { RedisClient } from '@/lib/redis';
import { PoolClient } from 'pg';
import * as db from './db';
import * as repository from './repository';
import { MessageHistoryDbEntry } from './types';

export async function getHistoryTtlhours(
  logger: Logger,
  pgClient: PoolClient,
  nspRoomId: string
): Promise<number> {
  logger.info(`Getting history ttl`, { nspRoomId });

  try {
    const { rows } = await db.getHistoryTtlhours(pgClient, nspRoomId);

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
  logger.info(`Setting history ttl (${historyTtlHours}h)`, { key, historyTtlHours });

  try {
    await repository.setHistoryTtl(redisClient, key, historyTtlHours);
  } catch (err: any) {
    logger.error(`Failed to set history ttl`, { err });
    throw err;
  }
}

export function parseMessage(message: any) {
  const content = message.content.toString();
  const parsedContent = JSON.parse(content);
  return parsedContent.data;
}

export function parseMessageHistoryDbEntries(
  logger: Logger,
  messages: any[]
): MessageHistoryDbEntry[] {
  logger.debug(`Parsing ${messages.length} message(s)`);

  return messages.reduce<MessageHistoryDbEntry[]>((acc, message) => {
    const { roomId, event, message: messageData } = message;
    const { requestId, data, session, latencyLog } = messageData;
    const now = new Date().toISOString();

    try {
      acc.push([
        data.id,
        session.appPid,
        session.keyId,
        session.uid,
        session.clientId,
        session.connectionId,
        session.socketId,
        roomId,
        event,
        requestId,
        data.body,
        now,
        now
      ]);
    } catch (err: unknown) {
      logger.error(`Failed to parse log stream message`, { err });
    }

    return acc;
  }, []);
}

export async function bulkInsertMessageHistory(
  logger: Logger,
  pgClient: PoolClient,
  parsedMessageHistoryDbEntries: MessageHistoryDbEntry[]
): Promise<void> {
  logger.debug(`Bulk inserting ${parsedMessageHistoryDbEntries.length} hostory message(s)`);

  try {
    const placeholdersPerRow = parsedMessageHistoryDbEntries[0].length;

    const queryPlaceholders = parsedMessageHistoryDbEntries.map((_, i) => {
      const baseIndex = i * placeholdersPerRow + 1;
      const arrayParams = { length: placeholdersPerRow };
      const placeholders = Array.from(arrayParams, (_, j) => `$${baseIndex + j}`);

      return `(${placeholders.join(', ')})`;
    });

    const values = parsedMessageHistoryDbEntries.flat();

    await db.bulkInsertMessageHistory(pgClient, queryPlaceholders, values);
  } catch (err: unknown) {
    logger.error(`Failed to bulk insert webhook logs`, { err });
    throw err;
  }
}
