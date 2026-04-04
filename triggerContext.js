/**
 * Trigger Context Utility
 * 
 * Manages the structured format for rule-triggered and webhook-triggered job execution.
 * Provides methods to create, validate, and extract context for use in scripts and orchestrations.
 */

/**
 * Create a trigger context from a rule evaluation result
 * @param {string} ruleId - Unique rule identifier
 * @param {string} jobId - Job being triggered
 * @param {object} metricResult - Result from metric query
 * @param {object} ruleCondition - Rule condition definition
 * @param {string} executionId - Execution ID for tracking
 * @returns {object} Structured trigger context
 */
function createRuleTriggerContext(ruleId, jobId, metricResult, ruleCondition, executionId) {
  return {
    type: 'rule',
    ruleId,
    jobId,
    executionId,
    timestamp: new Date().toISOString(),
    source: 'rule',
    metric: {
      type: metricResult.type,
      agent: metricResult.agent,
      path: metricResult.path,
      pattern: metricResult.pattern,
      value: metricResult.value,
      unit: metricResult.unit || '%',
      previousValue: metricResult.previousValue || null,
      changePercent: metricResult.previousValue ? 
        Math.round(((metricResult.value - metricResult.previousValue) / metricResult.previousValue) * 100 * 10) / 10 
        : null
    },
    condition: {
      operator: ruleCondition.operator,
      threshold: ruleCondition.threshold,
      triggered: true,
      message: `Metric ${metricResult.type} (${metricResult.value}${metricResult.unit}) triggered rule with ${ruleCondition.operator} ${ruleCondition.threshold}`
    }
  };
}

/**
 * Create a trigger context from a webhook payload
 * @param {string} webhookId - Webhook identifier
 * @param {string} jobId - Job being triggered
 * @param {object} payload - Arbitrary JSON payload from webhook
 * @param {string} executionId - Execution ID for tracking
 * @returns {object} Structured trigger context
 */
function createWebhookTriggerContext(webhookId, jobId, payload, executionId) {
  return {
    type: 'webhook',
    webhookId,
    jobId,
    executionId,
    timestamp: new Date().toISOString(),
    source: 'webhook',
    webhook: {
      payload,
      receivedAt: new Date().toISOString()
    }
  };
}

/**
 * Create a test/sample context for orchestration builder
 * @param {string} sampleName - Name of the sample
 * @param {object} sampleData - Sample data structure
 * @returns {object} Sample trigger context
 */
function createSampleTriggerContext(sampleName, sampleData) {
  return {
    type: 'sample',
    sampleName,
    timestamp: new Date().toISOString(),
    source: 'test',
    ...sampleData
  };
}

/**
 * Convert trigger context to environment variables for script execution
 * Flattens the nested structure into simple env var format
 * @param {object} triggerContext - Trigger context object
 * @returns {object} Key-value pairs for environment variables
 */
function contextToEnvVars(triggerContext) {
  if (!triggerContext) return {};

  const envVars = {
    BACKUPHUB_TRIGGER_TYPE: triggerContext.type,
    BACKUPHUB_TRIGGER_TIMESTAMP: triggerContext.timestamp,
    BACKUPHUB_EXECUTION_ID: triggerContext.executionId || '',
  };

  // Rule-specific env vars
  if (triggerContext.type === 'rule' && triggerContext.metric) {
    envVars.BACKUPHUB_TRIGGER_RULE_ID = triggerContext.ruleId || '';
    envVars.BACKUPHUB_METRIC_TYPE = triggerContext.metric.type || '';
    envVars.BACKUPHUB_METRIC_VALUE = String(triggerContext.metric.value !== undefined ? triggerContext.metric.value : '');
    envVars.BACKUPHUB_METRIC_UNIT = triggerContext.metric.unit || '%';
    envVars.BACKUPHUB_METRIC_PATH = triggerContext.metric.path || '';
    envVars.BACKUPHUB_METRIC_PATTERN = triggerContext.metric.pattern || '';
    envVars.BACKUPHUB_METRIC_PREVIOUS_VALUE = String(triggerContext.metric.previousValue !== null && triggerContext.metric.previousValue !== undefined ? triggerContext.metric.previousValue : '');
    envVars.BACKUPHUB_METRIC_CHANGE_PERCENT = String(triggerContext.metric.changePercent !== null && triggerContext.metric.changePercent !== undefined ? triggerContext.metric.changePercent : '');
    envVars.BACKUPHUB_METRIC_AGENT = triggerContext.metric.agent || '';
    envVars.BACKUPHUB_CONDITION_OPERATOR = triggerContext.condition.operator || '';
    envVars.BACKUPHUB_CONDITION_THRESHOLD = String(triggerContext.condition.threshold || '');
  }

  // Webhook-specific env vars
  if (triggerContext.type === 'webhook' && triggerContext.webhook) {
    envVars.BACKUPHUB_WEBHOOK_ID = triggerContext.webhookId || '';
    envVars.BACKUPHUB_WEBHOOK_PAYLOAD = JSON.stringify(triggerContext.webhook.payload);
    envVars.BACKUPHUB_WEBHOOK_RECEIVED_AT = triggerContext.webhook.receivedAt || '';
  }

  // Always include full context as JSON for advanced users
  envVars.BACKUPHUB_TRIGGER_CONTEXT = JSON.stringify(triggerContext);

  return envVars;
}

/**
 * Validate trigger context structure
 * @param {object} context - Context to validate
 * @returns {boolean} Whether context is valid
 */
function isValidTriggerContext(context) {
  if (!context || typeof context !== 'object') return false;
  
  const validTypes = ['rule', 'webhook', 'sample'];
  if (!validTypes.includes(context.type)) return false;
  
  if (!context.timestamp || !context.executionId) return false;
  
  // Type-specific validation
  if (context.type === 'rule') {
    return !!(context.metric && context.condition && context.ruleId);
  }
  
  if (context.type === 'webhook') {
    return !!(context.webhook && context.webhook.payload && context.webhookId);
  }
  
  if (context.type === 'sample') {
    return !!context.sampleName;
  }
  
  return true;
}

/**
 * Extract metric value from context for template substitution
 * Supports path notation like "#{context.metric.value}"
 * @param {object} context - Trigger context
 * @param {string} path - Dot-notation path (e.g., "metric.value")
 * @returns {any} Value at path, or null if not found
 */
function getValue(context, path) {
  if (!context || !path) return null;
  
  const parts = path.split('.');
  let current = context;
  
  for (const part of parts) {
    if (current === null || current === undefined) return null;
    current = current[part];
  }
  
  return current;
}

/**
 * Substitute template placeholders with context values
 * Supports #{context.metric.value}, #{context.condition.threshold}, etc.
 * @param {string} template - Template string with placeholders
 * @param {object} context - Trigger context
 * @returns {string} Substituted string
 */
function substituteTemplate(template, context) {
  if (!template || typeof template !== 'string') return template;
  
  return template.replace(/#{context\.([^}]+)}/g, (match, path) => {
    const value = getValue(context, path);
    if (value !== null && value !== undefined) {
      // Use JSON.stringify for objects, String() for primitives
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
    return match;
  });
}

/**
 * Sample templates for orchestration builder testing
 */
const SAMPLE_TEMPLATES = {
  cpu_spike: {
    name: 'CPU Spike (95%)',
    icon: 'trending_up',
    context: {
      type: 'rule',
      ruleId: 'cpu-monitor-95',
      metric: {
        type: 'cpu',
        agent: 'agent1',
        value: 95,
        unit: '%',
        previousValue: 45,
        changePercent: 111.1
      },
      condition: {
        operator: '>=',
        threshold: 90,
        triggered: true,
        message: 'CPU usage exceeded 90% threshold'
      }
    }
  },
  
  storage_full: {
    name: 'Storage Full (98%)',
    icon: 'storage',
    context: {
      type: 'rule',
      ruleId: 'mount-monitor-98',
      metric: {
        type: 'mount_usage',
        agent: 'agent1',
        path: '/mnt/data',
        value: 98,
        unit: '%',
        previousValue: 92,
        changePercent: 6.5
      },
      condition: {
        operator: '>=',
        threshold: 90,
        triggered: true,
        message: 'Mount usage exceeded 90% threshold'
      }
    }
  },
  
  files_old: {
    name: 'Old Files Detected (90 days)',
    icon: 'history',
    context: {
      type: 'rule',
      ruleId: 'file-age-monitor',
      metric: {
        type: 'file_age',
        agent: 'agent1',
        path: '/archive',
        value: 90,
        unit: 'days',
        previousValue: null,
        changePercent: null
      },
      condition: {
        operator: '>=',
        threshold: 60,
        triggered: true,
        message: 'Files older than 60 days detected'
      }
    }
  },
  
  file_count_high: {
    name: 'High File Count (5000 files)',
    icon: 'folder_special',
    context: {
      type: 'rule',
      ruleId: 'file-count-monitor',
      metric: {
        type: 'file_count',
        agent: 'agent1',
        path: '/data/cache',
        pattern: '*.tmp',
        value: 5000,
        unit: 'files',
        previousValue: 2800,
        changePercent: 78.6
      },
      condition: {
        operator: '>=',
        threshold: 3000,
        triggered: true,
        message: 'File count exceeded 3000 threshold'
      }
    }
  },
  
  webhook_example: {
    name: 'Webhook Payload (Example)',
    icon: 'webhook',
    context: {
      type: 'webhook',
      webhookId: 'webhook-12345',
      payload: {
        event: 'backup_notification',
        status: 'warning',
        message: 'Backup storage at 85% capacity',
        data: {
          path: '/backups',
          used: 850,
          total: 1000
        }
      }
    }
  }
};

module.exports = {
  createRuleTriggerContext,
  createWebhookTriggerContext,
  createSampleTriggerContext,
  contextToEnvVars,
  isValidTriggerContext,
  getValue,
  substituteTemplate,
  SAMPLE_TEMPLATES
};
