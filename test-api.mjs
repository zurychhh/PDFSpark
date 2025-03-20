#!/usr/bin/env node

/**
 * Simple test script for PDFSpark API
 * Uses ES modules format for compatibility
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

// Simulate require for importing packages
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Allow using fetch API
import fetch from 'node-fetch';

// URL to test
const API_URL = process.argv[2] || 'https://pdfspark-ch1-production.up.railway.app';

async function testEndpoint(path, options = {}) {
  const url = `${API_URL}${path}`;
  console.log(`Testing: ${url}`);
  
  try {
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
    console.log(`Status: ${response.status}`);
    console.log('Response:', data);
    return { status: response.status, data };
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return { error: error.message };
  }
}

async function runTests() {
  console.log(`\n=== Testing PDFSpark API at ${API_URL} ===\n`);
  
  // Test 1: Health endpoint
  console.log('\n--- Test 1: Health Endpoint ---');
  const healthResult = await testEndpoint('/health');
  
  if (healthResult.status === 200) {
    console.log('✅ Health check successful');
  } else {
    console.log('❌ Health check failed');
  }
  
  // Test 2: Cloudinary status
  console.log('\n--- Test 2: Cloudinary Status ---');
  const cloudinaryResult = await testEndpoint('/api/cloudinary/status');
  
  if (cloudinaryResult.status === 200 && cloudinaryResult.data.status === 'ok') {
    console.log('✅ Cloudinary is properly configured');
  } else if (cloudinaryResult.status === 200 && cloudinaryResult.data.status === 'not_configured') {
    console.log('⚠️ Cloudinary is not configured on the server');
  } else {
    console.log('❌ Cloudinary status check failed');
  }
  
  // Test 3: Root endpoint
  console.log('\n--- Test 3: Root Endpoint ---');
  await testEndpoint('/');
  
  console.log('\n=== Tests completed ===');
}

runTests().catch(console.error);