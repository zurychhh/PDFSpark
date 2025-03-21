/**
 * Simple health check endpoint for Railway
 * 
 * This script creates a HTTP server that provides health check
 * endpoints for the Railway platform's health check mechanism.
 */

const http = require('http');

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    // Memory usage statistics
    const memUsage = process.memoryUsage();
    const memoryPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
    
    // Check if memory usage is above warning threshold
    const memoryThreshold = process.env.MEMORY_WARNING_THRESHOLD || 0.6;
    const memoryWarning = (memUsage.heapUsed / memUsage.heapTotal) > memoryThreshold;
    
    // Response object
    const healthInfo = {
      status: memoryWarning ? 'warning' : 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        usedPercent: memoryPercent,
        warning: memoryWarning
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        memoryFallback: process.env.USE_MEMORY_FALLBACK === 'true',
        maxConcurrency: process.env.MAX_CONCURRENCY || '?'
      }
    };
    
    // Send response
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(healthInfo, null, 2));
  } else {
    // Route not found
    res.writeHead(404);
    res.end('Not found');
  }
});

// Start server on the same port as the main application
const PORT = process.env.PORT || 3000;
// Bind to all network interfaces (0.0.0.0) to make it accessible from outside
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Health check server running on port ${PORT} and bound to all interfaces`);
});

module.exports = server;