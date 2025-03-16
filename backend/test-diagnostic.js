const http = require('http');

// Function to make a GET request to the diagnostic endpoint
function testEndpoint(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse JSON: ' + e.message));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Wait for the server to be fully started
setTimeout(() => {
  // Test the memory diagnostic endpoint
  testEndpoint('/api/diagnostic/memory')
    .then(data => {
      console.log('===== MEMORY DIAGNOSTIC =====');
      console.log(JSON.stringify(data, null, 2));
    })
    .catch(error => {
      console.error('Memory diagnostic error:', error);
    });

  // Test the file system diagnostic endpoint
  testEndpoint('/api/diagnostic/file-system')
    .then(data => {
      console.log('\n===== FILE SYSTEM DIAGNOSTIC =====');
      console.log(JSON.stringify(data, null, 2));
    })
    .catch(error => {
      console.error('File system diagnostic error:', error);
    });

  // Test the health endpoint
  testEndpoint('/health')
    .then(data => {
      console.log('\n===== HEALTH CHECK =====');
      console.log(JSON.stringify(data, null, 2));
    })
    .catch(error => {
      console.error('Health check error:', error);
    });

  // Test the root endpoint
  testEndpoint('/')
    .then(data => {
      console.log('\n===== ROOT ENDPOINT =====');
      console.log(JSON.stringify(data, null, 2));
    })
    .catch(error => {
      console.error('Root endpoint error:', error);
    });
}, 2000); // Wait 2 seconds for the server to start

console.log('Running diagnostic tests...');