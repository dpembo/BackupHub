// Test suite for scriptTestManager module

// Mock wsBrowserTransport before importing scriptTestManager
jest.mock('../../communications/wsBrowserTransport.js', () => ({
  getIO: jest.fn().mockReturnValue({
    emit: jest.fn(),
  }),
}));

const wsBrowserTransport = require('../../communications/wsBrowserTransport.js');

describe('Script Test Manager', () => {
  let scriptTestManager;
  let mockIO;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Set up global mocks
    global.logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Mock Socket.io instance - fresh for each test
    mockIO = {
      emit: jest.fn(),
    };

    wsBrowserTransport.getIO.mockClear();
    wsBrowserTransport.getIO.mockReturnValue(mockIO);

    // Import after all mocks are set up
    scriptTestManager = require('../../scriptTestManager.js');
  });

  afterEach(() => {
    delete global.logger;
  });

  describe('createTest()', () => {
    it('should create a new test execution with pending status', () => {
      const result = scriptTestManager.createTest({
        executionId: 'exec-001',
        agentName: 'agent-1',
        scriptName: 'backup.sh',
        scriptDescription: 'Backup script',
        scriptSource: '#!/bin/sh\necho "test"',
        sourceType: 'saved',
        commandParams: '--verbose',
        requestedBy: 'user@example.com',
      });

      expect(result.ok).toBe(true);
      expect(result.execution).toBeDefined();
      expect(result.execution.status).toBe('pending');
      expect(result.execution.executionId).toBe('exec-001');
      expect(result.execution.scriptDescription).toBe('Backup script');
      expect(result.execution.commandParams).toBe('--verbose');
    });

    it('should preserve script metadata in execution', () => {
      const result = scriptTestManager.createTest({
        executionId: 'exec-002',
        agentName: 'agent-1',
        scriptName: 'test.sh',
        scriptDescription: 'Test script with params',
        scriptSource: '#start-params\n#Some params\n#end-params\necho "test"',
        sourceType: 'saved',
        commandParams: '--param1 value1',
        requestedBy: 'admin',
      });

      expect(result.execution.scriptName).toBe('test.sh');
      expect(result.execution.sourceType).toBe('saved');
      expect(result.execution.commandParams).toBe('--param1 value1');
      expect(result.execution.requestedBy).toBe('admin');
    });

    it('should emit status event when test is created', () => {
      const result = scriptTestManager.createTest({
        executionId: 'exec-003',
        agentName: 'agent-1',
        scriptName: 'test.sh',
        scriptDescription: 'Test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      expect(result.ok).toBe(true);
      expect(result.execution.status).toBe('pending');
    });

    it('should enforce global per-script exclusivity', () => {
      // Create first test
      const result1 = scriptTestManager.createTest({
        executionId: 'exec-004a',
        agentName: 'agent-1',
        scriptName: 'exclusive.sh',
        scriptDescription: 'Exclusive test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      expect(result1.ok).toBe(true);

      // Attempt to create second test for same script
      const result2 = scriptTestManager.createTest({
        executionId: 'exec-004b',
        agentName: 'agent-2',
        scriptName: 'exclusive.sh',
        scriptDescription: 'Exclusive test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user2',
      });

      expect(result2.ok).toBe(false);
      expect(result2.type).toBe('active');
      expect(result2.execution).toBeDefined();
    });

    it('should prevent new test if unseen retained result exists', () => {
      // Create and complete a test
      const result1 = scriptTestManager.createTest({
        executionId: 'exec-005a',
        agentName: 'agent-1',
        scriptName: 'retained.sh',
        scriptDescription: 'Test with retention',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      const execId = result1.execution.executionId;
      scriptTestManager.markRunning(execId);
      scriptTestManager.completeTest(execId, 0, 'output');

      // Attempt new test with same script but unacknowledged retained result
      const result2 = scriptTestManager.createTest({
        executionId: 'exec-005b',
        agentName: 'agent-1',
        scriptName: 'retained.sh',
        scriptDescription: 'Test with retention',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      expect(result2.ok).toBe(false);
      expect(result2.type).toBe('retained');
      expect(result2.execution.executionId).toBe(execId);
    });
  });

  describe('markRunning()', () => {
    it('should transition execution from pending to running', () => {
      const createResult = scriptTestManager.createTest({
        executionId: 'exec-006',
        agentName: 'agent-1',
        scriptName: 'run.sh',
        scriptDescription: 'Test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      const execution = scriptTestManager.markRunning(createResult.execution.executionId);

      expect(execution).toBeDefined();
      expect(execution.status).toBe('running');
      expect(execution.startedAt).toBeDefined();
    });

    it('should return null for nonexistent execution', () => {
      const result = scriptTestManager.markRunning('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('appendLog()', () => {
    it('should append text to execution log', () => {
      const createResult = scriptTestManager.createTest({
        executionId: 'exec-007',
        agentName: 'agent-1',
        scriptName: 'log.sh',
        scriptDescription: 'Test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      const execId = createResult.execution.executionId;
      scriptTestManager.markRunning(execId);
      scriptTestManager.appendLog(execId, 'Line 1\n');
      scriptTestManager.appendLog(execId, 'Line 2\n');

      const execution = scriptTestManager.getExecution(execId);
      expect(execution.log).toContain('Line 1');
      expect(execution.log).toContain('Line 2');
    });

    it('should emit log event', () => {
      const createResult = scriptTestManager.createTest({
        executionId: 'exec-008',
        agentName: 'agent-1',
        scriptName: 'log.sh',
        scriptDescription: 'Test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      const execId = createResult.execution.executionId;
      scriptTestManager.markRunning(execId);
      scriptTestManager.appendLog(execId, 'output text');
      scriptTestManager.appendLog(execId, 'more output');

      const execution = scriptTestManager.getExecution(execId);
      expect(execution.log).toContain('output text');
      expect(execution.log).toContain('more output');
    });
  });

  describe('completeTest()', () => {
    it('should transition execution to completed status', () => {
      const createResult = scriptTestManager.createTest({
        executionId: 'exec-009',
        agentName: 'agent-1',
        scriptName: 'complete.sh',
        scriptDescription: 'Test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      const execId = createResult.execution.executionId;
      scriptTestManager.markRunning(execId);
      scriptTestManager.appendLog(execId, 'Success output');

      const execution = scriptTestManager.completeTest(execId, 0, 'Success output');

      expect(execution.status).toBe('completed');
      expect(execution.returnCode).toBe(0);
      expect(execution.completedAt).toBeDefined();
    });

    it('should transition failed execution with non-zero return code', () => {
      const createResult = scriptTestManager.createTest({
        executionId: 'exec-010',
        agentName: 'agent-1',
        scriptName: 'fail.sh',
        scriptDescription: 'Test',
        scriptSource: 'false',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      const execId = createResult.execution.executionId;
      scriptTestManager.markRunning(execId);
      const execution = scriptTestManager.completeTest(execId, 1, 'Error: Command failed');

      expect(execution.status).toBe('failed');
      expect(execution.returnCode).toBe(1);
    });

    it('should set retention timestamp on completion', () => {
      const createResult = scriptTestManager.createTest({
        executionId: 'exec-011',
        agentName: 'agent-1',
        scriptName: 'retain.sh',
        scriptDescription: 'Test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      const execId = createResult.execution.executionId;
      scriptTestManager.markRunning(execId);
      const execution = scriptTestManager.completeTest(execId, 0, 'output');

      expect(execution.retainedUntil).toBeDefined();
      const retentionMs = new Date(execution.retainedUntil).getTime() - new Date(execution.completedAt).getTime();
      expect(retentionMs).toBeGreaterThan(29 * 60 * 1000); // ~30 minutes
      expect(retentionMs).toBeLessThan(31 * 60 * 1000);
    });
  });

  describe('acknowledgeExecution()', () => {
    it('should mark execution as acknowledged', () => {
      const createResult = scriptTestManager.createTest({
        executionId: 'exec-012',
        agentName: 'agent-1',
        scriptName: 'ack.sh',
        scriptDescription: 'Test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      const execId = createResult.execution.executionId;
      scriptTestManager.markRunning(execId);
      scriptTestManager.completeTest(execId, 0, 'output');

      const execution = scriptTestManager.acknowledgeExecution(execId);

      expect(execution).toBeDefined();
      expect(execution.isAcknowledged).toBe(true);
      expect(execution.acknowledgedAt).toBeDefined();
    });
  });

  describe('discardExecution()', () => {
    it('should remove acknowledged execution', () => {
      const createResult = scriptTestManager.createTest({
        executionId: 'exec-013',
        agentName: 'agent-1',
        scriptName: 'discard.sh',
        scriptDescription: 'Test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      const execId = createResult.execution.executionId;
      scriptTestManager.markRunning(execId);
      scriptTestManager.completeTest(execId, 0, 'output');
      scriptTestManager.acknowledgeExecution(execId);

      const result = scriptTestManager.discardExecution(execId);

      expect(result).toBe(true);
      expect(scriptTestManager.getExecution(execId)).toBeNull();
    });

    it('should discard any non-active execution', () => {
      const createResult = scriptTestManager.createTest({
        executionId: 'exec-014',
        agentName: 'agent-1',
        scriptName: 'nodiscard.sh',
        scriptDescription: 'Test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      const execId = createResult.execution.executionId;
      scriptTestManager.markRunning(execId);
      scriptTestManager.completeTest(execId, 0, 'output');

      // Discard should succeed once execution is no longer active
      const result = scriptTestManager.discardExecution(execId);

      expect(result).toBe(true);
      expect(scriptTestManager.getExecution(execId)).toBeNull();
    });
  });

  describe('getExecution()', () => {
    it('should return execution by ID', () => {
      const createResult = scriptTestManager.createTest({
        executionId: 'exec-015',
        agentName: 'agent-1',
        scriptName: 'get.sh',
        scriptDescription: 'Test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '--verbose',
        requestedBy: 'user',
      });

      const execId = createResult.execution.executionId;
      const execution = scriptTestManager.getExecution(execId);

      expect(execution).toBeDefined();
      expect(execution.executionId).toBe(execId);
      expect(execution.commandParams).toBe('--verbose');
    });

    it('should return null for nonexistent execution', () => {
      const result = scriptTestManager.getExecution('nonexistent');
      expect(result).toBeNull();
    });

    it('should return cloned execution (not reference)', () => {
      const createResult = scriptTestManager.createTest({
        executionId: 'exec-016',
        agentName: 'agent-1',
        scriptName: 'clone.sh',
        scriptDescription: 'Test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      const execId = createResult.execution.executionId;
      const exec1 = scriptTestManager.getExecution(execId);
      exec1.log = 'modified log';

      const exec2 = scriptTestManager.getExecution(execId);
      expect(exec2.log).not.toBe('modified log');
    });
  });

  describe('buildScriptIdentity()', () => {
    it('should use script name for saved scripts', () => {
      const identity = scriptTestManager.buildScriptIdentity({
        scriptName: 'backup.sh',
        scriptSource: 'content here',
        sourceType: 'saved',
      });

      expect(identity).toBe('script:backup.sh');
    });

    it('should hash content for editor source', () => {
      const identity1 = scriptTestManager.buildScriptIdentity({
        scriptName: null,
        scriptSource: '#!/bin/sh\necho "test"',
        sourceType: 'editor',
      });

      const identity2 = scriptTestManager.buildScriptIdentity({
        scriptName: null,
        scriptSource: '#!/bin/sh\necho "different"',
        sourceType: 'editor',
      });

      expect(identity1).toMatch(/^editor:/);
      expect(identity1).not.toBe(identity2);
    });

    it('should be consistent for same content', () => {
      const source = '#!/bin/sh\necho "test"';
      const identity1 = scriptTestManager.buildScriptIdentity({
        scriptName: null,
        scriptSource: source,
        sourceType: 'editor',
      });

      const identity2 = scriptTestManager.buildScriptIdentity({
        scriptName: null,
        scriptSource: source,
        sourceType: 'editor',
      });

      expect(identity1).toBe(identity2);
    });
  });

  describe('getBlockingState()', () => {
    it('should return null if no blocking state exists', () => {
      const identity = scriptTestManager.buildScriptIdentity({
        scriptName: 'free.sh',
        scriptSource: 'echo test',
        sourceType: 'saved',
      });

      const state = scriptTestManager.getBlockingState(identity);
      expect(state).toBeNull();
    });

    it('should return active execution if one exists', () => {
      const createResult = scriptTestManager.createTest({
        executionId: 'exec-017',
        agentName: 'agent-1',
        scriptName: 'blocking.sh',
        scriptDescription: 'Test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      const identity = scriptTestManager.buildScriptIdentity({
        scriptName: 'blocking.sh',
        scriptSource: 'echo test',
        sourceType: 'saved',
      });

      const state = scriptTestManager.getBlockingState(identity);

      expect(state).toBeDefined();
      expect(state.type).toBe('active');
      expect(state.execution.executionId).toBe('exec-017');
    });

    it('should return retained execution if one exists and unacknowledged', () => {
      const createResult = scriptTestManager.createTest({
        executionId: 'exec-018',
        agentName: 'agent-1',
        scriptName: 'retained2.sh',
        scriptDescription: 'Test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      const execId = createResult.execution.executionId;
      scriptTestManager.markRunning(execId);
      scriptTestManager.completeTest(execId, 0, 'output');

      const identity = scriptTestManager.buildScriptIdentity({
        scriptName: 'retained2.sh',
        scriptSource: 'echo test',
        sourceType: 'saved',
      });

      const state = scriptTestManager.getBlockingState(identity);

      expect(state).toBeDefined();
      expect(state.type).toBe('retained');
    });
  });

  describe('cleanupExpiredTests()', () => {
    it('should not remove active executions', () => {
      const createResult = scriptTestManager.createTest({
        executionId: 'exec-019',
        agentName: 'agent-1',
        scriptName: 'active.sh',
        scriptDescription: 'Test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      const execId = createResult.execution.executionId;
      scriptTestManager.markRunning(execId);

      scriptTestManager.cleanupExpiredTests();

      expect(scriptTestManager.getExecution(execId)).toBeDefined();
    });

    it('should not remove non-retained executions', () => {
      const createResult = scriptTestManager.createTest({
        executionId: 'exec-020',
        agentName: 'agent-1',
        scriptName: 'transient.sh',
        scriptDescription: 'Test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      const execId = createResult.execution.executionId;

      scriptTestManager.cleanupExpiredTests();

      expect(scriptTestManager.getExecution(execId)).toBeDefined();
    });
  });

  describe('requestTermination()', () => {
    it('should mark execution as terminating and set termination timestamp', () => {
      const createResult = scriptTestManager.createTest({
        executionId: 'exec-021',
        agentName: 'agent-1',
        scriptName: 'term.sh',
        scriptDescription: 'Test',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      const execId = createResult.execution.executionId;
      scriptTestManager.markRunning(execId);

      const execution = scriptTestManager.requestTermination(execId, 'terminator-user');

      expect(execution).toBeDefined();
      expect(execution.status).toBe('terminating');
      expect(execution.terminationRequestedAt).toBeDefined();
    });
  });

  describe('Integration: Full lifecycle', () => {
    it('should complete a full test lifecycle with metadata preservation', () => {
      // Create test with metadata
      const createResult = scriptTestManager.createTest({
        executionId: 'exec-full-001',
        agentName: 'agent-1',
        scriptName: 'full-test.sh',
        scriptDescription: 'Full lifecycle test',
        scriptSource: '#!/bin/sh\necho "Starting"\necho "Done"',
        sourceType: 'saved',
        commandParams: '--param1 value1 --param2 value2',
        requestedBy: 'testuser@example.com',
      });

      expect(createResult.ok).toBe(true);
      const execution = createResult.execution;

      // Verify initial state
      expect(execution.status).toBe('pending');
      expect(execution.scriptName).toBe('full-test.sh');
      expect(execution.scriptDescription).toBe('Full lifecycle test');
      expect(execution.commandParams).toBe('--param1 value1 --param2 value2');
      expect(execution.requestedBy).toBe('testuser@example.com');

      // Mark running
      const runningExecution = scriptTestManager.markRunning(execution.executionId);
      expect(runningExecution.status).toBe('running');

      // Append log
      scriptTestManager.appendLog(execution.executionId, 'Starting\n');
      scriptTestManager.appendLog(execution.executionId, 'Done\n');

      // Complete with success
      const completedExecution = scriptTestManager.completeTest(
        execution.executionId,
        0,
        'Starting\nDone\n'
      );

      expect(completedExecution.status).toBe('completed');
      expect(completedExecution.returnCode).toBe(0);
      expect(completedExecution.completedAt).toBeDefined();
      expect(completedExecution.retainedUntil).toBeDefined();

      // Verify metadata persisted
      expect(completedExecution.scriptName).toBe('full-test.sh');
      expect(completedExecution.scriptDescription).toBe('Full lifecycle test');
      expect(completedExecution.commandParams).toBe('--param1 value1 --param2 value2');
      expect(completedExecution.requestedBy).toBe('testuser@example.com');

      // Acknowledge and retrieve
      const acknowledgedExecution = scriptTestManager.acknowledgeExecution(
        execution.executionId
      );
      expect(acknowledgedExecution.isAcknowledged).toBe(true);

      // Discard
      const discarded = scriptTestManager.discardExecution(execution.executionId);
      expect(discarded).toBe(true);
      expect(scriptTestManager.getExecution(execution.executionId)).toBeNull();
    });

    it('should allow new test after acknowledged discard', () => {
      const scriptName = 'reusable.sh';

      // Create and complete first test
      const result1 = scriptTestManager.createTest({
        executionId: 'exec-reuse-001',
        agentName: 'agent-1',
        scriptName,
        scriptDescription: 'Test 1',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      const execId1 = result1.execution.executionId;
      scriptTestManager.markRunning(execId1);
      scriptTestManager.completeTest(execId1, 0, 'output');
      scriptTestManager.acknowledgeExecution(execId1);
      scriptTestManager.discardExecution(execId1);

      // Create second test for same script
      const result2 = scriptTestManager.createTest({
        executionId: 'exec-reuse-002',
        agentName: 'agent-1',
        scriptName,
        scriptDescription: 'Test 2',
        scriptSource: 'echo test',
        sourceType: 'saved',
        commandParams: '',
        requestedBy: 'user',
      });

      expect(result2.ok).toBe(true);
      expect(result2.execution.executionId).toBe('exec-reuse-002');
    });
  });
});
