# Async/Await Standardization - Quick Reference

## For Developers

### ✅ DO: Use asyncHandler for Express Routes

```javascript
const { asyncHandler } = require('./utils/errorHandler.js');

// Correct
app.get('/api/data', asyncHandler(async (req, res) => {
  const data = await db.getData(req.params.id);
  res.json(data);
}));

// Wrong ❌ (will lose errors)
app.get('/api/data', async (req, res) => {
  const data = await db.getData(req.params.id);
  res.json(data);
});
```

### ✅ DO: Throw AppError for Known Errors

```javascript
const { AppError, ValidationError } = require('./utils/errorHandler.js');

// Correct
app.post('/user', asyncHandler(async (req, res) => {
  if (!req.body.email) {
    throw new ValidationError('Email is required');
  }
  // ...
}));

// Wrong ❌ (loses error type)
app.post('/user', asyncHandler(async (req, res) => {
  if (!req.body.email) {
    throw new Error('Email is required');
  }
}));
```

### ✅ DO: Use fs.promises for File Operations

```javascript
const fs = require('fs').promises;
const { asyncUtils } = require('./utils/asyncUtils.js');

// Correct
async function readConfig() {
  try {
    const data = await fs.readFile('./config.json', 'utf8');
    return JSON.parse(data);
  } catch (err) {
    logger.error('Failed to read config:', err.message);
    throw new AppError('Configuration not found', 500);
  }
}

// Or use helper
const content = await asyncUtils.readFileAsync('./config.json');

// Wrong ❌ (blocks event loop)
const data = fs.readFileSync('./config.json');
```

### ✅ DO: Use Async/Await (not .then/.catch)

```javascript
// Correct
async function processData() {
  try {
    const users = await db.getUsers();
    const results = await Promise.all(users.map(u => processUser(u)));
    return results;
  } catch (err) {
    logger.error('Processing failed:', err.message);
    throw err;
  }
}

// Wrong ❌ (hard to read, error handling messy)
function processData() {
  return db.getUsers()
    .then(users => Promise.all(users.map(u => processUser(u))))
    .catch(err => {
      logger.error('Processing failed:', err.message);
    });
}
```

### ✅ DO: Return Promises from Sync Functions that Do Async Work

```javascript
// Correct - allows callers to await
function updateConfig() {
  const data = JSON.stringify(config);
  return fs.writeFile('./config.json', data, 'utf8');
}

// Usage
await updateConfig();
// or
updateConfig().catch(err => logger.error('Update failed:', err));
```

### ✅ DO: Add Error Context When Throwing

```javascript
// Correct - error has full context
throw new AppError(
  `Failed to fetch user ${userId}`, 
  404  // status code
);

// Better with custom error class
const { NotFoundError } = require('./utils/errorHandler.js');
throw new NotFoundError(`User ${userId} not found`);
```

## Error Handling Patterns

### Pattern 1: Route Handler (Express)
```javascript
app.post('/api/save', asyncHandler(async (req, res) => {
  // All thrown errors automatically caught and logged
  const item = await db.save(req.body);
  res.json({ success: true, data: item });
}));
```

### Pattern 2: Background Job
```javascript
async function runScheduledJob(jobName) {
  try {
    logger.info(`Starting job: ${jobName}`);
    const result = await executeJob(jobName);
    logger.info(`Job ${jobName} completed`);
    return result;
  } catch (err) {
    logger.error(`Job ${jobName} failed:`, err.message);
    throw err; // Let caller handle
  }
}
```

### Pattern 3: Service Class
```javascript
class UserService {
  async create(userData) {
    try {
      // validation
      await this.validateUser(userData);
      // operation
      const user = await db.insert(userData);
      // return
      return user;
    } catch (err) {
      if (err.code === 'DUPLICATE_KEY') {
        throw new AppError('User already exists', 400);
      }
      throw new AppError(`Failed to create user: ${err.message}`, 500);
    }
  }
}
```

## Common Mistakes to Avoid

❌ **DON'T**: Forget error handling
```javascript
async function bad() {
  await db.query(); // If this fails, app crashes
}
```

❌ **DON'T**: Not await async operations
```javascript
async function bad() {
  db.saveAsync(data); // Missing await!
  // Code continues before save completes
}
```

❌ **DON'T**: Swallow errors silently
```javascript
async function bad() {
  await db.save(data).catch(err => {
    // Silently ignored!
  });
}
```

❌ **DON'T**: Use callback patterns
```javascript
async function bad(callback) {
  fs.readFile('./file.json', (err, data) => {
    if (err) callback(err);
    else callback(null, JSON.parse(data));
  });
}
```

## Checking If Code Is Correct

Before submitting code, verify:
- [ ] All async functions are declared with `async`
- [ ] All async calls are awaited
- [ ] All Express routes use `asyncHandler`
- [ ] Error handling with try/catch where needed
- [ ] No callback-style code in new additions
- [ ] No fs.readFileSync/writeFileSync in async contexts
- [ ] Database operations properly awaited
- [ ] Errors thrown as AppError subclasses when possible
- [ ] Promises are awaited before returning

## Testing Your Changes

```javascript
// Test that errors are caught
const res = await request(app).post('/api/test').send({});
expect(res.status).toBe(400);
expect(res.body.message).toBeDefined();
expect(res.body.code).toBeDefined();
```

## Questions?

Refer to:
1. `ASYNC_STANDARDIZATION.md` - Complete implementation details
2. `utils/errorHandler.js` - Error class definitions
3. `utils/asyncUtils.js` - Async helper functions
