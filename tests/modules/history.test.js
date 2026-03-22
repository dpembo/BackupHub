// Mock setup for history module tests

// Mock dateTimeUtils module before importing history
jest.mock('../../utils/dateTimeUtils.js', () => ({
  displayFormatDate: jest.fn().mockReturnValue('2026-03-21T12:00:00.000'),
  applyTz: jest.fn().mockReturnValue('2026-03-21T12:00:00Z'),
  displaySecs: jest.fn().mockReturnValue('0h 0m 0s'),
}));

const dateTimeUtils = require('../../utils/dateTimeUtils.js');

describe('History Module', () => {
  let history;
  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up global mocks
    global.logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    global.serverConfig = {
      server: {
        timezone: 'Europe/London',
      },
    };

    // Mock db as a global object
    mockDb = {
      getData: jest.fn().mockResolvedValue(null),
      putData: jest.fn().mockResolvedValue(true),
    };

    global.db = mockDb;
    global.moment = require('moment-timezone');

    history = require('../../history.js');
  });

  afterEach(() => {
    delete global.logger;
    delete global.serverConfig;
    delete global.db;
    delete global.moment;
  });

  describe('init()', () => {
    it('should initialize and load history items from database', async () => {
      const mockItems = [
        { jobName: 'test', runDate: '2026-03-21T12:00:00Z' },
      ];
      mockDb.getData.mockResolvedValue(mockItems);

      await history.init();
      expect(mockDb.getData).toHaveBeenCalledWith('JOB_HISTORY');
    });

    it('should handle missing history data gracefully', async () => {
      mockDb.getData.mockRejectedValue(new Error('NotFoundError'));

      await history.init();
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('add()', () => {
    it('should add a new history item', () => {
      const item = { jobName: 'test-job', runDate: new Date().toISOString() };
      history.add(item);
      expect(logger.info).toHaveBeenCalled();
    });

    it('should maintain max history items limit', () => {
      // Add more than MAX_HISTORY_ITEMS
      for (let i = 0; i < 160; i++) {
        history.add({ jobName: `job-${i}`, runDate: new Date().toISOString() });
      }
      expect(logger.info).toHaveBeenCalled();
    });

    it('should persist to database after adding', () => {
      const item = { jobName: 'test-job', runDate: new Date().toISOString() };
      history.add(item);
      expect(mockDb.putData).toHaveBeenCalledWith('JOB_HISTORY', expect.any(Array));
    });
  });

  describe('createHistoryItem()', () => {
    it('should create a history item with correct structure', () => {
      const item = history.createHistoryItem(
        'test-job',
        new Date().toISOString(),
        0,
        100,
        'Success',
        true
      );

      expect(item).toHaveProperty('jobName', 'test-job');
      expect(item).toHaveProperty('returnCode', 0);
      expect(item).toHaveProperty('runTime', 100);
      expect(item).toHaveProperty('log', 'Success');
      expect(item).toHaveProperty('manual', true);
    });

    it('should default manual to false if not provided', () => {
      const item = history.createHistoryItem('test', new Date().toISOString(), 0, 100, 'log');
      expect(item.manual).toBe(false);
    });
  });

  describe('getItems()', () => {
    it('should return a copy of history items', () => {
      const item = { jobName: 'test', runDate: new Date().toISOString() };
      history.add(item);

      const items = history.getItems();
      expect(Array.isArray(items)).toBe(true);
    });
  });

  describe('searchItemWithName()', () => {
    it('should find item by partial job name', () => {
      const item = { jobName: 'test-backup-job', runDate: new Date().toISOString() };
      history.add(item);

      const found = history.searchItemWithName('backup');
      expect(found).not.toBeNull();
      expect(found.jobName).toContain('backup');
    });

    it('should return null if not found', () => {
      const found = history.searchItemWithName('nonexistent');
      expect(found).toBeNull();
    });

    it('should handle array search terms', () => {
      const item = { jobName: 'test-job', runDate: new Date().toISOString() };
      history.add(item);

      const found = history.searchItemWithName(['test']);
      expect(found).not.toBeNull();
    });

    it('should reject invalid search terms', () => {
      const found = history.searchItemWithName(123);
      expect(found).toBeNull();
    });
  });

  describe('getItemsUsingTZ()', () => {
    it('should format items with timezone', () => {
      const item = { jobName: 'test', runDate: new Date().toISOString() };
      history.add(item);

      const formattedItems = history.getItemsUsingTZ();
      expect(Array.isArray(formattedItems)).toBe(true);
      expect(dateTimeUtils.displayFormatDate).toHaveBeenCalled();
    });
  });
});
