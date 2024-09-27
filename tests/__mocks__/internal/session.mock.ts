import { ReducedSession } from '@/module/types';

const DEFAULT_REDUCED_SESSION = {
  uid: 'Fef8GnS7C5zN:rHg5Gd5VGMdv',
  appPid: 'Fef8GnS7C5zN',
  keyId: 'GFVHaIrJ6Y1_',
  clientId: 'Fef8GnS7C5zN:rHg5Gd5VGMdv',
  connectionId: 'Fef8GnS7C5zN:U7JWOF-5XgfF',
  socketId: '63836bc5-e304-415a-a93e-230fe5f32c64'
};

export function getMockReducedSession(sessionData: Partial<ReducedSession> = {}): ReducedSession {
  return {
    ...DEFAULT_REDUCED_SESSION,
    ...sessionData
  };
}
