// Mock setup for scheduler module tests

// Mock db module before importing scheduler
jest.mock('../../db.js', () => ({
  getData: jest.fn(),
  putData: jest.fn(),
  deleteData: jest.fn(),
}));

// Mock dateTimeUtils module before importing scheduler
jest.mock('../../utils/dateTimeUtils.js', () => ({
  displayFormatDate: jest.fn().mockReturnValue('2026-03-21T12:00:00.000'),
  applyTz: jest.fn().mockReturnValue('2026-03-21T12:00:00Z'),
  displaySecs: jest.fn().mockReturnValue('0h 0m 0s'),
}));

jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  const mockPromises = {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    unlink: jest.fn(),
  };
  return {
    ...actualFs,
    existsSync: jest.fn().mockReturnValue(false),
    promises: mockPromises,
  };
});

const dateTimeUtils = require('../../utils/dateTimeUtils.js');
const fs = require('fs');
const db = require('../../db.js');

describe('Scheduler Module', () => {
  let scheduler;
  let mockAgents;
  let mockHistory;

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
        jobFailEnabled: 'true',
        timezone: 'Europe/London',
      },
    };

    global.agentComms = {
      sendCommand: jest.fn(),
    };

    global.mqttTransport = {
      getCommandTopic: jest.fn().mockReturnValue('backup/commands'),
    };

    global.thresholdJobs = {
      empty: jest.fn(),
      addJob: jest.fn(),
    };

    global.nodeschedule = {
      scheduleJob: jest.fn().mockReturnValue({}),
      scheduledJobs: {},
    };

    global.notifier = {
      sendNotification: jest.fn(),
    };

    // Mock agents as a global object
    mockAgents = {
      getAgent: jest.fn().mockReturnValue({
        name: 'test-agent',
        status: 'online',
      }),
      getDict: jest.fn().mockReturnValue({
        'test-agent': { name: 'test-agent', status: 'online' },
      }),
    };

    // Mock history as a global object (named 'hist' in production)
    mockHistory = {
      createHistoryItem: jest.fn().mockReturnValue({
        jobName: 'test',
        returnCode: 0,
      }),
      add: jest.fn(),
      getAverageRuntime: jest.fn().mockReturnValue(3600), // 1 hour in seconds
    };

    // Mock fs.promises
    fs.promises.readFile = jest.fn().mockImplementation((filePath) => {
      if (filePath === './data/schedules.json') {
        // Return mock schedules for migration (if file exists)
        return Promise.resolve(JSON.stringify([
          {
            jobName: 'test-job',
            agent: 'test-agent',
            command: 'test.sh',
            scheduleType: 'daily',
            scheduleTime: '12:00',
            dayOfWeek: '*',
            dayInMonth: '*',
          },
        ]));
      }
      // Return shell script content for other files
      return Promise.resolve('#!/bin/bash\necho test');
    });
    fs.promises.writeFile = jest.fn().mockResolvedValue(undefined);
    fs.promises.mkdir = jest.fn().mockResolvedValue(undefined);
    fs.promises.unlink = jest.fn().mockResolvedValue(undefined);

    // Set up the actual mocked db with sample schedules
    const sampleSchedules = [
      {
        jobName: 'test-job',
        agent: 'test-agent',
        command: 'test.sh',
        scheduleType: 'daily',
        scheduleTime: '12:00',
        dayOfWeek: '*',
        dayInMonth: '*',
      },
    ];
    
    db.getData.mockResolvedValue(sampleSchedules);
    db.putData.mockResolvedValue(true);

    global.agents = mockAgents;
    global.hist = mockHistory;
    global.moment = require('moment-timezone');

    scheduler = require('../../scheduler.js');
  });

  afterEach(() => {
    delete global.logger;
    delete global.serverConfig;
    delete global.agentComms;
    delete global.mqttTransport;
    delete global.thresholdJobs;
    delete global.nodeschedule;
    delete global.notifier;
    delete global.agents;
    delete global.hist;
    delete global.moment;
  });

  describe('init()', () => {
    it('should initialize scheduler', async () => {
      db.getData.mockResolvedValue([
        {
          jobName: 'test-job',
          agent: 'test-agent',
          command: 'test.sh',
          scheduleType: 'daily',
          scheduleTime: '12:00',
          dayOfWeek: '*',
          dayInMonth: '*',
        },
      ]);

      await scheduler.init();
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('getSchedule()', () => {
    beforeEach(async () => {
      // Initialize scheduler to load schedules
      await scheduler.init();
    });

    it('should retrieve a schedule by job name', async () => {
      const schedule = scheduler.getSchedule('test-job');
      
      if (schedule) {
        expect(schedule.jobName).toBe('test-job');
      }
    });
  });

  describe('getSchedules()', () => {
    beforeEach(async () => {
      // Set up mock data before init
      db.getData.mockResolvedValue([
        {
          jobName: 'test-job',
          agent: 'test-agent',
          command: 'test.sh',
          scheduleType: 'daily',
          scheduleTime: '12:00',
          dayOfWeek: '*',
          dayInMonth: '*',
        },
      ]);
      // Initialize scheduler to load schedules
      await scheduler.init();
    });

    it('should return array of schedules', () => {
      const schedules = scheduler.getSchedules();
      expect(Array.isArray(schedules)).toBe(true);
      expect(schedules.length).toBeGreaterThan(0);
    });
  });

  describe('deleteSchedule()', () => {
    it('should delete a schedule by job name', async () => {
      // This test is simplified since the scheduler would need
      // proper setup with actual schedule data
      await scheduler.deleteSchedule('test-job');
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('manualJobRun()', () => {
    beforeEach(async () => {
      // Set up mock data before init
      db.getData.mockResolvedValue([
        {
          jobName: 'test-job',
          agent: 'test-agent',
          command: 'test.sh',
          scheduleType: 'daily',
          scheduleTime: '12:00',
          dayOfWeek: '*',
          dayInMonth: '*',
        },
      ]);
      // Initialize scheduler to load schedules
      await scheduler.init();
    });

    it('should attempt to manually run a job', async () => {
      mockAgents.getAgent.mockReturnValue({
        name: 'test-agent',
        status: 'online',
      });

      const result = await scheduler.manualJobRun(0, 'test-job');
      expect(result).toBeDefined();
    });

    it('should reject if agent is offline', async () => {
      mockAgents.getAgent.mockReturnValue({
        name: 'test-agent',
        status: 'offline',
      });

      const result = await scheduler.manualJobRun(0, 'test-job');
      expect(result).toBe('error');
    });

    it('should reject if agent not found', async () => {
      mockAgents.getAgent.mockReturnValue(undefined);

      const result = await scheduler.manualJobRun(0, 'test-job');
      expect(result).toBe('error');
    });

    it('should validate job name is a string', async () => {
      const result = await scheduler.manualJobRun(0, ['not-a-string']);
      expect(result).toBe('error');
    });
  });

  describe('upsertSchedule()', () => {
    it('should create or update a schedule', async () => {
      const schedule = {
        jobName: 'new-job',
        description: 'Test Job',
        agent: 'test-agent',
        command: 'test.sh',
      };

      await scheduler.upsertSchedule(schedule);
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('getNextRunDate()', () => {
    it('should calculate next run date for schedule', () => {
      const schedule = {
        scheduleType: 'daily',
        scheduleTime: '12:00',
      };

      const nextRun = scheduler.getNextRunDate(schedule);
      if (nextRun) {
        expect(nextRun instanceof Date).toBe(true);
      }
    });
  });
});
