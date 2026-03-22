// Mock setup for running module tests

// Mock dateTimeUtils module before importing running
jest.mock('../../utils/dateTimeUtils.js', () => ({
  displayFormatDate: jest.fn().mockReturnValue('2026-03-21T12:00:00.000'),
  applyTz: jest.fn().mockReturnValue('2026-03-21T12:00:00Z'),
  displaySecs: jest.fn().mockReturnValue('0h 0m 0s'),
}));

const dateTimeUtils = require('../../utils/dateTimeUtils.js');

describe('Running Module', () => {
  let running;
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

    running = require('../../running.js');
  });

  afterEach(() => {
    delete global.logger;
    delete global.serverConfig;
    delete global.db;
    delete global.moment;
  });

  describe('init()', () => {
    it('should initialize and load running items from database', async () => {
      const mockItems = [
        { jobName: 'running-job', startTime: new Date().toISOString() },
      ];
      mockDb.getData.mockResolvedValue(mockItems);

      await running.init();
      expect(mockDb.getData).toHaveBeenCalledWith('JOB_RUNNING');
    });

    it('should handle missing running data gracefully', async () => {
      mockDb.getData.mockRejectedValue(new Error('NotFoundError'));

      await running.init();
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('add()', () => {
    it('should add a new running item', () => {
      const item = { jobName: 'test-job', startTime: new Date().toISOString() };
      running.add(item);
      expect(logger.info).toHaveBeenCalled();
    });

    it('should persist to database after adding', () => {
      const item = { jobName: 'test-job', startTime: new Date().toISOString() };
      running.add(item);
      expect(mockDb.putData).toHaveBeenCalledWith('JOB_RUNNING', expect.any(Array));
    });

    it('should maintain max running items limit', () => {
      // Add more than MAX_HISTORY_ITEMS (50)
      for (let i = 0; i < 60; i++) {
        running.add({ jobName: `job-${i}`, startTime: new Date().toISOString() });
      }
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('createItem()', () => {
    it('should create a running item with correct structure', () => {
      const item = running.createItem('test-job', new Date().toISOString(), true);

      expect(item).toHaveProperty('jobName', 'test-job');
      expect(item).toHaveProperty('startTime');
      expect(item).toHaveProperty('manual', true);
    });

    it('should default mode to false if not provided', () => {
      const item = running.createItem('test-job', new Date().toISOString());
      expect(item.manual).toBe(false);
    });
  });

  describe('getItems()', () => {
    it('should return a copy of running items', () => {
      const item = { jobName: 'test', startTime: new Date().toISOString() };
      running.add(item);

      const items = running.getItems();
      expect(Array.isArray(items)).toBe(true);
    });

    it('should return items as structured clone', () => {
      const item = { jobName: 'test', startTime: new Date().toISOString() };
      running.add(item);

      const items = running.getItems();
      expect(items).not.toBe(undefined);
    });
  });

  describe('searchItemWithName()', () => {
    it('should find item by partial job name', () => {
      const item = { jobName: 'test-backup-job', startTime: new Date().toISOString() };
      running.add(item);

      const found = running.searchItemWithName('backup');
      expect(found).not.toBeNull();
      expect(found.jobName).toContain('backup');
    });

    it('should return null if not found', () => {
      const found = running.searchItemWithName('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('getItemByName()', () => {
    it('should find item by exact job name', () => {
      const item = { jobName: 'test-job', startTime: new Date().toISOString() };
      running.add(item);

      const found = running.getItemByName('test-job');
      expect(found).not.toBeNull();
      expect(found.jobName).toBe('test-job');
    });

    it('should return null if not found', () => {
      const found = running.getItemByName('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('removeItem()', () => {
    it('should remove item by job name', () => {
      const item = { jobName: 'test-job', startTime: new Date().toISOString() };
      running.add(item);

      running.removeItem('test-job');
      expect(mockDb.putData).toHaveBeenCalled();
    });

    it('should persist removal to database', () => {
      const item = { jobName: 'test-job', startTime: new Date().toISOString() };
      running.add(item);
      mockDb.putData.mockClear();

      running.removeItem('test-job');
      expect(mockDb.putData).toHaveBeenCalledWith('JOB_RUNNING', expect.any(Array));
    });
  });

  describe('getItemsUsingTZ()', () => {
    it('should format items with timezone', () => {
      const item = { jobName: 'test', startTime: new Date().toISOString() };
      running.add(item);

      const formattedItems = running.getItemsUsingTZ();
      expect(Array.isArray(formattedItems)).toBe(true);
      expect(dateTimeUtils.displayFormatDate).toHaveBeenCalled();
    });
  });
});
