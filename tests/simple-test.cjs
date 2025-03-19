/**
 * Simple test to verify Jest environment
 */

const { describe, test, expect } = require('@jest/globals');

describe('Simple Tests', () => {
  let container;
  
  beforeEach(() => {
    // Setup test environment
    container = document.createElement('div');
    container.id = 'tree-container';
    document.body.appendChild(container);
  });
  
  afterEach(() => {
    document.body.removeChild(container);
  });
  
  test('basic environment setup', () => {
    // Check DOM environment
    expect(document).toBeDefined();
    expect(window).toBeDefined();
    expect(container).toBeTruthy();
    expect(document.getElementById('tree-container')).toBe(container);
    
    // Create and verify a DOM element
    const div = document.createElement('div');
    div.textContent = "Test Element";
    document.body.appendChild(div);
    
    expect(document.body.textContent).toContain('Test Element');
    
    // Clean up
    document.body.removeChild(div);
  });
  
  test('TextEncoder is available', () => {
    expect(TextEncoder).toBeDefined();
    const encoder = new TextEncoder();
    const encoded = encoder.encode('test');
    expect(encoded).toBeTruthy();
    expect(encoded.constructor.name).toBe('Uint8Array');
  });
});
