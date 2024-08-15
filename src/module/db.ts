import { PoolClient, QueryResult } from 'pg';

export function getHistoryTtlhours(pgClient: PoolClient, nspRoomId: string): Promise<QueryResult> {
  const [pid] = nspRoomId.split(':');

  const query = `
    SELECT "historyTtlHours" FROM applications WHERE pid = $1;
  `;

  return pgClient.query(query, [pid]);
}
