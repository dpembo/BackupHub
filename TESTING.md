# Orchelium Testing Guide

## Overview

This document describes how to run the test suite for Orchelium. The test infrastructure uses Jest as the testing framework with comprehensive mocking for all module dependencies.

## Prerequisites

Ensure Node.js (version 14+) and npm are installed on your system.

## Installation

1. **Install dependencies** (including Jest):
   ```bash
   npm install
   ```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode (re-run on file changes)
```bash
npm test:watch
```

### Run tests with coverage report
```bash
npm test:coverage
```

## Test Structure

Tests are organized into two main directories:

```
tests/
├── utils/                          # Utility function tests
│   ├── errorHandler.test.js       # AppError class and asyncHandler middleware
│   └── dateTimeUtils.test.js      # Date/time formatting utilities
├── modules/                        # Core module tests
│   ├── agents.test.js             # Agent management system
│   ├── history.test.js            # Job history persistence
│   ├── running.test.js            # Active job tracking
│   └── scheduler.test.js          # Job scheduling engine
└── routes/                         # Route handler tests
    └── server.test.js             # Express route mocking and responses
```

## Test Suites Description

### Utils Tests

#### **errorHandler.test.js** (~80 lines)
Tests the centralized error handling system:
- `AppError` class creation and properties
- `asyncHandler` middleware for wrapping async route handlers
- Error passing to Express next() middleware

**Key Tests:**
```javascript
✓ AppError stores statusCode
✓ asyncHandler catches async errors
✓ asyncHandler passes error to next middleware
```

#### **dateTimeUtils.test.js** (~200 lines)
Tests date/time formatting utilities:
- `displaySecs()` - Convert seconds to human-readable format (e.g., "2 hours 30 mins")
- `displayFormatDate()` - Format dates with optional time delta
- `convertToTimezone()` - Convert dates between timezones
- `applyTz()` - Apply timezone formatting

**Key Tests:**
```javascript
✓ displaySecs formats seconds to minutes
✓ displaySecs formats seconds to hours  
✓ displaySecs formats seconds to days
✓ Timezone conversion for London/New York
✓ Date delta formatting (e.g., "2 hours ago")
```

### Module Tests

#### **agents.test.js** (~220 lines)
Tests the agent management system:
- Load agent configuration from json file
- Register/update agents
- Retrieve agent status and properties
- Delete agents from configuration
- Handle online/offline status

**Key Tests:**
```javascript
✓ init() loads agents from config file
✓ getAgent() retrieves agent by name
✓ registerAgent() creates new agent
✓ updateAgentStatus() updates all fields
✓ deleteAgent() removes from config and persists
✓ Online status correctly handled
```

**Mock Dependencies:**
- `fs/promises` - File system operations
- `db.js` - Database persistence

#### **history.test.js** (~150 lines)
Tests job history storage and retrieval:
- Load history from database on startup
- Add new history entries
- Persist to database after modifications
- Search and filter history items
- Format entries with timezone info

**Key Tests:**
```javascript
✓ init() loads from database
✓ add() creates and persists history entry
✓ searchItemWithName() finds partial matches
✓ getItemsUsingTZ() formats with timezone
✓ Database persistence called correctly
```

**Mock Dependencies:**
- `db.js` - Database persistence (LevelDB)
- `dateTimeUtils.js` - Date formatting

#### **running.test.js** (~180 lines)
Tests in-flight job tracking with persistence:
- Track jobs currently executing
- Persist running jobs to database
- Remove completed jobs and update database
- Enforce maximum item limits
- Search and match job names

**Key Tests:**
```javascript
✓ init() loads from database on startup
✓ add() persists new running job
✓ removeItemByIndex() deletes and persists
✓ Max items limit enforcement
✓ getItemByName() finds exact matches
```

**Mock Dependencies:**
- `db.js` - Database persistence (LevelDB)
- `dateTimeUtils.js` - Date formatting

#### **scheduler.test.js** (~200 lines)
Tests job scheduling engine:
- Initialize scheduler and load schedules
- Retrieve schedules by name or all schedules
- Execute manual job runs with agent status checks
- Delete and update schedules
- Calculate next run dates

**Key Tests:**
```javascript
✓ getSchedule() retrieves schedule by name
✓ manualJobRun() validates agent is online
✓ manualJobRun() rejects offline agents
✓ manualJobRun() rejects if agent missing
✓ updateSchedule() adds/modifies schedule
✓ getNextRunDate() calculates correctly
```

**Mock Dependencies:**
- `agents.js` - Agent status validation
- `history.js` - Save job results
- `db.js` - Persist schedules
- `notify.js` - Notifications
- `child_process` - Script execution

### Route Tests

#### **server.test.js** (~150 lines)
Tests Express route handlers and HTTP responses:
- Agent pre-checks before running jobs
- Offline agent error handling
- History data retrieval and pagination
- CSRF token validation
- Error passing to middleware
- Response formatting (JSON, redirects, renders)

**Key Tests:**
```javascript
✓ Gets agent status before running job
✓ Handles offline agent gracefully
✓ Returns paginated history data
✓ Includes schedule properties (icon, color)
✓ Validates CSRF tokens
✓ Passes errors to Express middleware
```

**Mock Dependencies:**
- `agents.js` - Agent database
- `scheduler.js` - Schedule database
- `history.js` - History data
- `db.js` - General persistence

## Mocking Strategy

All tests use Jest mocks to isolate modules from their dependencies:

### Database Mocking (db.js)
```javascript
jest.mock('../db.js');
db.getData = jest.fn().mockResolvedValue(null);
db.putData = jest.fn().mockResolvedValue(true);
```

### File System Mocking (fs/promises)
```javascript
jest.mock('fs/promises');
const fs = require('fs/promises');
fs.readFile = jest.fn().mockResolvedValue(JSON.stringify(data));
```

### Global Setup
All tests set up required globals before running:
```javascript
global.logger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

global.serverConfig = {
  server: { timezone: 'Europe/London' },
};
```

## Writing New Tests

### Basic Test Template
```javascript
describe('Module name', () => {
  let moduleUnderTest;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    
    // Set up global mocks
    global.logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    
    // Mock dependencies
    jest.mock('../dependency.js');
    
    // Import module under test
    moduleUnderTest = require('../module.js');
  });

  afterEach(() => {
    delete global.logger;
  });

  it('should do something', () => {
    expect(moduleUnderTest.method()).toBe(expectedValue);
  });
});
```

### Testing Async Functions
```javascript
it('should load data from database', async () => {
  db.getData = jest.fn().mockResolvedValue({ key: 'value' });
  
  const result = await module.init();
  
  expect(result).toBeDefined();
  expect(db.getData).toHaveBeenCalled();
});
```

## Coverage Goals

The test suite aims for:
- **Statements**: 80%+ coverage
- **Branches**: 75%+ coverage
- **Functions**: 80%+ coverage
- **Lines**: 80%+ coverage

View coverage report:
```bash
npm test:coverage
```

Coverage report is generated in the `coverage/` directory with an HTML report accessible at `coverage/lcov-report/index.html`.

## CI/CD Integration

These tests are designed to run in GitHub Actions and other CI/CD systems. The test framework:
- ✅ Runs without external dependencies (all mocked)
- ✅ Uses Jest's built-in coverage reporting
- ✅ Supports JUnit XML output for CI systems
- ✅ Completes in under 30 seconds

### GitHub Actions Example
```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test -- --coverage
      - uses: actions/upload-artifact@v3
        with:
          name: coverage
          path: coverage/
```

## Troubleshooting

### Tests timeout
Increase the Jest timeout in `jest.config.js`:
```javascript
testTimeout: 20000 // 20 seconds
```

### Mock not working
Ensure mocks are set up **before** requiring the module:
```javascript
jest.mock('../db.js'); // Must be before require
const db = require('../db.js');
```

### Missing globals
All tests assume these globals are available:
```javascript
global.logger
global.serverConfig
global.agentComms (if using agent communication)
global.mqttTransport (if testing MQTT)
```

## Contributing Tests

When adding new features:
1. Write tests in the appropriate `tests/modules/` or `tests/utils/` file
2. Use existing test patterns as templates
3. Ensure all mocks are properly configured
4. Run `npm test:coverage` to verify coverage
5. Commit both code and tests together

## Performance Notes

- Tests complete in 1-3 seconds on modern systems
- No external services required (all mocked)
- Suitable for rapid feedback during development
- Can run on every commit without performance impact
