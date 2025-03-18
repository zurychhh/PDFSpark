/**
 * Test script for verifying the enhanced Cloudinary fallback mechanism
 * 
 * This script tests both the original and preview file access with Cloudinary fallback
 * It demonstrates how the system handles various failure scenarios:
 * 1. When local files are missing
 * 2. When Cloudinary direct access fails (401/403)
 * 3. How the proxy mechanism works for content retrieval
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Import Cloudinary helper
const cloudinaryHelper = require('./utils/cloudinaryHelper');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:5001';
const API_BASE_URL = `${API_URL}/api`;

/**
 * Test the preview fallback mechanism
 */
async function testPreviewFallback(fileId) {
  console.log('\n=== Testing PDF Preview Fallback ===');
  console.log(`Testing preview for file ID: ${fileId}`);
  
  if (!fileId) {
    console.error('No file ID provided. Please provide a file ID as the first argument.');
    return false;
  }
  
  // Construct the preview URL
  const previewUrl = `${API_BASE_URL}/files/preview/${fileId}.pdf`;
  console.log(`Preview URL: ${previewUrl}`);
  
  try {
    // Try accessing the preview directly - this will test our fallback mechanism
    console.log('Accessing preview...');
    const response = await axios.get(previewUrl, {
      responseType: 'arraybuffer',
      validateStatus: status => true // Accept any status
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.status >= 200 && response.status < 300) {
      console.log('✅ Successfully accessed preview');
      console.log('Content type:', response.headers['content-type']);
      console.log('Content length:', response.data.length);
      
      // Save the preview to verify
      const previewSavePath = path.join(__dirname, 'test-files', `preview-test-${fileId}.jpg`);
      
      // Ensure test-files directory exists
      const testDir = path.join(__dirname, 'test-files');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      
      // Save the preview
      fs.writeFileSync(previewSavePath, Buffer.from(response.data));
      console.log(`Saved preview to: ${previewSavePath}`);
      
      return true;
    } else {
      console.log(`❌ Failed to access preview: HTTP ${response.status}`);
      if (response.data) {
        // Try to parse and display the error
        try {
          const errorText = Buffer.from(response.data).toString('utf8');
          console.error('Response data:', errorText);
        } catch (parseError) {
          console.error('Unable to parse response data');
        }
      }
      return false;
    }
  } catch (error) {
    console.error('Error accessing preview:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
    }
    return false;
  }
}

/**
 * Test the original file fallback mechanism
 */
async function testOriginalFileFallback(fileId) {
  console.log('\n=== Testing Original File Fallback ===');
  console.log(`Testing original file access for file ID: ${fileId}`);
  
  if (!fileId) {
    console.error('No file ID provided. Please provide a file ID as the first argument.');
    return false;
  }
  
  // Determine file extension - check in uploads directory
  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
  let extension = '.pdf'; // Default to PDF
  
  const possibleExtensions = ['.pdf', '.docx', '.xlsx', '.jpg', '.png'];
  for (const ext of possibleExtensions) {
    const filePath = path.join(uploadDir, `${fileId}${ext}`);
    if (fs.existsSync(filePath)) {
      extension = ext;
      console.log(`Found original file with extension: ${extension}`);
      break;
    }
  }
  
  // Construct the original file URL
  const originalUrl = `${API_BASE_URL}/files/original/${fileId}${extension}`;
  console.log(`Original file URL: ${originalUrl}`);
  
  try {
    // Try accessing the original file directly - this will test our fallback mechanism
    console.log('Accessing original file...');
    const response = await axios.get(originalUrl, {
      responseType: 'arraybuffer',
      validateStatus: status => true // Accept any status
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.status >= 200 && response.status < 300) {
      console.log('✅ Successfully accessed original file');
      console.log('Content type:', response.headers['content-type']);
      console.log('Content length:', response.data.length);
      
      // Save the file to verify
      const fileSavePath = path.join(__dirname, 'test-files', `original-test-${fileId}${extension}`);
      
      // Ensure test-files directory exists
      const testDir = path.join(__dirname, 'test-files');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      
      // Save the file
      fs.writeFileSync(fileSavePath, Buffer.from(response.data));
      console.log(`Saved original file to: ${fileSavePath}`);
      
      return true;
    } else {
      console.log(`❌ Failed to access original file: HTTP ${response.status}`);
      if (response.data) {
        // Try to parse and display the error
        try {
          const errorText = Buffer.from(response.data).toString('utf8');
          console.error('Response data:', errorText);
        } catch (parseError) {
          console.error('Unable to parse response data');
        }
      }
      return false;
    }
  } catch (error) {
    console.error('Error accessing original file:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
    }
    return false;
  }
}

/**
 * Test the result file fallback mechanism
 */
async function testResultFileFallback(fileId, extension = '.pdf') {
  console.log('\n=== Testing Result File Fallback ===');
  console.log(`Testing result file access for file ID: ${fileId}`);
  
  if (!fileId) {
    console.error('No file ID provided. Please provide a file ID as the first argument.');
    return false;
  }
  
  // Construct the result file URL
  const resultUrl = `${API_BASE_URL}/files/result/${fileId}${extension}`;
  console.log(`Result file URL: ${resultUrl}`);
  
  try {
    // Try accessing the result file directly - this will test our fallback mechanism
    console.log('Accessing result file...');
    const response = await axios.get(resultUrl, {
      responseType: 'arraybuffer',
      validateStatus: status => true // Accept any status
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.status >= 200 && response.status < 300) {
      console.log('✅ Successfully accessed result file');
      console.log('Content type:', response.headers['content-type']);
      console.log('Content length:', response.data.length);
      
      // Save the file to verify
      const fileSavePath = path.join(__dirname, 'test-files', `result-test-${fileId}${extension}`);
      
      // Ensure test-files directory exists
      const testDir = path.join(__dirname, 'test-files');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      
      // Save the file
      fs.writeFileSync(fileSavePath, Buffer.from(response.data));
      console.log(`Saved result file to: ${fileSavePath}`);
      
      return true;
    } else {
      console.log(`❌ Failed to access result file: HTTP ${response.status}`);
      if (response.data) {
        // Try to parse and display the error
        try {
          const errorText = Buffer.from(response.data).toString('utf8');
          console.error('Response data:', errorText);
        } catch (parseError) {
          console.error('Unable to parse response data');
        }
      }
      return false;
    }
  } catch (error) {
    console.error('Error accessing result file:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
    }
    return false;
  }
}

/**
 * Test the fallback mechanism when local files are intentionally removed
 */
async function testFallbackWithRemovedFiles(fileId) {
  console.log('\n=== Testing Fallback with Removed Local Files ===');
  
  if (!fileId) {
    console.error('No file ID provided. Please provide a file ID as the first argument.');
    return false;
  }
  
  // Find the local files
  const tempDir = process.env.TEMP_DIR || path.join(__dirname, 'temp');
  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
  
  const previewPath = path.join(tempDir, `${fileId}.jpg`);
  
  // Find original file
  let originalPath = null;
  const possibleExtensions = ['.pdf', '.docx', '.xlsx', '.jpg', '.png'];
  for (const ext of possibleExtensions) {
    const filePath = path.join(uploadDir, `${fileId}${ext}`);
    if (fs.existsSync(filePath)) {
      originalPath = filePath;
      console.log(`Found original file: ${originalPath}`);
      break;
    }
  }
  
  // Check if files exist
  const previewExists = fs.existsSync(previewPath);
  const originalExists = originalPath && fs.existsSync(originalPath);
  
  console.log(`Preview file exists: ${previewExists ? 'YES' : 'NO'} (${previewPath})`);
  console.log(`Original file exists: ${originalExists ? 'YES' : 'NO'} (${originalPath})`);
  
  // Backup files if they exist
  let previewBackupPath = null;
  let originalBackupPath = null;
  
  if (previewExists) {
    previewBackupPath = `${previewPath}.backup`;
    fs.copyFileSync(previewPath, previewBackupPath);
    console.log(`Made backup of preview file: ${previewBackupPath}`);
  }
  
  if (originalExists) {
    originalBackupPath = `${originalPath}.backup`;
    fs.copyFileSync(originalPath, originalBackupPath);
    console.log(`Made backup of original file: ${originalBackupPath}`);
  }
  
  try {
    // Temporarily remove files to test fallback
    if (previewExists) {
      console.log(`Temporarily removing preview file: ${previewPath}`);
      fs.renameSync(previewPath, `${previewPath}.test`);
    }
    
    if (originalExists) {
      console.log(`Temporarily removing original file: ${originalPath}`);
      fs.renameSync(originalPath, `${originalPath}.test`);
    }
    
    // Run the fallback tests (should use Cloudinary)
    console.log('\nTesting fallback without local files...');
    await testPreviewFallback(fileId);
    
    if (originalPath) {
      const ext = path.extname(originalPath);
      await testOriginalFileFallback(fileId, ext);
    }
    
    return true;
  } finally {
    // Restore files
    if (previewExists) {
      try {
        console.log(`Restoring preview file from: ${previewPath}.test`);
        fs.renameSync(`${previewPath}.test`, previewPath);
      } catch (error) {
        console.error(`Failed to restore preview file: ${error.message}`);
        
        // Try restoring from backup
        if (previewBackupPath) {
          try {
            console.log(`Trying to restore preview from backup: ${previewBackupPath}`);
            fs.copyFileSync(previewBackupPath, previewPath);
            fs.unlinkSync(previewBackupPath);
          } catch (backupError) {
            console.error(`Failed to restore preview from backup: ${backupError.message}`);
          }
        }
      }
    }
    
    if (originalExists) {
      try {
        console.log(`Restoring original file from: ${originalPath}.test`);
        fs.renameSync(`${originalPath}.test`, originalPath);
      } catch (error) {
        console.error(`Failed to restore original file: ${error.message}`);
        
        // Try restoring from backup
        if (originalBackupPath) {
          try {
            console.log(`Trying to restore original from backup: ${originalBackupPath}`);
            fs.copyFileSync(originalBackupPath, originalPath);
            fs.unlinkSync(originalBackupPath);
          } catch (backupError) {
            console.error(`Failed to restore original from backup: ${backupError.message}`);
          }
        }
      }
    }
  }
}

/**
 * Main function to run all tests
 */
async function runAllTests() {
  console.log('🔍 PDFSpark Cloudinary Fallback Test Suite 🔍\n');
  
  // Get file ID from command line argument
  const fileId = process.argv[2];
  
  if (!fileId) {
    console.error('Please provide a file ID as the first argument');
    console.error('Example: node test-cloudinary-fallback.js a5e99315-4adc-44d4-ab90-a044bdb37be4');
    console.error('Options:');
    console.error('  --simulate-railway  Simulate Railway environment by setting RAILWAY_MODE=true');
    process.exit(1);
  }
  
  // Check for simulation flags
  const simulateRailway = process.argv.includes('--simulate-railway');
  
  if (simulateRailway) {
    console.log('🚂 SIMULATING RAILWAY ENVIRONMENT');
    process.env.RAILWAY_SERVICE_NAME = 'pdfspark-test';
    process.env.RAILWAY_MODE = 'true';
  }
  
  try {
    // 1. Test basic file access (should work if files exist locally)
    await testPreviewFallback(fileId);
    await testOriginalFileFallback(fileId);
    
    // 2. Test fallback when local files are removed
    await testFallbackWithRemovedFiles(fileId);
    
    console.log('\n✅ All tests completed!');
  } catch (error) {
    console.error('\n❌ Tests failed:', error.message);
    process.exit(1);
  }
}

// Run the tests
runAllTests();