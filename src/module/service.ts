import { Logger } from 'winston';
import { PoolClient } from 'pg';
import * as db from './db';
import { KeyPrefix, MessageHistoryDbEntry, ParsedMessage } from './types';
import { RedisClient } from '@/lib/redis';
import { Document } from '@langchain/core/documents';
import { getQdrantVectorStore } from '@/lib/qdrant';
import { getOpenSearchVectorStore } from '@/lib/opensearch';
import { Client } from '@opensearch-project/opensearch/.';

export function getBufferKey(nspRoomId: string): string {
  return `${KeyPrefix.HISTORY}:buffer:${nspRoomId}`;
}

export function parseMessageHistoryDbEntries(
  logger: Logger,
  messages: any[]
): MessageHistoryDbEntry[] {
  logger.debug(`Parsing ${messages.length} message(s)`);

  return messages.reduce<MessageHistoryDbEntry[]>((acc, message) => {
    const { roomId, event, message: messageData } = message;
    const { requestId, data, session } = messageData;
    const now = new Date(data.timestamp).toISOString();
    const body = { $: data.body };

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
        body,
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

export async function invalidateCachedMessages(
  logger: Logger,
  redisClient: RedisClient,
  messages: ParsedMessage[]
): Promise<void> {
  logger.debug(`Invalidating ${messages.length} cached message(s)`);

  const multi = redisClient.multi();

  try {
    const invalidationMap = createInvalidationMap(messages);

    for (const [nspRoomId, score] of invalidationMap.entries()) {
      const key = getBufferKey(nspRoomId);
      multi.zRemRangeByScore(key, '-inf', score);
    }

    await multi.exec();
  } catch (err: unknown) {
    logger.error(`Failed to invalidate cached message(s)`, { err });
    throw err;
  }
}

export function createInvalidationMap(messages: ParsedMessage[]): Map<string, number> {
  const invalidationMap = new Map<string, number>();

  for (const messageData of messages) {
    const message = messageData.message;
    const nspRoomId = message.nspRoomId;
    const timestamp = message.data.timestamp;

    const existingTimestamp = invalidationMap.get(nspRoomId);

    if (!existingTimestamp || timestamp > existingTimestamp) {
      invalidationMap.set(nspRoomId, timestamp);
    }
  }

  return invalidationMap;
}

function createDocument(message: ParsedMessage): Document {
  const { message: messageData } = message;
  const { session, data } = messageData;

  const userText = `username=${session.user?.username}`;
  const bodyText = `message=${JSON.stringify(data.body)}`;
  const timestampText = `timestamp=${data.timestamp}`;
  const pageContent = `${userText}; ${bodyText}; ${timestampText};`;

  const { appPid, roomId } = message;

  const metadata = {
    id: data.id,
    appPid,
    roomId,
    timestamp: data.timestamp
  };

  return {
    id: data.id,
    pageContent,
    metadata
  };
}

export async function addMessagesToVectorStore(
  logger: Logger,
  openSearchClient: Client,
  messages: ParsedMessage[]
): Promise<void> {
  logger.debug(`Adding ${messages.length} message(s) to vector store`);

  try {
    const groupedMessages = groupMessagesByAppPid(logger, messages);

    for (const [appPid, appMessages] of groupedMessages.entries()) {
      // const vectorStore = getQdrantVectorStore(appPid);
      const vectorStore = getOpenSearchVectorStore(openSearchClient, appPid);
      const documents = appMessages.map(createDocument);
      await vectorStore.addDocuments(documents);
    }
  } catch (err: unknown) {
    logger.error(`Failed to add message to vector store`, { err });
    throw err;
  }
}

export function groupMessagesByAppPid(
  logger: Logger,
  messages: ParsedMessage[]
): Map<string, ParsedMessage[]> {
  logger.debug(`Grouping ${messages.length} message(s) by app pid`);

  try {
    return messages.reduce<Map<string, ParsedMessage[]>>((acc, message) => {
      const { appPid } = message;
      const existingMessages = acc.get(appPid) || [];

      acc.set(appPid, [...existingMessages, message]);

      return acc;
    }, new Map<string, ParsedMessage[]>());
  } catch (err: unknown) {
    logger.error(`Failed to group messages by app pid`, { err });
    throw err;
  }
}
