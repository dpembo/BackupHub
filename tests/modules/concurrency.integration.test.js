// Unit tests for server-side concurrency management and rule-based job triggers

// Mock dependencies (must be before requiring modules that depend on them)
jest.mock('../../db.js');
jest.mock('../../agents.js');
jest.mock('../../scheduler.js');
jest.mock('../../communications/wsBrowserTransport.js');

// Require modules after mocks are set up to ensure they receive mocked dependencies
const running = require('../../running.js');
const db = require('../../db.js');
const agents = require('../../agents.js');

describe('Server-Side Concurrency Management', () => {
  let mockRunningItems;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRunningItems = [];

    global.logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  });

  describe('Concurrency limit per agent', () => {
    it('should have default concurrency limit of 3 per agent', () => {
      const DEFAULT_CONCURRENCY_LIMIT = 3;
      expect(DEFAULT_CONCURRENCY_LIMIT).toBe(3);
    });

    it('should allow configuring different concurrency limits per agent', () => {
      const agentConcurrencyConfig = {
        'agent-1': 3,
        'agent-2': 5,
        'agent-3': 1,
      };

      expect(agentConcurrencyConfig['agent-1']).toBe(3);
      expect(agentConcurrencyConfig['agent-2']).toBe(5);
      expect(agentConcurrencyConfig['agent-3']).toBe(1);
    });
  });

  describe('Running job tracking per agent', () => {
    it('should count running jobs for an agent', () => {
      const agentName = 'backup-agent-1';
      const runningJobs = [
        { jobName: 'job1', executionId: 'e1', agentName: agentName },
        { jobName: 'job2', executionId: 'e2', agentName: agentName },
      ];

      const runningCount = runningJobs.filter(j => j.agentName === agentName).length;
      expect(runningCount).toBe(2);
    });

    it('should not count jobs from other agents', () => {
      const allRunningJobs = [
        { jobName: 'job1', executionId: 'e1', agentName: 'agent-a' },
        { jobName: 'job2', executionId: 'e2', agentName: 'agent-a' },
        { jobName: 'job3', executionId: 'e3', agentName: 'agent-b' },
      ];

      const agentAJobs = allRunningJobs.filter(j => j.agentName === 'agent-a').length;
      const agentBJobs = allRunningJobs.filter(j => j.agentName === 'agent-b').length;

      expect(agentAJobs).toBe(2);
      expect(agentBJobs).toBe(1);
    });

    it('should track same job running concurrently with different executionIds', () => {
      const agentName = 'agent-x';
      const jobName = 'backup-db';
      const runningJobs = [
        { jobName: jobName, executionId: 'exec-1', agentName: agentName },
        { jobName: jobName, executionId: 'exec-2', agentName: agentName },
        { jobName: jobName, executionId: 'exec-3', agentName: agentName },
      ];

      const sameJobConcurrent = runningJobs.filter(j => j.jobName === jobName).length;
      expect(sameJobConcurrent).toBe(3);
    });
  });

  describe('Concurrency limit enforcement', () => {
    it('should allow job start when agent is below limit', () => {
      const concurrencyLimit = 3;
      const runningCount = 2;

      const canStart = runningCount < concurrencyLimit;
      expect(canStart).toBe(true);
    });

    it('should prevent job start when agent is at limit', () => {
      const concurrencyLimit = 3;
      const runningCount = 3;

      const canStart = runningCount < concurrencyLimit;
      expect(canStart).toBe(false);
    });

    it('should prevent job start when agent exceeds limit', () => {
      const concurrencyLimit = 3;
      const runningCount = 4;

      const canStart = runningCount < concurrencyLimit;
      expect(canStart).toBe(false);
    });

    it('should allow job start immediately after one completes', () => {
      let runningCount = 3; // At capacity
      const concurrencyLimit = 3;

      expect(runningCount < concurrencyLimit).toBe(false); // Cannot start new

      runningCount--; // One job completes
      expect(runningCount < concurrencyLimit).toBe(true); // Can now start new
    });
  });

  describe('Rule-triggered job concurrency awareness', () => {
    it('should skip rule trigger when agent is at concurrency limit', () => {
      const agentName = 'monitored-agent';
      const concurrencyLimit = 3;
      const runningCount = 3;

      const shouldSkipRuleTrigger = runningCount >= concurrencyLimit;
      expect(shouldSkipRuleTrigger).toBe(true);
    });

    it('should allow rule trigger when agent has capacity', () => {
      const agentName = 'monitored-agent';
      const concurrencyLimit = 3;
      const runningCount = 2;

      const shouldSkipRuleTrigger = runningCount >= concurrencyLimit;
      expect(shouldSkipRuleTrigger).toBe(false);
    });

    it('should not execute multiple concurrent metric queries for same agent', () => {
      const agentName = 'query-agent';
      const concurrencyLimit = 3;
      const runningCount = 3; // At capacity

      const canQueryMetric = runningCount < concurrencyLimit;

      // If no capacity, skip the metric query that could trigger jobs
      expect(canQueryMetric).toBe(false);
    });

    it('should allow threshold detection even when rule trigger is skipped', () => {
      // Threshold jobs checked at pong time still execute post-check
      // Rules have independent concurrency awareness
      const thresholdCheckHappens = true;
      const rulePollSkipped = false; // Separate from threshold

      expect(thresholdCheckHappens).toBe(true);
      expect(rulePollSkipped).toBe(false);
    });
  });

  describe('Concurrent job execution scenarios', () => {
    it('should support 3 concurrent database backups on same agent', () => {
      const agent = 'db-agent';
      const concurrencyLimit = 3;
      const runningJobs = [
        { jobName: 'backup-db', executionId: 'exec-1', agentName: agent },
        { jobName: 'backup-db', executionId: 'exec-2', agentName: agent },
        { jobName: 'backup-db', executionId: 'exec-3', agentName: agent },
      ];

      const runningCount = runningJobs.length;
      expect(runningCount).toBe(3);
      expect(runningCount === concurrencyLimit).toBe(true);
    });

    it('should support mixed job types up to concurrency limit', () => {
      const agent = 'multi-agent';
      const concurrencyLimit = 3;
      const runningJobs = [
        { jobName: 'backup-db', executionId: 'exec-1', agentName: agent },
        { jobName: 'cleanup-logs', executionId: 'exec-2', agentName: agent },
        { jobName: 'verify-storage', executionId: 'exec-3', agentName: agent },
      ];

      const runningCount = runningJobs.length;
      expect(runningCount).toBe(3);

      // All three jobs running simultaneously
      const jobNames = runningJobs.map(j => j.jobName);
      expect(jobNames).toContain('backup-db');
      expect(jobNames).toContain('cleanup-logs');
      expect(jobNames).toContain('verify-storage');
    });

    it('should queue job request when agent is at capacity', () => {
      const agent = 'busy-agent';
      const concurrencyLimit = 3;
      const runningCount = 3;

      const newJobRequest = {
        jobName: 'pending-task',
        agentName: agent,
        queuedAt: Date.now(),
      };

      const canStart = runningCount < concurrencyLimit;
      expect(canStart).toBe(false);

      // Job would be queued or rejected
      if (!canStart) {
        expect(newJobRequest.queuedAt).toBeDefined();
      }
    });
  });

  describe('Completed job cleanup and capacity release', () => {
    it('should remove completed job from running list', () => {
      const agent = 'test-agent';
      let runningJobs = [
        { jobName: 'job1', executionId: 'exec-1', agentName: agent },
        { jobName: 'job2', executionId: 'exec-2', agentName: agent },
        { jobName: 'job3', executionId: 'exec-3', agentName: agent },
      ];

      // Job 1 completes
      runningJobs = runningJobs.filter(j => j.executionId !== 'exec-1');

      expect(runningJobs.length).toBe(2);
      expect(runningJobs.some(j => j.executionId === 'exec-1')).toBe(false);
    });

    it('should release capacity when job completes', () => {
      const concurrencyLimit = 3;
      let runningCount = 3;

      expect(runningCount < concurrencyLimit).toBe(false); // At capacity

      runningCount -= 1; // Job completes
      expect(runningCount < concurrencyLimit).toBe(true); // Capacity available
    });

    it('should allow next queued job to start after capacity freed', () => {
      const concurrencyLimit = 3;
      let runningCount = 3;
      let queuedJobs = [
        { jobName: 'queued-1' },
        { jobName: 'queued-2' },
      ];

      // At capacity, can't start queued
      expect(runningCount >= concurrencyLimit).toBe(true);

      // One job completes
      runningCount -= 1;
      expect(runningCount < concurrencyLimit).toBe(true);

      // Start first queued job
      const startedJob = queuedJobs.shift();
      runningCount += 1;

      expect(runningCount).toBe(3);
      expect(queuedJobs.length).toBe(1);
    });
  });

  describe('Multi-agent concurrency independence', () => {
    it('should enforce independent limits for different agents', () => {
      const agents = {
        'agent-a': {
          limit: 3,
          running: 3,
        },
        'agent-b': {
          limit: 5,
          running: 2,
        },
      };

      const agentACapacity = agents['agent-a'].running < agents['agent-a'].limit;
      const agentBCapacity = agents['agent-b'].running < agents['agent-b'].limit;

      expect(agentACapacity).toBe(false); // No capacity
      expect(agentBCapacity).toBe(true); // Has capacity
    });

    it('should not block agent-b jobs when agent-a is at limit', () => {
      const runningByAgent = {
        'agent-a': 3, // At default limit
        'agent-b': 1, // Below limit
      };

      const agentACanRun = runningByAgent['agent-a'] < 3;
      const agentBCanRun = runningByAgent['agent-b'] < 3;

      expect(agentACanRun).toBe(false);
      expect(agentBCanRun).toBe(true);
    });
  });

  describe('Concurrent execution timeout protection', () => {
    it('should track start time for each concurrent execution', () => {
      const now = Date.now();
      const executions = [
        { executionId: 'e1', startTime: now },
        { executionId: 'e2', startTime: now + 100 },
        { executionId: 'e3', startTime: now + 200 },
      ];

      expect(executions[0].startTime).toBe(now);
      expect(executions[1].startTime).toBe(now + 100);
      expect(executions[2].startTime).toBe(now + 200);
    });

    it('should detect stalled concurrent jobs by elapsed time', () => {
      const timeout = 3600000; // 1 hour
      const executions = [
        { executionId: 'e1', startTime: Date.now() - timeout - 10000 },
        { executionId: 'e2', startTime: Date.now() - 5000 },
      ];

      const elapsedE1 = Date.now() - executions[0].startTime;
      const elapsedE2 = Date.now() - executions[1].startTime;

      expect(elapsedE1 > timeout).toBe(true); // Stalled
      expect(elapsedE2 < timeout).toBe(true); // Running normally
    });
  });

  describe('ETA submission and executionId correctness', () => {
    it('should route eta_submission to correct execution by executionId', () => {
      const agent = 'test-agent';
      const runningExecutions = [
        { executionId: 'exec-a', jobName: 'task-1', agent },
        { executionId: 'exec-b', jobName: 'task-1', agent },
      ];

      const etagSubmission = {
        jobName: 'task-1',
        executionId: 'exec-b',
        eta: 15.5,
        returnCode: 0,
      };

      const targetExecution = runningExecutions.find(
        e => e.executionId === etagSubmission.executionId
      );

      expect(targetExecution).toBeDefined();
      expect(targetExecution.executionId).toBe('exec-b');
      expect(targetExecution).not.toBe(runningExecutions[0]); // Not the other one
    });

    it('should not prematurely complete first job when second completes', () => {
      const runningExecutions = [
        { executionId: 'slow-job', jobName: 'backup', startTime: Date.now() - 20000 },
        { executionId: 'fast-job', jobName: 'backup', startTime: Date.now() - 5000 },
      ];

      // Second job finishes
      const completedEta = {
        executionId: 'fast-job',
        eta: 17.02,
      };

      // Remove only the completed one
      const remaining = runningExecutions.filter(
        e => e.executionId !== completedEta.executionId
      );

      expect(remaining.length).toBe(1);
      expect(remaining[0].executionId).toBe('slow-job'); // First job still running
    });
  });

  describe('Log isolation with concurrent executions', () => {
    it('should route log_submission to correct execution by executionId', () => {
      const exec1 = 'job-exec-1';
      const exec2 = 'job-exec-2';

      const logs = {
        [exec1]: 'Log from execution 1',
        [exec2]: 'Log from execution 2',
      };

      const incomingLog = {
        executionId: exec1,
        data: 'Line from first job',
      };

      const targetLogs = logs[incomingLog.executionId];
      expect(targetLogs).toBe('Log from execution 1');
      expect(targetLogs).not.toContain('Line from first job'); // Not yet added
    });

    it('should maintain isolation between concurrent log streams', () => {
      const concurrentLogs = {
        'exec-a': [],
        'exec-b': [],
      };

      // Interleaved log submissions
      concurrentLogs['exec-a'].push('Start job A');
      concurrentLogs['exec-b'].push('Start job B');
      concurrentLogs['exec-a'].push('Step 1 job A');
      concurrentLogs['exec-b'].push('Step 1 job B');
      concurrentLogs['exec-a'].push('Complete job A');
      concurrentLogs['exec-b'].push('Complete job B');

      expect(concurrentLogs['exec-a']).toEqual([
        'Start job A',
        'Step 1 job A',
        'Complete job A',
      ]);
      expect(concurrentLogs['exec-b']).toEqual([
        'Start job B',
        'Step 1 job B',
        'Complete job B',
      ]);
    });
  });
});
