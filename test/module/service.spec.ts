import { describe, vi, it, afterEach, expect } from 'vitest';
import { getLogger } from '@/util/logger';
import { groupMessagesByAppPid } from '@/module/service';
import { ParsedMessage } from '@/module/types';
import { getMockMessageData } from 'test/__mocks__/internal/message.mock';

const logger = getLogger('history-service');

describe('service', () => {
  describe('groupMessagesByAppPid', () => {
    it('should group messages by app pid', () => {
      const messages = [
        getMockMessageData({ appPid: '123' }),
        getMockMessageData({ appPid: '123' }),
        getMockMessageData({ appPid: '456' })
      ];

      const groupedMessages = groupMessagesByAppPid(logger, messages as ParsedMessage[]);

      expect(groupedMessages.size).toBe(2);
      expect(groupedMessages.get('123')).toHaveLength(2);
      expect(groupedMessages.get('456')).toHaveLength(1);
    });
  });
});
