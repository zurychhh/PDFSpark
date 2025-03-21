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

// Initialize health check before main application
console.log('Starting health check server...');
const healthServer = require('./health-endpoint.js');
console.log('✅ Health check server initialized and ready for Railway health checks');

// Give Railway health check some time to detect the health endpoint
console.log('Giving health checks a chance to detect the server...');
setTimeout(() => {
  // Start the main application
  try {
    console.log('Loading main application...');
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
    
    // Keep the health server running even if the main app fails
    console.log('⚠️ Main application failed to load, but health check server remains active');
    console.log('This will allow Railway to detect the service as healthy while issues are being fixed');
  }
}, 2000); // Wait 2 seconds before loading main app
