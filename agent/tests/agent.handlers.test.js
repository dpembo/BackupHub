// Tests for MqttHandler, WebSocketHandler, and HTTP API endpoint logic from agent.js
// Classes and logic are replicated here since agent.js is a monolith with no exports.

jest.mock('mqtt');
jest.mock('ws');
jest.mock('reconnecting-websocket');

const mqtt = require('mqtt');
const ReconnectingWebSocket = require('reconnecting-websocket');

// ─── Shared RetryBackoffManager (replicated from agent.js) ───────────────────

class RetryBackoffManager {
  constructor(agentId, handlerType) {
    this.agentId = agentId;
    this.handlerType = handlerType;
    this.currentAttempt = 0;
    this.startTime = Date.now();
    this.lastBackoffChangeTime = this.startTime;
    this.currentBackoffStage = 0;
    this.backoffStages = [
      { durationMs: 10 * 60 * 1000, intervalMs: 1 * 60 * 1000,  stageName: '1-min backoff (10 mins)' },
      { durationMs: 10 * 60 * 1000, intervalMs: 5 * 60 * 1000,  stageName: '5-min backoff (10 mins)' },
      { durationMs: 60 * 60 * 1000, intervalMs: 10 * 60 * 1000, stageName: '10-min backoff (1 hour)' },
      { durationMs: 60 * 60 * 1000, intervalMs: 20 * 60 * 1000, stageName: '20-min backoff (1 hour)' },
      { durationMs: 60 * 60 * 1000, intervalMs: 30 * 60 * 1000, stageName: '30-min backoff (1 hour)' },
      { durationMs: Infinity,        intervalMs: 60 * 60 * 1000, stageName: '1-hour backoff (indefinite)' },
    ];
  }

  getNextRetryDelay() {
    const now = Date.now();
    const currentStage = this.backoffStages[this.currentBackoffStage];
    const timeInStage = now - this.lastBackoffChangeTime;
    if (timeInStage > currentStage.durationMs && this.currentBackoffStage < this.backoffStages.length - 1) {
      this.currentBackoffStage++;
      this.lastBackoffChangeTime = now;
    }
    return this.backoffStages[this.currentBackoffStage].intervalMs;
  }

  recordAttempt() { this.currentAttempt++; }

  reset() {
    this.currentAttempt = 0;
    this.startTime = Date.now();
    this.lastBackoffChangeTime = this.startTime;
    this.currentBackoffStage = 0;
  }
}

// ─── MqttHandler (replicated from agent.js) ──────────────────────────────────

class MqttHandler {
  constructor(server, port, options = {}) {
    this.server = server;
    this.port = port;
    this.client = null;
    this.isConnected = false;
    this.isReconnecting = false;
    this.isConnecting = false;
    this.connectionTimeout = options.connectionTimeout || 5000;
    this.connectionTimeoutHandler = null;
    this.retryManager = new RetryBackoffManager(this.server, 'MQTT');
  }

  checkConnected() { return this.isConnected; }

  connect() {
    if (this.isConnected && this.client) return Promise.resolve(this.client);
    if (this.isConnecting) return Promise.reject(new Error('MQTT connection attempt in progress'));
    this.isConnecting = true;
    return new Promise((resolve, reject) => {
      const connectUrl = `mqtt://${this.server}:${this.port}`;
      this.client = mqtt.connect(connectUrl);
      this.connectionTimeoutHandler = setTimeout(() => {
        if (!this.isConnected) {
          this.client.end();
          this.isConnecting = false;
          reject(new Error('Connection timeout'));
        }
      }, this.connectionTimeout);

      this.client.on('connect', () => {
        this.isConnected = true;
        this.retryManager.reset();
        clearTimeout(this.connectionTimeoutHandler);
        this.isReconnecting = false;
        this.isConnecting = false;
        resolve(this.client);
      });

      this.client.on('error', (err) => {
        this.client.end();
        this.isConnected = false;
        clearTimeout(this.connectionTimeoutHandler);
        this.isConnecting = false;
        reject(err);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        this.isConnecting = false;
      });
    });
  }

  retryConnection() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    const retryDelay = this.retryManager.getNextRetryDelay();
    setTimeout(() => {
      this.retryManager.recordAttempt();
      this.connect()
        .then(() => { this.isReconnecting = false; })
        .catch(() => this.retryConnection());
    }, retryDelay);
  }

  disconnect() {
    if (this.client) {
      this.client.end();
      this.isConnected = false;
    }
  }

  publish(topic, message) {
    if (!this.isConnected) return Promise.reject(new Error('Not connected to MQTT server'));
    return new Promise((resolve, reject) => {
      this.client.publish(topic, message, (err) => {
        err ? reject(err) : resolve();
      });
    });
  }

  subscribe(topic, callback) {
    if (this.isConnected && this.client) {
      this.client.subscribe(topic, (err) => {
        if (!err) {
          this.client.on('message', (receivedTopic, message) => {
            if (receivedTopic === topic) callback(message.toString());
          });
        }
      });
    }
  }
}

// ─── MqttHandler tests ────────────────────────────────────────────────────────

describe('MqttHandler', () => {
  let mockMqttClient;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    mockMqttClient = {
      on: jest.fn(),
      end: jest.fn(),
      publish: jest.fn(),
      subscribe: jest.fn(),
    };
    mqtt.connect = jest.fn().mockReturnValue(mockMqttClient);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialise with correct default values', () => {
      const handler = new MqttHandler('localhost', '1883');
      expect(handler.server).toBe('localhost');
      expect(handler.port).toBe('1883');
      expect(handler.isConnected).toBe(false);
      expect(handler.isConnecting).toBe(false);
      expect(handler.isReconnecting).toBe(false);
      expect(handler.connectionTimeout).toBe(5000);
      expect(handler.client).toBeNull();
    });

    it('should accept a custom connectionTimeout', () => {
      const handler = new MqttHandler('broker', '8883', { connectionTimeout: 10000 });
      expect(handler.connectionTimeout).toBe(10000);
    });

    it('should create a RetryBackoffManager', () => {
      const handler = new MqttHandler('localhost', '1883');
      expect(handler.retryManager).toBeDefined();
      expect(handler.retryManager.currentAttempt).toBe(0);
    });
  });

  describe('connect()', () => {
    it('should connect and resolve when the connect event fires', async () => {
      const handler = new MqttHandler('localhost', '1883');

      mockMqttClient.on.mockImplementation((event, cb) => {
        if (event === 'connect') setTimeout(() => cb(), 0);
      });

      const connectPromise = handler.connect();
      jest.runAllTimers();
      const client = await connectPromise;

      expect(client).toBe(mockMqttClient);
      expect(handler.isConnected).toBe(true);
      expect(handler.isConnecting).toBe(false);
      expect(mqtt.connect).toHaveBeenCalledWith('mqtt://localhost:1883');
    });

    it('should reject when an MQTT error event fires', async () => {
      const handler = new MqttHandler('localhost', '1883');
      const testError = new Error('Connection refused');

      mockMqttClient.on.mockImplementation((event, cb) => {
        if (event === 'error') setTimeout(() => cb(testError), 0);
      });

      const connectPromise = handler.connect();
      jest.runAllTimers();
      await expect(connectPromise).rejects.toThrow('Connection refused');
      expect(handler.isConnected).toBe(false);
      expect(handler.isConnecting).toBe(false);
    });

    it('should reject immediately if already connecting', async () => {
      const handler = new MqttHandler('localhost', '1883');
      handler.isConnecting = true;
      await expect(handler.connect()).rejects.toThrow('MQTT connection attempt in progress');
    });

    it('should resolve immediately with existing client when already connected', async () => {
      const handler = new MqttHandler('localhost', '1883');
      handler.isConnected = true;
      handler.client = mockMqttClient;

      const client = await handler.connect();
      expect(client).toBe(mockMqttClient);
      expect(mqtt.connect).not.toHaveBeenCalled();
    });

    it('should reset retryManager on successful connection', async () => {
      const handler = new MqttHandler('localhost', '1883');
      handler.retryManager.currentAttempt = 5;
      handler.retryManager.currentBackoffStage = 2;

      mockMqttClient.on.mockImplementation((event, cb) => {
        if (event === 'connect') setTimeout(() => cb(), 0);
      });

      const connectPromise = handler.connect();
      jest.runAllTimers();
      await connectPromise;

      expect(handler.retryManager.currentAttempt).toBe(0);
      expect(handler.retryManager.currentBackoffStage).toBe(0);
    });

    it('should reject with Connection timeout when connection does not complete within timeout', async () => {
      const handler = new MqttHandler('localhost', '1883', { connectionTimeout: 100 });

      // on() registered but connect event never fires
      mockMqttClient.on.mockImplementation(() => {});

      const connectPromise = handler.connect();
      jest.advanceTimersByTime(200);
      await expect(connectPromise).rejects.toThrow('Connection timeout');
    });

    it('should set isConnected to false on close event', async () => {
      const handler = new MqttHandler('localhost', '1883');
      let closeCallback;

      mockMqttClient.on.mockImplementation((event, cb) => {
        if (event === 'connect') setTimeout(() => cb(), 0);
        if (event === 'close') closeCallback = cb;
      });

      const connectPromise = handler.connect();
      jest.runAllTimers();
      await connectPromise;

      expect(handler.isConnected).toBe(true);
      closeCallback();
      expect(handler.isConnected).toBe(false);
    });
  });

  describe('checkConnected()', () => {
    it('should return false when not connected', () => {
      expect(new MqttHandler('localhost', '1883').checkConnected()).toBe(false);
    });

    it('should return true when connected', () => {
      const handler = new MqttHandler('localhost', '1883');
      handler.isConnected = true;
      expect(handler.checkConnected()).toBe(true);
    });
  });

  describe('publish()', () => {
    it('should reject when not connected', async () => {
      const handler = new MqttHandler('localhost', '1883');
      await expect(handler.publish('test/topic', 'data')).rejects.toThrow('Not connected to MQTT server');
    });

    it('should resolve when connected and broker acknowledges', async () => {
      const handler = new MqttHandler('localhost', '1883');
      handler.isConnected = true;
      handler.client = mockMqttClient;
      mockMqttClient.publish.mockImplementation((topic, msg, cb) => cb(null));

      await expect(handler.publish('orchelium/agent/status', 'payload')).resolves.toBeUndefined();
      expect(mockMqttClient.publish).toHaveBeenCalledWith(
        'orchelium/agent/status', 'payload', expect.any(Function)
      );
    });

    it('should reject when the broker returns an error', async () => {
      const handler = new MqttHandler('localhost', '1883');
      handler.isConnected = true;
      handler.client = mockMqttClient;
      mockMqttClient.publish.mockImplementation((topic, msg, cb) => cb(new Error('Broker error')));

      await expect(handler.publish('test/topic', 'data')).rejects.toThrow('Broker error');
    });
  });

  describe('disconnect()', () => {
    it('should call client.end() and mark as not connected', () => {
      const handler = new MqttHandler('localhost', '1883');
      handler.isConnected = true;
      handler.client = mockMqttClient;

      handler.disconnect();
      expect(mockMqttClient.end).toHaveBeenCalled();
      expect(handler.isConnected).toBe(false);
    });

    it('should not throw when client is null', () => {
      const handler = new MqttHandler('localhost', '1883');
      expect(() => handler.disconnect()).not.toThrow();
    });
  });

  describe('subscribe()', () => {
    it('should subscribe and invoke callback when a matching message arrives', () => {
      const handler = new MqttHandler('localhost', '1883');
      handler.isConnected = true;
      handler.client = mockMqttClient;

      const messageListeners = {};
      mockMqttClient.subscribe.mockImplementation((topic, cb) => cb(null));
      mockMqttClient.on.mockImplementation((event, cb) => { messageListeners[event] = cb; });

      const userCallback = jest.fn();
      handler.subscribe('orchelium/agent/command', userCallback);

      // Simulate an inbound message
      messageListeners['message']('orchelium/agent/command', Buffer.from('test-payload'));
      expect(userCallback).toHaveBeenCalledWith('test-payload');
    });

    it('should not subscribe when client is not connected', () => {
      const handler = new MqttHandler('localhost', '1883');
      handler.isConnected = false;
      handler.client = mockMqttClient;

      handler.subscribe('orchelium/agent/command', jest.fn());
      expect(mockMqttClient.subscribe).not.toHaveBeenCalled();
    });

    it('should not invoke callback for messages on a different topic', () => {
      const handler = new MqttHandler('localhost', '1883');
      handler.isConnected = true;
      handler.client = mockMqttClient;

      const messageListeners = {};
      mockMqttClient.subscribe.mockImplementation((topic, cb) => cb(null));
      mockMqttClient.on.mockImplementation((event, cb) => { messageListeners[event] = cb; });

      const userCallback = jest.fn();
      handler.subscribe('orchelium/agent/command', userCallback);

      // Different topic — callback should not fire
      messageListeners['message']('other/topic', Buffer.from('irrelevant'));
      expect(userCallback).not.toHaveBeenCalled();
    });
  });

  describe('retryConnection()', () => {
    it('should not start a second retry if already reconnecting', () => {
      const handler = new MqttHandler('localhost', '1883');
      handler.isReconnecting = true;
      handler.retryConnection();
      // No timer was scheduled
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should set isReconnecting to true and schedule a retry', () => {
      const handler = new MqttHandler('localhost', '1883');
      handler.retryConnection();
      expect(handler.isReconnecting).toBe(true);
    });
  });
});

// ─── WebSocketHandler (replicated from agent.js) ─────────────────────────────

class WebSocketHandler {
  constructor(server, port, agentId, processMessageCallback, options = {}) {
    this.server = server;
    this.port = port;
    this.agentId = agentId;
    this.client = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.isReconnecting = false;
    this.connectionTimeout = options.connectionTimeout || 5000;
    this.processMessageCallback = processMessageCallback;
    this.reconnectTimeoutId = null;
    this.retryManager = new RetryBackoffManager(this.agentId, 'WebSocket');
  }

  checkConnected() { return this.isConnected; }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.isConnected) return resolve(this.client);
      if (this.isConnecting) return reject(new Error('WebSocket connection attempt in progress'));
      this.isConnecting = true;

      const connId = encodeURIComponent(this.agentId);
      const connectUrl = `ws://${this.server}:${this.port}?name=${connId}`;
      const options = {
        WebSocket: require('ws'),
        connectionTimeout: this.connectionTimeout,
        maxRetries: 0,
        reconnectInterval: 1000,
      };

      this.client = new ReconnectingWebSocket(connectUrl, [], options);

      this.client.addEventListener('open', () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.retryManager.reset();
        this.isReconnecting = false;
        resolve(this.client);
      });

      this.client.addEventListener('close', () => {
        this.isConnected = false;
        this.isConnecting = false;
        if (!this.isReconnecting) this.triggerReconnect();
      });

      this.client.addEventListener('error', (err) => {
        this.isConnected = false;
        this.isConnecting = false;
        if (!this.isReconnecting) this.triggerReconnect();
        reject(err);
      });

      this.client.addEventListener('message', (event) => {
        const message = `"${event.data}"`;
        this.processMessageCallback(message);
      });

      const connectionTimeoutId = setTimeout(() => {
        if (!this.isConnected && this.isConnecting) {
          this.isConnecting = false;
          if (!this.isReconnecting) this.triggerReconnect();
          reject(new Error('Connection timeout'));
        }
      }, this.connectionTimeout);
    });
  }

  triggerReconnect() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    const retryDelay = this.retryManager.getNextRetryDelay();
    this.reconnectTimeoutId = setTimeout(() => {
      this.retryManager.recordAttempt();
      this.isReconnecting = false;
      this.connect().catch(() => {});
    }, retryDelay);
  }

  sendMessage(message) {
    if (this.isConnected && this.client && this.client.readyState === 1) {
      this.client.send(message);
    }
  }

  disconnect() {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.client) {
      this.client.close();
      this.isConnected = false;
      this.isConnecting = false;
      this.isReconnecting = false;
    }
  }
}

// ─── WebSocketHandler tests ───────────────────────────────────────────────────

describe('WebSocketHandler', () => {
  let mockWsClient;
  let eventListeners;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    eventListeners = {};
    mockWsClient = {
      addEventListener: jest.fn((event, cb) => { eventListeners[event] = cb; }),
      send: jest.fn(),
      close: jest.fn(),
      readyState: 1,
    };
    ReconnectingWebSocket.mockImplementation(() => mockWsClient);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialise with correct default values', () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn());
      expect(handler.server).toBe('localhost');
      expect(handler.port).toBe('49981');
      expect(handler.agentId).toBe('agent-1');
      expect(handler.isConnected).toBe(false);
      expect(handler.isConnecting).toBe(false);
      expect(handler.connectionTimeout).toBe(5000);
      expect(handler.client).toBeNull();
      expect(handler.reconnectTimeoutId).toBeNull();
    });

    it('should accept a custom connectionTimeout', () => {
      const handler = new WebSocketHandler('srv', '49981', 'a', jest.fn(), { connectionTimeout: 8000 });
      expect(handler.connectionTimeout).toBe(8000);
    });
  });

  describe('connect()', () => {
    it('should connect and resolve when the open event fires', async () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn());
      const connectPromise = handler.connect();

      eventListeners['open']();
      const client = await connectPromise;

      expect(client).toBe(mockWsClient);
      expect(handler.isConnected).toBe(true);
      expect(handler.isConnecting).toBe(false);
    });

    it('should build the correct WebSocket URL with encoded agent ID', () => {
      const handler = new WebSocketHandler('myhost', '49981', 'agent one', jest.fn());
      handler.connect();
      expect(ReconnectingWebSocket).toHaveBeenCalledWith(
        'ws://myhost:49981?name=agent%20one',
        [],
        expect.any(Object)
      );
    });

    it('should reject immediately when already connecting', async () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn());
      handler.isConnecting = true;
      await expect(handler.connect()).rejects.toThrow('WebSocket connection attempt in progress');
    });

    it('should resolve immediately when already connected', async () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn());
      handler.isConnected = true;
      handler.client = mockWsClient;

      const client = await handler.connect();
      expect(client).toBe(mockWsClient);
      expect(ReconnectingWebSocket).not.toHaveBeenCalled();
    });

    it('should reset retryManager on successful connection', async () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn());
      handler.retryManager.currentAttempt = 3;
      handler.retryManager.currentBackoffStage = 1;

      const connectPromise = handler.connect();
      eventListeners['open']();
      await connectPromise;

      expect(handler.retryManager.currentAttempt).toBe(0);
      expect(handler.retryManager.currentBackoffStage).toBe(0);
    });

    it('should trigger reconnect when the close event fires after connection', async () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn());
      const connectPromise = handler.connect();
      eventListeners['open']();
      await connectPromise;

      expect(handler.isConnected).toBe(true);
      eventListeners['close']();
      expect(handler.isConnected).toBe(false);
      expect(handler.isReconnecting).toBe(true);
    });

    it('should reject with Connection timeout when open event never fires', async () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn(), { connectionTimeout: 100 });
      const connectPromise = handler.connect();
      jest.advanceTimersByTime(200);
      await expect(connectPromise).rejects.toThrow('Connection timeout');
    });
  });

  describe('checkConnected()', () => {
    it('should return false initially', () => {
      expect(new WebSocketHandler('localhost', '49981', 'a', jest.fn()).checkConnected()).toBe(false);
    });

    it('should return true when connected', () => {
      const handler = new WebSocketHandler('localhost', '49981', 'a', jest.fn());
      handler.isConnected = true;
      expect(handler.checkConnected()).toBe(true);
    });
  });

  describe('sendMessage()', () => {
    it('should send when connected and readyState is OPEN (1)', () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn());
      handler.isConnected = true;
      handler.client = mockWsClient;
      mockWsClient.readyState = 1;

      handler.sendMessage('{"cmd":"ping"}');
      expect(mockWsClient.send).toHaveBeenCalledWith('{"cmd":"ping"}');
    });

    it('should not send when isConnected is false', () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn());
      handler.isConnected = false;
      handler.client = mockWsClient;
      mockWsClient.readyState = 1;

      handler.sendMessage('data');
      expect(mockWsClient.send).not.toHaveBeenCalled();
    });

    it('should not send when readyState is CLOSED (3)', () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn());
      handler.isConnected = true;
      handler.client = mockWsClient;
      mockWsClient.readyState = 3;

      handler.sendMessage('data');
      expect(mockWsClient.send).not.toHaveBeenCalled();
    });

    it('should not send when client is null', () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn());
      handler.isConnected = true;
      handler.client = null;

      expect(() => handler.sendMessage('data')).not.toThrow();
    });
  });

  describe('processMessageCallback', () => {
    it('should call the callback with the message wrapped in quotes', () => {
      const processMessage = jest.fn();
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', processMessage);
      handler.connect();
      eventListeners['open']();
      eventListeners['message']({ data: '{"command":"ping"}' });
      expect(processMessage).toHaveBeenCalledWith('"{"command":"ping"}"');
    });
  });

  describe('disconnect()', () => {
    it('should close the client and reset connection flags', () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn());
      handler.isConnected = true;
      handler.client = mockWsClient;

      handler.disconnect();
      expect(mockWsClient.close).toHaveBeenCalled();
      expect(handler.isConnected).toBe(false);
      expect(handler.isConnecting).toBe(false);
      expect(handler.isReconnecting).toBe(false);
    });

    it('should cancel a pending reconnect timeout', () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn());
      handler.reconnectTimeoutId = setTimeout(() => {}, 60000);
      handler.client = mockWsClient;

      handler.disconnect();
      expect(handler.reconnectTimeoutId).toBeNull();
    });

    it('should not throw when client is null', () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn());
      expect(() => handler.disconnect()).not.toThrow();
    });
  });

  describe('triggerReconnect()', () => {
    it('should set isReconnecting and schedule a reconnect', () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn());
      handler.triggerReconnect();
      expect(handler.isReconnecting).toBe(true);
      expect(handler.reconnectTimeoutId).not.toBeNull();
    });

    it('should not schedule a second reconnect if already reconnecting', () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn());
      handler.isReconnecting = true;
      const existingTimeoutId = null;
      handler.reconnectTimeoutId = existingTimeoutId;

      handler.triggerReconnect();
      expect(handler.reconnectTimeoutId).toBe(existingTimeoutId); // unchanged
    });

    it('should cancel any prior reconnect timer before scheduling a new one', () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn());
      handler.reconnectTimeoutId = setTimeout(() => {}, 99999);
      const oldId = handler.reconnectTimeoutId;

      // Allow a new reconnect cycle
      handler.isReconnecting = false;
      handler.triggerReconnect();
      expect(handler.reconnectTimeoutId).not.toBe(oldId);
    });

    it('should increment retryManager attempt count after the delay elapses', () => {
      const handler = new WebSocketHandler('localhost', '49981', 'agent-1', jest.fn());
      const initialAttempts = handler.retryManager.currentAttempt;

      handler.triggerReconnect();
      jest.advanceTimersByTime(handler.retryManager.getNextRetryDelay() + 100);

      expect(handler.retryManager.currentAttempt).toBe(initialAttempts + 1);
    });
  });
});

// ─── HTTP debug endpoint logic ────────────────────────────────────────────────

describe('HTTP debug endpoint logic', () => {
  const DEBUG_TOKEN_EXPIRY_MS = 10 * 60 * 1000;
  const crypto = require('crypto');

  function makeState() {
    return { debugToken: null, debugTokenExpiry: null };
  }

  function generateDebugToken(state) {
    const token = crypto.randomBytes(8).toString('hex');
    state.debugToken = token;
    state.debugTokenExpiry = Date.now() + DEBUG_TOKEN_EXPIRY_MS;
    return token;
  }

  function isValidDebugToken(token, state) {
    if (!state.debugToken || !state.debugTokenExpiry) return false;
    if (Date.now() > state.debugTokenExpiry) {
      state.debugToken = null;
      state.debugTokenExpiry = null;
      return false;
    }
    if (token === state.debugToken) {
      state.debugTokenExpiry = Date.now() + DEBUG_TOKEN_EXPIRY_MS;
      return true;
    }
    return false;
  }

  // Simulate the handler logic for each endpoint
  function handleDebugGet(token, state, debugMode) {
    if (!token) {
      generateDebugToken(state);
      return { status: 401, body: { error: 'Token required', current_state: debugMode } };
    }
    if (!isValidDebugToken(token, state)) {
      return { status: 401, body: { error: 'Invalid or expired token', current_state: debugMode } };
    }
    return { status: 200, body: { DEBUG_MODE: debugMode, message: 'Token valid for next 10 minutes' } };
  }

  function handleDebugOn(token, state) {
    if (!token) {
      generateDebugToken(state);
      return { status: 401, body: { error: 'Token required' } };
    }
    if (!isValidDebugToken(token, state)) {
      return { status: 401, body: { error: 'Invalid or expired token' } };
    }
    return { status: 200, body: { DEBUG_MODE: true, message: 'Debug mode enabled. Token valid for next 10 minutes' } };
  }

  function handleDebugOff(token, state) {
    if (!token) {
      generateDebugToken(state);
      return { status: 401, body: { error: 'Token required' } };
    }
    if (!isValidDebugToken(token, state)) {
      return { status: 401, body: { error: 'Invalid or expired token' } };
    }
    return { status: 200, body: { DEBUG_MODE: false, message: 'Debug mode disabled. Token valid for next 10 minutes' } };
  }

  describe('GET /debug', () => {
    it('should return 401 and generate a token when no token is provided', () => {
      const state = makeState();
      const res = handleDebugGet(null, state, false);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Token required');
      expect(state.debugToken).not.toBeNull(); // token was generated
    });

    it('should return 401 for a wrong token', () => {
      const state = makeState();
      state.debugToken = 'validtoken';
      state.debugTokenExpiry = Date.now() + DEBUG_TOKEN_EXPIRY_MS;
      const res = handleDebugGet('wrongtoken', state, false);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or expired token');
    });

    it('should return 200 and DEBUG_MODE for a valid token', () => {
      const state = makeState();
      const token = generateDebugToken(state);
      const res = handleDebugGet(token, state, false);
      expect(res.status).toBe(200);
      expect(res.body.DEBUG_MODE).toBe(false);
    });

    it('should include current_state in the 401 body', () => {
      const state = makeState();
      const res = handleDebugGet(null, state, true);
      expect(res.body.current_state).toBe(true);
    });

    it('should return 401 for an expired token and clear the token state', () => {
      const state = makeState();
      state.debugToken = 'expiredtoken';
      state.debugTokenExpiry = Date.now() - 1000;
      const res = handleDebugGet('expiredtoken', state, false);
      expect(res.status).toBe(401);
      expect(state.debugToken).toBeNull();
      expect(state.debugTokenExpiry).toBeNull();
    });

    it('should reset token expiry on each successful validation', () => {
      const state = makeState();
      const token = generateDebugToken(state);
      const firstExpiry = state.debugTokenExpiry;

      // Simulate time passing
      jest.useFakeTimers();
      jest.advanceTimersByTime(5000);
      handleDebugGet(token, state, false);
      const secondExpiry = state.debugTokenExpiry;
      jest.useRealTimers();

      expect(secondExpiry).toBeGreaterThan(firstExpiry);
    });
  });

  describe('GET /debug/on', () => {
    it('should return 401 and generate a token when no token is provided', () => {
      const state = makeState();
      const res = handleDebugOn(null, state);
      expect(res.status).toBe(401);
      expect(state.debugToken).not.toBeNull();
    });

    it('should return 200 and enable debug mode with a valid token', () => {
      const state = makeState();
      const token = generateDebugToken(state);
      const res = handleDebugOn(token, state);
      expect(res.status).toBe(200);
      expect(res.body.DEBUG_MODE).toBe(true);
    });

    it('should return 401 for an invalid token', () => {
      const state = makeState();
      generateDebugToken(state);
      const res = handleDebugOn('wrong', state);
      expect(res.status).toBe(401);
    });

    it('should include a confirmation message on success', () => {
      const state = makeState();
      const token = generateDebugToken(state);
      const res = handleDebugOn(token, state);
      expect(res.body.message).toContain('enabled');
    });
  });

  describe('GET /debug/off', () => {
    it('should return 401 when no token is provided', () => {
      const state = makeState();
      const res = handleDebugOff(null, state);
      expect(res.status).toBe(401);
    });

    it('should return 200 and disable debug mode with a valid token', () => {
      const state = makeState();
      const token = generateDebugToken(state);
      const res = handleDebugOff(token, state);
      expect(res.status).toBe(200);
      expect(res.body.DEBUG_MODE).toBe(false);
    });

    it('should return 401 for an invalid token', () => {
      const state = makeState();
      generateDebugToken(state);
      const res = handleDebugOff('badtoken', state);
      expect(res.status).toBe(401);
    });

    it('should include a confirmation message on success', () => {
      const state = makeState();
      const token = generateDebugToken(state);
      const res = handleDebugOff(token, state);
      expect(res.body.message).toContain('disabled');
    });
  });
});

// ─── POST /api/server-restart endpoint logic ─────────────────────────────────

describe('POST /api/server-restart endpoint logic', () => {
  function handleServerRestart(useMQTT, mqttClient, wsClient) {
    try {
      if (useMQTT && mqttClient && mqttClient.retryManager) {
        mqttClient.retryManager.reset();
        if (!mqttClient.isConnected) {
          mqttClient.connect()
            .catch(() => mqttClient.retryConnection());
        }
      } else if (!useMQTT && wsClient && wsClient.retryManager) {
        wsClient.retryManager.reset();
        if (!wsClient.isConnected) {
          wsClient.connect()
            .catch(() => wsClient.triggerReconnect());
        }
      }
      return { status: 'success', message: 'Server restart notification received, connection backoff reset', timestamp: new Date().toISOString() };
    } catch (error) {
      return { status: 'error', message: 'Failed to process server restart notification', error: error.message };
    }
  }

  it('should reset MQTT backoff and trigger reconnect when MQTT is disconnected', () => {
    const retryManager = { reset: jest.fn() };
    const mqttClient = { isConnected: false, retryManager, connect: jest.fn().mockResolvedValue(), retryConnection: jest.fn() };

    const result = handleServerRestart(true, mqttClient, null);
    expect(retryManager.reset).toHaveBeenCalled();
    expect(mqttClient.connect).toHaveBeenCalled();
    expect(result.status).toBe('success');
  });

  it('should not call connect when MQTT is already connected', () => {
    const retryManager = { reset: jest.fn() };
    const mqttClient = { isConnected: true, retryManager, connect: jest.fn(), retryConnection: jest.fn() };

    handleServerRestart(true, mqttClient, null);
    expect(retryManager.reset).toHaveBeenCalled();
    expect(mqttClient.connect).not.toHaveBeenCalled();
  });

  it('should reset WebSocket backoff and trigger reconnect when WS is disconnected', () => {
    const retryManager = { reset: jest.fn() };
    const wsClient = { isConnected: false, retryManager, connect: jest.fn().mockResolvedValue(), triggerReconnect: jest.fn() };

    const result = handleServerRestart(false, null, wsClient);
    expect(retryManager.reset).toHaveBeenCalled();
    expect(wsClient.connect).toHaveBeenCalled();
    expect(result.status).toBe('success');
  });

  it('should not call connect when WebSocket is already connected', () => {
    const retryManager = { reset: jest.fn() };
    const wsClient = { isConnected: true, retryManager, connect: jest.fn(), triggerReconnect: jest.fn() };

    handleServerRestart(false, null, wsClient);
    expect(retryManager.reset).toHaveBeenCalled();
    expect(wsClient.connect).not.toHaveBeenCalled();
  });

  it('should return a success response with an ISO timestamp', () => {
    const wsClient = { isConnected: true, retryManager: { reset: jest.fn() }, connect: jest.fn() };
    const result = handleServerRestart(false, null, wsClient);
    expect(result.status).toBe('success');
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should include the standard success message', () => {
    const wsClient = { isConnected: true, retryManager: { reset: jest.fn() }, connect: jest.fn() };
    const result = handleServerRestart(false, null, wsClient);
    expect(result.message).toContain('backoff reset');
  });

  it('should return an error response when an exception is thrown', () => {
    const brokenClient = {
      isConnected: false,
      retryManager: { reset: jest.fn(() => { throw new Error('Unexpected failure'); }) },
      connect: jest.fn(),
    };

    const result = handleServerRestart(true, brokenClient, null);
    expect(result.status).toBe('error');
    expect(result.error).toBe('Unexpected failure');
  });
});
