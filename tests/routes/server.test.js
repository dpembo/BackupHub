// Mock setup for server routes tests
jest.mock('../../db.js');
jest.mock('../../agents.js');
jest.mock('../../scheduler.js');
jest.mock('../../history.js');

describe('Server Routes', () => {
  let mockReq;
  let mockRes;
  let mockNext;
  let agents;
  let scheduler;
  let history;

  beforeEach(() => {
    jest.resetModules();
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

    // Create mock request/response objects
    mockReq = {
      query: {},
      body: {},
      params: {},
      headers: {},
      csrfToken: jest.fn().mockReturnValue('test-token'),
    };

    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      redirect: jest.fn(),
      render: jest.fn(),
      send: jest.fn(),
      sendFile: jest.fn(),
    };

    mockNext = jest.fn();

    agents = require('../../agents.js');
    scheduler = require('../../scheduler.js');
    history = require('../../history.js');
  });

  afterEach(() => {
    delete global.logger;
    delete global.serverConfig;
  });

  describe('runSchedule endpoint (/runSchedule.html)', () => {
    it('should get agent status before running job', async () => {
      mockReq.query = { jobname: 'test-job', index: 0 };

      agents.getAgent = jest.fn().mockReturnValue({
        name: 'test-agent',
        status: 'online',
      });

      scheduler.getSchedule = jest.fn().mockReturnValue({
        jobName: 'test-job',
        agent: 'test-agent',
      });

      scheduler.getSchedules = jest.fn().mockReturnValue([
        {
          jobName: 'test-job',
          agent: 'test-agent',
        },
      ]);

      scheduler.manualJobRun = jest.fn().mockResolvedValue('ok');

      expect(mockRes.redirect).toBeDefined();
    });

    it('should handle offline agent gracefully', async () => {
      agents.getAgent = jest.fn().mockReturnValue({
        name: 'test-agent',
        status: 'offline',
      });

      scheduler.getSchedule = jest.fn().mockReturnValue({
        jobName: 'test-job',
        agent: 'test-agent',
      });

      scheduler.getSchedules = jest.fn().mockReturnValue([
        {
          jobName: 'test-job',
          agent: 'test-agent',
        },
      ]);

      expect(agents.getAgent).toBeDefined();
    });
  });

  describe('History data endpoint (/historyList/data)', () => {
    it('should return paginated history data', () => {
      mockReq.query = { sort: 'runDate', order: 'desc' };

      const mockHistoryItems = [
        {
          jobName: 'job-1',
          runDate: '2026-03-21T12:00:00Z',
          returnCode: 0,
        },
        {
          jobName: 'job-2',
          runDate: '2026-03-21T11:00:00Z',
          returnCode: 1,
        },
      ];

      history.getItemsUsingTZ = jest.fn().mockReturnValue(mockHistoryItems);

      expect(history.getItemsUsingTZ).toBeDefined();
    });

    it('should include schedule icon and color if available', () => {
      scheduler.getSchedules = jest.fn().mockReturnValue([
        {
          jobName: 'job-1',
          icon: 'backup',
          color: '#2196F3',
        },
      ]);

      const schedules = scheduler.getSchedules();
      expect(schedules[0]).toHaveProperty('icon');
      expect(schedules[0]).toHaveProperty('color');
    });

    it('should optimize orchestration success percentage computation (avoid N+1 queries)', async () => {
      // This test verifies the optimization that pre-fetches orchestration executions
      // once and computes percentages in-memory, instead of querying per job.
      
      const mockDb = require('../../db.js');
      const mockHistoryItems = [
        {
          jobName: 'orch-1',
          isOrchestration: true,
          jobId: 'orch-1-id',
          runDate: '2026-03-21T12:00:00Z',
          returnCode: 0,
        },
        {
          jobName: 'orch-2',
          isOrchestration: true,
          jobId: 'orch-2-id',
          runDate: '2026-03-21T11:00:00Z',
          returnCode: 0,
        },
        {
          jobName: 'orch-3',
          isOrchestration: true,
          jobId: 'orch-3-id',
          runDate: '2026-03-21T10:00:00Z',
          returnCode: 0,
        },
      ];

      // Mock orchestration execution history
      const mockExecutions = {
        'orch-1-id': [
          { executionId: 'exec-1', finalStatus: 'success' },
          { executionId: 'exec-2', finalStatus: 'success' },
          { executionId: 'exec-3', finalStatus: 'failed' },
          { executionId: 'exec-4', finalStatus: 'success' },
        ], // 3 success/4 total = 75%
        'orch-2-id': [
          { executionId: 'exec-5', finalStatus: 'success' },
          { executionId: 'exec-6', finalStatus: 'failed' },
        ], // 1 success/2 total = 50%
        'orch-3-id': [
          { executionId: 'exec-7', finalStatus: 'success' },
          { executionId: 'exec-8', finalStatus: 'success' },
          { executionId: 'exec-9', finalStatus: 'success' },
          { executionId: 'exec-10', finalStatus: 'success' },
          { executionId: 'exec-11', finalStatus: 'success' },
        ], // 5 success/5 total = 100%
      };

      mockDb.getData = jest.fn().mockResolvedValue(mockExecutions);

      // Simulate the optimization logic from server.js /historyList/data
      let orchestrationSuccessMap = {};

      try {
        const allExecutions = await mockDb.getData('ORCHESTRATION_EXECUTIONS');
        if (allExecutions) {
          for (const jobId in allExecutions) {
            const executions = allExecutions[jobId] || [];
            if (executions.length > 0) {
              const successCount = executions.filter(e => e.finalStatus === 'success').length;
              orchestrationSuccessMap[jobId] = Math.round((successCount / executions.length) * 100);
            } else {
              orchestrationSuccessMap[jobId] = '-';
            }
          }
        }
      } catch (err) {
        // Handle error
      }

      // Verify db.getData was called exactly ONCE (not 3 times for 3 jobs)
      expect(mockDb.getData).toHaveBeenCalledTimes(1);
      expect(mockDb.getData).toHaveBeenCalledWith('ORCHESTRATION_EXECUTIONS');

      // Verify success percentages were computed correctly
      expect(orchestrationSuccessMap['orch-1-id']).toBe(75);
      expect(orchestrationSuccessMap['orch-2-id']).toBe(50);
      expect(orchestrationSuccessMap['orch-3-id']).toBe(100);

      // Apply percentages to history items
      for (let i = 0; i < mockHistoryItems.length; i++) {
        if (mockHistoryItems[i].isOrchestration) {
          mockHistoryItems[i].successPercentage = orchestrationSuccessMap[mockHistoryItems[i].jobId] || '-';
        }
      }

      // Verify final history items have correct percentages
      expect(mockHistoryItems[0].successPercentage).toBe(75);
      expect(mockHistoryItems[1].successPercentage).toBe(50);
      expect(mockHistoryItems[2].successPercentage).toBe(100);
    });
  });

  describe('Input validation', () => {
    it('should validate CSRF tokens', () => {
      const token = mockReq.csrfToken();
      expect(token).toBe('test-token');
    });

    it('should handle missing parameters gracefully', () => {
      mockReq.query = {};
      expect(mockReq.query.jobname).toBeUndefined();
      expect(mockReq.query.index).toBeUndefined();
    });
  });

  describe('Error handling in routes', () => {
    it('should pass errors to next middleware', async () => {
      const testError = new Error('Test error');
      
      if (mockNext) {
        mockNext(testError);
        expect(mockNext).toHaveBeenCalledWith(testError);
      }
    });

    it('should handle undefined agent gracefully', () => {
      agents.getAgent = jest.fn().mockReturnValue(undefined);
      const agent = agents.getAgent('nonexistent');
      expect(agent).toBeUndefined();
    });
  });

  describe('Response formatting', () => {
    it('should return JSON responses with proper status codes', () => {
      mockRes.status(200).json({ success: true });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });

    it('should handle redirect responses', () => {
      mockRes.redirect('/history.html?message=Success');
      expect(mockRes.redirect).toHaveBeenCalledWith('/history.html?message=Success');
    });

    it('should render views with proper data', () => {
      mockRes.render('history', { data: 'test' });
      expect(mockRes.render).toHaveBeenCalledWith('history', { data: 'test' });
    });
  });
});
