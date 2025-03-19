#!/usr/bin/env node

/**
 * Test script for Cloudinary-First Strategy
 * 
 * This script verifies Cloudinary configuration and tests
 * the reliable Cloudinary upload functionality.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const os = require('os');

// Set up basic logging
const log = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌ ' : type === 'warning' ? '⚠️ ' : '✅ ';
  console.log(`${timestamp} ${prefix}${message}`);
};

// Check Cloudinary configuration
const cloudinaryConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (!cloudinaryConfigured) {
  log('Cloudinary configuration is missing!', 'error');
  log('Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET', 'error');
  process.exit(1);
}

log('Cloudinary configuration detected');
log(`Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME}`);
log(`API Key: ${process.env.CLOUDINARY_API_KEY ? '[SET]' : '[MISSING]'}`);
log(`API Secret: ${process.env.CLOUDINARY_API_SECRET ? '[SET]' : '[MISSING]'}`);

// Setup Cloudinary
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Create a test file
const createTestFile = async () => {
  const tempDir = os.tmpdir();
  const testFilePath = path.join(tempDir, `test-railway-${Date.now()}.txt`);
  
  log(`Creating test file at ${testFilePath}`);
  
  const content = `
    PDFSpark Railway Test File
    Created at: ${new Date().toISOString()}
    For Cloudinary-First Strategy testing
    
    This file tests the reliable upload functionality with retry logic.
  `;
  
  fs.writeFileSync(testFilePath, content);
  log(`Test file created (${fs.statSync(testFilePath).size} bytes)`);
  
  return testFilePath;
};

// Reliable Cloudinary upload with retry
const uploadToCloudinary = async (filePath, options = {}) => {
  log(`Starting Cloudinary upload: ${path.basename(filePath)}`);
  
  const maxAttempts = options.maxAttempts || 3;
  const baseTimeout = options.baseTimeout || 10000; // 10 seconds
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      log(`Upload attempt ${attempt}/${maxAttempts}`);
      
      // Increase timeout with each retry
      const timeoutMs = baseTimeout * Math.pow(1.5, attempt - 1);
      
      // Prepare upload options
      const uploadOptions = {
        folder: 'pdfspark_railway_test',
        resource_type: 'auto',
        timeout: timeoutMs,
        ...options
      };
      
      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(filePath, uploadOptions);
      
      log(`Upload successful! Public ID: ${result.public_id}`);
      return result;
    } catch (error) {
      if (attempt === maxAttempts) {
        log(`All ${maxAttempts} attempts failed`, 'error');
        throw error;
      }
      
      log(`Attempt ${attempt} failed: ${error.message}`, 'warning');
      
      // Wait before retrying (exponential backoff)
      const delayMs = 1000 * Math.pow(2, attempt);
      log(`Waiting ${delayMs}ms before next attempt...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
};

// Run tests
const runTests = async () => {
  try {
    log('Starting Cloudinary-First Strategy tests');
    
    // Test Cloudinary ping
    log('Testing Cloudinary connectivity (ping)');
    const pingResult = await cloudinary.api.ping();
    log(`Ping result: ${JSON.stringify(pingResult)}`);
    
    // Check account info
    log('Checking account info');
    const accountInfo = await cloudinary.api.usage();
    log(`Plan: ${accountInfo.plan}, Credits used: ${accountInfo.credits.used}/${accountInfo.credits.limit}`);
    
    // Create and upload test file
    const testFilePath = await createTestFile();
    const uploadResult = await uploadToCloudinary(testFilePath, {
      tags: ['test', 'railway', 'pdfspark']
    });
    
    // Generate a download URL
    log('Generating download URL');
    const downloadUrl = cloudinary.url(uploadResult.public_id, {
      resource_type: uploadResult.resource_type,
      type: 'upload',
      format: uploadResult.format,
      flags: 'attachment'
    });
    
    log(`Download URL: ${downloadUrl}`);
    
    // Clean up test file
    fs.unlinkSync(testFilePath);
    log(`Test file cleaned up: ${testFilePath}`);
    
    // Delete the uploaded file if requested
    if (process.env.CLEANUP_TEST_FILES === 'true') {
      log('Deleting test file from Cloudinary');
      await cloudinary.uploader.destroy(uploadResult.public_id);
      log('Test file deleted from Cloudinary');
    }
    
    log('All tests completed successfully!');
  } catch (error) {
    log(`Test failed: ${error.message}`, 'error');
    if (error.error && error.error.message) {
      log(`Cloudinary error: ${error.error.message}`, 'error');
    }
    console.error(error);
    process.exit(1);
  }
};

// Run the tests
runTests();