#!/usr/bin/env node

/**
 * Enhanced Railway entry script for PDFSpark
 * 
 * This script serves as the entry point for the application when deployed on Railway.
 * It provides memory management optimizations and environment configuration
 * specifically tailored for Railway's constrained environment.
 */

console.log('Starting PDFSpark application with memory-optimized settings for Railway...');

// Force memory fallback mode for Railway environment
process.env.USE_MEMORY_FALLBACK = 'true';
console.log('✅ Memory fallback mode enabled');

// Set aggressive memory management
process.env.MEMORY_MANAGEMENT_AGGRESSIVE = 'true';
console.log('✅ Aggressive memory management enabled');

// Configure temp directories (Railway has ephemeral filesystem)
process.env.TEMP_DIR = '/tmp';
process.env.UPLOAD_DIR = '/tmp/uploads';
process.env.LOG_DIR = '/tmp/logs';
console.log('✅ Temporary directories configured for Railway');

// Set conservative memory thresholds for Railway environment
process.env.MEMORY_WARNING_THRESHOLD = process.env.MEMORY_WARNING_THRESHOLD || '0.60';
process.env.MEMORY_CRITICAL_THRESHOLD = process.env.MEMORY_CRITICAL_THRESHOLD || '0.75';
process.env.MEMORY_EMERGENCY_THRESHOLD = process.env.MEMORY_EMERGENCY_THRESHOLD || '0.85';
console.log('✅ Memory thresholds adjusted for Railway');

// Configure max concurrency to 2 for better memory management
process.env.MAX_CONCURRENCY = process.env.MAX_CONCURRENCY || '2';
console.log('✅ Concurrency set to 2 for Railway');

// Initial memory diagnostic
const initialMemoryUsage = process.memoryUsage();
console.log('Initial memory usage:', {
  heapUsedMB: Math.round(initialMemoryUsage.heapUsed / 1024 / 1024),
  heapTotalMB: Math.round(initialMemoryUsage.heapTotal / 1024 / 1024),
  rssMB: Math.round(initialMemoryUsage.rss / 1024 / 1024),
  externalMB: Math.round((initialMemoryUsage.external || 0) / 1024 / 1024)
});

// Setup emergency memory handler
process.on('memoryWarning', (currentUsage) => {
  console.warn('⚠️ Memory warning triggered', {
    heapUsedMB: Math.round(currentUsage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(currentUsage.heapTotal / 1024 / 1024),
    percentUsed: Math.round((currentUsage.heapUsed / currentUsage.heapTotal) * 100)
  });
  
  // Force garbage collection if available
  if (global.gc) {
    console.log('🧹 Forcing garbage collection');
    global.gc(true);
  }
});

// Set up a simple health check endpoint in the main application
const express = require('express');
const app = express();

// Add a health check endpoint
app.get('/health', (req, res) => {
  const memUsage = process.memoryUsage();
  const memoryPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
  
  // Check if memory usage is above warning threshold
  const memoryThreshold = parseFloat(process.env.MEMORY_WARNING_THRESHOLD || 0.6);
  const memoryWarning = (memUsage.heapUsed / memUsage.heapTotal) > memoryThreshold;
  
  // Response object
  const healthInfo = {
    status: memoryWarning ? 'warning' : 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      usedPercent: memoryPercent,
      warning: memoryWarning
    },
    environment: {
      nodeEnv: process.env.NODE_ENV,
      memoryFallback: process.env.USE_MEMORY_FALLBACK === 'true',
      maxConcurrency: process.env.MAX_CONCURRENCY || '?'
    }
  };
  
  res.status(200).json(healthInfo);
});

// Start a server with the health check before loading the main app
const PORT = parseInt(process.env.PORT || '3000', 10);
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🩺 Health check server running on port ${PORT}`);
  
  // Now that the health check is running, start the main application
  try {
    console.log('Starting main application...');
    require('./index.js');
    console.log('🚀 PDFSpark application started successfully');
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    
    // Emergency recovery - try to free up memory before exiting
    if (global.gc) {
      try {
        console.log('🧹 Emergency garbage collection');
        global.gc(true);
      } catch (e) {
        console.error('Failed to run emergency GC:', e);
      }
    }
    
    process.exit(1);
  }
});
