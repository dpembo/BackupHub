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

// Mock notify module before importing orchestrationEngine
jest.mock('../../notify.js', () => ({
  sendNotification: jest.fn(),
}));

// Mock orchestrationMonitor module before importing orchestrationEngine
jest.mock('../../orchestrationMonitor.js', () => ({
  getJobDefinitionVersion: jest.fn(),
}));

// Mock configuration module before importing orchestrationEngine
jest.mock('../../configuration.js', () => ({
  getConfig: jest.fn(),
}));

const db = require('../../db.js');
const wsBrowserTransport = require('../../communications/wsBrowserTransport.js');
const notifier = require('../../notify.js');
const orchestrationMonitor = require('../../orchestrationMonitor.js');
const configuration = require('../../configuration.js');
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

    global.wsBrowser = wsBrowserTransport;

    // Setup notifier mock
    notifier.sendNotification = jest.fn();

    // Setup orchestrationMonitor mock
    orchestrationMonitor.getJobDefinitionVersion = jest.fn();

    // Setup configuration mock
    configuration.getConfig = jest.fn().mockReturnValue(global.serverConfig);

    // Import orchestrationEngine module (only once after mocks are set up)
    if (!orchestrationEngine) {
      orchestrationEngine = require('../../orchestrationEngine.js');
    }
  });

  afterEach(async () => {
    jest.clearAllMocks();
    // Wait for pending timers/promises to settle
    await new Promise(resolve => setImmediate(resolve));
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

    it('should handle concurrent executions of the SAME job with different executionIds', async () => {
      // Simulate two concurrent executions of the same orchestration job with different executionIds
      // This proves the fix for the concurrency bug where jobName must include executionId
      const jobName1 = 'Orchestration [test-job] Execution [exec-uuid-1] Node [node-1]';
      const jobName2 = 'Orchestration [test-job] Execution [exec-uuid-2] Node [node-1]';

      const promise1 = orchestrationEngine.waitForScriptCompletion(jobName1, 5000);
      const promise2 = orchestrationEngine.waitForScriptCompletion(jobName2, 5000);

      // Simulate completions in reverse order to ensure they don't cross-talk
      setTimeout(() => {
        orchestrationEngine.signalScriptCompletion(jobName2, { 
          exitCode: 1, 
          stdout: 'Output from execution 2',
          stderr: '' 
        });
        orchestrationEngine.signalScriptCompletion(jobName1, { 
          exitCode: 0, 
          stdout: 'Output from execution 1',
          stderr: '' 
        });
      }, 100);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Verify each execution got its own result (not cross-talked)
      expect(result1.exitCode).toBe(0);
      expect(result1.stdout).toBe('Output from execution 1');
      expect(result2.exitCode).toBe(1);
      expect(result2.stdout).toBe('Output from execution 2');
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
    it('should evaluate equality operator ==', () => {
      expect(orchestrationEngine.evaluateNumericCondition(10, '==', 10)).toBe(true);
      expect(orchestrationEngine.evaluateNumericCondition(10, '==', 5)).toBe(false);
    });

    it('should evaluate alternative equality operator =', () => {
      expect(orchestrationEngine.evaluateNumericCondition(10, '=', 10)).toBe(true);
      expect(orchestrationEngine.evaluateNumericCondition(10, '=', 5)).toBe(false);
    });

    it('should evaluate not equal operator !=', () => {
      expect(orchestrationEngine.evaluateNumericCondition(10, '!=', 5)).toBe(true);
      expect(orchestrationEngine.evaluateNumericCondition(10, '!=', 10)).toBe(false);
    });

    it('should evaluate greater than operator >', () => {
      expect(orchestrationEngine.evaluateNumericCondition(15, '>', 10)).toBe(true);
      expect(orchestrationEngine.evaluateNumericCondition(5, '>', 10)).toBe(false);
      expect(orchestrationEngine.evaluateNumericCondition(10, '>', 10)).toBe(false);
    });

    it('should evaluate greater than or equal operator >=', () => {
      expect(orchestrationEngine.evaluateNumericCondition(15, '>=', 10)).toBe(true);
      expect(orchestrationEngine.evaluateNumericCondition(10, '>=', 10)).toBe(true);
      expect(orchestrationEngine.evaluateNumericCondition(5, '>=', 10)).toBe(false);
    });

    it('should evaluate less than operator <', () => {
      expect(orchestrationEngine.evaluateNumericCondition(5, '<', 10)).toBe(true);
      expect(orchestrationEngine.evaluateNumericCondition(15, '<', 10)).toBe(false);
      expect(orchestrationEngine.evaluateNumericCondition(10, '<', 10)).toBe(false);
    });

    it('should evaluate less than or equal operator <=', () => {
      expect(orchestrationEngine.evaluateNumericCondition(5, '<=', 10)).toBe(true);
      expect(orchestrationEngine.evaluateNumericCondition(10, '<=', 10)).toBe(true);
      expect(orchestrationEngine.evaluateNumericCondition(15, '<=', 10)).toBe(false);
    });

    it('should support negated operators with ! prefix', () => {
      expect(orchestrationEngine.evaluateNumericCondition(10, '!=', 5)).toBe(true);
      expect(orchestrationEngine.evaluateNumericCondition(15, '!>', 10)).toBe(false);
      expect(orchestrationEngine.evaluateNumericCondition(5, '!>', 10)).toBe(true);
      expect(orchestrationEngine.evaluateNumericCondition(10, '!==', 10)).toBe(false);
      expect(orchestrationEngine.evaluateNumericCondition(10, '!==', 5)).toBe(true);
    });

    it('should handle string numbers via parseFloat', () => {
      expect(orchestrationEngine.evaluateNumericCondition('10', '==', '10')).toBe(true);
      expect(orchestrationEngine.evaluateNumericCondition('15.5', '>', '10.5')).toBe(true);
      expect(orchestrationEngine.evaluateNumericCondition('5.5', '<', '10.5')).toBe(true);
    });

    it('should default unknown operators to equality', () => {
      expect(orchestrationEngine.evaluateNumericCondition(10, 'unknown', 10)).toBe(true);
      expect(orchestrationEngine.evaluateNumericCondition(10, 'unknown', 5)).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith('Unknown operator: unknown, defaulting to ==');
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

    it('should send notification when orchestration fails with jobFailEnabled true', async () => {
      db.getData.mockResolvedValue({});
      orchestrationMonitor.getJobDefinitionVersion.mockResolvedValue({
        id: 'job1',
        name: 'My Orchestration',
      });
      global.serverConfig.server.jobFailEnabled = 'true';

      const executionLog = {
        jobId: 'job1',
        executionId: 'exec1',
        status: 'completed',
        finalStatus: 'failure',
        visitedNodes: ['start', 'execute1'],
        errors: [{ node: 'execute1', message: 'Script failed' }],
        scriptOutputs: {
          execute1: {
            exitCode: 1,
            stdout: 'Error output',
            stderr: '',
          },
        },
        endTime: new Date().toISOString(),
      };

      await orchestrationEngine.saveExecutionResult(executionLog);

      expect(notifier.sendNotification).toHaveBeenCalledWith(
        'My Orchestration - Orchestration Failed',
        expect.stringContaining('Node [execute1] failed'),
        'WARNING',
        expect.stringContaining('/orchestration/monitor.html?jobId=job1&executionId=exec1')
      );
    });

    it('should not send notification when orchestration succeeds', async () => {
      db.getData.mockResolvedValue({});
      orchestrationMonitor.getJobDefinitionVersion.mockResolvedValue({
        id: 'job1',
        name: 'My Orchestration',
      });
      global.serverConfig.server.jobFailEnabled = 'true';

      const executionLog = {
        jobId: 'job1',
        executionId: 'exec1',
        status: 'completed',
        finalStatus: 'success',
        visitedNodes: ['start', 'execute1', 'end'],
        endTime: new Date().toISOString(),
      };

      await orchestrationEngine.saveExecutionResult(executionLog);

      expect(notifier.sendNotification).not.toHaveBeenCalled();
    });

    it('should not send notification when jobFailEnabled is false', async () => {
      db.getData.mockResolvedValue({});
      orchestrationMonitor.getJobDefinitionVersion.mockResolvedValue({
        id: 'job1',
        name: 'My Orchestration',
      });
      global.serverConfig.server.jobFailEnabled = 'false';

      const executionLog = {
        jobId: 'job1',
        executionId: 'exec1',
        status: 'completed',
        finalStatus: 'failure',
        visitedNodes: ['start', 'execute1'],
        errors: [{ node: 'execute1', message: 'Script failed' }],
        endTime: new Date().toISOString(),
      };

      await orchestrationEngine.saveExecutionResult(executionLog);

      expect(notifier.sendNotification).not.toHaveBeenCalled();
    });

    it('should include execution ID in notification', async () => {
      db.getData.mockResolvedValue({});
      orchestrationMonitor.getJobDefinitionVersion.mockResolvedValue({
        id: 'job1',
        name: 'Test Orchestration',
      });
      global.serverConfig.server.jobFailEnabled = 'true';

      const executionLog = {
        jobId: 'job1',
        executionId: 'abc123def456',
        status: 'completed',
        finalStatus: 'failure',
        visitedNodes: ['start', 'execute1'],
        errors: [{ node: 'execute1', message: 'Node failed' }],
        endTime: new Date().toISOString(),
      };

      await orchestrationEngine.saveExecutionResult(executionLog);

      const callArgs = notifier.sendNotification.mock.calls[0];
      expect(callArgs[1]).toContain('abc123def456');
      expect(callArgs[3]).toContain('abc123def456');
    });

    it('should use exit code in root cause when no errors array', async () => {
      db.getData.mockResolvedValue({});
      orchestrationMonitor.getJobDefinitionVersion.mockResolvedValue({
        id: 'job1',
        name: 'Test Orchestration',
      });
      global.serverConfig.server.jobFailEnabled = 'true';

      const executionLog = {
        jobId: 'job1',
        executionId: 'exec1',
        status: 'completed',
        finalStatus: 'failure',
        visitedNodes: ['start', 'execute1'],
        errors: [],
        scriptOutputs: {
          execute1: {
            exitCode: 2,
            stdout: 'Failed',
            stderr: '',
          },
        },
        endTime: new Date().toISOString(),
      };

      await orchestrationEngine.saveExecutionResult(executionLog);

      const callArgs = notifier.sendNotification.mock.calls[0];
      expect(callArgs[1]).toContain('exit code 2');
    });

    it('should handle notification errors gracefully', async () => {
      db.getData.mockResolvedValue({});
      orchestrationMonitor.getJobDefinitionVersion.mockResolvedValue({
        id: 'job1',
        name: 'Test Orchestration',
      });
      global.serverConfig.server.jobFailEnabled = 'true';
      notifier.sendNotification.mockImplementation(() => {
        throw new Error('Notification service unavailable');
      });

      const executionLog = {
        jobId: 'job1',
        executionId: 'exec1',
        status: 'completed',
        finalStatus: 'failure',
        visitedNodes: ['start', 'execute1'],
        errors: [{ node: 'execute1', message: 'Failed' }],
        endTime: new Date().toISOString(),
      };

      // Should not throw, should log warning
      await expect(
        orchestrationEngine.saveExecutionResult(executionLog)
      ).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send orchestration failure notification')
      );
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

  describe('executeJob()', () => {
    // Helper function to create a mock orchestration job
    const createMockJob = (override = {}) => {
      const baseJob = {
        id: 'test-job',
        name: 'Test Orchestration',
        currentVersion: 1,
        versions: [
          {
            nodes: [
              { id: 'start-node', type: 'start', data: { name: 'Start' } },
              { id: 'execute-node', type: 'execute', data: { script: 'test.sh', agent: 'agent1', parameters: '' } },
              { id: 'end-node', type: 'end-success', data: { name: 'End Success' } },
            ],
            edges: [
              { from: 'start-node', fromPort: 'out', to: 'execute-node' },
              { from: 'execute-node', fromPort: 'out', to: 'end-node' },
            ],
          },
        ],
      };
      return { ...baseJob, ...override };
    };

    beforeEach(() => {
      // Mock fs.readFile for script reading
      require('fs').promises.readFile.mockResolvedValue('#!/bin/bash\necho "test"');
      
      // Mock agents.getAgent - MUST include status: 'online' or orchestrationEngine treats it as offline
      const agents = require('../../agents.js');
      agents.getAgent.mockReturnValue({ name: 'test-agent', id: 'agent1', status: 'online' });
      agents.getDict.mockReturnValue({ agent1: { name: 'test-agent', status: 'online' } });
    });

    describe('Happy Path Scenarios', () => {
      it('should execute simple start -> execute -> end-success path', async () => {
        const mockJob = createMockJob();
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        // Mock script completion signal to happen after execution
        setTimeout(() => {
          const jobName = 'Orchestration [test-job] Execution [test-exec1] Node [execute-node]';
          orchestrationEngine.signalScriptCompletion(jobName, {
            exitCode: 0,
            stdout: 'Script output',
            stderr: '',
          });
        }, 50);

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.jobId).toBe('test-job');
        expect(result.executionId).toBe('test-exec1');
        expect(result.status).toBe('completed');
        expect(result.finalStatus).toBe('success');
        expect(result.visitedNodes).toContain('start-node');
        expect(result.visitedNodes).toContain('execute-node');
        expect(result.visitedNodes).toContain('end-node');
        expect(result.scriptOutputs['execute-node']).toBeDefined();
        expect(result.scriptOutputs['execute-node'].exitCode).toBe(0);
      });

      it('should emit orchestrationNodeStarted and orchestrationNodeCompleted events for each node', async () => {
        const mockJob = createMockJob();
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        // Reset the mock to ensure clean call tracking
        wsBrowserTransport.emitOrchestrationEvent.mockClear();

        setTimeout(() => {
          const jobName = 'Orchestration [test-job] Execution [test-exec1] Node [execute-node]';
          orchestrationEngine.signalScriptCompletion(jobName, {
            exitCode: 0,
            stdout: 'Script output',
            stderr: '',
          });
        }, 50);

        await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        // At least some events should have been emitted
        expect(wsBrowserTransport.emitOrchestrationEvent).toHaveBeenCalled();
        
        // Verify events included start and completion for nodes
        const calls = wsBrowserTransport.emitOrchestrationEvent.mock.calls;
        
        // Should have calls with orchestrationNodeStarted
        const hasNodeStarted = calls.some(call => call[2] === 'orchestrationNodeStarted');
        expect(hasNodeStarted).toBe(true);
        
        // Should have calls with orchestrationNodeCompleted
        const hasNodeCompleted = calls.some(call => call[2] === 'orchestrationNodeCompleted');
        expect(hasNodeCompleted).toBe(true);
      });

      it('should send script content and parameters to agent', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
                { 
                  id: 'execute-node', 
                  type: 'execute', 
                  data: { 
                    script: 'backup.sh', 
                    agent: 'agent1', 
                    parameters: '--incremental --compress' 
                  } 
                },
                { id: 'end-node', type: 'end-success', data: { name: 'End Success' } },
              ],
              edges: [
                { from: 'start-node', fromPort: 'out', to: 'execute-node' },
                { from: 'execute-node', fromPort: 'out', to: 'end-node' },
              ],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        setTimeout(() => {
          const jobName = 'Orchestration [test-job] Execution [test-exec1] Node [execute-node]';
          orchestrationEngine.signalScriptCompletion(jobName, {
            exitCode: 0,
            stdout: 'Backup complete',
            stderr: '',
          });
        }, 50);

        await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        // Verify script content was sent to agent
        expect(global.agentComms.sendCommand).toHaveBeenCalledWith(
          'agent1',
          'execute/orchestrationScript',
          '#!/bin/bash\necho "test"',
          '--incremental --compress',
          expect.stringContaining('[test-job]'),
          undefined,
          false,
          'test-exec1'
        );
      });

      it('should clear old logs before executing script', async () => {
        const mockJob = createMockJob();
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        setTimeout(() => {
          const jobName = 'Orchestration [test-job] Execution [test-exec1] Node [execute-node]';
          orchestrationEngine.signalScriptCompletion(jobName, {
            exitCode: 0,
            stdout: 'Output',
            stderr: '',
          });
        }, 50);

        await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        // Verify deleteData was called to clear old logs
        expect(db.deleteData).toHaveBeenCalledWith(
          expect.stringContaining('test-agent_Orchestration')
        );
      });

      it('should record node metrics (timing) for all nodes', async () => {
        const mockJob = createMockJob();
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        setTimeout(() => {
          const jobName = 'Orchestration [test-job] Execution [test-exec1] Node [execute-node]';
          orchestrationEngine.signalScriptCompletion(jobName, {
            exitCode: 0,
            stdout: 'Output',
            stderr: '',
          });
        }, 50);

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.nodeMetrics['start-node']).toBeDefined();
        expect(result.nodeMetrics['start-node'].duration).toBeGreaterThanOrEqual(0);
        expect(result.nodeMetrics['execute-node']).toBeDefined();
        expect(result.nodeMetrics['end-node']).toBeDefined();
      });

      it('should handle manual execution flag', async () => {
        const mockJob = createMockJob();
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        setTimeout(() => {
          const jobName = 'Orchestration [test-job] Execution [test-exec1] Node [execute-node]';
          orchestrationEngine.signalScriptCompletion(jobName, {
            exitCode: 0,
            stdout: 'Output',
            stderr: '',
          });
        }, 50);

        const result = await orchestrationEngine.executeJob('test-job', true, 'test-exec1');

        expect(result.manual).toBe(true);
        // Verify isManual was passed to agent (it's the 7th parameter)
        expect(global.agentComms.sendCommand).toHaveBeenCalled();
        const callArgs = global.agentComms.sendCommand.mock.calls[0];
        expect(callArgs[6]).toBe(true); // isManual is the 7th parameter (index 6)
      });

      it('should handle multiple execute nodes in sequence', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
                { id: 'execute-1', type: 'execute', data: { script: 'script1.sh', agent: 'agent1' } },
                { id: 'execute-2', type: 'execute', data: { script: 'script2.sh', agent: 'agent1' } },
                { id: 'end-node', type: 'end-success', data: { name: 'End' } },
              ],
              edges: [
                { from: 'start-node', fromPort: 'out', to: 'execute-1' },
                { from: 'execute-1', fromPort: 'out', to: 'execute-2' },
                { from: 'execute-2', fromPort: 'out', to: 'end-node' },
              ],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        // Mock sendCommand to intercept and signal completions
        let sendCommandCallCount = 0;
        global.agentComms.sendCommand.mockImplementation((agentId, command, script, params, jobName) => {
          sendCommandCallCount++;
          // Stagger the responses
          setTimeout(() => {
            orchestrationEngine.signalScriptCompletion(jobName, {
              exitCode: 0,
              stdout: `Execution ${sendCommandCallCount} completed`,
              stderr: '',
            });
          }, 100);
        });

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.visitedNodes).toEqual(['start-node', 'execute-1', 'execute-2', 'end-node']);
        expect(result.scriptOutputs['execute-1']).toBeDefined();
        expect(result.scriptOutputs['execute-2']).toBeDefined();
        expect(result.finalStatus).toBe('success');
      }, 30000);
    });

    describe('Condition Node - Return Code Evaluation', () => {
      it('should evaluate return_code condition with == operator', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
                { id: 'execute-node', type: 'execute', data: { script: 'test.sh', agent: 'agent1' } },
                {
                  id: 'condition-node',
                  type: 'condition',
                  data: {
                    conditionType: 'return_code',
                    operator: '==',
                    conditionValue: '0',
                  },
                },
                { id: 'end-success', type: 'end-success', data: { name: 'Success' } },
                { id: 'end-failure', type: 'end-failure', data: { name: 'Failure' } },
              ],
              edges: [
                { from: 'start-node', fromPort: 'out', to: 'execute-node' },
                { from: 'execute-node', fromPort: 'out', to: 'condition-node' },
                { from: 'condition-node', fromPort: 'true', to: 'end-success' },
                { from: 'condition-node', fromPort: 'false', to: 'end-failure' },
              ],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        setTimeout(() => {
          orchestrationEngine.signalScriptCompletion(
            'Orchestration [test-job] Execution [test-exec1] Node [execute-node]',
            { exitCode: 0, stdout: 'Success', stderr: '' }
          );
        }, 50);

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.conditionEvaluations['condition-node']).toBeDefined();
        expect(result.conditionEvaluations['condition-node'].result).toBe(true);
        expect(result.visitedNodes).toContain('end-success');
        expect(result.finalStatus).toBe('success');
      });

      it('should route to false branch when return_code condition fails', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
                { id: 'execute-node', type: 'execute', data: { script: 'test.sh', agent: 'agent1' } },
                {
                  id: 'condition-node',
                  type: 'condition',
                  data: {
                    conditionType: 'return_code',
                    operator: '==',
                    conditionValue: '0',
                  },
                },
                { id: 'end-success', type: 'end-success', data: { name: 'Success' } },
                { id: 'end-failure', type: 'end-failure', data: { name: 'Failure' } },
              ],
              edges: [
                { from: 'start-node', fromPort: 'out', to: 'execute-node' },
                { from: 'execute-node', fromPort: 'out', to: 'condition-node' },
                { from: 'condition-node', fromPort: 'true', to: 'end-success' },
                { from: 'condition-node', fromPort: 'false', to: 'end-failure' },
              ],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        setTimeout(() => {
          orchestrationEngine.signalScriptCompletion(
            'Orchestration [test-job] Execution [test-exec1] Node [execute-node]',
            { exitCode: 1, stdout: 'Failed', stderr: 'Error' }
          );
        }, 50);

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.conditionEvaluations['condition-node'].result).toBe(false);
        expect(result.visitedNodes).toContain('end-failure');
        expect(result.finalStatus).toBe('failure');
      });

      it('should support all comparison operators for return_code', async () => {
        const testCases = [
          { operator: '>', exitCode: 5, conditionValue: '3', expectedResult: true },
          { operator: '<', exitCode: 3, conditionValue: '5', expectedResult: true },
          { operator: '>=', exitCode: 5, conditionValue: '5', expectedResult: true },
          { operator: '<=', exitCode: 5, conditionValue: '5', expectedResult: true },
          { operator: '!=', exitCode: 1, conditionValue: '0', expectedResult: true },
        ];

        for (const testCase of testCases) {
          const mockJob = createMockJob({
            versions: [
              {
                nodes: [
                  { id: 'start-node', type: 'start', data: { name: 'Start' } },
                  { id: 'execute-node', type: 'execute', data: { script: 'test.sh', agent: 'agent1' } },
                  {
                    id: 'condition-node',
                    type: 'condition',
                    data: {
                      conditionType: 'return_code',
                      operator: testCase.operator,
                      conditionValue: testCase.conditionValue,
                    },
                  },
                  { id: 'end-success', type: 'end-success', data: { name: 'Success' } },
                  { id: 'end-failure', type: 'end-failure', data: { name: 'Failure' } },
                ],
                edges: [
                  { from: 'start-node', fromPort: 'out', to: 'execute-node' },
                  { from: 'execute-node', fromPort: 'out', to: 'condition-node' },
                  { from: 'condition-node', fromPort: 'true', to: 'end-success' },
                  { from: 'condition-node', fromPort: 'false', to: 'end-failure' },
                ],
              },
            ],
          });
          db.getData.mockResolvedValue({ 'test-job': mockJob });

          setTimeout(() => {
            orchestrationEngine.signalScriptCompletion(
              'Orchestration [test-job] Execution [test-exec-' + testCase.operator + '] Node [execute-node]',
              { exitCode: testCase.exitCode, stdout: 'Output', stderr: '' }
            );
          }, 50);

          jest.clearAllMocks();
          const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec-' + testCase.operator);

          expect(result.conditionEvaluations['condition-node'].result).toBe(testCase.expectedResult);
        }
      });
    });

    describe('Condition Node - Output Contains Evaluation', () => {
      it('should evaluate output_contains condition when string is present', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
                { id: 'execute-node', type: 'execute', data: { script: 'test.sh', agent: 'agent1' } },
                {
                  id: 'condition-node',
                  type: 'condition',
                  data: {
                    conditionType: 'output_contains',
                    operator: '==',
                    conditionValue: 'SUCCESS',
                  },
                },
                { id: 'end-success', type: 'end-success', data: { name: 'Success' } },
                { id: 'end-failure', type: 'end-failure', data: { name: 'Failure' } },
              ],
              edges: [
                { from: 'start-node', fromPort: 'out', to: 'execute-node' },
                { from: 'execute-node', fromPort: 'out', to: 'condition-node' },
                { from: 'condition-node', fromPort: 'true', to: 'end-success' },
                { from: 'condition-node', fromPort: 'false', to: 'end-failure' },
              ],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        setTimeout(() => {
          orchestrationEngine.signalScriptCompletion(
            'Orchestration [test-job] Execution [test-exec1] Node [execute-node]',
            { exitCode: 0, stdout: 'Backup completed with SUCCESS status', stderr: '' }
          );
        }, 50);

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.conditionEvaluations['condition-node'].result).toBe(true);
        expect(result.finalStatus).toBe('success');
      });

      it('should handle output_contains with negation operator !=', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
                { id: 'execute-node', type: 'execute', data: { script: 'test.sh', agent: 'agent1' } },
                {
                  id: 'condition-node',
                  type: 'condition',
                  data: {
                    conditionType: 'output_contains',
                    operator: '!=',
                    conditionValue: 'ERROR',
                  },
                },
                { id: 'end-success', type: 'end-success', data: { name: 'Success' } },
                { id: 'end-failure', type: 'end-failure', data: { name: 'Failure' } },
              ],
              edges: [
                { from: 'start-node', fromPort: 'out', to: 'execute-node' },
                { from: 'execute-node', fromPort: 'out', to: 'condition-node' },
                { from: 'condition-node', fromPort: 'true', to: 'end-success' },
                { from: 'condition-node', fromPort: 'false', to: 'end-failure' },
              ],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        setTimeout(() => {
          orchestrationEngine.signalScriptCompletion(
            'Orchestration [test-job] Execution [test-exec1] Node [execute-node]',
            { exitCode: 0, stdout: 'Backup completed successfully', stderr: '' }
          );
        }, 50);

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.conditionEvaluations['condition-node'].result).toBe(true);
      });
    });

    describe('Condition Node - Regex Match Evaluation', () => {
      it('should evaluate regex_match condition with valid pattern', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
                { id: 'execute-node', type: 'execute', data: { script: 'test.sh', agent: 'agent1' } },
                {
                  id: 'condition-node',
                  type: 'condition',
                  data: {
                    conditionType: 'regex_match',
                    operator: '==',
                    conditionValue: '^Backup (completed|finished)',
                  },
                },
                { id: 'end-success', type: 'end-success', data: { name: 'Success' } },
                { id: 'end-failure', type: 'end-failure', data: { name: 'Failure' } },
              ],
              edges: [
                { from: 'start-node', fromPort: 'out', to: 'execute-node' },
                { from: 'execute-node', fromPort: 'out', to: 'condition-node' },
                { from: 'condition-node', fromPort: 'true', to: 'end-success' },
                { from: 'condition-node', fromPort: 'false', to: 'end-failure' },
              ],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        setTimeout(() => {
          orchestrationEngine.signalScriptCompletion(
            'Orchestration [test-job] Execution [test-exec1] Node [execute-node]',
            { exitCode: 0, stdout: 'Backup completed successfully', stderr: '' }
          );
        }, 50);

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.conditionEvaluations['condition-node'].result).toBe(true);
        expect(result.finalStatus).toBe('success');
      });

      it('should reject invalid regex patterns', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
                { id: 'execute-node', type: 'execute', data: { script: 'test.sh', agent: 'agent1' } },
                {
                  id: 'condition-node',
                  type: 'condition',
                  data: {
                    conditionType: 'regex_match',
                    operator: '==',
                    conditionValue: '[invalid(regex',
                  },
                },
                { id: 'end-success', type: 'end-success', data: { name: 'Success' } },
              ],
              edges: [
                { from: 'start-node', fromPort: 'out', to: 'execute-node' },
                { from: 'execute-node', fromPort: 'out', to: 'condition-node' },
                { from: 'condition-node', fromPort: 'true', to: 'end-success' },
              ],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        setTimeout(() => {
          orchestrationEngine.signalScriptCompletion(
            'Orchestration [test-job] Execution [test-exec1] Node [execute-node]',
            { exitCode: 0, stdout: 'Output', stderr: '' }
          );
        }, 50);

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.status).toBe('failed');
        expect(result.finalStatus).toBe('error');
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].message).toContain('Invalid regex');
      });
    });

    describe('Condition Node - Execution Time Evaluation', () => {
      it('should evaluate execution_time condition', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
                { id: 'execute-node', type: 'execute', data: { script: 'test.sh', agent: 'agent1' } },
                {
                  id: 'condition-node',
                  type: 'condition',
                  data: {
                    conditionType: 'execution_time',
                    operator: '<',
                    conditionValue: '10',
                  },
                },
                { id: 'end-success', type: 'end-success', data: { name: 'Success' } },
                { id: 'end-failure', type: 'end-failure', data: { name: 'Failure' } },
              ],
              edges: [
                { from: 'start-node', fromPort: 'out', to: 'execute-node' },
                { from: 'execute-node', fromPort: 'out', to: 'condition-node' },
                { from: 'condition-node', fromPort: 'true', to: 'end-success' },
                { from: 'condition-node', fromPort: 'false', to: 'end-failure' },
              ],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        setTimeout(() => {
          orchestrationEngine.signalScriptCompletion(
            'Orchestration [test-job] Execution [test-exec1] Node [execute-node]',
            { exitCode: 0, stdout: 'Completed', stderr: '' }
          );
        }, 50);

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.conditionEvaluations['condition-node']).toBeDefined();
        expect(result.conditionEvaluations['condition-node'].result).toBe(true);
      });
    });

    describe('End Node Handling', () => {
      it('should set finalStatus to success at end-success node', async () => {
        const mockJob = createMockJob();
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        setTimeout(() => {
          orchestrationEngine.signalScriptCompletion(
            'Orchestration [test-job] Execution [test-exec1] Node [execute-node]',
            { exitCode: 0, stdout: 'Output', stderr: '' }
          );
        }, 50);

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.finalStatus).toBe('success');
        expect(result.visitedNodes[result.visitedNodes.length - 1]).toBe('end-node');
      });

      it('should set finalStatus to failure at end-failure node', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
                { id: 'end-failure', type: 'end-failure', data: { name: 'End Failure' } },
              ],
              edges: [{ from: 'start-node', fromPort: 'out', to: 'end-failure' }],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.finalStatus).toBe('failure');
      });

      it('should determine status from last execute node if no explicit end node', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
                { id: 'execute-node', type: 'execute', data: { script: 'test.sh', agent: 'agent1' } },
              ],
              edges: [{ from: 'start-node', fromPort: 'out', to: 'execute-node' }],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        setTimeout(() => {
          orchestrationEngine.signalScriptCompletion(
            'Orchestration [test-job] Execution [test-exec1] Node [execute-node]',
            { exitCode: 0, stdout: 'Output', stderr: '' }
          );
        }, 50);

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.finalStatus).toBe('success');
      });
    });

    describe('Error Handling', () => {
      it('should throw error when job not found', async () => {
        db.getData.mockResolvedValue({});

        const result = await orchestrationEngine.executeJob('nonexistent-job', false, 'test-exec1');

        expect(result.status).toBe('failed');
        expect(result.finalStatus).toBe('error');
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].message).toContain('not found');
      });

      it('should throw error when no start node found', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'execute-node', type: 'execute', data: { script: 'test.sh', agent: 'agent1' } },
                { id: 'end-node', type: 'end-success', data: { name: 'End' } },
              ],
              edges: [{ from: 'execute-node', fromPort: 'out', to: 'end-node' }],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.status).toBe('failed');
        expect(result.finalStatus).toBe('error');
        expect(result.errors[0].message).toContain('No start node');
      });

      it('should throw error when node not found in graph', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
              ],
              edges: [{ from: 'start-node', fromPort: 'out', to: 'nonexistent-node' }],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.status).toBe('failed');
        expect(result.finalStatus).toBe('error');
        expect(result.errors[0].message).toContain('not found in orchestration');
      });

      it('should throw error when execute node has no script', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
                { id: 'execute-node', type: 'execute', data: { agent: 'agent1' } },
                { id: 'end-node', type: 'end-success', data: { name: 'End' } },
              ],
              edges: [
                { from: 'start-node', fromPort: 'out', to: 'execute-node' },
                { from: 'execute-node', fromPort: 'out', to: 'end-node' },
              ],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.status).toBe('failed');
        expect(result.errors[0].message).toContain('no script');
      });

      it('should throw error when execute node has no agent', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
                { id: 'execute-node', type: 'execute', data: { script: 'test.sh' } },
                { id: 'end-node', type: 'end-success', data: { name: 'End' } },
              ],
              edges: [
                { from: 'start-node', fromPort: 'out', to: 'execute-node' },
                { from: 'execute-node', fromPort: 'out', to: 'end-node' },
              ],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.status).toBe('failed');
        expect(result.errors[0].message).toContain('no agent');
      });

      it('should throw error when script file not found', async () => {
        const mockJob = createMockJob();
        db.getData.mockResolvedValue({ 'test-job': mockJob });
        require('fs').promises.readFile.mockRejectedValue(new Error('ENOENT: no such file'));

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.status).toBe('failed');
        expect(result.finalStatus).toBe('error');
        expect(result.errors[0].message).toContain('Failed to read script');
      });

      it('should throw error when unknown node type encountered', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
                { id: 'unknown-node', type: 'unknown-type', data: {} },
              ],
              edges: [{ from: 'start-node', fromPort: 'out', to: 'unknown-node' }],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.status).toBe('failed');
        expect(result.errors[0].message).toContain('Unknown node type');
      });

      it('should throw error when start node has no outgoing connection', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
              ],
              edges: [],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.status).toBe('failed');
        expect(result.errors[0].message).toContain('no outgoing connection');
      });

      it('should throw error when condition has no true branch', async () => {
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
                { id: 'execute-node', type: 'execute', data: { script: 'test.sh', agent: 'agent1' } },
                {
                  id: 'condition-node',
                  type: 'condition',
                  data: {
                    conditionType: 'return_code',
                    operator: '==',
                    conditionValue: '0',
                  },
                },
              ],
              edges: [
                { from: 'start-node', fromPort: 'out', to: 'execute-node' },
                { from: 'execute-node', fromPort: 'out', to: 'condition-node' },
              ],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        setTimeout(() => {
          orchestrationEngine.signalScriptCompletion(
            'Orchestration [test-job] Execution [test-exec1] Node [execute-node]',
            { exitCode: 0, stdout: 'Output', stderr: '' }
          );
        }, 50);

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.status).toBe('failed');
        expect(result.errors[0].message).toContain('no true branch');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty script output', async () => {
        const mockJob = createMockJob();
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        setTimeout(() => {
          orchestrationEngine.signalScriptCompletion(
            'Orchestration [test-job] Execution [test-exec1] Node [execute-node]',
            { exitCode: 0, stdout: '', stderr: '' }
          );
        }, 50);

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.status).toBe('completed');
        expect(result.scriptOutputs['execute-node'].stdout).toBe('');
      });

      it('should detect infinite loops and stop at maxIterations', async () => {
        // Create a self-referencing execute node (infinite loop)
        const mockJob = createMockJob({
          versions: [
            {
              nodes: [
                { id: 'start-node', type: 'start', data: { name: 'Start' } },
                { id: 'execute-node', type: 'execute', data: { script: 'test.sh', agent: 'agent1' } },
              ],
              edges: [
                { from: 'start-node', fromPort: 'out', to: 'execute-node' },
                { from: 'execute-node', fromPort: 'out', to: 'execute-node' }, // Self-reference creates infinite loop
              ],
            },
          ],
        });
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        // Keep signaling for the looping node
        let callCount = 0;
        global.agentComms.sendCommand.mockImplementation(() => {
          callCount++;
          setTimeout(() => {
            orchestrationEngine.signalScriptCompletion(
              `Orchestration [test-job] Execution [test-exec1] Node [execute-node]`,
              { exitCode: 0, stdout: 'Completed', stderr: '' }
            );
          }, 10);
        });

        const result = await orchestrationEngine.executeJob('test-job', false, 'test-exec1');

        expect(result.status).toBe('failed');
        expect(result.finalStatus).toBe('error');
        expect(result.errors[0].message).toContain('exceeded maximum iterations');
      }, 30000);

      it('should handle execution with onNodeComplete callback', async () => {
        const mockJob = createMockJob();
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        const onNodeCompleteSpy = jest.fn();

        setTimeout(() => {
          orchestrationEngine.signalScriptCompletion(
            'Orchestration [test-job] Execution [test-exec1] Node [execute-node]',
            { exitCode: 0, stdout: 'Output', stderr: '' }
          );
        }, 50);

        await orchestrationEngine.executeJob('test-job', false, 'test-exec1', onNodeCompleteSpy);

        // onNodeComplete should be called for each node completion
        expect(onNodeCompleteSpy).toHaveBeenCalled();
        expect(onNodeCompleteSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
      });

      it('should generate unique executionId if not provided', async () => {
        const mockJob = createMockJob();
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        // Mock sendCommand to capture the job name and signal back with it
        global.agentComms.sendCommand.mockImplementation((agentId, command, script, params, jobName) => {
          setTimeout(() => {
            orchestrationEngine.signalScriptCompletion(jobName, {
              exitCode: 0,
              stdout: 'Output',
              stderr: '',
            });
          }, 50);
        });

        const result = await orchestrationEngine.executeJob('test-job', false);

        expect(result.executionId).toBeDefined();
        expect(result.executionId.length).toBeGreaterThan(0);
        expect(result.status).toBe('completed');
        expect(result.finalStatus).toBe('success');
      }, 20000);
    });

    describe('Concurrency', () => {
      it('should track multiple concurrent executions of same job', async () => {
        const mockJob = createMockJob();
        db.getData.mockResolvedValue({ 'test-job': mockJob });

        // Start two concurrent executions
        const exec1Promise = orchestrationEngine.executeJob('test-job', false, 'exec-1');
        const exec2Promise = orchestrationEngine.executeJob('test-job', false, 'exec-2');

        // Send completion signals
        setTimeout(() => {
          orchestrationEngine.signalScriptCompletion(
            'Orchestration [test-job] Execution [exec-1] Node [execute-node]',
            { exitCode: 0, stdout: 'Output 1', stderr: '' }
          );
          orchestrationEngine.signalScriptCompletion(
            'Orchestration [test-job] Execution [exec-2] Node [execute-node]',
            { exitCode: 1, stdout: 'Output 2', stderr: '' }
          );
        }, 50);

        const [result1, result2] = await Promise.all([exec1Promise, exec2Promise]);

        expect(result1.executionId).toBe('exec-1');
        expect(result2.executionId).toBe('exec-2');
        expect(result1.scriptOutputs['execute-node'].exitCode).toBe(0);
        expect(result2.scriptOutputs['execute-node'].exitCode).toBe(1);
      });
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
