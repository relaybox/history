import { PoolClient, QueryResult } from 'pg';

export function getHistoryTtlhours(pgClient: PoolClient, nspRoomId: string): Promise<QueryResult> {
  const [pid] = nspRoomId.split(':');

  const query = `
    SELECT "historyTtlHours" FROM applications WHERE pid = $1;
  `;

  return pgClient.query(query, [pid]);
}

export function bulkInsertMessageHistory(
  pgClient: PoolClient,
  queryPlaceholders: string[],
  values: any[]
): Promise<QueryResult> {
  const query = `
    INSERT INTO message_history (
      id, 
      "appPid", 
      "keyId", 
      uid, 
      "clientId", 
      "connectionId", 
      "socketId", 
      "roomId", 
      "roomUuid",
      event, 
      "requestId", 
      body, 
      "llmInputPath",
      "createdAt", 
      "updatedAt"
    )
    VALUES ${queryPlaceholders}
    ON CONFLICT (id) 
    DO NOTHING;
  `;

  return pgClient.query(query, values);
}
