/**
 * Standalone health check endpoint for Railway
 * 
 * This file creates a simple HTTP server that responds to health check requests
 * before the main application is loaded, solving timeout issues with Railway.
 */

const http = require('http');

// Create a simple HTTP server for health checks
const server = http.createServer((req, res) => {
  // Log all requests for debugging
  console.log(`Health server received: ${req.method} ${req.url} from ${req.headers['host'] || 'unknown'}`);

  // Respond to health check requests
  if (req.url === '/api/diagnostic/health') {
    console.log('Health check requested, responding with 200 OK');
    
    const healthData = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      message: 'PDFSpark health check endpoint is operational'
    };
    
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Connection': 'close'
    });
    
    res.end(JSON.stringify(healthData, null, 2));
  } 
  // Handle root requests
  else if (req.url === '/') {
    console.log('Root path requested, responding with startup page');
    
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Connection': 'close'
    });
    
    res.end(`
      <html>
        <head>
          <title>PDFSpark API - Starting</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; text-align: center; }
            h1 { color: #333; }
            .spinner { display: inline-block; width: 50px; height: 50px; border: 3px solid rgba(0,0,0,.3); border-radius: 50%; border-top-color: #333; animation: spin 1s ease-in-out infinite; margin: 20px; }
            @keyframes spin { to { transform: rotate(360deg); } }
            .status { margin: 20px; padding: 15px; background: #f5f5f5; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h1>PDFSpark API</h1>
          <div class="spinner"></div>
          <div class="status">
            <p>The server is starting up...</p>
            <p>Health endpoint is available at <code>/api/diagnostic/health</code></p>
            <p>Server has been up for ${process.uptime().toFixed(2)} seconds</p>
          </div>
        </body>
      </html>
    `);
  } 
  // Default response for all other paths
  else {
    console.log('Unknown path requested on health server, responding with redirect to health check');
    
    res.writeHead(302, {
      'Location': '/api/diagnostic/health',
      'Connection': 'close'
    });
    
    res.end();
  }
});

// Get port from environment or use 3000 as default
const PORT = process.env.PORT || 3000;

// IMPORTANT: Bind to 0.0.0.0 to make accessible outside the container
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Health check server started on port ${PORT}`);
  console.log(`🔍 Health endpoint available at: http://localhost:${PORT}/api/diagnostic/health`);
});

// Export the server for integration with the main application
module.exports = server;