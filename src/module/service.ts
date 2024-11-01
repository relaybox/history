import { Logger } from 'winston';
import { PoolClient } from 'pg';
import * as db from './db';
import { MessageHistoryDbEntry } from './types';

export function parseMessageHistoryDbEntries(
  logger: Logger,
  messages: any[]
): MessageHistoryDbEntry[] {
  logger.debug(`Parsing ${messages.length} message(s)`);

  return messages.reduce<MessageHistoryDbEntry[]>((acc, message) => {
    const { roomId, event, message: messageData } = message;
    const { requestId, data, session, latencyLog } = messageData;
    const now = new Date(data.timestamp).toISOString();

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
  logger.debug(`Bulk inserting ${parsedMessageHistoryDbEntries.length} message(s)`);

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

// export async function deleteCachedMessage
