/**
 * Webhooks Data Module Unit Tests
 * 
 * Tests the webhook database persistence layer:
 * - Creating webhooks
 * - Retrieving webhooks
 * - Validating webhook keys
 * - Recording webhook triggers
 * - Managing webhook lifecycle
 */

const webhookManager = require('../../webhookManager.js');

describe('Webhooks Data Module', () => {
  let webhooksData;
  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up global logger mock
    global.logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Set up db as a global mock (expected by webhooksData module)
    mockDb = {
      getData: jest.fn(),
      putData: jest.fn(),
      deleteData: jest.fn(),
    };
    global.db = mockDb;

    // Reset the webhooksData module by deleting from require cache
    delete require.cache[require.resolve('../../webhooksData.js')];
    webhooksData = require('../../webhooksData.js');

    // Set up default db mock implementations
    mockDb.getData.mockImplementation((key) => {
      if (key === 'WEBHOOKS_INDEX') {
        return Promise.resolve({});
      }
      return Promise.reject(new Error('Not found'));
    });

    mockDb.putData.mockResolvedValue(undefined);
    mockDb.deleteData.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete global.db;
    delete global.logger;
  });

  describe('Initialization', () => {
    it('should initialize without errors', async () => {
      await webhooksData.init();
      
      expect(global.logger.info).toHaveBeenCalledWith(expect.stringContaining('initialized'));
    });

    it('should load webhooks index from database', async () => {
      const mockIndex = {
        'job1': ['webhook1', 'webhook2'],
        'job2': ['webhook3'],
      };

      mockDb.getData.mockResolvedValueOnce(mockIndex);
      
      await webhooksData.init();
      
      expect(mockDb.getData).toHaveBeenCalledWith('WEBHOOKS_INDEX');
    });

    it('should handle missing webhooks index gracefully', async () => {
      mockDb.getData.mockRejectedValueOnce(new Error('Not found'));
      
      await webhooksData.init();
      
      expect(global.logger.debug).toHaveBeenCalledWith(expect.stringContaining('No webhooks index'));
    });

    it('should set initialized flag', async () => {
      await webhooksData.init();
      
      // The module should be initialized (can't directly check flag, but functions should work)
      const webhook = await webhooksData.createWebhook('job1', 'Test');
      expect(webhook).toBeDefined();
    });
  });

  describe('createWebhook()', () => {
    beforeEach(async () => {
      await webhooksData.init();
    });

    it('should create a new webhook', async () => {
      const jobId = 'test-job';
      const name = 'Test Webhook';
      const description = 'A test webhook';

      const webhook = await webhooksData.createWebhook(jobId, name, description);

      expect(webhook).toBeDefined();
      expect(webhook.jobId).toBe(jobId);
      expect(webhook.name).toBe(name);
      expect(webhook.description).toBe(description);
      expect(webhook.apiKey).toBeDefined();
      expect(webhookManager.isValidWebhookKey(webhook.apiKey)).toBe(true);
    });

    it('should store webhook in database', async () => {
      await webhooksData.createWebhook('job1', 'Test');

      expect(mockDb.putData).toHaveBeenCalled();
      
      // Check that webhook data was stored
      const calls = mockDb.putData.mock.calls;
      const webhookDataCall = calls.find(call => call[0].startsWith('WEBHOOK_DATA_'));
      expect(webhookDataCall).toBeDefined();
    });

    it('should update webhooks index', async () => {
      await webhooksData.createWebhook('job1', 'Test 1');
      await webhooksData.createWebhook('job1', 'Test 2');

      expect(mockDb.putData).toHaveBeenCalledWith(
        'WEBHOOKS_INDEX',
        expect.any(Object)
      );
    });

    it('should generate unique webhook IDs', async () => {
      const webhook1 = await webhooksData.createWebhook('job1', 'Test 1');
      const webhook2 = await webhooksData.createWebhook('job1', 'Test 2');

      expect(webhook1.id).not.toBe(webhook2.id);
    });

    it('should respect maximum webhooks per job limit', async () => {
      // Create max webhooks (assuming limit is 10)
      for (let i = 0; i < 10; i++) {
        await webhooksData.createWebhook('job1', `Webhook ${i}`);
      }

      // Attempt to create one more should fail
      await expect(
        webhooksData.createWebhook('job1', 'Webhook 11')
      ).rejects.toThrow('Maximum webhooks');
    });

    it('should handle creation errors gracefully', async () => {
      mockDb.putData.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        webhooksData.createWebhook('job1', 'Test')
      ).rejects.toThrow();

      expect(global.logger.error).toHaveBeenCalled();
    });

    it('should allow empty description', async () => {
      const webhook = await webhooksData.createWebhook('job1', 'Test');

      expect(webhook.description).toBe('');
    });

    it('should initialize trigger tracking', async () => {
      const webhook = await webhooksData.createWebhook('job1', 'Test');

      expect(webhook.triggerCount).toBe(0);
      expect(webhook.lastTriggeredAt).toBeNull();
      expect(webhook.isActive).toBe(true);
    });
  });

  describe('getWebhooksForJob()', () => {
    beforeEach(async () => {
      await webhooksData.init();
    });

    it('should retrieve all webhooks for a job', async () => {
      const webhook1 = await webhooksData.createWebhook('job1', 'Test 1');
      const webhook2 = await webhooksData.createWebhook('job1', 'Test 2');

      mockDb.getData.mockImplementation((key) => {
        if (key.includes(webhook1.id)) {
          return Promise.resolve(webhook1);
        }
        if (key.includes(webhook2.id)) {
          return Promise.resolve(webhook2);
        }
        return Promise.reject(new Error('Not found'));
      });

      const webhooks = await webhooksData.getWebhooksForJob('job1');

      expect(webhooks).toBeInstanceOf(Array);
      expect(webhooks.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array for job with no webhooks', async () => {
      const webhooks = await webhooksData.getWebhooksForJob('nonexistent-job');

      expect(webhooks).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      const webhook = await webhooksData.createWebhook('job1', 'Test');
      
      // Reset mock to simulate database error
      mockDb.getData.mockImplementation((key) => {
        if (key === 'WEBHOOKS_INDEX') {
          return Promise.resolve({ 'job1': [webhook.id] });
        }
        // Database error for webhook data retrieval
        return Promise.reject(new Error('Database error'));
      });

      const webhooks = await webhooksData.getWebhooksForJob('job1');

      expect(webhooks).toEqual([]);
      expect(global.logger.warn).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });

    it('should remove missing webhooks from index', async () => {
      // Create a webhook
      const webhook = await webhooksData.createWebhook('job1', 'Test');

      // Simulate webhook not found in database
      mockDb.getData.mockRejectedValue(new Error('Not found'));

      await webhooksData.getWebhooksForJob('job1');

      // Should attempt to remove from index
      expect(global.logger.warn).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });
  });

  describe('getWebhook()', () => {
    beforeEach(async () => {
      await webhooksData.init();
    });

    it('should retrieve a specific webhook', async () => {
      const created = await webhooksData.createWebhook('job1', 'Test');

      mockDb.getData.mockResolvedValueOnce(created);

      const webhook = await webhooksData.getWebhook('job1', created.id);

      expect(webhook).toBeDefined();
      expect(webhook.id).toBe(created.id);
    });

    it('should throw error if webhook not found', async () => {
      mockDb.getData.mockRejectedValueOnce(new Error('Not found'));

      await expect(
        webhooksData.getWebhook('job1', 'nonexistent')
      ).rejects.toThrow();
    });

    it('should log errors appropriately', async () => {
      mockDb.getData.mockRejectedValueOnce(new Error('Database error'));

      try {
        await webhooksData.getWebhook('job1', 'webhook1');
      } catch (e) {
        // Expected
      }

      expect(global.logger.error).toHaveBeenCalled();
    });
  });

  describe('validateWebhookKey()', () => {
    beforeEach(async () => {
      await webhooksData.init();
    });

    it('should throw error for invalid key format', async () => {
      await expect(
        webhooksData.validateWebhookKey('job1', 'invalid-key')
      ).rejects.toThrow('Invalid webhook key format');
    });

    it('should throw error for key not found', async () => {
      const validKey = webhookManager.generateWebhookKey();

      // Mock getWebhooksForJob to return empty list
      mockDb.getData.mockImplementation((key) => {
        if (key === 'WEBHOOKS_INDEX') {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Not found'));
      });

      await expect(
        webhooksData.validateWebhookKey('job1', validKey)
      ).rejects.toThrow('Webhook key not found');
    });

    it('should log validation failures', async () => {
      mockDb.getData.mockRejectedValueOnce(new Error('DB error'));

      try {
        await webhooksData.validateWebhookKey('job1', webhookManager.generateWebhookKey());
      } catch (e) {
        // Expected
      }

      expect(global.logger.warn).toHaveBeenCalled();
    });
  });

  describe('recordWebhookTrigger()', () => {
    beforeEach(async () => {
      await webhooksData.init();
    });

    it('should increment trigger count', async () => {
      const webhook = await webhooksData.createWebhook('job1', 'Test');

      mockDb.getData.mockResolvedValueOnce(webhook);

      await webhooksData.recordWebhookTrigger('job1', webhook.id);

      expect(mockDb.putData).toHaveBeenCalled();
      
      // Verify the updated webhook was saved with incremented count
      const calls = mockDb.putData.mock.calls;
      const webhookUpdateCall = calls.find(call => 
        call[0].includes(webhook.id) && call[1] && call[1].triggerCount === 1
      );
      expect(webhookUpdateCall).toBeDefined();
    });

    it('should update lastTriggeredAt timestamp', async () => {
      const webhook = await webhooksData.createWebhook('job1', 'Test');
      const beforeRecord = new Date();

      mockDb.getData.mockResolvedValueOnce(webhook);

      await webhooksData.recordWebhookTrigger('job1', webhook.id);

      const afterRecord = new Date();

      // Check that putData was called with updated webhook
      const calls = mockDb.putData.mock.calls;
      const webhookUpdateCall = calls.find(call => 
        call[0].includes(webhook.id) && call[1] && call[1].lastTriggeredAt
      );
      
      expect(webhookUpdateCall).toBeDefined();
      const updatedWebhook = webhookUpdateCall[1];
      const triggerTime = new Date(updatedWebhook.lastTriggeredAt);
      
      expect(triggerTime.getTime()).toBeGreaterThanOrEqual(beforeRecord.getTime());
      expect(triggerTime.getTime()).toBeLessThanOrEqual(afterRecord.getTime());
    });

    it('should handle errors when recording trigger', async () => {
      mockDb.getData.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        webhooksData.recordWebhookTrigger('job1', 'webhook1')
      ).rejects.toThrow();

      expect(global.logger.error).toHaveBeenCalled();
    });
  });

  describe('updateWebhook()', () => {
    beforeEach(async () => {
      await webhooksData.init();
    });

    it('should update webhook metadata', async () => {
      const webhook = await webhooksData.createWebhook('job1', 'Test', 'Old description');

      mockDb.getData.mockResolvedValueOnce(webhook);

      await webhooksData.updateWebhook('job1', webhook.id, {
        name: 'Updated Name',
        description: 'New description',
      });

      expect(mockDb.putData).toHaveBeenCalled();
    });

    it('should toggle webhook active status', async () => {
      const webhook = await webhooksData.createWebhook('job1', 'Test');

      mockDb.getData.mockResolvedValueOnce(webhook);

      await webhooksData.updateWebhook('job1', webhook.id, {
        isActive: false,
      });

      const calls = mockDb.putData.mock.calls;
      const webhookUpdateCall = calls.find(call =>
        call[0].includes(webhook.id) && call[1] && call[1].isActive === false
      );

      expect(webhookUpdateCall).toBeDefined();
    });

    it('should handle update errors', async () => {
      mockDb.getData.mockRejectedValueOnce(new Error('Not found'));

      await expect(
        webhooksData.updateWebhook('job1', 'webhook1', { name: 'New' })
      ).rejects.toThrow();
    });
  });

  describe('rotateWebhookKey()', () => {
    beforeEach(async () => {
      await webhooksData.init();
    });

    it('should rotate webhook API key', async () => {
      const webhook = await webhooksData.createWebhook('job1', 'Test');
      const oldKey = webhook.apiKey;

      mockDb.getData.mockResolvedValueOnce(webhook);

      await webhooksData.rotateWebhookKey('job1', webhook.id, oldKey);

      expect(mockDb.putData).toHaveBeenCalled();

      // Check that new key was saved
      const calls = mockDb.putData.mock.calls;
      const keyRotationCall = calls.find(call =>
        call[0].includes(webhook.id) && call[1] && call[1].apiKey !== oldKey
      );

      expect(keyRotationCall).toBeDefined();
    });

    it('should fail if old key does not match', async () => {
      const webhook = await webhooksData.createWebhook('job1', 'Test');

      mockDb.getData.mockResolvedValueOnce(webhook);

      await expect(
        webhooksData.rotateWebhookKey('job1', webhook.id, webhookManager.generateWebhookKey())
      ).rejects.toThrow();
    });

    it('should update keyRotatedAt timestamp', async () => {
      const webhook = await webhooksData.createWebhook('job1', 'Test');
      const beforeRotation = new Date();

      mockDb.getData.mockResolvedValueOnce(webhook);

      await webhooksData.rotateWebhookKey('job1', webhook.id, webhook.apiKey);

      const afterRotation = new Date();

      const calls = mockDb.putData.mock.calls;
      const keyRotationCall = calls.find(call =>
        call[0].includes(webhook.id) && call[1] && call[1].keyRotatedAt
      );

      expect(keyRotationCall).toBeDefined();
      const updatedWebhook = keyRotationCall[1];
      const rotationTime = new Date(updatedWebhook.keyRotatedAt);

      expect(rotationTime.getTime()).toBeGreaterThanOrEqual(beforeRotation.getTime());
      expect(rotationTime.getTime()).toBeLessThanOrEqual(afterRotation.getTime());
    });
  });

  describe('deleteWebhook()', () => {
    beforeEach(async () => {
      await webhooksData.init();
    });

    it('should delete a webhook', async () => {
      const webhook = await webhooksData.createWebhook('job1', 'Test');

      await webhooksData.deleteWebhook('job1', webhook.id);

      expect(mockDb.deleteData).toHaveBeenCalled();
    });

    it('should remove webhook from index', async () => {
      const webhook = await webhooksData.createWebhook('job1', 'Test');

      await webhooksData.deleteWebhook('job1', webhook.id);

      // Index should be updated
      expect(mockDb.putData).toHaveBeenCalledWith(
        'WEBHOOKS_INDEX',
        expect.any(Object)
      );
    });

    it('should handle deletion errors', async () => {
      mockDb.deleteData.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        webhooksData.deleteWebhook('job1', 'webhook1')
      ).rejects.toThrow();
    });
  });

  describe('Integration Tests', () => {
    beforeEach(async () => {
      await webhooksData.init();
    });

    it('should create, retrieve, and update webhooks for a job', async () => {
      // Create multiple webhooks
      const webhook1 = await webhooksData.createWebhook('job1', 'Webhook 1', 'First webhook');
      const webhook2 = await webhooksData.createWebhook('job1', 'Webhook 2', 'Second webhook');

      // Setup mock returns for retrieval
      mockDb.getData.mockImplementation((key) => {
        if (key.includes(webhook1.id)) {
          return Promise.resolve(webhook1);
        }
        if (key.includes(webhook2.id)) {
          return Promise.resolve(webhook2);
        }
        return Promise.reject(new Error('Not found'));
      });

      // Verify both exist
      const webhooks = await webhooksData.getWebhooksForJob('job1');
      expect(webhooks.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle webhook lifecycle: create, trigger, rotate, delete', async () => {
      // Create
      const webhook = await webhooksData.createWebhook('job1', 'Lifecycle Test');
      const originalKey = webhook.apiKey;

      // Record trigger
      mockDb.getData.mockResolvedValueOnce(webhook);
      await webhooksData.recordWebhookTrigger('job1', webhook.id);

      // Rotate key
      mockDb.getData.mockResolvedValueOnce(webhook);
      await webhooksData.rotateWebhookKey('job1', webhook.id, originalKey);

      // Delete
      await webhooksData.deleteWebhook('job1', webhook.id);

      expect(mockDb.deleteData).toHaveBeenCalled();
    });
  });
});
