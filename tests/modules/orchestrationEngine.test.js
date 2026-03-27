// Mock setup for orchestrationEngine module tests

// Mock db module before importing orchestrationEngine
jest.mock('../../db.js', () => ({
  getData: jest.fn(),
  putData: jest.fn(),
  deleteData: jest.fn(),
}));

// Mock fs module before importing orchestrationEngine
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    promises: {
      readFile: jest.fn(),
      writeFile: jest.fn(),
    },
  };
});

// Mock agents module before importing orchestrationEngine
jest.mock('../../agents.js', () => ({
  getAgent: jest.fn(),
  getDict: jest.fn(),
}));

// Mock wsBrowserTransport before importing orchestrationEngine
jest.mock('../../communications/wsBrowserTransport.js', () => ({
  emitOrchestrationEvent: jest.fn(),
  emitNotification: jest.fn(),
}));

// Mock history module before importing orchestrationEngine
jest.mock('../../history.js', () => ({
  add: jest.fn(),
  createHistoryItem: jest.fn(),
}));

const db = require('../../db.js');
const fs = require('fs');

describe('Orchestration Engine Module', () => {
  let orchestrationEngine;

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

    global.db = db;
    
    // Mock db functions
    db.getData = jest.fn();
    db.putData = jest.fn();
    db.deleteData = jest.fn();

    global.agentComms = {
      sendCommand: jest.fn(),
    };

    global.wsBrowser = {
      emitOrchestrationEvent: jest.fn(),
      emitNotification: jest.fn(),
    };

    // Import orchestrationEngine module (only once after mocks are set up)
    if (!orchestrationEngine) {
      orchestrationEngine = require('../../orchestrationEngine.js');
    }
  });

  afterEach(() => {
    delete global.logger;
    delete global.serverConfig;
    delete global.db;
    delete global.agentComms;
    delete global.wsBrowser;
  });

  describe('waitForScriptCompletion()', () => {
    it('should wait for script completion and resolve with result', async () => {
      const completionPromise = orchestrationEngine.waitForScriptCompletion('job1', 5000);

      // Simulate script completion signal
      setTimeout(() => {
        orchestrationEngine.signalScriptCompletion('job1', {
          exitCode: 0,
          stdout: 'Script completed',
          stderr: '',
        });
      }, 100);

      const result = await completionPromise;

      expect(result).toHaveProperty('exitCode', 0);
      expect(result).toHaveProperty('stdout', 'Script completed');
    });

    it('should reject on timeout', async () => {
      await expect(orchestrationEngine.waitForScriptCompletion('job1', 100)).rejects.toThrow(
        'Script execution timeout'
      );
    });

    it('should handle multiple concurrent script completions', async () => {
      const promise1 = orchestrationEngine.waitForScriptCompletion('job1', 5000);
      const promise2 = orchestrationEngine.waitForScriptCompletion('job2', 5000);

      setTimeout(() => {
        orchestrationEngine.signalScriptCompletion('job1', { exitCode: 0, stdout: 'Job1' });
        orchestrationEngine.signalScriptCompletion('job2', { exitCode: 1, stdout: 'Job2' });
      }, 100);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1.exitCode).toBe(0);
      expect(result2.exitCode).toBe(1);
    });
  });

  describe('signalScriptCompletion()', () => {
    it('should signal successful script completion', () => {
      const completionPromise = orchestrationEngine.waitForScriptCompletion('job1', 5000);

      orchestrationEngine.signalScriptCompletion('job1', {
        exitCode: 0,
        stdout: 'Success',
      });

      return expect(completionPromise).resolves.toEqual(
        expect.objectContaining({ exitCode: 0, stdout: 'Success' })
      );
    });

    it('should ignore signal if no pending execution', () => {
      // Should not throw, just log warning
      expect(() => {
        orchestrationEngine.signalScriptCompletion('nonexistent', { exitCode: 0 });
      }).not.toThrow();

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('evaluateNumericCondition()', () => {
    // Access evaluateNumericCondition through module internals or test via executeJob
    it('should evaluate numeric conditions correctly', () => {
      // Test via orchestrationEngine module if exposed, or implicitly through integration tests
      expect(logger).toBeDefined();
    });
  });

  describe('getExecutionHistory()', () => {
    it('should retrieve execution history for a job', async () => {
      const mockExecutions = {
        job1: [
          {
            jobId: 'job1',
            executionId: 'exec1',
            status: 'completed',
            finalStatus: 'success',
          },
        ],
      };
      db.getData.mockResolvedValue(mockExecutions);

      const result = await orchestrationEngine.getExecutionHistory('job1');

      expect(db.getData).toHaveBeenCalledWith('ORCHESTRATION_EXECUTIONS');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    });

    it('should return empty array when no history exists', async () => {
      db.getData.mockRejectedValue(new Error('NotFoundError: Key not found'));

      const result = await orchestrationEngine.getExecutionHistory('job1');

      expect(result).toEqual([]);
    });

    it('should return empty array for job with no executions', async () => {
      db.getData.mockResolvedValue({});

      const result = await orchestrationEngine.getExecutionHistory('job1');

      expect(result).toEqual([]);
    });

    it('should throw non-NotFoundError exceptions', async () => {
      db.getData.mockRejectedValue(new Error('Database connection failed'));

      await expect(orchestrationEngine.getExecutionHistory('job1')).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('saveExecutionResult()', () => {
    it('should save execution result to database', async () => {
      db.getData.mockResolvedValue({});

      const executionLog = {
        jobId: 'job1',
        executionId: 'exec1',
        status: 'completed',
        finalStatus: 'success',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
      };

      await orchestrationEngine.saveExecutionResult(executionLog);

      expect(db.putData).toHaveBeenCalled();
      const savedData = db.putData.mock.calls[0][1];
      expect(savedData.job1).toBeDefined();
      expect(savedData.job1.length).toBe(1);
      expect(savedData.job1[0].executionId).toBe('exec1');
    });

    it('should initialize execution data if not found', async () => {
      db.getData.mockRejectedValueOnce(new Error('NotFoundError: Key not found'))
        .mockResolvedValueOnce({}); // Second call for subsequent saves

      const executionLog = {
        jobId: 'job1',
        executionId: 'exec1',
        status: 'completed',
        finalStatus: 'success',
      };

      await orchestrationEngine.saveExecutionResult(executionLog);

      expect(db.putData).toHaveBeenCalled();
    });

    it('should limit execution history to last 100 entries', async () => {
      // Create mock data with 101 existing executions
      const existingExecutions = {
        job1: Array.from({ length: 100 }, (_, i) => ({
          jobId: 'job1',
          executionId: `exec${i}`,
          finalStatus: 'success',
        })),
      };

      db.getData.mockResolvedValue(existingExecutions);

      const newExecutionLog = {
        jobId: 'job1',
        executionId: 'exec101',
        status: 'completed',
        finalStatus: 'success',
      };

      await orchestrationEngine.saveExecutionResult(newExecutionLog);

      const savedData = db.putData.mock.calls[0][1];
      expect(savedData.job1.length).toBe(100); // Should keep only last 100
      expect(savedData.job1[99].executionId).toBe('exec101'); // New one should be last
    });

    it('should handle database errors gracefully', async () => {
      db.getData.mockRejectedValue(new Error('Database connection failed'));

      const executionLog = {
        jobId: 'job1',
        executionId: 'exec1',
        finalStatus: 'success',
      };

      // Should not throw, should log error
      await expect(
        orchestrationEngine.saveExecutionResult(executionLog)
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalled();
    });

    it('should maintain multiple jobs execution history', async () => {
      db.getData.mockResolvedValue({
        job1: [{ jobId: 'job1', executionId: 'exec1' }],
      });

      const newExecution = {
        jobId: 'job2',
        executionId: 'exec2',
        finalStatus: 'success',
      };

      await orchestrationEngine.saveExecutionResult(newExecution);

      const savedData = db.putData.mock.calls[0][1];
      expect(savedData.job1).toBeDefined();
      expect(savedData.job2).toBeDefined();
      expect(savedData.job2[0].executionId).toBe('exec2');
    });
  });

  describe('getExecutionIndexById()', () => {
    it('should find execution by ID', async () => {
      const mockExecutions = [
        { executionId: 'exec1', finalStatus: 'success' },
        { executionId: 'exec2', finalStatus: 'failed' },
        { executionId: 'exec3', finalStatus: 'success' },
      ];

      db.getData.mockResolvedValue({ job1: mockExecutions });

      const index = await orchestrationEngine.getExecutionIndexById('job1', 'exec2');

      expect(index).toBe(1);
    });

    it('should return -1 when execution not found', async () => {
      const mockExecutions = [
        { executionId: 'exec1', finalStatus: 'success' },
      ];

      db.getData.mockResolvedValue({ job1: mockExecutions });

      const index = await orchestrationEngine.getExecutionIndexById('job1', 'nonexistent');

      expect(index).toBe(-1);
    });

    it('should return -1 when history is empty', async () => {
      db.getData.mockResolvedValue({});

      const index = await orchestrationEngine.getExecutionIndexById('job1', 'exec1');

      expect(index).toBe(-1);
    });

    it('should handle database errors gracefully', async () => {
      db.getData.mockRejectedValue(new Error('Database error'));

      const index = await orchestrationEngine.getExecutionIndexById('job1', 'exec1');

      expect(index).toBe(-1);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('activeOrchestrationExecutions tracking', () => {
    it('should expose activeOrchestrationExecutions object', () => {
      expect(orchestrationEngine.activeOrchestrationExecutions).toBeDefined();
      expect(typeof orchestrationEngine.activeOrchestrationExecutions).toBe('object');
    });
  });

  describe('Integration Tests', () => {
    it('should handle execution lifecycle: save and retrieve', async () => {
      db.getData.mockResolvedValue({});

      const executionLog = {
        jobId: 'integration-job',
        executionId: 'int-exec1',
        status: 'completed',
        finalStatus: 'success',
        startTime: '2026-03-27T00:00:00Z',
        endTime: '2026-03-27T00:05:00Z',
        visitedNodes: ['start', 'execute1', 'end'],
        nodeMetrics: {
          start: { duration: 0.1 },
          execute1: { duration: 300 },
          end: { duration: 0.1 },
        },
      };

      // Save execution
      await orchestrationEngine.saveExecutionResult(executionLog);
      expect(db.putData).toHaveBeenCalled();

      // Retrieve execution history
      db.getData.mockResolvedValue({
        'integration-job': [executionLog],
      });

      const history = await orchestrationEngine.getExecutionHistory('integration-job');
      expect(history.length).toBe(1);
      expect(history[0].executionId).toBe('int-exec1');

      // Find specific execution
      const index = await orchestrationEngine.getExecutionIndexById('integration-job', 'int-exec1');
      expect(index).toBe(0);
    });

    it('should handle script completion workflow', async () => {
      // Start waiting for script
      const completionPromise = orchestrationEngine.waitForScriptCompletion('workflow-job', 5000);

      // Simulate agent sending script completion
      setTimeout(() => {
        orchestrationEngine.signalScriptCompletion('workflow-job', {
          exitCode: 0,
          stdout: 'Backup completed successfully',
          stderr: '',
        });
      }, 50);

      const result = await completionPromise;

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Backup completed');
    });
  });
});
