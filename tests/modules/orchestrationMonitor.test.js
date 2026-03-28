// Mock setup for orchestrationMonitor module tests

// Mock db module before importing orchestrationMonitor
jest.mock('../../db.js', () => ({
  getData: jest.fn(),
  putData: jest.fn(),
  deleteData: jest.fn(),
}));

// Mock dateTimeUtils before importing orchestrationMonitor
jest.mock('../../utils/dateTimeUtils.js', () => ({
  displayFormatDate: jest.fn((date) => date.toISOString()),
  applyTz: jest.fn((date) => date.toISOString()),
  displaySecs: jest.fn((secs) => `${secs}s`),
}));

const db = require('../../db.js');
const dateTimeUtils = require('../../utils/dateTimeUtils.js');

describe('Orchestration Monitor Module', () => {
  let orchestrationMonitor;

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

    // Mock dateTimeUtils functions
    dateTimeUtils.displayFormatDate = jest.fn((date) => date.toISOString());
    dateTimeUtils.applyTz = jest.fn((date) => date.toISOString());
    dateTimeUtils.displaySecs = jest.fn((secs) => `${secs}s`);

    // Import orchestrationMonitor module (only once after mocks are set up)
    if (!orchestrationMonitor) {
      orchestrationMonitor = require('../../orchestrationMonitor.js');
    }
  });

  afterEach(() => {
    delete global.logger;
    delete global.serverConfig;
    delete global.db;
  });

  describe('getExecutionDetails()', () => {
    beforeEach(() => {
      const mockJob = {
        id: 'job1',
        name: 'Test Job',
        description: 'Test description',
        currentVersion: 1,
        versions: [
          {
            version: 1,
            nodes: [
              { id: 'node1', type: 'start', data: { name: 'Start' } },
              { id: 'node2', type: 'execute', data: { name: 'Execute', script: 'backup.sh' } },
              { id: 'node3', type: 'end', data: { name: 'End' } },
            ],
            edges: [
              { from: 'node1', to: 'node2', fromPort: 'out', toPort: 'in' },
              { from: 'node2', to: 'node3', fromPort: 'out', toPort: 'in' },
            ],
          },
        ],
      };

      const mockExecution = {
        jobId: 'job1',
        executionId: 'exec1',
        orchestrationVersion: 1,
        status: 'completed',
        finalStatus: 'success',
        startTime: '2026-03-27T00:00:00Z',
        endTime: '2026-03-27T00:05:00Z',
        visitedNodes: ['node1', 'node2', 'node3'],
        nodeMetrics: {
          node1: { duration: 0.1 },
          node2: { duration: 300 },
          node3: { duration: 0.1 },
        },
        scriptOutputs: {
          node2: { exitCode: 0, stdout: 'Backup completed' },
        },
        errors: [],
      };

      db.getData.mockImplementation((key) => {
        if (key === 'ORCHESTRATION_JOBS') return Promise.resolve({ job1: mockJob });
        if (key === 'ORCHESTRATION_EXECUTIONS') return Promise.resolve({ job1: [mockExecution] });
        return Promise.reject(new Error('NotFoundError'));
      });
    });

    it('should retrieve execution details with latest index', async () => {
      const result = await orchestrationMonitor.getExecutionDetails('job1', 'latest');

      expect(result).toHaveProperty('jobId', 'job1');
      expect(result).toHaveProperty('execution');
      expect(result.execution.status).toBe('completed');
    });

    it('should retrieve execution by numeric index', async () => {
      const result = await orchestrationMonitor.getExecutionDetails('job1', 0);

      expect(result).toBeDefined();
      expect(result.execution.executionId).toBe('exec1');
    });

    it('should throw error for invalid execution index', async () => {
      await expect(orchestrationMonitor.getExecutionDetails('job1', 99)).rejects.toThrow(
        'Invalid execution index'
      );
    });

    it('should throw error when no execution history found', async () => {
      db.getData.mockResolvedValue({});

      await expect(orchestrationMonitor.getExecutionDetails('job1')).rejects.toThrow(
        'No execution history found'
      );
    });

    it('should format nodes and edges correctly', async () => {
      const result = await orchestrationMonitor.getExecutionDetails('job1', 'latest');

      expect(Array.isArray(result.nodes)).toBe(true);
      expect(Array.isArray(result.edges)).toBe(true);
      expect(result.nodes.length).toBe(3);
    });
  });

  describe('getNodeOutput()', () => {
    beforeEach(() => {
      const mockJob = {
        id: 'job1',
        versions: [
          {
            nodes: [
              { id: 'node1', type: 'execute', data: { script: 'test.sh' } },
            ],
          },
        ],
      };

      const mockExecution = {
        jobId: 'job1',
        executionId: 'exec1',
        visitedNodes: ['node1'],
        scriptOutputs: {
          node1: {
            exitCode: 0,
            stdout: 'Script output here',
            stderr: '',
          },
        },
      };

      db.getData.mockImplementation((key) => {
        if (key === 'ORCHESTRATION_JOBS') return Promise.resolve({ job1: mockJob });
        if (key === 'ORCHESTRATION_EXECUTIONS') return Promise.resolve({ job1: [mockExecution] });
        return Promise.reject(new Error('NotFoundError'));
      });
    });

    it('should retrieve node output for execution', async () => {
      const result = await orchestrationMonitor.getNodeOutput('job1', 'node1', 'latest');

      expect(result).toHaveProperty('exitCode', 0);
      expect(result).toHaveProperty('log');
      expect(result).toHaveProperty('status', 'executed');
    });

    it('should return not_executed status if node has no output', async () => {
      const result = await orchestrationMonitor.getNodeOutput('job1', 'nonexistent-node', 'latest');

      expect(result).toHaveProperty('status', 'not_executed');
      expect(result).toHaveProperty('nodeId', 'nonexistent-node');
    });
  });

  describe('formatNodeDetails()', () => {
    it('should format nodes with execution data', () => {
      const nodes = [
        { id: 'node1', type: 'start', data: { name: 'Start' } },
        { id: 'node2', type: 'execute', data: { name: 'Execute' } },
        { id: 'node3', type: 'end', data: { name: 'End' } },
      ];

      const execution = {
        visitedNodes: ['node1', 'node2'],
        nodeMetrics: {
          node1: { duration: 0.1 },
          node2: { duration: 5 },
        },
        scriptOutputs: {
          node2: { exitCode: 0, stdout: 'success' },
        },
        errors: [],
      };

      const result = orchestrationMonitor.formatNodeDetails(nodes, execution);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
      expect(result[0]).toHaveProperty('id', 'node1');
      expect(result[0]).toHaveProperty('executed', true);
    });

    it('should mark unvisited nodes as not executed', () => {
      const nodes = [
        { id: 'node1', type: 'start' },
        { id: 'node2', type: 'execute' },
      ];

      const execution = {
        visitedNodes: ['node1'], // Only node1 was visited
        errors: [],
      };

      const result = orchestrationMonitor.formatNodeDetails(nodes, execution);

      expect(result[0].executed).toBe(true);
      expect(result[1].executed).toBe(false);
    });

    it('should include node error information when present', () => {
      const nodes = [{ id: 'node1', type: 'execute' }];

      const execution = {
        visitedNodes: ['node1'],
        errors: [{ node: 'node1', message: 'Script failed' }],
      };

      const result = orchestrationMonitor.formatNodeDetails(nodes, execution);

      expect(result[0].hasError).toBe(true);
      expect(result[0].errorMessage).toBe('Script failed');
    });

    it('should include exit code from script output', () => {
      const nodes = [{ id: 'node1', type: 'execute' }];

      const execution = {
        visitedNodes: ['node1'],
        scriptOutputs: {
          node1: { exitCode: 1, stdout: 'Error occurred' },
        },
        errors: [],
      };

      const result = orchestrationMonitor.formatNodeDetails(nodes, execution);

      expect(result[0].exitCode).toBe(1);
    });
  });

  describe('formatEdgeDetails()', () => {
    it('should format edges with traversal information', () => {
      const edges = [
        { from: 'node1', to: 'node2', fromPort: 'out', toPort: 'in' },
        { from: 'node2', to: 'node3', fromPort: 'out', toPort: 'in' },
      ];

      const execution = {
        visitedNodes: ['node1', 'node2', 'node3'],
      };

      const result = orchestrationMonitor.formatEdgeDetails(edges, execution, ['node1', 'node2']);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should mark edges as executed if both nodes were visited', () => {
      const edges = [
        { from: 'node1', to: 'node2', fromPort: 'out', toPort: 'in' },
      ];

      const execution = {};

      const result = orchestrationMonitor.formatEdgeDetails(edges, execution, ['node1', 'node2']);

      expect(result[0]).toHaveProperty('executed', true);
    });

    it('should mark edges as not executed if not in visited path', () => {
      const edges = [
        { from: 'node1', to: 'node2', fromPort: 'out', toPort: 'in' },
      ];

      const execution = {};

      const result = orchestrationMonitor.formatEdgeDetails(edges, execution, ['node1']);

      expect(result[0]).toHaveProperty('executed', false);
    });
  });

  describe('getJobDefinitionVersion()', () => {
    beforeEach(() => {
      const mockJob = {
        id: 'job1',
        name: 'Test Job',
        currentVersion: 2,
        versions: [
          {
            version: 1,
            nodes: [{ id: 'n1', type: 'start' }],
            edges: [],
          },
          {
            version: 2,
            nodes: [{ id: 'n1', type: 'start' }, { id: 'n2', type: 'execute' }],
            edges: [],
          },
        ],
      };

      db.getData.mockResolvedValue({ job1: mockJob });
    });

    it('should retrieve current version', async () => {
      const result = await orchestrationMonitor.getJobDefinitionVersion('job1', 'current');

      expect(result).toBeDefined();
      expect(result.version).toBe(2);
      expect(result.nodes.length).toBe(2);
    });

    it('should retrieve specific version by number', async () => {
      const result = await orchestrationMonitor.getJobDefinitionVersion('job1', 1);

      expect(result).toBeDefined();
      expect(result.version).toBe(1);
      expect(result.nodes.length).toBe(1);
    });

    it('should throw error when job not found', async () => {
      db.getData.mockResolvedValue({});

      await expect(orchestrationMonitor.getJobDefinitionVersion('nonexistent')).rejects.toThrow();
    });
  });

  describe('listJobsWithStatus()', () => {
    beforeEach(() => {
      const mockJobs = {
        job1: {
          id: 'job1',
          name: 'Job 1',
          currentVersion: 1,
          versions: [{ nodes: [], edges: [] }],
        },
        job2: {
          id: 'job2',
          name: 'Job 2',
          currentVersion: 1,
          versions: [{ nodes: [], edges: [] }],
        },
      };

      const mockExecutions = {
        job1: [
          {
            executionId: 'exec1',
            finalStatus: 'success',
            endTime: '2026-03-27T00:00:00Z',
          },
        ],
        job2: [
          {
            executionId: 'exec2',
            finalStatus: 'failed',
            endTime: '2026-03-27T01:00:00Z',
          },
        ],
      };

      db.getData.mockImplementation((key) => {
        if (key === 'ORCHESTRATION_JOBS') return Promise.resolve(mockJobs);
        if (key === 'ORCHESTRATION_EXECUTIONS') return Promise.resolve(mockExecutions);
        return Promise.reject(new Error('NotFoundError'));
      });
    });

    it('should list all jobs with status', async () => {
      const result = await orchestrationMonitor.listJobsWithStatus('Europe/London');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should include last execution status for each job', async () => {
      const result = await orchestrationMonitor.listJobsWithStatus('Europe/London');

      const job1Result = result.find(j => j.id === 'job1');
      expect(job1Result).toBeDefined();
      expect(job1Result.lastExecutionStatus).toBeDefined();
    });

    it('should handle jobs with no execution history', async () => {
      db.getData.mockImplementation((key) => {
        if (key === 'ORCHESTRATION_JOBS') {
          return Promise.resolve({
            job1: {
              id: 'job1',
              name: 'Job 1',
              versions: [{ nodes: [], edges: [] }],
            },
          });
        }
        if (key === 'ORCHESTRATION_EXECUTIONS') return Promise.resolve({});
        return Promise.reject(new Error('NotFoundError'));
      });

      const result = await orchestrationMonitor.listJobsWithStatus('Europe/London');

      expect(result.length).toBe(1);
      expect(result[0].lastExecutionStatus).toBe('never_run');
    });
  });

  describe('Integration Tests', () => {
    it('should retrieve complete job details with execution history', async () => {
      const mockJob = {
        id: 'integration-job',
        name: 'Integration Test Job',
        currentVersion: 1,
        versions: [
          {
            version: 1,
            nodes: [
              { id: 'start', type: 'start' },
              { id: 'execute', type: 'execute', data: { script: 'test.sh' } },
              { id: 'end', type: 'end' },
            ],
            edges: [
              { from: 'start', to: 'execute' },
              { from: 'execute', to: 'end' },
            ],
          },
        ],
      };

      const mockExecution = {
        jobId: 'integration-job',
        executionId: 'int-exec1',
        orchestrationVersion: 1,
        status: 'completed',
        finalStatus: 'success',
        startTime: '2026-03-27T00:00:00Z',
        endTime: '2026-03-27T00:05:00Z',
        visitedNodes: ['start', 'execute', 'end'],
        nodeMetrics: {
          start: { duration: 0.1 },
          execute: { duration: 300 },
          end: { duration: 0.1 },
        },
        scriptOutputs: {
          execute: {
            exitCode: 0,
            stdout: 'Integration test successful',
          },
        },
        errors: [],
      };

      db.getData.mockImplementation((key) => {
        if (key === 'ORCHESTRATION_JOBS') return Promise.resolve({ 'integration-job': mockJob });
        if (key === 'ORCHESTRATION_EXECUTIONS') return Promise.resolve({ 'integration-job': [mockExecution] });
        return Promise.reject(new Error('NotFoundError'));
      });

      // Get execution details
      const details = await orchestrationMonitor.getExecutionDetails('integration-job', 'latest');

      expect(details).toHaveProperty('jobId', 'integration-job');
      expect(details.execution.finalStatus).toBe('success');
      expect(details.nodes.length).toBe(3);
      expect(details.edges.length).toBe(2);

      // Get node output
      const nodeOutput = await orchestrationMonitor.getNodeOutput('integration-job', 'execute', 'latest');
      expect(nodeOutput).toBeDefined();
      expect(nodeOutput.status).toBe('executed');

      // List jobs with status
      const jobs = await orchestrationMonitor.listJobsWithStatus('Europe/London');
      expect(jobs.length).toBe(1);
      expect(jobs[0].lastExecutionStatus).toBe('success');
    });
  });
});
