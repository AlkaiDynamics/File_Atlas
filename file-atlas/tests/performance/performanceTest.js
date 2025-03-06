const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Performance metrics collector
class PerformanceMetrics {
    constructor() {
        this.metrics = {
            loadTime: 0,
            renderTime: 0,
            memoryUsage: 0,
            frameRate: 0
        };
    }

    toJSON() {
        return this.metrics;
    }

    saveToFile(filename) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = path.join(__dirname, 'results', `${filename}_${timestamp}.json`);
        fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(this.metrics, null, 2));
        console.log(`Performance results saved to: ${outputPath}`);
    }
}

// Main benchmarking function
async function runPerformanceBenchmark() {
    const metrics = new PerformanceMetrics();
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        
        // Enable performance metrics collection
        await page.setCacheEnabled(false);
        await page.coverage.startJSCoverage();

        // Measure page load time
        const start = Date.now();
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
        metrics.metrics.loadTime = Date.now() - start;

        // Measure render time for tree update
        metrics.metrics.renderTime = await page.evaluate(() => {
            return new Promise(resolve => {
                const start = performance.now();
                // Assuming update() is the tree update function
                if (typeof update === 'function') {
                    update(root);
                    const end = performance.now();
                    resolve(end - start);
                } else {
                    resolve(0);
                }
            });
        });

        // Measure memory usage
        const performanceMetrics = await page.metrics();
        metrics.metrics.memoryUsage = performanceMetrics.JSHeapUsedSize / (1024 * 1024); // Convert to MB

        // Measure frame rate during interaction
        metrics.metrics.frameRate = await page.evaluate(() => {
            return new Promise(resolve => {
                let frames = 0;
                const startTime = performance.now();
                const duration = 1000; // Measure for 1 second

                function countFrame() {
                    frames++;
                    if (performance.now() - startTime < duration) {
                        requestAnimationFrame(countFrame);
                    } else {
                        resolve(frames);
                    }
                }

                requestAnimationFrame(countFrame);
            });
        });

        // Save results
        metrics.saveToFile('performance_benchmark');
        
        // Log results to console
        console.log('Performance Benchmark Results:');
        console.log('---------------------------');
        console.log(`Initial Load Time: ${metrics.metrics.loadTime}ms`);
        console.log(`Tree Render Time: ${metrics.metrics.renderTime}ms`);
        console.log(`Memory Usage: ${metrics.metrics.memoryUsage.toFixed(2)}MB`);
        console.log(`Frame Rate: ${metrics.metrics.frameRate}fps`);

    } catch (error) {
        console.error('Benchmark failed:', error);
    } finally {
        await browser.close();
    }
}

// Run the benchmark
runPerformanceBenchmark().catch(console.error);