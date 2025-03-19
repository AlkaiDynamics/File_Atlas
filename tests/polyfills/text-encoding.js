/**
 * TextEncoder/TextDecoder polyfill for Jest tests
 */

// Create polyfills before any imports are processed
import { TextEncoder, TextDecoder } from 'util';

// Use globalThis instead of global for ES modules
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;

console.log('TextEncoder/TextDecoder polyfills installed');

// export as default for CommonJS compatibility
export default {
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder
};
