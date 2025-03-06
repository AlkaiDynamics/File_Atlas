const puppeteer = require('puppeteer');
const { performance } = require('perf_hooks');
const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');

describe('Performance Benchmarking', () => {
  let browser;
  let page;
  let chrome;

  beforeAll(async () => {
    chrome = await chromeLauncher.launch();
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox']
    });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
    await chrome.kill();
  });

  test('Initial Load Performance', async () => {
    const startTime = performance.now();
    await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle0'
    });
    const loadTime = performance.now() - startTime;
    expect(loadTime).toBeLessThan(3000); // Should load under 3 seconds

    // Lighthouse performance audit
    const results = await lighthouse('http://localhost:3000', {
      port: chrome.port,
      onlyCategories: ['performance']
    });
    expect(results.lhr.categories.performance.score).toBeGreaterThan(0.8); // Score should be > 80%
  });

  test('File Tree Rendering Performance', async () => {
    await page.waitForSelector('.file-tree');
    const metrics = await page.metrics();
    expect(metrics.ScriptDuration).toBeLessThan(100); // Script execution time
    expect(metrics.TaskDuration).toBeLessThan(200); // Total task time

    // Test tree node rendering speed
    const renderMetrics = await page.evaluate(() => {
      const startTime = performance.now();
      document.querySelector('.file-tree').querySelectorAll('.tree-node');
      return performance.now() - startTime;
    });
    expect(renderMetrics).toBeLessThan(50); // Node rendering under 50ms
  });

  test('Memory Usage', async () => {
    const performanceMetrics = await page.evaluate(() => performance.memory);
    expect(performanceMetrics.usedJSHeapSize).toBeLessThan(100 * 1024 * 1024); // Less than 100MB

    // Test memory leaks
    const initialMemory = performanceMetrics.usedJSHeapSize;
    await page.reload({ waitUntil: 'networkidle0' });
    const afterMemory = (await page.evaluate(() => performance.memory)).usedJSHeapSize;
    expect(afterMemory - initialMemory).toBeLessThan(10 * 1024 * 1024); // Memory growth < 10MB
  });

  test('Frame Rate During Navigation', async () => {
    const fps = await page.evaluate(() => {
      return new Promise(resolve => {
        let frames = 0;
        const startTime = performance.now();
        function countFrames() {
          frames++;
          if (performance.now() - startTime < 1000) {
            requestAnimationFrame(countFrames);
          } else {
            resolve(frames);
          }
        }
        requestAnimationFrame(countFrames);
      });
    });
    expect(fps).toBeGreaterThan(30); // Should maintain at least 30 FPS
  });

  test('Resource Loading', async () => {
    const resourceTimings = await page.evaluate(() => {
      return performance.getEntriesByType('resource').map(entry => ({
        name: entry.name,
        duration: entry.duration
      }));
    });
    
    resourceTimings.forEach(timing => {
      expect(timing.duration).toBeLessThan(1000); // Each resource should load under 1s
    });
  });
});