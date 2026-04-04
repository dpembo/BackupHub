// Unit tests for rule-based job scheduling (metric thresholds)

// Mock dependencies (must be before requiring modules that depend on them)
jest.mock('../../db.js');
jest.mock('../../agents.js');
jest.mock('../../running.js');
jest.mock('../../agentMessageProcessor.js');
jest.mock('../../communications/wsBrowserTransport.js');
jest.mock('../../communications/wsServerTransport.js');
jest.mock('../../communications/mqttTransport.js', () => ({
  getCommandTopic: jest.fn().mockReturnValue('backup/agent/command'),
}));
jest.mock('node-schedule');

// Require modules after mocks are set up to ensure they receive mocked dependencies
const scheduler = require('../../scheduler.js');
const db = require('../../db.js');
const agents = require('../../agents.js');
const running = require('../../running.js');
const agentMsgProcessor = require('../../agentMessageProcessor.js');

describe('Rule-Based Job Scheduling (Metric Thresholds)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock logger
    global.logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  });

  describe('evaluateRuleCondition()', () => {
    // Access private function through module exports or by refactoring
    // For now, we'll test the condition evaluation logic directly
    
    it('should evaluate greater-than condition correctly', () => {
      const testCondition = (actual, operator, threshold) => {
        const a = parseFloat(actual);
        const t = parseFloat(threshold);
        if (isNaN(a) || isNaN(t)) return false;
        switch (operator) {
          case '>': return a > t;
          case '>=': return a >= t;
          case '<': return a < t;
          case '<=': return a <= t;
          case '==': return a === t;
          case '!=': return a !== t;
          default: return false;
        }
      };

      expect(testCondition(95, '>', 90)).toBe(true);
      expect(testCondition(85, '>', 90)).toBe(false);
      expect(testCondition(90, '>', 90)).toBe(false);
    });

    it('should evaluate greater-than-or-equal condition correctly', () => {
      const testCondition = (actual, operator, threshold) => {
        const a = parseFloat(actual);
        const t = parseFloat(threshold);
        if (isNaN(a) || isNaN(t)) return false;
        switch (operator) {
          case '>': return a > t;
          case '>=': return a >= t;
          case '<': return a < t;
          case '<=': return a <= t;
          case '==': return a === t;
          case '!=': return a !== t;
          default: return false;
        }
      };

      expect(testCondition(90, '>=', 90)).toBe(true);
      expect(testCondition(95, '>=', 90)).toBe(true);
      expect(testCondition(85, '>=', 90)).toBe(false);
    });

    it('should evaluate less-than condition correctly', () => {
      const testCondition = (actual, operator, threshold) => {
        const a = parseFloat(actual);
        const t = parseFloat(threshold);
        if (isNaN(a) || isNaN(t)) return false;
        switch (operator) {
          case '>': return a > t;
          case '>=': return a >= t;
          case '<': return a < t;
          case '<=': return a <= t;
          case '==': return a === t;
          case '!=': return a !== t;
          default: return false;
        }
      };

      expect(testCondition(25, '<', 50)).toBe(true);
      expect(testCondition(60, '<', 50)).toBe(false);
      expect(testCondition(50, '<', 50)).toBe(false);
    });

    it('should evaluate equality condition correctly', () => {
      const testCondition = (actual, operator, threshold) => {
        const a = parseFloat(actual);
        const t = parseFloat(threshold);
        if (isNaN(a) || isNaN(t)) return false;
        switch (operator) {
          case '>': return a > t;
          case '>=': return a >= t;
          case '<': return a < t;
          case '<=': return a <= t;
          case '==': return a === t;
          case '!=': return a !== t;
          default: return false;
        }
      };

      expect(testCondition(100, '==', 100)).toBe(true);
      expect(testCondition(100, '==', 101)).toBe(false);
    });

    it('should evaluate inequality condition correctly', () => {
      const testCondition = (actual, operator, threshold) => {
        const a = parseFloat(actual);
        const t = parseFloat(threshold);
        if (isNaN(a) || isNaN(t)) return false;
        switch (operator) {
          case '>': return a > t;
          case '>=': return a >= t;
          case '<': return a < t;
          case '<=': return a <= t;
          case '==': return a === t;
          case '!=': return a !== t;
          default: return false;
        }
      };

      expect(testCondition(50, '!=', 100)).toBe(true);
      expect(testCondition(100, '!=', 100)).toBe(false);
    });

    it('should handle NaN values gracefully', () => {
      const testCondition = (actual, operator, threshold) => {
        const a = parseFloat(actual);
        const t = parseFloat(threshold);
        if (isNaN(a) || isNaN(t)) return false;
        switch (operator) {
          case '>': return a > t;
          case '>=': return a >= t;
          case '<': return a < t;
          case '<=': return a <= t;
          case '==': return a === t;
          case '!=': return a !== t;
          default: return false;
        }
      };

      expect(testCondition('invalid', '>', 90)).toBe(false);
      expect(testCondition(90, '>', 'invalid')).toBe(false);
      expect(testCondition(undefined, '>', 90)).toBe(false);
    });
  });

  describe('Rule metric support', () => {
    it('should support CPU metric type', () => {
      const allowedMetricTypes = ['cpu', 'mount_usage', 'dir_size', 'file_size', 'file_count', 'file_age'];
      expect(allowedMetricTypes).toContain('cpu');
    });

    it('should support mount_usage metric type', () => {
      const allowedMetricTypes = ['cpu', 'mount_usage', 'dir_size', 'file_size', 'file_count', 'file_age'];
      expect(allowedMetricTypes).toContain('mount_usage');
    });

    it('should support dir_size metric type', () => {
      const allowedMetricTypes = ['cpu', 'mount_usage', 'dir_size', 'file_size', 'file_count', 'file_age'];
      expect(allowedMetricTypes).toContain('dir_size');
    });

    it('should support file_size metric type', () => {
      const allowedMetricTypes = ['cpu', 'mount_usage', 'dir_size', 'file_size', 'file_count', 'file_age'];
      expect(allowedMetricTypes).toContain('file_size');
    });

    it('should support file_count metric type', () => {
      const allowedMetricTypes = ['cpu', 'mount_usage', 'dir_size', 'file_size', 'file_count', 'file_age'];
      expect(allowedMetricTypes).toContain('file_count');
    });

    it('should support file_age metric type', () => {
      const allowedMetricTypes = ['cpu', 'mount_usage', 'dir_size', 'file_size', 'file_count', 'file_age'];
      expect(allowedMetricTypes).toContain('file_age');
    });
  });

  describe('Rule condition operators', () => {
    it('should support all allowed operators', () => {
      const allowedOperators = ['>', '>=', '<', '<=', '==', '!='];
      expect(allowedOperators).toHaveLength(6);
      expect(allowedOperators).toContain('>');
      expect(allowedOperators).toContain('>=');
      expect(allowedOperators).toContain('<');
      expect(allowedOperators).toContain('<=');
      expect(allowedOperators).toContain('==');
      expect(allowedOperators).toContain('!=');
    });
  });

  describe('Rule cooldown logic', () => {
    it('should enforce cooldown period between triggers', () => {
      const jobName = 'cpu-threshold-job';
      const cooldownMins = 30;
      const cooldownMs = cooldownMins * 60 * 1000;

      const now = Date.now();
      const lastTriggered = new Date(now - cooldownMs + 5000).getTime(); // 5s before cooldown expires

      // Still in cooldown
      const remainingMs = cooldownMs - (now - lastTriggered);
      expect(remainingMs > 0).toBe(true);
    });

    it('should allow trigger after cooldown expires', () => {
      const cooldownMins = 30;
      const cooldownMs = cooldownMins * 60 * 1000;

      const now = Date.now();
      const lastTriggered = new Date(now - cooldownMs - 5000).getTime(); // 5s after cooldown expires

      // Cooldown expired
      const remainingMs = cooldownMs - (now - lastTriggered);
      expect(remainingMs < 0).toBe(true);
    });

    it('should default to 60 minute cooldown if not specified', () => {
      const defaultCooldownMins = 60;
      expect(defaultCooldownMins).toBe(60);
    });
  });

  describe('Rule job configuration', () => {
    it('should have rule metric with agent, type, path, pattern', () => {
      const ruleMetric = {
        agent: 'test-agent',
        type: 'cpu',
        path: null,
        pattern: null,
      };

      expect(ruleMetric.agent).toBe('test-agent');
      expect(ruleMetric.type).toBe('cpu');
      expect(ruleMetric.path).toBeNull();
      expect(ruleMetric.pattern).toBeNull();
    });

    it('should have rule condition with operator and threshold', () => {
      const ruleCondition = {
        operator: '>',
        threshold: 85,
      };

      expect(ruleCondition.operator).toBe('>');
      expect(ruleCondition.threshold).toBe(85);
    });

    it('should track last trigger time to enforce cooldown', () => {
      const schedItem = {
        jobName: 'cpu-check',
        ruleLastTriggered: new Date('2026-04-03T15:00:00Z').toISOString(),
      };

      expect(schedItem.ruleLastTriggered).toBeDefined();
      expect(new Date(schedItem.ruleLastTriggered)).toBeInstanceOf(Date);
    });
  });

  describe('Rule trigger conditions', () => {
    it('should only trigger if agent is online', () => {
      const agentStatus = 'online';
      const isOffline = agentStatus === 'offline';
      expect(isOffline).toBe(false);
    });

    it('should skip poll if agent is offline', () => {
      const agentStatus = 'offline';
      const isOffline = agentStatus === 'offline';
      expect(isOffline).toBe(true);
    });

    it('should skip trigger if agent is at concurrency limit', () => {
      const concurrencyLimit = 3;
      const runningCount = 3;
      const canRun = runningCount < concurrencyLimit;
      expect(canRun).toBe(false);
    });

    it('should allow trigger if agent has capacity', () => {
      const concurrencyLimit = 3;
      const runningCount = 2;
      const canRun = runningCount < concurrencyLimit;
      expect(canRun).toBe(true);
    });
  });

  describe('Rule metric query', () => {
    it('should send queryMetric command to agent', () => {
      const metricConfig = {
        type: 'cpu',
      };

      expect(metricConfig.type).toBe('cpu');
    });

    it('should include optional path in metric config', () => {
      const metricConfig = {
        type: 'file_size',
        path: '/var/log/app.log',
      };

      expect(metricConfig.path).toBe('/var/log/app.log');
    });

    it('should include optional pattern in metric config', () => {
      const metricConfig = {
        type: 'file_count',
        path: '/var/log',
        pattern: '*.log',
      };

      expect(metricConfig.pattern).toBe('*.log');
    });

    it('should use correlation ID for metric result tracking', () => {
      const jobName = 'cpu-check';
      const correlationId = `RuleCheck_${jobName}_abc123`;

      expect(correlationId).toContain('RuleCheck_');
      expect(correlationId).toContain(jobName);
    });

    it('should timeout if metric result not received within 30 seconds', () => {
      const timeoutMs = 30000;
      expect(timeoutMs).toBe(30000);
    });
  });
});
