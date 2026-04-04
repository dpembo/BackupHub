/**
 * Trigger Context Unit Tests
 * 
 * Tests the trigger context system:
 * - Creating rule trigger contexts
 * - Creating webhook trigger contexts
 * - Converting contexts to environment variables
 * - Template substitution
 * - Trigger context validation
 */

const triggerContext = require('../../triggerContext.js');

describe('Trigger Context Module', () => {
  describe('createRuleTriggerContext()', () => {
    it('should create a valid rule trigger context', () => {
      const ruleId = 'rule-123';
      const jobId = 'job-1';
      const metricResult = {
        type: 'cpu_usage',
        value: 85,
        unit: '%',
        agent: 'agent-1',
        path: null,
        pattern: null,
      };
      const ruleCondition = {
        operator: '>=',
        threshold: 80,
      };
      const executionId = 'exec-abc123';

      const context = triggerContext.createRuleTriggerContext(
        ruleId,
        jobId,
        metricResult,
        ruleCondition,
        executionId
      );

      expect(context).toBeDefined();
      expect(context.type).toBe('rule');
      expect(context.ruleId).toBe(ruleId);
      expect(context.jobId).toBe(jobId);
      expect(context.executionId).toBe(executionId);
      expect(context.timestamp).toBeDefined();
      expect(context.metric).toBeDefined();
      expect(context.condition).toBeDefined();
    });

    it('should include metric data correctly', () => {
      const metricResult = {
        type: 'mount_usage',
        value: 92.5,
        unit: '%',
        agent: 'agent-1',
        path: '/data',
        pattern: null,
      };

      const context = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        metricResult,
        { operator: '>', threshold: 90 },
        'exec1'
      );

      expect(context.metric.type).toBe('mount_usage');
      expect(context.metric.value).toBe(92.5);
      expect(context.metric.unit).toBe('%');
      expect(context.metric.agent).toBe('agent-1');
      expect(context.metric.path).toBe('/data');
    });

    it('should calculate change percent when previousValue exists', () => {
      const metricResult = {
        type: 'cpu_usage',
        value: 100,
        unit: '%',
        agent: 'agent-1',
        path: null,
        pattern: null,
        previousValue: 80,
      };

      const context = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        metricResult,
        { operator: '>', threshold: 90 },
        'exec1'
      );

      expect(context.metric.changePercent).toBe(25); // (100-80)/80 * 100 = 25%
      expect(context.metric.previousValue).toBe(80);
    });

    it('should set changePercent to null when no previousValue', () => {
      const metricResult = {
        type: 'cpu_usage',
        value: 85,
        unit: '%',
        agent: 'agent-1',
        path: null,
        pattern: null,
      };

      const context = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        metricResult,
        { operator: '>', threshold: 80 },
        'exec1'
      );

      expect(context.metric.changePercent).toBeNull();
      expect(context.metric.previousValue).toBeNull();
    });

    it('should include condition metadata with triggered flag', () => {
      const ruleCondition = {
        operator: '>=',
        threshold: 90,
      };

      const context = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        { type: 'cpu', value: 95, unit: '%', agent: 'a1', path: null, pattern: null },
        ruleCondition,
        'exec1'
      );

      expect(context.condition.operator).toBe('>=');
      expect(context.condition.threshold).toBe(90);
      expect(context.condition.triggered).toBe(true);
      expect(context.condition.message).toBeDefined();
    });

    it('should create ISO timestamp', () => {
      const before = new Date();
      const context = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        { type: 'cpu', value: 80, unit: '%', agent: 'a1', path: null, pattern: null },
        { operator: '>', threshold: 75 },
        'exec1'
      );
      const after = new Date();

      const contextTime = new Date(context.timestamp);
      expect(contextTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(contextTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should handle file count metric without unit default', () => {
      const metricResult = {
        type: 'file_count',
        value: 1500,
        unit: 'count',
        agent: 'agent-1',
        path: '/data',
        pattern: '*.log',
      };

      const context = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        metricResult,
        { operator: '>', threshold: 1000 },
        'exec1'
      );

      expect(context.metric.type).toBe('file_count');
      expect(context.metric.value).toBe(1500);
      expect(context.metric.unit).toBe('count');
    });
  });

  describe('createWebhookTriggerContext()', () => {
    it('should create a valid webhook trigger context', () => {
      const webhookId = 'webhook-123';
      const jobId = 'job-1';
      const payload = { severity: 'high', message: 'Alert!' };
      const executionId = 'exec-abc123';

      const context = triggerContext.createWebhookTriggerContext(
        webhookId,
        jobId,
        payload,
        executionId
      );

      expect(context).toBeDefined();
      expect(context.type).toBe('webhook');
      expect(context.webhookId).toBe(webhookId);
      expect(context.jobId).toBe(jobId);
      expect(context.executionId).toBe(executionId);
      expect(context.timestamp).toBeDefined();
      expect(context.webhook).toBeDefined();
    });

    it('should store webhook payload intact', () => {
      const payload = {
        severity: 'critical',
        alertType: 'disk_full',
        mountPoint: '/data',
        usedPercent: 95,
        timestamp: '2026-04-04T10:30:00Z',
      };

      const context = triggerContext.createWebhookTriggerContext(
        'webhook1',
        'job1',
        payload,
        'exec1'
      );

      expect(context.webhook.payload).toEqual(payload);
      expect(context.webhook.payload.severity).toBe('critical');
      expect(context.webhook.payload.mountPoint).toBe('/data');
    });

    it('should record receivedAt timestamp', () => {
      const before = new Date();
      const context = triggerContext.createWebhookTriggerContext(
        'webhook1',
        'job1',
        { test: true },
        'exec1'
      );
      const after = new Date();

      const receivedTime = new Date(context.webhook.receivedAt);
      expect(receivedTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(receivedTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should handle complex nested payload', () => {
      const payload = {
        event: 'deployment',
        repository: {
          name: 'my-app',
          url: 'https://github.com/demo/my-app',
          branch: 'main',
        },
        deployment: {
          id: 'dep-12345',
          environment: 'production',
          status: 'success',
          timestamp: '2026-04-04T10:30:00Z',
        },
        commit: {
          sha: 'abc123def456',
          message: 'Deploy version 2.0',
        },
      };

      const context = triggerContext.createWebhookTriggerContext(
        'webhook1',
        'job1',
        payload,
        'exec1'
      );

      expect(context.webhook.payload).toEqual(payload);
      expect(context.webhook.payload.repository.name).toBe('my-app');
      expect(context.webhook.payload.deployment.status).toBe('success');
    });

    it('should have source set to webhook', () => {
      const context = triggerContext.createWebhookTriggerContext(
        'webhook1',
        'job1',
        { test: true },
        'exec1'
      );

      expect(context.source).toBe('webhook');
    });
  });

  describe('contextToEnvVars()', () => {
    it('should convert rule context to environment variables', () => {
      const ruleMeta = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        { type: 'cpu_usage', value: 85, unit: '%', agent: 'a1', path: null, pattern: null },
        { operator: '>=', threshold: 80 },
        'exec-123'
      );

      const envVars = triggerContext.contextToEnvVars(ruleMeta);

      expect(envVars.BACKUPHUB_TRIGGER_TYPE).toBe('rule');
      expect(envVars.BACKUPHUB_EXECUTION_ID).toBe('exec-123');
      expect(envVars.BACKUPHUB_METRIC_TYPE).toBe('cpu_usage');
      expect(envVars.BACKUPHUB_METRIC_VALUE).toBe('85');
      expect(envVars.BACKUPHUB_METRIC_UNIT).toBe('%');
      expect(envVars.BACKUPHUB_CONDITION_OPERATOR).toBe('>=');
      expect(envVars.BACKUPHUB_CONDITION_THRESHOLD).toBe('80');
    });

    it('should include full context as JSON', () => {
      const webhookContext = triggerContext.createWebhookTriggerContext(
        'webhook1',
        'job1',
        { severity: 'high' },
        'exec-123'
      );

      const envVars = triggerContext.contextToEnvVars(webhookContext);

      expect(envVars.BACKUPHUB_TRIGGER_CONTEXT).toBeDefined();
      const parsed = JSON.parse(envVars.BACKUPHUB_TRIGGER_CONTEXT);
      expect(parsed.type).toBe('webhook');
      expect(parsed.webhook.payload.severity).toBe('high');
    });

    it('should convert webhook context to environment variables', () => {
      const webhookCtx = triggerContext.createWebhookTriggerContext(
        'webhook-123',
        'job1',
        { alert: 'test' },
        'exec-123'
      );

      const envVars = triggerContext.contextToEnvVars(webhookCtx);

      expect(envVars.BACKUPHUB_TRIGGER_TYPE).toBe('webhook');
      expect(envVars.BACKUPHUB_WEBHOOK_ID).toBe('webhook-123');
      expect(envVars.BACKUPHUB_WEBHOOK_PAYLOAD).toBeDefined();
      const payload = JSON.parse(envVars.BACKUPHUB_WEBHOOK_PAYLOAD);
      expect(payload.alert).toBe('test');
    });

    it('should handle null/undefined context gracefully', () => {
      expect(triggerContext.contextToEnvVars(null)).toEqual({});
      expect(triggerContext.contextToEnvVars(undefined)).toEqual({});
    });

    it('should include timestamp in env vars', () => {
      const ctx = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        { type: 'cpu', value: 80, unit: '%', agent: 'a1', path: null, pattern: null },
        { operator: '>', threshold: 75 },
        'exec1'
      );

      const envVars = triggerContext.contextToEnvVars(ctx);

      expect(envVars.BACKUPHUB_TRIGGER_TIMESTAMP).toBeDefined();
    });

    it('should convert numeric values to strings', () => {
      const ctx = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        { type: 'metric', value: 123.45, unit: 'units', agent: 'a1', path: null, pattern: null },
        { operator: '>=', threshold: 100 },
        'exec1'
      );

      const envVars = triggerContext.contextToEnvVars(ctx);

      expect(typeof envVars.BACKUPHUB_METRIC_VALUE).toBe('string');
      expect(envVars.BACKUPHUB_METRIC_VALUE).toBe('123.45');
      expect(typeof envVars.BACKUPHUB_CONDITION_THRESHOLD).toBe('string');
      expect(envVars.BACKUPHUB_CONDITION_THRESHOLD).toBe('100');
    });

    it('should handle undefined metric values', () => {
      const ctx = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        { type: 'metric', value: undefined, unit: '%', agent: '1', path: null, pattern: null },
        { operator: '>', threshold: 50 },
        'exec1'
      );

      const envVars = triggerContext.contextToEnvVars(ctx);

      expect(envVars.BACKUPHUB_METRIC_VALUE).toBe('');
    });
  });

  describe('isValidTriggerContext()', () => {
    it('should accept valid rule context', () => {
      const context = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        { type: 'cpu', value: 85, unit: '%', agent: 'a1', path: null, pattern: null },
        { operator: '>=', threshold: 80 },
        'exec1'
      );

      expect(triggerContext.isValidTriggerContext(context)).toBe(true);
    });

    it('should accept valid webhook context', () => {
      const context = triggerContext.createWebhookTriggerContext(
        'webhook1',
        'job1',
        { alert: 'test' },
        'exec1'
      );

      expect(triggerContext.isValidTriggerContext(context)).toBe(true);
    });

    it('should reject null or undefined', () => {
      expect(triggerContext.isValidTriggerContext(null)).toBe(false);
      expect(triggerContext.isValidTriggerContext(undefined)).toBe(false);
    });

    it('should reject non-object types', () => {
      expect(triggerContext.isValidTriggerContext('string')).toBe(false);
      expect(triggerContext.isValidTriggerContext(123)).toBe(false);
      expect(triggerContext.isValidTriggerContext([])).toBe(false);
    });

    it('should reject invalid context type', () => {
      const invalidContext = {
        type: 'invalid',
        timestamp: new Date().toISOString(),
        executionId: 'exec1',
      };

      expect(triggerContext.isValidTriggerContext(invalidContext)).toBe(false);
    });

    it('should reject context missing required fields', () => {
      const incompleteContext = {
        type: 'rule',
        // Missing timestamp and executionId
      };

      expect(triggerContext.isValidTriggerContext(incompleteContext)).toBe(false);
    });

    it('should reject rule context without metric and condition', () => {
      const invalidRuleContext = {
        type: 'rule',
        timestamp: new Date().toISOString(),
        executionId: 'exec1',
        // Missing metric and condition
      };

      expect(triggerContext.isValidTriggerContext(invalidRuleContext)).toBe(false);
    });

    it('should reject webhook context without webhook payload', () => {
      const invalidWebhookContext = {
        type: 'webhook',
        timestamp: new Date().toISOString(),
        executionId: 'exec1',
        webhookId: 'webhook1',
        // Missing webhook
      };

      expect(triggerContext.isValidTriggerContext(invalidWebhookContext)).toBe(false);
    });
  });

  describe('substituteTemplate()', () => {
    it('should substitute rule metric values', () => {
      const context = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        { type: 'cpu_usage', value: 92, unit: '%', agent: 'agent-1', path: null, pattern: null },
        { operator: '>=', threshold: 90 },
        'exec1'
      );

      const template = '--threshold #{context.condition.threshold}';
      const result = triggerContext.substituteTemplate(template, context);

      expect(result).toBe('--threshold 90');
    });

    it('should substitute webhook payload values', () => {
      const context = triggerContext.createWebhookTriggerContext(
        'webhook1',
        'job1',
        { severity: 'high', message: 'Disk full' },
        'exec1'
      );

      const template = 'Alert: #{context.webhook.payload.message}';
      const result = triggerContext.substituteTemplate(template, context);

      expect(result).toBe('Alert: Disk full');
    });

    it('should substitute multiple placeholders', () => {
      const context = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        { type: 'mount_usage', value: 95.5, unit: '%', agent: 'agent-1', path: '/data', pattern: null },
        { operator: '>=', threshold: 90 },
        'exec1'
      );

      const template = '--path #{context.metric.path} --usage #{context.metric.value} --threshold #{context.condition.threshold}';
      const result = triggerContext.substituteTemplate(template, context);

      expect(result).toBe('--path /data --usage 95.5 --threshold 90');
    });

    it('should not affect template without placeholders', () => {
      const context = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        { type: 'cpu', value: 80, unit: '%', agent: 'a1', path: null, pattern: null },
        { operator: '>', threshold: 75 },
        'exec1'
      );

      const template = '--no-substitution --plain-text';
      const result = triggerContext.substituteTemplate(template, context);

      expect(result).toBe(template);
    });

    it('should leave unmatched placeholders unchanged', () => {
      const context = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        { type: 'cpu', value: 80, unit: '%', agent: 'a1', path: null, pattern: null },
        { operator: '>', threshold: 75 },
        'exec1'
      );

      const template = '--threshold #{context.condition.threshold} --missing #{context.nonexistent.field}';
      const result = triggerContext.substituteTemplate(template, context);

      expect(result).toContain('--threshold 75');
      expect(result).toContain('#{context.nonexistent.field}');
    });

    it('should handle nested path substitution', () => {
      const context = triggerContext.createWebhookTriggerContext(
        'webhook1',
        'job1',
        {
          deployment: {
            environment: 'production',
            version: 'v2.0',
          },
        },
        'exec1'
      );

      const template = 'Deploy #{context.webhook.payload.deployment.environment} version #{context.webhook.payload.deployment.version}';
      const result = triggerContext.substituteTemplate(template, context);

      expect(result).toBe('Deploy production version v2.0');
    });

    it('should stringify objects as JSON', () => {
      const context = triggerContext.createWebhookTriggerContext(
        'webhook1',
        'job1',
        { alert: { severity: 'high', code: 500 } },
        'exec1'
      );

      const template = 'Alert details: #{context.webhook.payload.alert}';
      const result = triggerContext.substituteTemplate(template, context);

      expect(result).toContain('"severity":"high"');
      expect(result).toContain('"code":500');
    });

    it('should handle null/undefined template gracefully', () => {
      const context = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        { type: 'cpu', value: 80, unit: '%', agent: 'a1', path: null, pattern: null },
        { operator: '>', threshold: 75 },
        'exec1'
      );

      expect(triggerContext.substituteTemplate(null, context)).toBe(null);
      expect(triggerContext.substituteTemplate(undefined, context)).toBe(undefined);
      expect(triggerContext.substituteTemplate('', context)).toBe('');
    });

    it('should handle non-string template gracefully', () => {
      const context = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        { type: 'cpu', value: 80, unit: '%', agent: 'a1', path: null, pattern: null },
        { operator: '>', threshold: 75 },
        'exec1'
      );

      expect(triggerContext.substituteTemplate(123, context)).toBe(123);
      expect(triggerContext.substituteTemplate({}, context)).toEqual({});
    });

    it('should handle context as parameter placeholder', () => {
      const context = triggerContext.createWebhookTriggerContext(
        'webhook1',
        'job1',
        { severity: 'critical', message: 'Database error' },
        'exec1'
      );

      const template = 'Full payload: #{context.webhook.payload}';
      const result = triggerContext.substituteTemplate(template, context);

      expect(result).toContain('"severity":"critical"');
      expect(result).toContain('"message":"Database error"');
    });

    it('should convert primitive values to strings', () => {
      const context = triggerContext.createRuleTriggerContext(
        'rule1',
        'job1',
        { type: 'metric', value: 123, unit: '%', agent: 'a1', path: null, pattern: null },
        { operator: '>=', threshold: 100 },
        'exec1'
      );

      const template = '--count #{context.metric.value}';
      const result = triggerContext.substituteTemplate(template, context);

      expect(result).toBe('--count 123');
      expect(typeof result).toBe('string');
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete rule trigger workflow', () => {
      // Create context
      const context = triggerContext.createRuleTriggerContext(
        'cpu_rule',
        'cleanup_job',
        {
          type: 'cpu_usage',
          value: 95,
          unit: '%',
          agent: 'backup-agent-1',
          path: null,
          pattern: null,
          previousValue: 88,
        },
        { operator: '>=', threshold: 90 },
        'exec-12345'
      );

      // Validate
      expect(triggerContext.isValidTriggerContext(context)).toBe(true);

      // Convert to env vars
      const envVars = triggerContext.contextToEnvVars(context);
      expect(envVars.BACKUPHUB_TRIGGER_TYPE).toBe('rule');
      expect(envVars.BACKUPHUB_METRIC_VALUE).toBe('95');

      // Substitute template
      const template = '--agent #{context.metric.agent} --value #{context.metric.value} --threshold #{context.condition.threshold} --change #{context.metric.changePercent}%';
      const result = triggerContext.substituteTemplate(template, context);
      // changePercent calculation: ((95-88)/88)*100 = ~7.95 rounded to 1 decimal = 8.0
      expect(result).toContain('--agent backup-agent-1');
      expect(result).toContain('--value 95');
      expect(result).toContain('--threshold 90');
    });

    it('should handle complete webhook trigger workflow', () => {
      // Create context
      const context = triggerContext.createWebhookTriggerContext(
        'alert_webhook',
        'emergency_backup',
        {
          eventType: 'threshold_exceeded',
          severity: 'critical',
          metric: 'disk_usage',
          value: 98,
          mountPoint: '/backup',
          timestamp: '2026-04-04T10:30:00Z',
        },
        'exec-67890'
      );

      // Validate
      expect(triggerContext.isValidTriggerContext(context)).toBe(true);

      // Convert to env vars
      const envVars = triggerContext.contextToEnvVars(context);
      expect(envVars.BACKUPHUB_TRIGGER_TYPE).toBe('webhook');

      // Substitute template
      const template = '--severity #{context.webhook.payload.severity} --mount #{context.webhook.payload.mountPoint} --usage #{context.webhook.payload.value}%';
      const result = triggerContext.substituteTemplate(template, context);
      expect(result).toBe('--severity critical --mount /backup --usage 98%');
    });
  });
});
