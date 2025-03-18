/**
 * Test script for all three file handlers in PDFSpark
 * Tests preview, original, and result file access
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:5001';
const API_BASE_URL = `${API_URL}/api`;

/**
 * Test all file handlers for a given file ID
 */
async function testAllHandlers(fileId) {
  console.log('\n=== PDFSpark File Handlers Test ===');
  console.log(`Testing file ID: ${fileId}\n`);
  
  if (!fileId) {
    console.error('No file ID provided. Please provide a file ID as the first argument.');
    process.exit(1);
  }
  
  // 1. Test original file access
  await testOriginalFile(fileId);
  
  // 2. Test preview file access
  await testPreviewFile(fileId);
  
  // 3. Test result file access
  await testResultFile(fileId);
}

/**
 * Test original file access
 */
async function testOriginalFile(fileId) {
  console.log('=== Testing Original File Handler ===');
  
  // Determine likely extensions for the original file
  const extensions = ['.pdf', '.docx', '.xlsx', '.jpg', '.jpeg', '.png'];
  let success = false;
  
  for (const ext of extensions) {
    const filename = `${fileId}${ext}`;
    const url = `${API_BASE_URL}/files/original/${filename}`;
    
    console.log(`Testing URL: ${url}`);
    
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        validateStatus: false
      });
      
      console.log(`Response status: ${response.status}`);
      
      if (response.status >= 200 && response.status < 300) {
        console.log('✅ Successfully accessed original file');
        console.log('Content type:', response.headers['content-type']);
        console.log('Content length:', response.data.length);
        
        // Save the file to verify
        const savePath = path.join(__dirname, 'test-files', `original-test-result${ext}`);
        
        // Ensure test-files directory exists
        const testDir = path.join(__dirname, 'test-files');
        if (!fs.existsSync(testDir)) {
          fs.mkdirSync(testDir, { recursive: true });
        }
        
        fs.writeFileSync(savePath, Buffer.from(response.data));
        console.log(`Saved original file to: ${savePath}`);
        
        success = true;
        break;
      } else if (response.status === 302) {
        // Got a redirect
        console.log(`Got redirect to: ${response.headers.location}`);
        
        // Try to follow the redirect
        try {
          const redirectResponse = await axios.get(response.headers.location, {
            responseType: 'arraybuffer'
          });
          
          console.log('✅ Successfully followed redirect');
          console.log('Content type:', redirectResponse.headers['content-type']);
          console.log('Content length:', redirectResponse.data.length);
          
          // Save the file
          const savePath = path.join(__dirname, 'test-files', `original-redirect-result${ext}`);
          fs.writeFileSync(savePath, Buffer.from(redirectResponse.data));
          console.log(`Saved redirected original file to: ${savePath}`);
          
          success = true;
          break;
        } catch (redirectError) {
          console.error(`Error following redirect: ${redirectError.message}`);
        }
      }
    } catch (error) {
      console.error(`Error accessing original file: ${error.message}`);
    }
  }
  
  if (!success) {
    console.log('❌ Failed to access original file with any extension');
  }
  
  console.log('\n');
}

/**
 * Test preview file access
 */
async function testPreviewFile(fileId) {
  console.log('=== Testing Preview File Handler ===');
  
  const previewUrl = `${API_BASE_URL}/files/preview/${fileId}.pdf`;
  console.log(`Testing URL: ${previewUrl}`);
  
  try {
    const response = await axios.get(previewUrl, {
      responseType: 'arraybuffer',
      validateStatus: false
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.status >= 200 && response.status < 300) {
      console.log('✅ Successfully accessed preview file');
      console.log('Content type:', response.headers['content-type']);
      console.log('Content length:', response.data.length);
      
      // Save the file to verify - use jpg extension since previews are actually JPGs
      const savePath = path.join(__dirname, 'test-files', `preview-test-result.jpg`);
      
      // Ensure test-files directory exists
      const testDir = path.join(__dirname, 'test-files');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      
      fs.writeFileSync(savePath, Buffer.from(response.data));
      console.log(`Saved preview file to: ${savePath}`);
    } else if (response.status === 302) {
      // Got a redirect
      console.log(`Got redirect to: ${response.headers.location}`);
      
      // Try to follow the redirect
      try {
        const redirectResponse = await axios.get(response.headers.location, {
          responseType: 'arraybuffer'
        });
        
        console.log('✅ Successfully followed redirect');
        console.log('Content type:', redirectResponse.headers['content-type']);
        console.log('Content length:', redirectResponse.data.length);
        
        // Save the file
        const savePath = path.join(__dirname, 'test-files', `preview-redirect-result.jpg`);
        fs.writeFileSync(savePath, Buffer.from(redirectResponse.data));
        console.log(`Saved redirected preview file to: ${savePath}`);
      } catch (redirectError) {
        console.error(`Error following redirect: ${redirectError.message}`);
      }
    } else {
      console.log('❌ Failed to access preview file');
    }
  } catch (error) {
    console.error(`Error accessing preview file: ${error.message}`);
  }
  
  console.log('\n');
}

/**
 * Test result file access
 */
async function testResultFile(fileId) {
  console.log('=== Testing Result File Handler ===');
  
  // Try common output formats
  const extensions = ['.pdf', '.docx', '.txt', '.xlsx'];
  let success = false;
  
  for (const ext of extensions) {
    const url = `${API_BASE_URL}/files/result/${fileId}${ext}`;
    console.log(`Testing URL: ${url}`);
    
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        validateStatus: false
      });
      
      console.log(`Response status: ${response.status}`);
      
      if (response.status >= 200 && response.status < 300) {
        console.log('✅ Successfully accessed result file');
        console.log('Content type:', response.headers['content-type']);
        console.log('Content length:', response.data.length);
        
        // Save the file to verify
        const savePath = path.join(__dirname, 'test-files', `result-test-output${ext}`);
        
        // Ensure test-files directory exists
        const testDir = path.join(__dirname, 'test-files');
        if (!fs.existsSync(testDir)) {
          fs.mkdirSync(testDir, { recursive: true });
        }
        
        fs.writeFileSync(savePath, Buffer.from(response.data));
        console.log(`Saved result file to: ${savePath}`);
        
        success = true;
        break;
      } else if (response.status === 302) {
        // Got a redirect
        console.log(`Got redirect to: ${response.headers.location}`);
        
        // Try to follow the redirect
        try {
          const redirectResponse = await axios.get(response.headers.location, {
            responseType: 'arraybuffer'
          });
          
          console.log('✅ Successfully followed redirect');
          console.log('Content type:', redirectResponse.headers['content-type']);
          console.log('Content length:', redirectResponse.data.length);
          
          // Save the file
          const savePath = path.join(__dirname, 'test-files', `result-redirect-output${ext}`);
          fs.writeFileSync(savePath, Buffer.from(redirectResponse.data));
          console.log(`Saved redirected result file to: ${savePath}`);
          
          success = true;
          break;
        } catch (redirectError) {
          console.error(`Error following redirect: ${redirectError.message}`);
        }
      }
    } catch (error) {
      console.error(`Error accessing result file: ${error.message}`);
    }
  }
  
  if (!success) {
    console.log('❌ Failed to access result file with any extension');
  }
}

// Get file ID from command line argument
const fileId = process.argv[2];

// Run tests
testAllHandlers(fileId);