/**
 * Minimal Health Check Application for Railway
 * 
 * This is a standalone health check server that does nothing but respond
 * to health check requests. It's designed to be as simple as possible
 * to troubleshoot Railway health check issues.
 */

const http = require('http');

// Create a simple HTTP server
const server = http.createServer((req, res) => {
  console.log(`Request received: ${req.method} ${req.url} from ${req.headers['host'] || 'unknown'}`);

  // Respond to health check requests
  if (req.url === '/health') {
    console.log('Health check requested, responding with 200 OK');
    
    const healthData = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
    
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Connection': 'close'
    });
    
    res.end(JSON.stringify(healthData, null, 2));
  } 
  // Respond to root requests
  else if (req.url === '/') {
    console.log('Root path requested, responding with info page');
    
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Connection': 'close'
    });
    
    res.end(`
      <html>
        <head>
          <title>Railway Health Check App</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            pre { background: #f5f5f5; padding: 10px; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h1>Railway Health Check App</h1>
          <p>This is a minimal application that only serves health checks.</p>
          <p>Visit <a href="/health">/health</a> to see the health check response.</p>
          <p>Server has been up for ${process.uptime().toFixed(2)} seconds.</p>
          <h2>Environment</h2>
          <pre>${JSON.stringify(process.env, null, 2)}</pre>
        </body>
      </html>
    `);
  } 
  // Handle all other requests
  else {
    console.log('Non-health path requested, responding with 404');
    
    res.writeHead(404, {
      'Content-Type': 'text/plain',
      'Connection': 'close'
    });
    
    res.end('Not Found - This server only responds to /health and /');
  }
});

// Get port from environment or use 3000 as default
const PORT = process.env.PORT || 3000;

// IMPORTANT: Bind to 0.0.0.0 to make accessible outside the container
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Health check server is running on port ${PORT}`);
  console.log(`🔍 Health endpoint available at: http://localhost:${PORT}/health`);
  console.log(`📊 Process ID: ${process.pid}`);
  console.log(`🧠 Memory usage: ${JSON.stringify(process.memoryUsage())}`);
  console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
});

// Handle termination signals properly
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});