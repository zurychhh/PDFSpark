#!/usr/bin/env node

/**
 * Railway specific startup script
 * This script ensures proper port binding and provides
 * additional diagnostics for Railway deployment
 */

console.log('=======================================');
console.log('Railway Entry Script - Starting Server');
console.log('=======================================');

// Log environment
console.log(`Node Version: ${process.version}`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`PORT: ${process.env.PORT || '3000'}`);
console.log(`MongoDB URI exists: ${!!process.env.MONGODB_URI}`);
console.log(`Railway Public Domain: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'not set'}`);
console.log(`Memory Fallback Enabled: ${process.env.USE_MEMORY_FALLBACK === 'true' ? 'YES' : 'NO'}`);

// Check for Cloudinary configuration
const cloudinaryConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);
console.log(`Cloudinary Configured: ${cloudinaryConfigured ? 'YES' : 'NO'}`);

if (!cloudinaryConfigured) {
  console.warn('WARNING: Cloudinary is not configured. Using memory fallback!');
  // Force memory fallback if Cloudinary is not configured
  process.env.USE_MEMORY_FALLBACK = 'true';
}

// Check file directories
try {
  const fs = require('fs');
  const paths = [
    process.env.TEMP_DIR || '/app/temp',
    process.env.UPLOAD_DIR || '/app/uploads',
    process.env.LOG_DIR || '/app/logs'
  ];
  
  paths.forEach(path => {
    try {
      if (!fs.existsSync(path)) {
        console.log(`Creating directory: ${path}`);
        fs.mkdirSync(path, { recursive: true });
      }
      
      // Check write permissions
      const testFile = `${path}/test-${Date.now()}.txt`;
      fs.writeFileSync(testFile, 'Test file write');
      fs.unlinkSync(testFile);
      console.log(`Directory ${path} exists and is writable ✅`);
    } catch (error) {
      console.error(`Error with directory ${path}: ${error.message}`);
    }
  });
} catch (error) {
  console.error('Error checking directories:', error);
}

// Setup memory diagnostics
const formatMem = (bytes) => {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
};

const logMemoryUsage = () => {
  const memoryUsage = process.memoryUsage();
  console.log('Memory Usage:');
  console.log(`  RSS: ${formatMem(memoryUsage.rss)}`);
  console.log(`  Heap Total: ${formatMem(memoryUsage.heapTotal)}`);
  console.log(`  Heap Used: ${formatMem(memoryUsage.heapUsed)}`);
  console.log(`  External: ${formatMem(memoryUsage.external)}`);

  // Calculate percentage of heap used
  const heapUsedPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
  console.log(`  Heap Usage: ${heapUsedPercentage.toFixed(2)}%`);
};

// Log memory usage every 30 minutes
setInterval(logMemoryUsage, 30 * 60 * 1000);

// Log initial memory usage
logMemoryUsage();

// Start actual application
console.log('Starting server via index.js...');
try {
  // Since we're using --max-old-space-size in the cmd
  // Add a helper function to check memory limits
  global.checkMemory = () => {
    const memoryUsage = process.memoryUsage();
    const heapUsedPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    
    if (heapUsedPercentage > 85) {
      console.warn(`WARNING: High memory usage (${heapUsedPercentage.toFixed(2)}%)`);
      // Force garbage collection if possible
      if (global.gc) {
        console.log('Running forced garbage collection...');
        global.gc();
      }
    }
    
    return {
      rss: formatMem(memoryUsage.rss),
      heapTotal: formatMem(memoryUsage.heapTotal),
      heapUsed: formatMem(memoryUsage.heapUsed),
      heapUsedPercentage: heapUsedPercentage.toFixed(2)
    };
  };
  
  // In the Docker container, the backend files are copied to /app
  // So index.js should be directly in the current directory
  console.log('Current directory files:');
  const fs = require('fs');
  fs.readdirSync('.').forEach(file => {
    console.log(`- ${file}`);
  });
  
  // Try to load from index.js directly
  try {
    console.log('Attempting to load from ./index.js');
    require('./index.js');
  } catch (error) {
    console.log('Error loading ./index.js:', error.message);
    console.log('Trying alternative paths...');
    
    // Try other potential locations
    const potentialPaths = [
      './backend/index.js',
      '/app/index.js',
      '/app/backend/index.js'
    ];
    
    let loaded = false;
    for (const path of potentialPaths) {
      try {
        console.log(`Attempting to load from ${path}`);
        require(path);
        console.log(`Successfully loaded from ${path}`);
        loaded = true;
        break;
      } catch (pathError) {
        console.log(`Error loading from ${path}:`, pathError.message);
      }
    }
    
    if (!loaded) {
      console.error('Failed to load the application from any location');
      throw new Error('Application entry point not found');
    }
  }
} catch (error) {
  console.error('Failed to start application:', error);
  process.exit(1);
}