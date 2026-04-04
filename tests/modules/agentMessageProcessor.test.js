// Mock setup for agentMessageProcessor module tests

// Mock db module
jest.mock('../../db.js', () => ({
  getData: jest.fn(),
  putData: jest.fn(),
  deleteData: jest.fn(),
  simpleGetData: jest.fn(),
  simplePutData: jest.fn(),
}));

// Mock agents module
jest.mock('../../agents.js', () => ({
  getAgent: jest.fn(),
  updateAgentStatus: jest.fn(),
}));

// Mock notify module
jest.mock('../../notify.js', () => ({
  sendNotification: jest.fn(),
}));

// Mock running module
jest.mock('../../running.js', () => ({
  createItem: jest.fn(),
  add: jest.fn(),
  removeItem: jest.fn(),
  removeItemByExecutionId: jest.fn(),
  removeItemByName: jest.fn(),
  getItemByName: jest.fn(),
  getItemByExecutionId: jest.fn(),
  getItems: jest.fn(),
  getRunningCountForAgent: jest.fn(),
}));

// Mock orchestrationEngine module
jest.mock('../../orchestrationEngine.js', () => ({
  signalScriptCompletion: jest.fn(),
}));

// Mock wsBrowserTransport
jest.mock('../../communications/wsBrowserTransport.js', () => ({
  emitOrchestrationEvent: jest.fn(),
}));

// Mock history module
jest.mock('../../history.js', () => ({
  add: jest.fn(),
}));

const db = require('../../db.js');
const agentsModule = require('../../agents.js');
const notifier = require('../../notify.js');
const running = require('../../running.js');
const orchestrationEngine = require('../../orchestrationEngine.js');
const history = require('../../history.js');

describe('Agent Message Processor - Notification Logic', () => {
  let agentMessageProcessor;
  let processMessageOriginal;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up global mocks BEFORE importing the module
    global.logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    global.serverConfig = {
      server: {
        jobFailEnabled: 'true',
      },
    };

    global.agents = agentsModule;
    global.db = db;
    global.notifier = notifier;
    global.running = running;
    global.history = history;
    global.hist = history; // agentMessageProcessor uses 'hist' instead of 'history'

    // Mock module functions
    db.getData = jest.fn();
    db.putData = jest.fn();
    db.deleteData = jest.fn();
    db.simpleGetData = jest.fn();
    db.simplePutData = jest.fn();

    agentsModule.getAgent = jest.fn();
    agentsModule.updateAgentStatus = jest.fn();

    notifier.sendNotification = jest.fn();

    running.createItem = jest.fn().mockReturnValue({ startTime: new Date().toISOString() });
    running.add = jest.fn();
    running.removeItem = jest.fn();
    running.removeItemByExecutionId = jest.fn();
    running.removeItemByName = jest.fn();
    running.getItemByName = jest.fn().mockReturnValue({ startTime: new Date().toISOString() });
    running.getItemByExecutionId = jest.fn().mockReturnValue({ startTime: new Date().toISOString() });
    running.getItems = jest.fn().mockReturnValue([]);
    running.getRunningCountForAgent = jest.fn().mockReturnValue(0);

    orchestrationEngine.signalScriptCompletion = jest.fn();

    history.add = jest.fn();
    history.createHistoryItem = jest.fn().mockReturnValue({ jobName: 'test-job', executionId: 'test-exec' });

    // Import agentMessageProcessor module after globals are set up
    if (!agentMessageProcessor) {
      delete require.cache[require.resolve('../../agentMessageProcessor.js')];
      agentMessageProcessor = require('../../agentMessageProcessor.js');
    }
  });

  afterEach(() => {
    delete global.logger;
    delete global.serverConfig;
    delete global.agents;
    delete global.db;
    delete global.notifier;
    delete global.running;
    delete global.history;
    delete global.hist;
  });

  describe('eta_submission with job failures', () => {
    it('should send notification for regular script job failure', async () => {
      agentsModule.getAgent.mockReturnValue({ name: 'test-agent', status: 'online' });
      db.simpleGetData.mockResolvedValue({ current: {}, previous: {} });

      const message = JSON.stringify({
        name: 'test-agent',
        status: 'eta_submission',
        jobName: 'backup-job-1',
        returnCode: 1,
        eta: 300,
        manual: false,
        lastStatusReport: new Date().toISOString(),
      });

      await agentMessageProcessor.processMessage('backup/agent/status', message, 'mqtt');

      expect(notifier.sendNotification).toHaveBeenCalledWith(
        'backup-job-1- job failed',
        expect.stringContaining('Job Name'),
        'WARNING',
        '/history.html'
      );
    });

    it('should NOT send notification for orchestration node failure', async () => {
      agentsModule.getAgent.mockReturnValue({ name: 'orchestration-agent', status: 'online' });
      db.getData.mockResolvedValue('');
      db.simpleGetData.mockResolvedValue({ current: {}, previous: {} });

      const message = JSON.stringify({
        name: 'orchestration-agent',
        status: 'eta_submission',
        jobName: 'Orchestration [orch-job-1] Execution [exec-123] Node [execute-1]',
        returnCode: 1,
        eta: 60,
        manual: false,
        lastStatusReport: new Date().toISOString(),
      });

      await agentMessageProcessor.processMessage('backup/agent/status', message, 'mqtt');

      expect(notifier.sendNotification).not.toHaveBeenCalled();
    });

    it('should signal orchestration engine for orchestration node completion', async () => {
      agentsModule.getAgent.mockReturnValue({ name: 'orchestration-agent', status: 'online' });
      db.getData.mockResolvedValue('Script output log');
      db.simpleGetData.mockResolvedValue({ current: {}, previous: {} });

      const message = JSON.stringify({
        name: 'orchestration-agent',
        status: 'eta_submission',
        jobName: 'Orchestration [orch-job-1] Execution [exec-123] Node [execute-1]',
        returnCode: 0,
        eta: 60,
        manual: false,
        lastStatusReport: new Date().toISOString(),
      });

      await agentMessageProcessor.processMessage('backup/agent/status', message, 'mqtt');

      expect(orchestrationEngine.signalScriptCompletion).toHaveBeenCalledWith(
        'Orchestration [orch-job-1] Execution [exec-123] Node [execute-1]',
        expect.objectContaining({
          exitCode: 0,
          stdout: 'Script output log',
          stderr: '',
        })
      );
    });

    it('should not send notification when job succeeds (returnCode 0)', async () => {
      agentsModule.getAgent.mockReturnValue({ name: 'test-agent', status: 'online' });
      db.simpleGetData.mockResolvedValue({ current: {}, previous: {} });

      const message = JSON.stringify({
        name: 'test-agent',
        status: 'eta_submission',
        jobName: 'backup-success-job',
        returnCode: 0,
        eta: 300,
        manual: false,
        lastStatusReport: new Date().toISOString(),
      });

      await agentMessageProcessor.processMessage('backup/agent/status', message, 'mqtt');

      expect(notifier.sendNotification).not.toHaveBeenCalled();
    });

    it('should not send notification when jobFailEnabled is false', async () => {
      global.serverConfig.server.jobFailEnabled = 'false';
      agentsModule.getAgent.mockReturnValue({ name: 'test-agent', status: 'online' });
      db.simpleGetData.mockResolvedValue({ current: {}, previous: {} });

      const message = JSON.stringify({
        name: 'test-agent',
        status: 'eta_submission',
        jobName: 'backup-job-1',
        returnCode: 1,
        eta: 300,
        manual: false,
        lastStatusReport: new Date().toISOString(),
      });

      await agentMessageProcessor.processMessage('backup/agent/status', message, 'mqtt');

      expect(notifier.sendNotification).not.toHaveBeenCalled();
    });

    it('should respect orchestration node pattern with different node formats', async () => {
      agentsModule.getAgent.mockReturnValue({ name: 'agent', status: 'online' });
      db.getData.mockResolvedValue('');
      db.simpleGetData.mockResolvedValue({ current: {}, previous: {} });

      const testCases = [
        'Orchestration [job1] Execution [exec1] Node [node1]',
        'Orchestration [complex-job-123] Execution [abc-def-ghi] Node [decision-point]',
        'Orchestration [test] Execution [x] Node [y]',
      ];

      for (const jobName of testCases) {
        notifier.sendNotification.mockClear();

        const message = JSON.stringify({
          name: 'agent',
          status: 'eta_submission',
          jobName: jobName,
          returnCode: 1,
          eta: 60,
          manual: false,
          lastStatusReport: new Date().toISOString(),
        });

        await agentMessageProcessor.processMessage('backup/agent/status', message, 'mqtt');

        expect(notifier.sendNotification).not.toHaveBeenCalled();
      }
    });

    it('should send notification for jobs with Orchestration in name but not matching pattern', async () => {
      agentsModule.getAgent.mockReturnValue({ name: 'test-agent', status: 'online' });
      db.simpleGetData.mockResolvedValue({ current: {}, previous: {} });

      // Job name that contains "Orchestration" but doesn't match the pattern
      const message = JSON.stringify({
        name: 'test-agent',
        status: 'eta_submission',
        jobName: 'My-Orchestration-Backup-Job',
        executionId: 'exec123',
        returnCode: 1,
        eta: 300,
        manual: false,
        lastStatusReport: new Date().toISOString(),
      });

      await agentMessageProcessor.processMessage('backup/agent/status', message, 'mqtt');

      // Should send notification because it doesn't match the exact pattern
      expect(notifier.sendNotification).toHaveBeenCalled();
    });

    it('should clear orchestration node log from database after processing', async () => {
      agentsModule.getAgent.mockReturnValue({ name: 'orchestration-agent', status: 'online' });
      db.getData.mockResolvedValue('Some log data');
      db.simpleGetData.mockResolvedValue({ current: {}, previous: {} });

      const message = JSON.stringify({
        name: 'orchestration-agent',
        status: 'eta_submission',
        jobName: 'Orchestration [job] Execution [exec] Node [node1]',
        executionId: 'exec',
        returnCode: 0,
        eta: 60,
        manual: false,
        lastStatusReport: new Date().toISOString(),
      });

      await agentMessageProcessor.processMessage('backup/agent/status', message, 'mqtt');

      expect(db.deleteData).toHaveBeenCalledWith(
        'orchestration-agent_Orchestration [job] Execution [exec] Node [node1]_exec_log'
      );
    });

    it('should handle missing log data gracefully for orchestration nodes', async () => {
      agentsModule.getAgent.mockReturnValue({ name: 'orchestration-agent', status: 'online' });
      db.getData.mockRejectedValue(new Error('NotFoundError: Key not found'));
      db.simpleGetData.mockResolvedValue({ current: {}, previous: {} });

      const message = JSON.stringify({
        name: 'orchestration-agent',
        status: 'eta_submission',
        jobName: 'Orchestration [job] Execution [exec] Node [node1]',
        executionId: 'exec',
        returnCode: 1,
        eta: 60,
        manual: false,
        lastStatusReport: new Date().toISOString(),
      });

      // Should not throw
      await expect(
        agentMessageProcessor.processMessage('backup/agent/status', message, 'mqtt')
      ).resolves.toBeUndefined();

      // Should still signal completion with empty stdout
      expect(orchestrationEngine.signalScriptCompletion).toHaveBeenCalledWith(
        'Orchestration [job] Execution [exec] Node [node1]',
        expect.objectContaining({
          stdout: '',
        })
      );
    });
  });
});
