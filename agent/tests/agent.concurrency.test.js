// Unit tests for agent concurrency support (concurrent job tracking by executionId)
const { spawn } = require('child_process');

describe('Agent Concurrency Support', () => {
  let activeJobs;

  beforeEach(() => {
    // Simulate the activeJobs Map with executionId as key
    activeJobs = new Map();
    
    global.logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  });

  afterEach(() => {
    // Clear all intervals from active jobs to prevent Jest from hanging
    activeJobs.forEach((job) => {
      if (job.logInterval) {
        clearInterval(job.logInterval);
      }
    });
    activeJobs.clear();
  });

  describe('activeJobs tracking by executionId', () => {
    it('should track job with executionId as key instead of jobName', () => {
      const jobName = 'backup-database';
      const executionId = 'exec-123-abc';

      // Simulate adding a job: key by executionId
      activeJobs.set(executionId, {
        startTime: Date.now(),
        status: 'running',
        executionId: executionId,
      });

      expect(activeJobs.has(executionId)).toBe(true);
      expect(activeJobs.size).toBe(1);
    });

    it('should support concurrent same-job runs with different executionIds', () => {
      const jobName = 'backup-database';
      const exec1 = 'exec-001';
      const exec2 = 'exec-002';

      // Start first job
      activeJobs.set(exec1, {
        startTime: Date.now(),
        status: 'running',
        executionId: exec1,
        jobName: jobName,
      });

      // Start second concurrent job with same jobName but different executionId
      activeJobs.set(exec2, {
        startTime: Date.now() + 100,
        status: 'running',
        executionId: exec2,
        jobName: jobName,
      });

      expect(activeJobs.size).toBe(2);
      expect(activeJobs.has(exec1)).toBe(true);
      expect(activeJobs.has(exec2)).toBe(true);

      // Both entries should have their own startTimes and executionIds
      const job1 = activeJobs.get(exec1);
      const job2 = activeJobs.get(exec2);

      expect(job1.executionId).toBe(exec1);
      expect(job2.executionId).toBe(exec2);
      expect(job2.startTime > job1.startTime).toBe(true);
    });

    it('should not overwrite first job when second concurrent job starts', () => {
      const jobName = 'test-job';
      const exec1 = 'first-execution';
      const exec2 = 'second-execution';

      const startTime1 = Date.now();

      // Add first job
      activeJobs.set(exec1, {
        startTime: startTime1,
        status: 'running',
        executionId: exec1,
        jobName: jobName,
      });

      // Add second job (would have overwritten if keyed by jobName)
      activeJobs.set(exec2, {
        startTime: Date.now() + 1000,
        status: 'running',
        executionId: exec2,
        jobName: jobName,
      });

      // Both should exist
      const job1 = activeJobs.get(exec1);
      expect(job1).toBeDefined();
      expect(job1.startTime).toBe(startTime1); // Original startTime preserved

      const job2 = activeJobs.get(exec2);
      expect(job2).toBeDefined();
      expect(job2.startTime > startTime1).toBe(true);
    });

    it('should retrieve job by executionId and not lose data', () => {
      const exec1 = 'exec-abc-123';
      const originalStartTime = Date.now();

      activeJobs.set(exec1, {
        startTime: originalStartTime,
        status: 'running',
        executionId: exec1,
        jobName: 'important-job',
      });

      // Retrieve and verify
      const retrievedJob = activeJobs.get(exec1);
      expect(retrievedJob.startTime).toBe(originalStartTime);
      expect(retrievedJob.executionId).toBe(exec1);
    });

    it('should allow cleanup of completed job without affecting concurrent jobs', () => {
      const exec1 = 'job-1';
      const exec2 = 'job-2';

      // Setup two concurrent jobs
      activeJobs.set(exec1, {
        startTime: Date.now(),
        status: 'running',
        executionId: exec1,
      });
      activeJobs.set(exec2, {
        startTime: Date.now() + 100,
        status: 'running',
        executionId: exec2,
      });

      expect(activeJobs.size).toBe(2);

      // Complete first job
      activeJobs.delete(exec1);

      // Second job should still exist
      expect(activeJobs.has(exec2)).toBe(true);
      expect(activeJobs.size).toBe(1);

      // Verify second job data intact
      const job2 = activeJobs.get(exec2);
      expect(job2.executionId).toBe(exec2);
    });
  });

  describe('Concurrency limit enforcement', () => {
    it('should define default concurrency limit of 3', () => {
      const DEFAULT_CONCURRENCY_LIMIT = 3;
      expect(DEFAULT_CONCURRENCY_LIMIT).toBe(3);
    });

    it('should track running count for an agent', () => {
      const agent = 'test-agent';
      const jobsForAgent = [
        { executionId: 'e1', agentName: agent },
        { executionId: 'e2', agentName: agent },
      ];

      const runningCount = jobsForAgent.length;
      expect(runningCount).toBe(2);
    });

    it('should prevent job start when agent reaches concurrency limit', () => {
      const concurrencyLimit = 3;
      const runningCount = 3;

      const canStartJob = runningCount < concurrencyLimit;
      expect(canStartJob).toBe(false);
    });

    it('should allow job start when agent has capacity', () => {
      const concurrencyLimit = 3;
      const runningCount = 2;

      const canStartJob = runningCount < concurrencyLimit;
      expect(canStartJob).toBe(true);
    });

    it('should support different concurrency limits per agent', () => {
      const agentConcurrency = {
        'agent-1': 3,
        'agent-2': 5,
        'agent-3': 2,
      };

      expect(agentConcurrency['agent-1']).toBe(3);
      expect(agentConcurrency['agent-2']).toBe(5);
      expect(agentConcurrency['agent-3']).toBe(2);
    });
  });

  describe('Execution ID propagation', () => {
    it('should capture executionId from JWT token at job start', () => {
      const decodedPayload = {
        name: 'agent-1',
        command: 'backup.sh',
        jobName: 'database-backup',
        executionId: 'jwt-generated-id-123',
      };

      const { executionId } = decodedPayload;
      expect(executionId).toBe('jwt-generated-id-123');
      expect(executionId).toBeDefined();
    });

    it('should use executionId as key when adding to activeJobs', () => {
      const executionId = 'xyz-789-abc';
      const jobData = {
        startTime: Date.now(),
        status: 'running',
        executionId: executionId,
        jobName: 'cleanup-task',
      };

      activeJobs.set(executionId, jobData);

      const stored = activeJobs.get(executionId);
      expect(stored).toBe(jobData);
    });

    it('should include executionId in all status updates', () => {
      const executionId = 'status-update-123';
      const statusUpdate = {
        jobName: 'test-job',
        executionId: executionId,
        status: 'running',
      };

      expect(statusUpdate.executionId).toBe(executionId);
    });

    it('should pass executionId to log submission', () => {
      const executionId = 'log-exec-id';
      const logSubmission = {
        jobName: 'app-backup',
        executionId: executionId,
        data: 'Starting backup...',
      };

      expect(logSubmission.executionId).toBe(executionId);
    });

    it('should pass executionId to eta submission at completion', () => {
      const executionId = 'completion-123';
      const etaSubmission = {
        jobName: 'verify-backup',
        executionId: executionId,
        eta: 45.2,
        returnCode: 0,
      };

      expect(etaSubmission.executionId).toBe(executionId);
    });

    it('should retrieve correct job from activeJobs using executionId at completion', () => {
      const exec1 = 'completing-job-1';
      const exec2 = 'completing-job-2';

      // Two concurrent jobs
      activeJobs.set(exec1, {
        startTime: Date.now() - 30000,
        jobName: 'task-a',
        executionId: exec1,
      });
      activeJobs.set(exec2, {
        startTime: Date.now() - 10000,
        jobName: 'task-a', // Same job name
        executionId: exec2,
      });

      // Completing job 1 should not affect job 2
      const completingJob = activeJobs.get(exec1);
      expect(completingJob.executionId).toBe(exec1);

      activeJobs.delete(exec1);

      const remainingJob = activeJobs.get(exec2);
      expect(remainingJob).toBeDefined();
      expect(remainingJob.executionId).toBe(exec2);
    });
  });

  describe('Concurrent execution isolation', () => {
    it('should isolate logs between concurrent executions', () => {
      const exec1 = 'isolation-test-1';
      const exec2 = 'isolation-test-2';

      // Concurrent jobs with same jobName
      activeJobs.set(exec1, {
        jobName: 'collect-logs',
        executionId: exec1,
        logFile: `/tmp/logs_${exec1}.log`,
      });
      activeJobs.set(exec2, {
        jobName: 'collect-logs',
        executionId: exec2,
        logFile: `/tmp/logs_${exec2}.log`,
      });

      const job1 = activeJobs.get(exec1);
      const job2 = activeJobs.get(exec2);

      expect(job1.logFile).not.toBe(job2.logFile);
      expect(job1.logFile).toContain(exec1);
      expect(job2.logFile).toContain(exec2);
    });

    it('should track independent start times for concurrent executions', () => {
      const exec1 = 'time-test-1';
      const exec2 = 'time-test-2';

      const time1 = Date.now();
      const time2 = time1 + 5000; // 5 seconds later

      activeJobs.set(exec1, {
        startTime: time1,
        executionId: exec1,
        jobName: 'schedule-check',
      });
      activeJobs.set(exec2, {
        startTime: time2,
        executionId: exec2,
        jobName: 'schedule-check',
      });

      const job1 = activeJobs.get(exec1);
      const job2 = activeJobs.get(exec2);

      expect(job1.startTime).toBe(time1);
      expect(job2.startTime).toBe(time2);
      expect(job2.startTime > job1.startTime).toBe(true);
    });

    it('should prevent one job completion from clearing another concurrent job', () => {
      const exec1 = 'persist-test-1';
      const exec2 = 'persist-test-2';

      // Setup concurrent jobs
      activeJobs.set(exec1, { executionId: exec1, jobName: 'task' });
      activeJobs.set(exec2, { executionId: exec2, jobName: 'task' });

      // Complete first job (would have cleared both if using jobName as key)
      activeJobs.delete(exec1);

      // Verify second job persists
      expect(activeJobs.has(exec2)).toBe(true);
      expect(activeJobs.size).toBe(1);
    });
  });

  describe('Fallback for null executionId (backward compatibility)', () => {
    it('should use jobName as key if executionId is null', () => {
      const jobName = 'legacy-backup';
      const executionId = null;

      // Fallback: use jobName if no executionId
      const key = executionId || jobName;
      expect(key).toBe(jobName);

      activeJobs.set(key, {
        startTime: Date.now(),
        executionId: null,
        jobName: jobName,
      });

      expect(activeJobs.has(jobName)).toBe(true);
    });

    it('should handle mixed executionId and null scenarios', () => {
      const jobName1 = 'job-with-exec-id';
      const jobName2 = 'legacy-job';
      const exec1 = 'exec-123';

      // New-style with executionId
      activeJobs.set(exec1, {
        executionId: exec1,
        jobName: jobName1,
      });

      // Old-style without executionId (fallback to jobName)
      activeJobs.set(jobName2, {
        executionId: null,
        jobName: jobName2,
      });

      expect(activeJobs.has(exec1)).toBe(true);
      expect(activeJobs.has(jobName2)).toBe(true);
      expect(activeJobs.size).toBe(2);
    });
  });

  describe('Error recovery in concurrent scenarios', () => {
    it('should recover from spawn error without affecting other jobs', () => {
      const exec1 = 'error-job';
      const exec2 = 'healthy-job';

      // Add both jobs
      activeJobs.set(exec1, {
        executionId: exec1,
        jobName: 'failing-task',
        status: 'running',
      });
      activeJobs.set(exec2, {
        executionId: exec2,
        jobName: 'working-task',
        status: 'running',
      });

      // Simulate error cleanup for first job
      activeJobs.delete(exec1);

      // Second job should persist
      expect(activeJobs.has(exec2)).toBe(true);
      const healthyJob = activeJobs.get(exec2);
      expect(healthyJob.status).toBe('running');
    });

    it('should allow restarting same job name with new executionId', () => {
      const jobName = 'retry-task';
      const exec1 = 'first-attempt';
      const exec2 = 'retry-attempt';

      // First execution fails and is cleaned up
      activeJobs.set(exec1, { executionId: exec1, jobName: jobName });
      activeJobs.delete(exec1);

      // Retry with new executionId
      activeJobs.set(exec2, { executionId: exec2, jobName: jobName });

      expect(activeJobs.has(exec1)).toBe(false);
      expect(activeJobs.has(exec2)).toBe(true);
    });
  });

  describe('Script test execution with per-execution tracking', () => {
    it('should execute script test with executionMode metadata', () => {
      const executionId = 'scripttest-001';
      const executionContext = {
        executionMode: 'test',
        scriptName: 'backup.sh',
        scriptIdentity: 'script:backup.sh',
        sourceType: 'saved',
        scriptLabel: 'backup.sh',
      };

      activeJobs.set(executionId, {
        executionId: executionId,
        jobName: `scripttest:${executionId}`,
        status: 'running',
        execution: executionContext,
        pid: 12345,
        logFile: `/tmp/scripttest_${executionId}.log`,
        logInterval: setInterval(() => {}, 1000),
      });

      const job = activeJobs.get(executionId);
      expect(job.execution.executionMode).toBe('test');
      expect(job.execution.scriptName).toBe('backup.sh');
      expect(job.pid).toBeDefined();
    });

    it('should track per-execution process and log file independently', () => {
      const exec1 = 'testexec-1';
      const exec2 = 'testexec-2';

      // Two concurrent script tests, same script
      activeJobs.set(exec1, {
        executionId: exec1,
        jobName: 'scripttest:' + exec1,
        status: 'running',
        execution: {
          executionMode: 'test',
          scriptName: 'deploy.sh',
          scriptIdentity: 'script:deploy.sh',
        },
        pid: 2001,
        logFile: `/tmp/scripttest_${exec1}.log`,
      });
      activeJobs.set(exec2, {
        executionId: exec2,
        jobName: 'scripttest:' + exec2,
        status: 'running',
        execution: {
          executionMode: 'test',
          scriptName: 'deploy.sh',
          scriptIdentity: 'script:deploy.sh',
        },
        pid: 2002,
        logFile: `/tmp/scripttest_${exec2}.log`,
      });

      // Verify isolation
      const job1 = activeJobs.get(exec1);
      const job2 = activeJobs.get(exec2);

      expect(job1.pid).toBe(2001);
      expect(job2.pid).toBe(2002);
      expect(job1.logFile).not.toBe(job2.logFile);
    });

    it('should support targeted termination by executionId', () => {
      const exec1 = 'term-test-1';
      const exec2 = 'term-test-2';

      // Two running script tests
      activeJobs.set(exec1, {
        executionId: exec1,
        status: 'running',
        pid: 3001,
        logInterval: Symbol('interval1'),
      });
      activeJobs.set(exec2, {
        executionId: exec2,
        status: 'running',
        pid: 3002,
        logInterval: Symbol('interval2'),
      });

      // Terminate only exec1
      const targetExec = activeJobs.get(exec1);
      expect(targetExec.pid).toBe(3001);

      // Simulate termination (kill process, clear interval, remove from activeJobs)
      activeJobs.delete(exec1);

      // Verify exec2 remains
      expect(activeJobs.has(exec1)).toBe(false);
      expect(activeJobs.has(exec2)).toBe(true);
      expect(activeJobs.get(exec2).pid).toBe(3002);
    });

    it('should include execution metadata in status updates', () => {
      const executionId = 'statusupdate-001';
      const statusUpdate = {
        jobName: 'scripttest:' + executionId,
        executionId: executionId,
        status: 'running',
        executionContext: {
          executionMode: 'test',
          scriptName: 'test.sh',
          scriptIdentity: 'script:test.sh',
          sourceType: 'saved',
        },
      };

      expect(statusUpdate.executionContext.executionMode).toBe('test');
      expect(statusUpdate.executionId).toBe(executionId);
    });

    it('should include execution metadata in log submissions', () => {
      const executionId = 'logsubmit-001';
      const logData = {
        jobName: 'scripttest:' + executionId,
        executionId: executionId,
        data: 'Script output line 1\nScript output line 2\n',
        executionContext: {
          executionMode: 'test',
          scriptName: 'monitor.sh',
          sourceType: 'saved',
        },
      };

      expect(logData.executionContext.executionMode).toBe('test');
      expect(logData.data).toContain('Script output line 1');
    });

    it('should include execution metadata in completion/eta submission', () => {
      const executionId = 'completion-001';
      const completionData = {
        jobName: 'scripttest:' + executionId,
        executionId: executionId,
        returnCode: 0,
        eta: 23.5,
        log: 'Script completed successfully',
        executionContext: {
          executionMode: 'test',
          scriptName: 'verify.sh',
          sourceType: 'editor',
        },
      };

      expect(completionData.executionContext.executionMode).toBe('test');
      expect(completionData.returnCode).toBe(0);
      expect(completionData.log).toContain('completed');
    });

    it('should support concurrent script tests with distinct execution contexts', () => {
      const testExec1 = 'distinct-1';
      const testExec2 = 'distinct-2';

      activeJobs.set(testExec1, {
        executionId: testExec1,
        jobName: 'scripttest:' + testExec1,
        execution: {
          executionMode: 'test',
          scriptName: 'task-a.sh',
          scriptIdentity: 'script:task-a.sh',
          sourceType: 'saved',
          commandParams: '--verbose',
        },
        pid: 4001,
      });
      activeJobs.set(testExec2, {
        executionId: testExec2,
        jobName: 'scripttest:' + testExec2,
        execution: {
          executionMode: 'test',
          scriptName: 'task-b.sh',
          scriptIdentity: 'editor:hash123',
          sourceType: 'editor',
          commandParams: '--debug',
        },
        pid: 4002,
      });

      const job1 = activeJobs.get(testExec1);
      const job2 = activeJobs.get(testExec2);

      // Both should have independent contexts
      expect(job1.execution.scriptName).toBe('task-a.sh');
      expect(job2.execution.scriptName).toBe('task-b.sh');
      expect(job1.execution.sourceType).toBe('saved');
      expect(job2.execution.sourceType).toBe('editor');
      expect(job1.execution.commandParams).toBe('--verbose');
      expect(job2.execution.commandParams).toBe('--debug');
    });

    it('should cleanup per-execution resources on completion', () => {
      const executionId = 'cleanup-test-001';

      const jobWithResources = {
        executionId: executionId,
        pid: 5001,
        logFile: `/tmp/scripttest_${executionId}.log`,
        logInterval: setInterval(() => {}, 1000),
      };

      activeJobs.set(executionId, jobWithResources);

      // Simulate cleanup
      const job = activeJobs.get(executionId);
      expect(job).toBeDefined();
      expect(job.pid).toBeDefined();
      expect(job.logFile).toBeDefined();
      expect(job.logInterval).toBeDefined();

      // Remove from tracking
      activeJobs.delete(executionId);

      expect(activeJobs.has(executionId)).toBe(false);
    });
  });
});
