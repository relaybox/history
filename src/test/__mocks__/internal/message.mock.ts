import { getMockSession } from './session.mock';

interface MockMessageDataOptions {
  clientId?: string;
  nspRoomId?: string;
  subscription?: string;
}

export function getMockMessageData({
  clientId,
  nspRoomId,
  subscription
}: MockMessageDataOptions = {}): any {
  clientId = clientId || '12345';
  nspRoomId = nspRoomId || 'test:123';
  subscription = subscription || 'test';

  const session = getMockSession({ clientId }, { clientId });
  const now = new Date().toISOString();
  const latencyLog = {
    createdAt: now,
    receivedAt: now
  };
  const message = {
    test: true
  };

  return {
    clientId,
    nspRoomId,
    subscription,
    session,
    message,
    latencyLog
  };
}
