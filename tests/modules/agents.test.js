// Mock setup for agents module tests
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    existsSync: jest.fn().mockReturnValue(false),
    copyFileSync: jest.fn(),
    promises: {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      mkdir: jest.fn(),
      rename: jest.fn(),
    },
  };
});

const fs = require('fs');

describe('Agents Module', () => {
  let agents;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up global mocks
    global.logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Mock agentHistory that's injected from server.js
    global.agentHistory = {
      addStatus: jest.fn().mockResolvedValue(undefined),
    };

    // Mock file system with all required methods
    fs.promises.readFile = jest.fn().mockResolvedValue(
      JSON.stringify({
        'agent-1': {
          name: 'agent-1',
          status: 'offline',
          description: 'Test Agent 1',
        },
        'agent-2': {
          name: 'agent-2',
          status: 'online',
          description: 'Test Agent 2',
        },
      })
    );
    fs.promises.writeFile = jest.fn().mockResolvedValue(undefined);
    fs.promises.mkdir = jest.fn().mockResolvedValue(undefined);
    fs.promises.rename = jest.fn().mockResolvedValue(undefined);
    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.copyFileSync = jest.fn();

    agents = require('../../agents.js');
  });

  afterEach(() => {
    delete global.logger;
    delete global.agentHistory;
  });

  describe('init()', () => {
    it('should initialize agents from config file', async () => {
      await agents.init();
      expect(fs.promises.readFile).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalled();
    });

    it('should handle missing config file gracefully', async () => {
      fs.promises.readFile.mockRejectedValue(new Error('ENOENT'));
      await agents.init();
      expect(logger.error).toHaveBeenCalled();
    });

    it('should reset all agents to offline', async () => {
      await agents.init();
      const dict = agents.getDict();
      Object.values(dict).forEach((agent) => {
        expect(agent.status).toBe('offline');
      });
    });
  });

  describe('getAgent()', () => {
    beforeEach(async () => {
      await agents.init();
    });

    it('should retrieve an agent by name', () => {
      const agent = agents.getAgent('agent-1');
      expect(agent).toBeTruthy();
      expect(agent.name).toBe('agent-1');
    });

    it('should return undefined for non-existent agent', () => {
      const agent = agents.getAgent('nonexistent');
      expect(agent).toBeUndefined();
    });
  });

  describe('registerAgent()', () => {
    it('should register a new agent', async () => {
      await agents.init();
      agents.registerAgent('new-agent', 'New Test Agent', 'cmd', 'icon-url', 'mqtt', 'display');
      
      const agent = agents.getAgent('new-agent');
      expect(agent).toBeTruthy();
      expect(agent.status).toBe('online');
    });

    it('should update existing agent', async () => {
      await agents.init();
      agents.registerAgent('agent-1', 'Updated Agent', 'cmd', 'icon', 'mqtt', 'display');
      
      const agent = agents.getAgent('agent-1');
      expect(agent.description).toBe('Updated Agent');
    });
  });

  describe('updateAgentStatus()', () => {
    beforeEach(async () => {
      await agents.init();
    });

    it('should update agent status', () => {
      agents.updateAgentStatus('agent-1', 'running', 'description', 'cmd', 'job-1', '2026-03-21', 'msg', 'mqtt', 'display');
      const agent = agents.getAgent('agent-1');
      expect(agent.status).toBe('running');
    });

    it('should update agent with all fields', () => {
      const now = new Date().toISOString();
      agents.updateAgentStatus('agent-1', 'online', 'new desc', 'new-cmd', 'job-name', now, 'test msg', 'mqtt', 'new-display');
      
      const agent = agents.getAgent('agent-1');
      expect(agent.description).toBe('new desc');
      expect(agent.command).toBe('new-cmd');
      expect(agent.jobName).toBe('job-name');
      expect(agent.display).toBe('new-display');
    });

    it('should set lastStatusReport timestamp', () => {
      agents.updateAgentStatus('agent-1', 'online');
      const agent = agents.getAgent('agent-1');
      expect(agent.lastStatusReport).toBeDefined();
    });
  });

  describe('deleteAgent()', () => {
    beforeEach(async () => {
      await agents.init();
    });

    it('should delete an agent', async () => {
      await agents.deleteAgent('agent-1');
      const agent = agents.getAgent('agent-1');
      expect(agent).toBeUndefined();
    });

    it('should persist deletion to config', async () => {
      await agents.deleteAgent('agent-1');
      expect(fs.promises.writeFile).toHaveBeenCalled();
    });
  });

  describe('getDict()', () => {
    beforeEach(async () => {
      await agents.init();
    });

    it('should return agents dictionary', () => {
      const dict = agents.getDict();
      expect(dict).toBeTruthy();
      expect(typeof dict).toBe('object');
    });

    it('should contain initialized agents', () => {
      const dict = agents.getDict();
      expect(Object.keys(dict).length).toBeGreaterThan(0);
    });
  });

  describe('addToAgentStatusDict()', () => {
    it('should add agent from JSON string', async () => {
      const agentJson = JSON.stringify({
        name: 'test-agent',
        status: 'online',
        description: 'Test',
      });

      await agents.addToAgentStatusDict(agentJson);
      const agent = agents.getAgent('test-agent');
      expect(agent).toBeTruthy();
    });

    it('should throw on invalid JSON', async () => {
      await expect(agents.addToAgentStatusDict('invalid json')).rejects.toThrow();
    });
  });

  describe('addObjToAgentStatusDict()', () => {
    it('should add agent from object', async () => {
      const agentObj = {
        name: 'obj-agent',
        status: 'online',
        description: 'Test',
      };

      await agents.addObjToAgentStatusDict(agentObj);
      const agent = agents.getAgent('obj-agent');
      expect(agent).toBeTruthy();
      expect(agent.status).toBe('online');
    });

    it('should set isOnline property correctly', async () => {
      const agentObj = {
        name: 'test',
        status: 'online',
      };

      await agents.addObjToAgentStatusDict(agentObj);
      const agent = agents.getAgent('test');
      expect(agent.isOnline).toBe('true');
    });

    it('should handle agents with no status', async () => {
      const agentObj = {
        name: 'no-status',
      };

      await agents.addObjToAgentStatusDict(agentObj);
      const agent = agents.getAgent('no-status');
      expect(agent.isOnline).toBe('UNKNOWN');
    });
  });
});
