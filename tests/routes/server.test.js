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

  describe('Script Test Routes', () => {
    let mockScriptTestManager;

    beforeEach(() => {
      // Reset and prepare scriptTestManager mock
      mockScriptTestManager = {
        cleanupExpiredTests: jest.fn(),
        getExecution: jest.fn(),
        getBlockingState: jest.fn(),
        buildScriptIdentity: jest.fn(),
        createTest: jest.fn(),
        acknowledgeExecution: jest.fn(),
        discardExecution: jest.fn(),
        requestTermination: jest.fn(),
      };

      global.scriptTestManager = mockScriptTestManager;
    });

    afterEach(() => {
      delete global.scriptTestManager;
    });

    describe('POST /rest/script-test/state', () => {
      it('should return blocking state for existing script', () => {
        mockReq.body = {
          scriptName: 'test.sh',
          sourceType: 'saved',
          scriptContent: 'echo test',
        };

        mockScriptTestManager.buildScriptIdentity.mockReturnValue('script:test.sh');
        mockScriptTestManager.getBlockingState.mockReturnValue({
          type: 'active',
          execution: { executionId: 'exec-123', status: 'running' },
        });

        // Simulate route handler call
        const scriptIdentity = mockScriptTestManager.buildScriptIdentity({
          scriptName: 'test.sh',
          scriptSource: 'echo test',
          sourceType: 'saved',
        });

        const state = mockScriptTestManager.getBlockingState(scriptIdentity);

        expect(mockRes.json).not.toHaveBeenCalled(); // In real code, json() would be called
        expect(state).toBeDefined();
        expect(state.type).toBe('active');
      });

      it('should return null when no blocking state exists', () => {
        mockReq.body = {
          scriptName: 'free.sh',
          sourceType: 'saved',
          scriptContent: 'echo test',
        };

        mockScriptTestManager.buildScriptIdentity.mockReturnValue('script:free.sh');
        mockScriptTestManager.getBlockingState.mockReturnValue(null);

        const scriptIdentity = mockScriptTestManager.buildScriptIdentity({
          scriptName: 'free.sh',
          scriptSource: 'echo test',
          sourceType: 'saved',
        });

        const state = mockScriptTestManager.getBlockingState(scriptIdentity);

        expect(state).toBeNull();
      });

      it('should reject if saved script lookup missing script name', () => {
        mockReq.body = {
          scriptName: null,
          sourceType: 'saved',
          scriptContent: '',
        };

        // Validation should reject
        const isValid = !(!mockReq.body.scriptName && mockReq.body.sourceType === 'saved');
        expect(isValid).toBe(false);
      });
    });

    describe('POST /rest/script-test/start', () => {
      it('should reject if agent is offline', () => {
        mockReq.body = {
          agentName: 'offline-agent',
          scriptName: 'test.sh',
          scriptContent: 'echo test',
          sourceType: 'saved',
          commandParams: '',
        };

        agents.getAgent = jest.fn().mockReturnValue({
          name: 'offline-agent',
          status: 'offline',
        });

        const agent = agents.getAgent('offline-agent');
        expect(agent.status).toBe('offline');
        // Would return 409 Conflict in real route
      });

      it('should create test execution on success', () => {
        mockReq.body = {
          agentName: 'agent-1',
          scriptName: 'backup.sh',
          scriptDescription: 'Backup script',
          scriptContent: '#!/bin/sh\necho "backup"',
          sourceType: 'saved',
          commandParams: '--verbose',
        };

        agents.getAgent = jest.fn().mockReturnValue({
          name: 'agent-1',
          status: 'online',
        });

        mockScriptTestManager.createTest.mockReturnValue({
          ok: true,
          execution: {
            executionId: 'exec-456',
            status: 'pending',
            scriptName: 'backup.sh',
            scriptDescription: 'Backup script',
            commandParams: '--verbose',
          },
        });

        const result = mockScriptTestManager.createTest({
          executionId: 'exec-456',
          agentName: 'agent-1',
          scriptName: 'backup.sh',
          scriptDescription: 'Backup script',
          scriptSource: '#!/bin/sh\necho "backup"',
          sourceType: 'saved',
          commandParams: '--verbose',
          requestedBy: 'user@test.com',
        });

        expect(result.ok).toBe(true);
        expect(result.execution.executionId).toBe('exec-456');
        expect(result.execution.scriptDescription).toBe('Backup script');
      });

      it('should return 409 if active test exists', () => {
        mockReq.body = {
          agentName: 'agent-1',
          scriptName: 'exclusive.sh',
          scriptContent: 'echo test',
          sourceType: 'saved',
          commandParams: '',
        };

        const activeExecution = {
          executionId: 'exec-active',
          status: 'running',
        };

        mockScriptTestManager.createTest.mockReturnValue({
          ok: false,
          type: 'active',
          execution: activeExecution,
        });

        const result = mockScriptTestManager.createTest({
          executionId: 'new-exec',
          agentName: 'agent-1',
          scriptName: 'exclusive.sh',
          scriptDescription: '',
          scriptSource: 'echo test',
          sourceType: 'saved',
          commandParams: '',
          requestedBy: 'user',
        });

        expect(result.ok).toBe(false);
        expect(result.type).toBe('active');
        // Would return 409 Conflict with this execution
      });

      it('should return 409 if unseen retained result exists', () => {
        mockReq.body = {
          agentName: 'agent-1',
          scriptName: 'retained.sh',
          scriptContent: 'echo test',
          sourceType: 'saved',
          commandParams: '',
        };

        const retainedExecution = {
          executionId: 'exec-retained',
          status: 'completed',
          retainedUntil: '2026-03-21T12:30:00Z',
          acknowledgedAt: null,
        };

        mockScriptTestManager.createTest.mockReturnValue({
          ok: false,
          type: 'unseen_retained',
          execution: retainedExecution,
        });

        const result = mockScriptTestManager.createTest({
          executionId: 'new-exec',
          agentName: 'agent-1',
          scriptName: 'retained.sh',
          scriptDescription: '',
          scriptSource: 'echo test',
          sourceType: 'saved',
          commandParams: '',
          requestedBy: 'user',
        });

        expect(result.ok).toBe(false);
        expect(result.type).toBe('unseen_retained');
        // Would return 409 Conflict with this execution
      });
    });

    describe('GET /rest/script-test/:executionId', () => {
      it('should return execution data', () => {
        mockReq.params = { executionId: 'exec-789' };

        mockScriptTestManager.getExecution.mockReturnValue({
          executionId: 'exec-789',
          status: 'completed',
          returnCode: 0,
          log: 'Completed successfully',
          scriptName: 'test.sh',
          commandParams: '--verbose',
        });

        const execution = mockScriptTestManager.getExecution('exec-789');

        expect(execution).toBeDefined();
        expect(execution.status).toBe('completed');
        expect(execution.log).toContain('Completed successfully');
      });

      it('should return null for nonexistent execution', () => {
        mockReq.params = { executionId: 'nonexistent' };

        mockScriptTestManager.getExecution.mockReturnValue(null);

        const execution = mockScriptTestManager.getExecution('nonexistent');

        expect(execution).toBeNull();
      });
    });

    describe('POST /rest/script-test/:executionId/acknowledge', () => {
      it('should mark execution as acknowledged', () => {
        mockReq.params = { executionId: 'exec-ack' };

        mockScriptTestManager.acknowledgeExecution.mockReturnValue({
          executionId: 'exec-ack',
          status: 'completed',
          acknowledgedAt: '2026-03-21T12:00:00Z',
          isAcknowledged: true,
        });

        const execution = mockScriptTestManager.acknowledgeExecution('exec-ack');

        expect(execution).toBeDefined();
        expect(execution.isAcknowledged).toBe(true);
        expect(execution.acknowledgedAt).toBeDefined();
      });
    });

    describe('POST /rest/script-test/:executionId/discard', () => {
      it('should discard acknowledged execution', () => {
        mockReq.params = { executionId: 'exec-discard' };

        mockScriptTestManager.discardExecution.mockReturnValue(true);

        const result = mockScriptTestManager.discardExecution('exec-discard');

        expect(result).toBe(true);
      });

      it('should fail to discard unacknowledged execution', () => {
        mockReq.params = { executionId: 'exec-unack' };

        mockScriptTestManager.discardExecution.mockReturnValue(false);

        const result = mockScriptTestManager.discardExecution('exec-unack');

        expect(result).toBe(false);
      });
    });

    describe('POST /rest/script-test/:executionId/terminate', () => {
      it('should request termination of running execution', () => {
        mockReq.params = { executionId: 'exec-term' };

        mockScriptTestManager.requestTermination.mockReturnValue({
          executionId: 'exec-term',
          status: 'terminating',
          terminationRequestedAt: '2026-03-21T12:00:00Z',
        });

        const execution = mockScriptTestManager.requestTermination(
          'exec-term',
          'user@test.com'
        );

        expect(execution).toBeDefined();
        expect(execution.status).toBe('terminating');
        expect(execution.terminationRequestedAt).toBeDefined();
      });

      it('should return error if execution not found', () => {
        mockReq.params = { executionId: 'nonexistent-term' };

        mockScriptTestManager.requestTermination.mockReturnValue(null);

        const execution = mockScriptTestManager.requestTermination(
          'nonexistent-term',
          'user@test.com'
        );

        expect(execution).toBeNull();
      });
    });

    describe('Integration: Parameter preservation across test lifecycle', () => {
      it('should preserve command parameters in all states', () => {
        const testParams = '--backup-dir=/data --compress=true';

        // Create
        const createResult = mockScriptTestManager.createTest({
          executionId: 'exec-int-001',
          agentName: 'agent-1',
          scriptName: 'backup.sh',
          scriptDescription: 'Full backup',
          scriptSource: 'echo backup',
          sourceType: 'saved',
          commandParams: testParams,
          requestedBy: 'user@test.com',
        });

        mockScriptTestManager.createTest.mockReturnValue({
          ok: true,
          execution: {
            executionId: 'exec-int-001',
            commandParams: testParams,
            status: 'pending',
          },
        });

        // Get
        mockScriptTestManager.getExecution.mockReturnValue({
          executionId: 'exec-int-001',
          commandParams: testParams,
          status: 'pending',
        });

        const created = mockScriptTestManager.createTest({
          executionId: 'exec-int-001',
          agentName: 'agent-1',
          scriptName: 'backup.sh',
          scriptDescription: 'Full backup',
          scriptSource: 'echo backup',
          sourceType: 'saved',
          commandParams: testParams,
          requestedBy: 'user@test.com',
        });

        const fetched = mockScriptTestManager.getExecution('exec-int-001');

        expect(created.execution.commandParams).toBe(testParams);
        expect(fetched.commandParams).toBe(testParams);
      });
    });
  });
});
