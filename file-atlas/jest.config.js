module.exports = {
  // Test environment setup
  testEnvironment: 'node',
  // Include Electron-specific test environment for renderer process tests
  testEnvironmentOptions: {
    url: 'http://localhost'
  },

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],

  // Coverage reporting configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  collectCoverageFrom: [
    'app/**/*.js',
    '!app/node_modules/**',
    '!app/renderer/vendor/**'
  ],

  // Module file extensions for importing
  moduleFileExtensions: ['js', 'json'],

  // Setup files
  setupFiles: ['./tests/setup.js'],

  // Transform configuration
  transform: {
    '^.+\\.js$': 'babel-jest'
  },

  // Test timeout
  testTimeout: 10000,

  // Verbose output
  verbose: true
}