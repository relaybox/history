import { getMockReducedSession } from '@/test/__mocks__/internal/session.mock';
import { describe, vi, it, afterEach, expect } from 'vitest';
import { getLogger } from '@/util/logger.util';
import { RedisClient } from '@/lib/redis';
import { PoolClient } from 'pg';
import { getHistoryTtlhours, setHistoryTtl } from '@/module/service';

const logger = getLogger('history-service');

const mockRepository = vi.hoisted(() => ({
  setHistoryTtl: vi.fn()
}));

vi.mock('@/module/repository', () => mockRepository);

const mockDb = vi.hoisted(() => ({
  getHistoryTtlhours: vi.fn()
}));

vi.mock('@/module/db', () => mockDb);

describe('service', () => {
  const mockRedisClient = {} as RedisClient;
  const mockPgClient = {} as PoolClient;

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getHistoryTtlhours', () => {
    it('should return history ttl for nspRoomId based on application settings', async () => {
      const historyTtlHoursForApplication = 24;
      mockDb.getHistoryTtlhours.mockResolvedValue({
        rows: [{ historyTtlHours: historyTtlHoursForApplication }]
      });

      const historyTtlHours = await getHistoryTtlhours(logger, mockPgClient, 'test:123');

      expect(historyTtlHours).toBe(historyTtlHoursForApplication);
    });
  });

  describe('setHistoryTtl', () => {
    it('should set the history cache key expiry time', async () => {
      const key = '2024-09-22T20h';
      const historyTtlHours = 24;

      await setHistoryTtl(logger, mockRedisClient, key, historyTtlHours);

      expect(mockRepository.setHistoryTtl).toHaveBeenCalledWith(
        mockRedisClient,
        key,
        historyTtlHours
      );
    });
  });
});
