/**
 * Webhook Manager Unit Tests
 * 
 * Tests the core webhook management functions:
 * - API key generation
 * - Webhook creation
 * - Key validation and rotation
 * - Trigger tracking
 */

const webhookManager = require('../../webhookManager.js');
const crypto = require('crypto');

describe('Webhook Manager Module', () => {
  describe('generateWebhookKey()', () => {
    it('should generate a valid UUID v4 format key', () => {
      const key = webhookManager.generateWebhookKey();
      
      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
      // UUID v4 format check
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(key).toMatch(uuidRegex);
    });

    it('should generate unique keys on each call', () => {
      const key1 = webhookManager.generateWebhookKey();
      const key2 = webhookManager.generateWebhookKey();
      const key3 = webhookManager.generateWebhookKey();
      
      expect(key1).not.toBe(key2);
      expect(key2).not.toBe(key3);
      expect(key1).not.toBe(key3);
    });
  });

  describe('createWebhook()', () => {
    it('should create a webhook with required properties', () => {
      const jobId = 'test-job';
      const name = 'Test Webhook';
      const description = 'A test webhook';
      
      const webhook = webhookManager.createWebhook(jobId, name, description);
      
      expect(webhook).toBeDefined();
      expect(webhook.jobId).toBe(jobId);
      expect(webhook.name).toBe(name);
      expect(webhook.description).toBe(description);
    });

    it('should generate unique webhook IDs', () => {
      const webhook1 = webhookManager.createWebhook('job1', 'Webhook 1');
      const webhook2 = webhookManager.createWebhook('job1', 'Webhook 2');
      
      expect(webhook1.id).not.toBe(webhook2.id);
    });

    it('should initialize trigger tracking with zero count', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test');
      
      expect(webhook.triggerCount).toBe(0);
      expect(webhook.lastTriggeredAt).toBeNull();
    });

    it('should set isActive to true by default', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test');
      
      expect(webhook.isActive).toBe(true);
    });

    it('should generate valid API key', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test');
      
      expect(webhookManager.isValidWebhookKey(webhook.apiKey)).toBe(true);
    });

    it('should set createdAt timestamp', () => {
      const beforeCreation = new Date();
      const webhook = webhookManager.createWebhook('job1', 'Test');
      const afterCreation = new Date();
      
      const createdAt = new Date(webhook.createdAt);
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime());
      expect(createdAt.getTime()).toBeLessThanOrEqual(afterCreation.getTime());
    });

    it('should handle empty description', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test');
      
      expect(webhook.description).toBe('');
    });

    it('should handle description parameter', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test', 'My description');
      
      expect(webhook.description).toBe('My description');
    });

    it('should have all required fields', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test', 'Desc');
      
      expect(webhook).toHaveProperty('id');
      expect(webhook).toHaveProperty('jobId');
      expect(webhook).toHaveProperty('name');
      expect(webhook).toHaveProperty('description');
      expect(webhook).toHaveProperty('apiKey');
      expect(webhook).toHaveProperty('createdAt');
      expect(webhook).toHaveProperty('lastTriggeredAt');
      expect(webhook).toHaveProperty('triggerCount');
      expect(webhook).toHaveProperty('isActive');
    });
  });

  describe('isValidWebhookKey()', () => {
    it('should validate correct UUID format', () => {
      const key = webhookManager.generateWebhookKey();
      
      expect(webhookManager.isValidWebhookKey(key)).toBe(true);
    });

    it('should reject null or undefined', () => {
      expect(webhookManager.isValidWebhookKey(null)).toBe(false);
      expect(webhookManager.isValidWebhookKey(undefined)).toBe(false);
    });

    it('should reject non-string types', () => {
      expect(webhookManager.isValidWebhookKey(123)).toBe(false);
      expect(webhookManager.isValidWebhookKey({})).toBe(false);
      expect(webhookManager.isValidWebhookKey([])).toBe(false);
    });

    it('should reject invalid UUID format', () => {
      expect(webhookManager.isValidWebhookKey('not-a-uuid')).toBe(false);
      expect(webhookManager.isValidWebhookKey('123-456-789')).toBe(false);
      expect(webhookManager.isValidWebhookKey('12345678-1234-1234-1234')).toBe(false);
      expect(webhookManager.isValidWebhookKey('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')).toBe(false);
    });

    it('should accept both uppercase and lowercase UUIDs', () => {
      const key = webhookManager.generateWebhookKey();
      
      expect(webhookManager.isValidWebhookKey(key.toUpperCase())).toBe(true);
      expect(webhookManager.isValidWebhookKey(key.toLowerCase())).toBe(true);
      expect(webhookManager.isValidWebhookKey(key.toUpperCase().substring(0, 13) + key.substring(13))).toBe(true);
    });

    it('should reject strings with extra spaces', () => {
      const key = webhookManager.generateWebhookKey();
      
      expect(webhookManager.isValidWebhookKey(' ' + key)).toBe(false);
      expect(webhookManager.isValidWebhookKey(key + ' ')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(webhookManager.isValidWebhookKey('')).toBe(false);
    });
  });

  describe('rotateWebhookKey()', () => {
    it('should generate a new API key', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test');
      const oldKey = webhook.apiKey;
      
      const rotated = webhookManager.rotateWebhookKey(webhook, oldKey);
      
      expect(rotated.apiKey).not.toBe(oldKey);
      expect(webhookManager.isValidWebhookKey(rotated.apiKey)).toBe(true);
    });

    it('should update keyRotatedAt timestamp', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test');
      const beforeRotation = new Date();
      
      const rotated = webhookManager.rotateWebhookKey(webhook, webhook.apiKey);
      
      const afterRotation = new Date();
      const keyRotatedAt = new Date(rotated.keyRotatedAt);
      
      expect(keyRotatedAt.getTime()).toBeGreaterThanOrEqual(beforeRotation.getTime());
      expect(keyRotatedAt.getTime()).toBeLessThanOrEqual(afterRotation.getTime());
    });

    it('should preserve other webhook properties', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test', 'Description');
      const oldId = webhook.id;
      const oldName = webhook.name;
      const oldJobId = webhook.jobId;
      
      const rotated = webhookManager.rotateWebhookKey(webhook, webhook.apiKey);
      
      expect(rotated.id).toBe(oldId);
      expect(rotated.name).toBe(oldName);
      expect(rotated.jobId).toBe(oldJobId);
    });

    it('should throw error if old key does not match', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test');
      const wrongKey = webhookManager.generateWebhookKey();
      
      expect(() => {
        webhookManager.rotateWebhookKey(webhook, wrongKey);
      }).toThrow('Invalid old webhook key provided');
    });

    it('should not modify webhook if key verification fails', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test');
      const originalKey = webhook.apiKey;
      
      try {
        webhookManager.rotateWebhookKey(webhook, webhookManager.generateWebhookKey());
      } catch (e) {
        // Expected to throw
      }
      
      expect(webhook.apiKey).toBe(originalKey);
    });

    it('should generate different keys on consecutive rotations', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test');
      const keys = [webhook.apiKey];
      
      for (let i = 0; i < 3; i++) {
        const rotated = webhookManager.rotateWebhookKey(webhook, webhook.apiKey);
        keys.push(rotated.apiKey);
        webhook.apiKey = rotated.apiKey;
      }
      
      // All keys should be unique
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });
  });

  describe('recordWebhookTrigger()', () => {
    it('should increment trigger count', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test');
      expect(webhook.triggerCount).toBe(0);
      
      const updated = webhookManager.recordWebhookTrigger(webhook);
      
      expect(updated.triggerCount).toBe(1);
    });

    it('should update lastTriggeredAt timestamp', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test');
      const beforeTrigger = new Date();
      
      const updated = webhookManager.recordWebhookTrigger(webhook);
      
      const afterTrigger = new Date();
      const lastTriggeredAt = new Date(updated.lastTriggeredAt);
      
      expect(lastTriggeredAt.getTime()).toBeGreaterThanOrEqual(beforeTrigger.getTime());
      expect(lastTriggeredAt.getTime()).toBeLessThanOrEqual(afterTrigger.getTime());
    });

    it('should increment counter on multiple triggers', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test');
      
      let updated = webhook;
      for (let i = 0; i < 5; i++) {
        updated = webhookManager.recordWebhookTrigger(updated);
        expect(updated.triggerCount).toBe(i + 1);
      }
    });

    it('should update timestamp on each trigger', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test');
      
      const first = webhookManager.recordWebhookTrigger(webhook);
      const firstTime = new Date(first.lastTriggeredAt).getTime();
      
      // Wait a bit and trigger again
      const second = webhookManager.recordWebhookTrigger(webhook);
      const secondTime = new Date(second.lastTriggeredAt).getTime();
      
      expect(secondTime).toBeGreaterThanOrEqual(firstTime);
    });

    it('should preserve other webhook properties', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test', 'Desc');
      const oldId = webhook.id;
      const oldApiKey = webhook.apiKey;
      const oldName = webhook.name;
      
      const updated = webhookManager.recordWebhookTrigger(webhook);
      
      expect(updated.id).toBe(oldId);
      expect(updated.apiKey).toBe(oldApiKey);
      expect(updated.name).toBe(oldName);
    });

    it('should handle webhook with undefined triggerCount', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test');
      delete webhook.triggerCount; // Simulate missing property
      
      const updated = webhookManager.recordWebhookTrigger(webhook);
      
      expect(updated.triggerCount).toBe(1);
    });
  });

  describe('getWebhookStorageKey()', () => {
    it('should generate correct storage key format', () => {
      const jobId = 'test-job';
      const webhookId = 'webhook-123';
      
      const key = webhookManager.getWebhookStorageKey(jobId, webhookId);
      
      expect(key).toBe(`WEBHOOK_${jobId}_${webhookId}`);
    });

    it('should create unique keys for different webhooks', () => {
      const jobId = 'job1';
      const key1 = webhookManager.getWebhookStorageKey(jobId, 'webhook1');
      const key2 = webhookManager.getWebhookStorageKey(jobId, 'webhook2');
      
      expect(key1).not.toBe(key2);
    });

    it('should create different keys for different jobs', () => {
      const webhookId = 'webhook1';
      const key1 = webhookManager.getWebhookStorageKey('job1', webhookId);
      const key2 = webhookManager.getWebhookStorageKey('job2', webhookId);
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('getWebhooksIndexKey()', () => {
    it('should generate correct index key format', () => {
      const jobId = 'test-job';
      
      const key = webhookManager.getWebhooksIndexKey(jobId);
      
      expect(key).toBe(`WEBHOOKS_${jobId}`);
    });

    it('should create unique keys for different jobs', () => {
      const key1 = webhookManager.getWebhooksIndexKey('job1');
      const key2 = webhookManager.getWebhooksIndexKey('job2');
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('Integration Tests', () => {
    it('should create, track, and rotate a webhook lifecycle', () => {
      // Create
      const webhook = webhookManager.createWebhook('job1', 'Production Webhook', 'For production alerts');
      expect(webhook.triggerCount).toBe(0);
      expect(webhook.isActive).toBe(true);
      
      const originalKey = webhook.apiKey;
      
      // Track triggers
      let updated = webhook;
      for (let i = 0; i < 3; i++) {
        updated = webhookManager.recordWebhookTrigger(updated);
      }
      
      expect(updated.triggerCount).toBe(3);
      expect(updated.lastTriggeredAt).not.toBeNull();
      expect(updated.apiKey).toBe(originalKey); // Key shouldn't change just from recording
      
      // Rotate key
      const rotated = webhookManager.rotateWebhookKey(updated, updated.apiKey);
      
      expect(rotated.apiKey).not.toBe(originalKey);
      expect(rotated.triggerCount).toBe(3); // Count preserved
      expect(rotated.keyRotatedAt).not.toBeUndefined();
    });

    it('should validate webhook keys throughout lifecycle', () => {
      const webhook = webhookManager.createWebhook('job1', 'Test');
      
      // Initial key should be valid
      expect(webhookManager.isValidWebhookKey(webhook.apiKey)).toBe(true);
      
      // After recording trigger
      const updated = webhookManager.recordWebhookTrigger(webhook);
      expect(webhookManager.isValidWebhookKey(updated.apiKey)).toBe(true);
      
      // After rotation
      const rotated = webhookManager.rotateWebhookKey(updated, updated.apiKey);
      expect(webhookManager.isValidWebhookKey(rotated.apiKey)).toBe(true);
    });
  });
});
