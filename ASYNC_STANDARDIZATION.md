# Async/Await Standardization - Implementation Guide

## Overview
This document outlines all standardization changes made to eliminate async/await inconsistencies and implement centralized error handling throughout the BackupHub project.

## Files Created

### 1. `/utils/errorHandler.js`
**Purpose**: Centralized error handling and Express middleware integration

**Key Features**:
- `AppError` base error class with standardized structure
- Specialized error classes:
  - `ValidationError` - HTTP 400 validation failures
  - `AuthError` - HTTP 401 authentication failures
  - `ForbiddenError` - HTTP 403 permission denials
  - `NotFoundError` - HTTP 404 missing resources
  - `DatabaseError` - Database operation failures
- `errorHandlerMiddleware` - Express error handler (must be last middleware)
- `asyncHandler` - Wrapper for async Express route handlers with automatic error propagation
- `safeAsyncExecute` - Run async code with automatic logging
- Consistent error logging with context, metadata, and stack traces

**Usage**:
```javascript
const { asyncHandler, AppError } = require('./utils/errorHandler.js');

app.post('/route', asyncHandler(async (req, res) => {
  // Errors automatically caught and passed to error handler middleware
  throw new AppError('Custom error message', 400);
}));
```

### 2. `/utils/asyncUtils.js`
**Purpose**: Common async/await patterns and utilities

**Key Functions**:
- `readFileAsync()` - Promise-based file reading
- `writeFileAsync()` - Promise-based file writing
- `retryAsync()` - Retry with exponential backoff
- `delay_ms()` - Simple delay utility
- `parallelAsync()` - Run promises in parallel with error handling
- `withTimeout()` - Add timeout to any promise
- `safeJsonParse()` - JSON parsing with fallback
- `buildQueryString()` - URL query builder
- `getNestedValue()` - Safely traverse nested objects

## Files Modified

### 1. `server.js`
**Changes Made**:
- Added imports: `errorHandler.js` and `asyncUtils.js`
- Registered `errorHandlerMiddleware` (MUST be last middleware)
- Converted routes to use `asyncHandler` wrapper:
  - `GET /login.html`
  - `POST /login.html`
  - `GET /register.html`
  - `POST /register.html`
  - `POST /saveScript`
  - `POST /forgot.html`
  - `GET /reset/:token/:user`
  - `POST /reset/:token/:user`
  - `GET /initial-setup*.html` routes
  
**Error Handling Improvements**:
- All async route handlers now have automatic error catching
- Authentication errors throw `AuthError` (401)
- Validation errors throw `AppError` (400)
- All errors logged with context (method, path, user ID, IP)
- Stack traces included in responses (dev only)

### 2. `scheduler.js`
**Critical Changes**:
- Converted `init()` to async function
- Converted `readSchedules()` to async - uses `fs.promises`
- Converted `writeSchedules()` to async - returns Promise
- Converted `runJob()` to async - now awaits file operations
- Updated `manualJobRun()` to async - awaits `runJob()`
- Converted `scheduleJobs()` to async
- Updated `upsertSchedule()` to return async promise
- Made `deleteScheduleAtIndex()` async - awaits `writeSchedules()`
- Added error handling with try/catch blocks
- Replaced callback-based `readFile()` with fs.promises
- Scheduled jobs now catch errors with `.catch()` handlers

**Migration Pattern**:
```javascript
// OLD (Now prevented)
function readSchedules() {
  const data = fs.readFileSync(scheduleFile);
  schedules = JSON.parse(data);
}

// NEW (Standard)
async function readSchedules() {
  try {
    const data = await fs.readFile(scheduleFile, 'utf8');
    schedules = JSON.parse(data);
  } catch (err) {
    logger.error('Error:', err.message);
    schedules = [];
  }
}
```

### 3. `agents.js`
**Critical Changes**:
- Converted `init()` from sync to async
- Removed deprecated `initAsync()` function
- Converted `updateConfig()` to async
- Made `deleteAgent()` return Promise
- Made `addObjToAgentStatusDict()` return Promise
- Updated imports to include `fs.promises`
- Added centralized error handler imports

**Promises Returned**:
- `deleteAgent()` returns updateConfig() promise
- `addObjToAgentStatusDict()` returns updateConfig() promise
- Allows callers to await these operations

## Architecture

### Error Flow
```
Route Handler
    ↓
asyncHandler (catches errors)
    ↓
Throws AppError or other Error
    ↓
errorHandlerMiddleware (last middleware)
    ↓
Logs with context
    ↓
JSON Response with error details
```

### Async Patterns

**Pattern 1: Express Routes**
```javascript
app.post('/route', asyncHandler(async (req, res) => {
  const result = await someAsyncOp();
  if (!result) throw new AppError('Not found', 404);
  res.json(result);
}));
```

**Pattern 2: Scheduled/Background Operations**
```javascript
async function runJob(jobName) {
  try {
    const command = await fs.readFile(path, 'utf8');
    await executeCommand(command);
  } catch (err) {
    logger.error('Job failed:', err.message);
    throw err;
  }
}
```

**Pattern 3: Promises Returned (for async compatibility)**
```javascript
function deleteAgent(name) {
  delete agentStatusDict[name];
  return updateConfig(); // Returns Promise
}
```

## Consistency Standards Implemented

### 1. All Async Operations Use fs.promises
- ✅ No more `fs.readFileSync()` in async contexts
- ✅ No more callback-based `fs.readFile()`
- ✅ All file operations use `fs.promises` or async wrappers

### 2. All Route Handlers Wrapped with asyncHandler
- ✅ Errors automatically sent to error handler middleware
- ✅ No need for try/catch in route handlers (handled by wrapper)
- ✅ Consistent error response format

### 3. All Async Functions Have Error Handling
- ✅ Try/catch blocks around await calls
- ✅ Errors logged with context
- ✅ Errors thrown with proper error classes

### 4. Config Updates Async and Awaitable
- ✅ `agents.updateConfig()` returns Promise
- ✅ `scheduler.writeSchedules()` returns Promise
- ✅ Callers can await or attach `.catch()`

## Migration Checklist

For any NEW async code:
- [ ] Use `asyncHandler` for Express routes
- [ ] Use async/await, not promises/callbacks
- [ ] Use fs.promises for file operations
- [ ] Add try/catch around awaits
- [ ] Log errors with context
- [ ] Throw AppError subclasses for known errors
- [ ] Return Promises from sync functions that do async work

## Testing the Changes

### Test asyncHandler
```javascript
// Should catch error and pass to middleware
app.get('/test-error', asyncHandler(async (req, res) => {
  throw new Error('Test error');
}));
```

### Test Error Logging
Check logs have format:
```
[timestamp] [level] context - message
code: ERROR_CODE
statusCode: 400/500
```

### Test Scheduler
```javascript
// Should use await
await scheduler.init();
await scheduler.runJob('testJob', false);
```

## Breaking Changes

1. **scheduler.init()** - Now async, must be awaited
2. **scheduler.runJob()** - Now async, must be awaited  
3. **agents.init()** - Now async, must be awaited
4. **agents.updateConfig()** - Now async, returns Promise
5. **No more sync file operations** in async contexts

## Performance Impact

- Minimal - async/await has same performance as promises
- Improved error handling reduces crash frequency
- File operations are non-blocking

## Future Improvements

1. Add request/response interceptors for all HTTP operations
2. Implement circuit breakers for external API calls
3. Add distributed tracing with correlation IDs
4. Add metrics collection for async operations
5. Implement graceful shutdown with proper cleanup
