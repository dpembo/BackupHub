# Async/Await Standardization - Testing Guide

## Testing the Changes

### 1. Verify Error Handler is Registered

Check that the app starts without errors and the error handler middleware is active.

```javascript
// In server.js logs, you should see:
// [timestamp] [INFO] BackupHubServer - Listening on port: 8080
```

### 2. Test Error Handling - 404 Error

```bash
curl -X GET http://localhost:8080/api/nonexistent

# Expected response:
{
  "code": "NOT_FOUND",
  "message": "Not found",
  "statusCode": 404,
  "context": "GET /api/nonexistent",
  "timestamp": "2024-03-20T10:30:45.123Z"
}
```

### 3. Test Validation Error - Missing Required Field

```bash
curl -X POST http://localhost:8080/register.html \
  -H "Content-Type: application/json" \
  -d '{"username":"test"}'

# Expected response:
{
  "code": "VALIDATION_ERROR", 
  "message": "...",
  "statusCode": 400,
  "context": "POST /register.html",
  "timestamp": "2024-03-20T10:30:45.123Z"
}
```

### 4. Test Async Scheduler Operations

```javascript
// Test scheduler init
const scheduler = require('./scheduler.js');
await scheduler.init();
// Should load schedules without errors

// Test manual job run
const result = await scheduler.manualJobRun(0, 'testJob');
// Should handle errors gracefully
```

### 5. Test Agent Configuration Updates

```javascript
// Test agent init
const agents = require('./agents.js');
await agents.init();
// Should load agent config

// Test agent update  
await agents.addObjToAgentStatusDict({
  name: 'test-agent',
  status: 'online',
  description: 'Test Agent'
});
// Should complete without error and update config file
```

### 6. Check Error Logs

Look for error logs with this format:

```
[2024-03-20T10:30:45.123Z] [ERROR] BackupHubServer - [GET /api/test] Error message here
code: ERROR_CODE
statusCode: 400/500
ip: 127.0.0.1
userId: user123
stack: Error: ... at Function.js:line:col
```

### 7. Test File Operations

File read/write operations should now be async:

```javascript
// These should work without blocking
const { asyncUtils } = require('./utils/asyncUtils.js');

await asyncUtils.readFileAsync('./data/config.json');
await asyncUtils.writeFileAsync('./data/config.json', '{}');
```

### 8. Test Retry Logic

```javascript
const { asyncUtils } = require('./utils/asyncUtils.js');

// Should retry with exponential backoff
const result = await asyncUtils.retryAsync(
  async () => {
    // Operation that might fail
    return await someUnstableOperation();
  },
  3,  // max retries
  100 // base delay
);
```

### 9. Monitor for Unhandled Rejections

The app should NOT show these errors in logs:

```
(node:1234) UnhandledPromiseRejectionWarning: Error: ...
```

If you see these, there's an async operation missing error handling.

### 10. Test Graceful Error Recovery

Verify the app continues running after errors:

1. Start app
2. Trigger an error (invalid request)
3. App should respond with error JSON
4. Make valid request - should work normally
5. App should NOT restart

## Performance Testing

### 1. File I/O Performance
```javascript
// Should be non-blocking
const start = Date.now();
const p1 = fs.readFile('/path1');
const p2 = fs.readFile('/path2');
await Promise.all([p1, p2]);
// Should take ~parallel time, not sequential

console.log(`Duration: ${Date.now() - start}ms`);
```

### 2. Error Handling Performance
```javascript
// Error handling should be fast
const iterations = 1000;
const start = Date.now();

for (let i = 0; i < iterations; i++) {
  try {
    throw new AppError('Test error');
  } catch (err) {
    // Handle error
  }
}

console.log(`${iterations} errors/ms: ${(Date.now() - start) / iterations}`);
```

## Regression Tests

### 1. Authentication Still Works
- User registration ✓
- User login ✓
- Password reset ✓
- Token validation ✓

### 2. Scheduler Still Works
- Job scheduling ✓
- Manual job execution ✓
- Job history tracking ✓
- Failed job notification ✓

### 3. Agent Management Still Works
- Agent registration ✓
- Agent status updates ✓
- Agent config persistence ✓
- Agent deletion ✓

### 4. Script Execution Still Works
- Script upload ✓
- Script execution ✓
- Execution logging ✓
- Error notification ✓

## Debugging Tips

### 1. Check Error Handler Registration
```javascript
// In server.js, before app.listen:
console.log('Error handler registered:', 
  app._router.stack.some(m => m.name === 'errorHandlerMiddleware'));
```

### 2. Enable Debug Logging
```javascript
// In server.js
if (process.env.DEBUG_ASYNC) {
  logger.level = 'debug';
}
```

### 3. Trace Async Operations
```javascript
// Add logging around async calls
const { asyncHandler } = require('./utils/errorHandler.js');

app.post('/test', asyncHandler(async (req, res) => {
  console.log('[TRACE] Entering handler');
  try {
    const data = await someAsyncOp();
    console.log('[TRACE] Got data:', data);
    res.json(data);
  } finally {
    console.log('[TRACE] Exiting handler');
  }
}));
```

### 4. Check Promise State
```javascript
// In scheduler.js
const result = scheduler.runJob('test-job');
console.log('Promise state:', result instanceof Promise);
result
  .then(() => console.log('Job succeeded'))
  .catch(err => console.log('Job failed:', err.message));
```

## Automated Tests

### Integration Test Template
```javascript
describe('Async/Await Standardization', () => {
  
  test('asyncHandler catches thrown errors', async () => {
    const res = await request(app)
      .get('/test-error');
    
    expect(res.status).toBe(500);
    expect(res.body.code).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });

  test('scheduler init works', async () => {
    expect(async () => {
      await scheduler.init();
    }).not.toThrow();
  });

  test('agents init works', async () => {
    expect(async () => {
      await agents.init();
    }).not.toThrow();
  });

  test('file operations are async', async () => {
    const start = Date.now();
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(asyncUtils.readFileAsync('./package.json'));
    }
    await Promise.all(promises);
    const duration = Date.now() - start;
    
    // Should be < 100-200ms for 10 parallel reads
    // NOT > 1000ms for sequential reads
    expect(duration).toBeLessThan(1000);
  });
});
```

## Deployment Checklist

Before deploying these changes:

- [ ] All tests passing
- [ ] No console errors on startup
- [ ] Error handler properly logging
- [ ] Scheduler initializes correctly
- [ ] Agents load successfully
- [ ] File operations work
- [ ] Authentication routes working
- [ ] No unhandled promise rejections
- [ ] Logs show proper error context
- [ ] Rollback plan documented

## Success Indicators

✅ App starts without errors
✅ Error handler middleware active
✅ Errors have proper HTTP status codes
✅ Errors logged with full context
✅ No more callback-style code
✅ All async operations awaited
✅ Scheduler works properly
✅ Agent config persists correctly
✅ File operations non-blocking
✅ Authentication flows work
