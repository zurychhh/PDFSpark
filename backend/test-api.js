// Backend API Test Script
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

// Configure these variables
const API_URL = process.env.VITE_API_URL || 'http://localhost:5001';
const TEST_FILE_PATH = './test-file.pdf'; // Create a small test PDF

// Create a simple test PDF file if it doesn't exist
if (!fs.existsSync(TEST_FILE_PATH)) {
  console.log('Creating test PDF file...');
  const minimalPdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%EOF';
  fs.writeFileSync(TEST_FILE_PATH, minimalPdf);
  console.log(`Created test file at ${TEST_FILE_PATH}`);
}

async function testFileUpload() {
  console.log('Running diagnostic tests on API at:', API_URL);
  
  // 1. Test basic connectivity
  try {
    const response = await axios.get(`${API_URL}/api/diagnostic/file-system`);
    console.log('File system diagnostic:', response.data);
  } catch (error) {
    console.error('File system diagnostic failed:', error.message);
    if (error.response) console.error('Error details:', error.response.data);
  }

  // 2. Test file upload
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(TEST_FILE_PATH));
    
    const response = await axios.post(`${API_URL}/api/files/upload`, form, {
      headers: {
        ...form.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    console.log('File upload test result:', response.data);
    return response.data.fileId; // Return for conversion test
  } catch (error) {
    console.error('File upload test failed:', error.message);
    if (error.response) console.error('Error details:', error.response.data);
    return null;
  }
}

async function testFileConversion(fileId) {
  if (!fileId) {
    console.log('Skipping conversion test due to upload failure');
    return null;
  }
  
  try {
    const response = await axios.post(`${API_URL}/api/convert`, {
      fileId,
      sourceFormat: 'pdf',
      targetFormat: 'txt',
      options: {}
    });
    
    console.log('Conversion test result:', response.data);
    return response.data.operationId;
  } catch (error) {
    console.error('Conversion test failed:', error.message);
    if (error.response) console.error('Error details:', error.response.data);
    return null;
  }
}

async function testFileDownload(operationId) {
  if (!operationId) {
    console.log('Skipping download test due to conversion failure');
    return;
  }
  
  // Wait for conversion to complete
  let status = 'pending';
  let attempts = 0;
  const maxAttempts = 10;
  
  while (status === 'pending' && attempts < maxAttempts) {
    try {
      const response = await axios.get(`${API_URL}/api/operations/${operationId}/status`);
      status = response.data.status;
      console.log(`Conversion status (attempt ${attempts + 1}):`, status);
      
      if (status === 'completed') {
        break;
      } else if (status === 'failed') {
        console.error('Conversion failed:', response.data.errorMessage);
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      attempts++;
    } catch (error) {
      console.error('Status check failed:', error.message);
      return;
    }
  }
  
  if (status !== 'completed') {
    console.log('Conversion did not complete in time');
    return;
  }
  
  // Test download
  try {
    const response = await axios.get(`${API_URL}/api/operations/${operationId}/download`);
    console.log('Download test result:', response.data);
    
    // Test actually downloading the file
    if (response.data.downloadUrl) {
      try {
        const fileResponse = await axios.get(response.data.downloadUrl, {
          responseType: 'arraybuffer'
        });
        console.log('File download successful. Size:', fileResponse.data.length, 'bytes');
      } catch (error) {
        console.error('File download failed:', error.message);
      }
    }
  } catch (error) {
    console.error('Download endpoint test failed:', error.message);
    if (error.response) console.error('Error details:', error.response.data);
  }
}

async function runTests() {
  console.log('====== PDFSpark API Test Suite ======');
  console.log('Starting tests at:', new Date().toISOString());
  console.log('API URL:', API_URL);
  console.log('Test file:', TEST_FILE_PATH);
  console.log('===================================');
  
  const fileId = await testFileUpload();
  const operationId = await testFileConversion(fileId);
  await testFileDownload(operationId);
  
  console.log('===================================');
  console.log('Tests completed at:', new Date().toISOString());
  console.log('===================================');
}

runTests();