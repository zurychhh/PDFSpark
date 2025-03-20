#!/usr/bin/env node

/**
 * Script to check available endpoints
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Simulate require for importing packages
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Allow using fetch API
import fetch from 'node-fetch';

// API URL
const API_URL = process.argv[2] || 'https://pdfspark-ch1-production.up.railway.app';

// Check endpoints
async function checkEndpoint(path) {
  try {
    console.log(`Testing endpoint: ${API_URL}${path}`);
    const response = await fetch(`${API_URL}${path}`);
    const contentType = response.headers.get('content-type');
    
    console.log(`Status: ${response.status}`);
    console.log(`Content-Type: ${contentType}`);
    
    let responseData;
    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
      console.log('Response (JSON):', responseData);
    } else {
      responseData = await response.text();
      console.log('Response (Text):', responseData.length > 100 ? 
        responseData.substring(0, 100) + '...' : responseData);
    }
    
    return { 
      status: response.status, 
      contentType, 
      data: responseData 
    };
  } catch (error) {
    console.error(`Error checking ${path}:`, error.message);
    return { error: error.message };
  }
}

// Run diagnostics
async function checkAllEndpoints() {
  console.log(`\n=== Checking PDFSpark Endpoints at ${API_URL} ===\n`);
  
  // List of endpoints to check
  const endpoints = [
    '/',                         // Root
    '/health',                   // Health check
    '/api/status',               // System status
    '/api/cloudinary/status'     // Cloudinary status
  ];
  
  for (const endpoint of endpoints) {
    console.log(`\n--- Checking ${endpoint} ---`);
    await checkEndpoint(endpoint);
  }
}

checkAllEndpoints().catch(console.error);