/**
 * Jest setup file for CommonJS tests
 */

// First, set up TextEncoder/TextDecoder before any other imports
const { TextEncoder, TextDecoder } = require('util');

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Now create DOM environment
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><div id="tree-container"></div>', {
  url: 'http://localhost'
});

// Set up global objects
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.MouseEvent = dom.window.MouseEvent;
global.SVGElement = dom.window.SVGElement;

// Simple event simulation helper
global.simulateEvent = (element, eventName, options = {}) => {
  const event = new MouseEvent(eventName, {
    bubbles: true,
    cancelable: true,
    ...options
  });
  element.dispatchEvent(event);
  return event;
};

// Initialize d3.event for zoom handlers
global.d3 = {
  select: jest.fn(() => ({
    selectAll: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    append: jest.fn().mockReturnThis(),
    attr: jest.fn().mockReturnThis(),
    style: jest.fn().mockReturnThis(),
    text: jest.fn().mockReturnThis(),
    call: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    data: jest.fn().mockReturnThis(),
    enter: jest.fn().mockReturnThis()
  })),
  zoom: jest.fn(() => ({
    scaleExtent: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis()
  })),
  cluster: jest.fn(() => ({
    size: jest.fn().mockReturnThis(),
    separation: jest.fn().mockReturnThis()
  })),
  drag: jest.fn(() => ({
    on: jest.fn().mockReturnThis()
  })),
  zoomIdentity: {
    k: 1,
    x: 0,
    y: 0
  }
};

console.log('Jest setup file loaded successfully');
