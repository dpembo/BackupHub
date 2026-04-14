module.exports = {
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/node_modules/'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'agent.js',
  ],
  testTimeout: 10000,
  // Ignore node_modules in tests
  modulePathIgnorePatterns: ['/node_modules/'],
  // Transform files to handle Node.js features
  transform: {},
  // Force exit after test completion to prevent hanging due to unclosed handles
  forceExit: true,
  // Set max workers to avoid resource issues
  maxWorkers: 1,
};
