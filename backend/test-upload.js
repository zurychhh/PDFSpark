const http = require('http');
const fs = require('fs');
const path = require('path');

// Create a sample test file
const testFilePath = path.join(__dirname, 'test-file.txt');
fs.writeFileSync(testFilePath, 'This is a test file for upload diagnostics');

console.log('Testing file upload...');

// Function to make a POST request to test the file upload endpoints
function testUpload() {
  return new Promise((resolve, reject) => {
    // Read the test file
    const fileContent = fs.readFileSync(testFilePath);
    
    // Create a multipart form-data boundary
    const boundary = '----WebKitFormBoundary' + Math.random().toString(16).slice(2);
    
    // Create the multipart form-data body
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="test-file.txt"',
      'Content-Type: text/plain',
      '',
      fileContent.toString(),
      `--${boundary}--`
    ].join('\r\n');
    
    // Set up the request
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/test-upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    
    // Make the request
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: JSON.parse(data)
          });
        } catch (e) {
          reject(new Error('Failed to parse JSON: ' + e.message + ', Data: ' + data));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(body);
    req.end();
  });
}

// Function to test the diagnostic upload endpoint
function testDiagnosticUpload() {
  return new Promise((resolve, reject) => {
    // Read the test file
    const fileContent = fs.readFileSync(testFilePath);
    
    // Create a multipart form-data boundary
    const boundary = '----WebKitFormBoundary' + Math.random().toString(16).slice(2);
    
    // Create the multipart form-data body
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="test-file.txt"',
      'Content-Type: text/plain',
      '',
      fileContent.toString(),
      `--${boundary}--`
    ].join('\r\n');
    
    // Set up the request
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/diagnostic/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    
    // Make the request
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: JSON.parse(data)
          });
        } catch (e) {
          reject(new Error('Failed to parse JSON: ' + e.message + ', Data: ' + data));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(body);
    req.end();
  });
}

// Wait for the server to be fully started
setTimeout(async () => {
  try {
    // Test the simple upload endpoint
    console.log('Testing basic upload endpoint...');
    const uploadResult = await testUpload();
    console.log('\n===== BASIC UPLOAD TEST =====');
    console.log('Status Code:', uploadResult.statusCode);
    console.log('Response:', JSON.stringify(uploadResult.body, null, 2));
    
    // Test the diagnostic upload endpoint
    console.log('\nTesting diagnostic upload endpoint...');
    const diagnosticResult = await testDiagnosticUpload();
    console.log('\n===== DIAGNOSTIC UPLOAD TEST =====');
    console.log('Status Code:', diagnosticResult.statusCode);
    console.log('Response:', JSON.stringify(diagnosticResult.body, null, 2));
    
    // Clean up
    fs.unlinkSync(testFilePath);
    console.log('\nTest file cleaned up');
  } catch (error) {
    console.error('Error during tests:', error);
  }
}, 3000); // Wait 3 seconds for the server to start