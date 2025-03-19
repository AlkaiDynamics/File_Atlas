const { JSDOM } = require('jsdom');
const { TextEncoder, TextDecoder } = require('./tests/polyfills/text-encoding');

module.exports = {
  // Environment setup
  testEnvironment: 'jsdom',
  setupFiles: ['./tests/setup.cjs'],
  
  // Transform configuration
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // Mock configurations
  moduleNameMapper: {
    '^d3$': '<rootDir>/tests/mocks/d3.cjs',
    '^../../app/renderer/components/tooltip$': '<rootDir>/tests/mocks/tooltip.cjs'
  },
  
  // Test pattern matching
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.test.cjs',
    '**/tests/simple-test.cjs'
  ],
  
  // Allow transforming node_modules packages that use ES modules
  transformIgnorePatterns: [
    'node_modules/(?!(d3|d3-*)/)',
    'node_modules/(?!d3|@d3)'
  ],
  
  // Other settings
  verbose: true,
  
  // Add JSDOM configuration
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons']
  }
};