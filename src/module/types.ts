export type MessageHistoryDbEntry = (string | number)[];

export interface LatencyLog {
  createdAt: string;
  receivedAt: string;
}

export interface AuthUser {
  id: string;
  clientId: string;
  createdAt: string;
  updatedAt: string;
  username: string;
  orgId: string;
  isOnline: boolean;
  lastOnline: string;
  appId: string;
  blockedAt: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface ReducedSession {
  appPid: string;
  keyId: string;
  uid: string;
  clientId: string;
  connectionId: string;
  socketId: string;
  instanceId?: string | number;
  user?: AuthUser;
}

export interface Message {
  event: string;
  data: any;
  nspRoomId: string;
  session: ReducedSession;
  requestId: string;
  latencyLog: LatencyLog;
  global?: boolean;
}

export interface ParsedMessage {
  appPid: string;
  roomId: string;
  event: string;
  message: Message;
  llmInputPath?: string;
}

export enum KeyPrefix {
  HISTORY = 'history'
}
