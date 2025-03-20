#!/usr/bin/env node

/**
 * Test script for PDFSpark file upload and conversion
 * Uses ES modules format for compatibility
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { writeFileSync, readFileSync } from 'fs';

// Simulate require for importing packages
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Allow using fetch API
import fetch from 'node-fetch';
import FormData from 'form-data';

// API URL
const API_URL = process.argv[2] || 'https://pdfspark-ch1-production.up.railway.app';

// Create a simple PDF for testing
async function createTestPdf() {
  console.log('Creating test PDF file...');
  
  // Simple minimal PDF content
  const minimalPdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%EOF';
  
  const testFilePath = resolve(__dirname, 'test-file.pdf');
  writeFileSync(testFilePath, minimalPdf);
  console.log(`Test PDF created at: ${testFilePath}`);
  
  return testFilePath;
}

// Upload a file to the API
async function uploadFile(filePath) {
  console.log(`\nUploading file to ${API_URL}/api/files/upload`);
  
  try {
    const form = new FormData();
    form.append('file', readFileSync(filePath), {
      filename: 'test-file.pdf',
      contentType: 'application/pdf',
    });
    
    const response = await fetch(`${API_URL}/api/files/upload`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders ? form.getHeaders() : undefined,
    });
    
    const result = await response.json();
    console.log('Upload response:', result);
    
    if (response.status === 200 && result.success) {
      console.log('✅ File upload successful');
      return result;
    } else {
      console.log('❌ File upload failed');
      return null;
    }
  } catch (error) {
    console.error(`Error uploading file: ${error.message}`);
    return null;
  }
}

// Start a conversion
async function convertFile(fileId, targetFormat = 'docx') {
  console.log(`\nConverting file ${fileId} to ${targetFormat}`);
  
  try {
    const response = await fetch(`${API_URL}/api/convert`, {
      method: 'POST',
      body: JSON.stringify({
        fileId,
        sourceFormat: 'pdf',
        targetFormat,
        options: {}
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const result = await response.json();
    console.log('Conversion response:', result);
    
    if (response.status === 200 && result.success) {
      console.log('✅ Conversion initiated successfully');
      return result;
    } else {
      console.log('❌ Conversion initiation failed');
      return null;
    }
  } catch (error) {
    console.error(`Error initiating conversion: ${error.message}`);
    return null;
  }
}

// Check conversion status
async function checkStatus(operationId) {
  console.log(`\nChecking status for operation ${operationId}`);
  
  try {
    const response = await fetch(`${API_URL}/api/operations/${operationId}/status`);
    const result = await response.json();
    console.log('Status response:', result);
    
    return result;
  } catch (error) {
    console.error(`Error checking status: ${error.message}`);
    return null;
  }
}

// Poll status until completion or failure
async function pollStatus(operationId, maxAttempts = 10) {
  console.log(`\nPolling status for operation ${operationId}...`);
  
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    const status = await checkStatus(operationId);
    
    if (!status) {
      console.log('Failed to get status, retrying...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      continue;
    }
    
    if (status.status === 'completed') {
      console.log('✅ Conversion completed successfully');
      return status;
    } else if (status.status === 'failed') {
      console.log('❌ Conversion failed');
      return status;
    } else if (status.status === 'processing' || status.status === 'pending') {
      console.log(`Conversion in progress (${status.status}), waiting...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log(`Unknown status: ${status.status}`);
      return status;
    }
  }
  
  console.log('❌ Timed out waiting for conversion');
  return null;
}

// Get download URL
async function getDownloadUrl(operationId) {
  console.log(`\nGetting download URL for operation ${operationId}`);
  
  try {
    const response = await fetch(`${API_URL}/api/operations/${operationId}/download`);
    const result = await response.json();
    console.log('Download URL response:', result);
    
    if (response.status === 200 && result.success) {
      console.log('✅ Download URL retrieved successfully');
      console.log(`Download URL: ${result.downloadUrl}`);
      return result;
    } else {
      console.log('❌ Failed to get download URL');
      return null;
    }
  } catch (error) {
    console.error(`Error getting download URL: ${error.message}`);
    return null;
  }
}

// Run the full test
async function runFullTest() {
  console.log(`\n=== Testing PDFSpark full workflow at ${API_URL} ===\n`);
  
  // Step 1: Create test file
  const testFilePath = await createTestPdf();
  
  // Step 2: Upload file
  const uploadResult = await uploadFile(testFilePath);
  if (!uploadResult) return;
  
  // Step 3: Start conversion
  const conversionResult = await convertFile(uploadResult.fileId, 'docx');
  if (!conversionResult) return;
  
  // Step 4: Poll for status
  const finalStatus = await pollStatus(conversionResult.operationId);
  if (!finalStatus || finalStatus.status !== 'completed') return;
  
  // Step 5: Get download URL
  const downloadResult = await getDownloadUrl(conversionResult.operationId);
  if (downloadResult && downloadResult.downloadUrl) {
    console.log(`\n✅ Full workflow test completed successfully!`);
    console.log(`You can download the converted file at: ${downloadResult.downloadUrl}`);
  }
}

runFullTest().catch(console.error);