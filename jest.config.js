module.exports = {
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/node_modules/'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'agents.js',
    'scheduler.js',
    'history.js',
    'running.js',
    'db.js',
    'utils/**/*.js',
  ],
  testTimeout: 10000,
};
