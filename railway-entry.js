#!/usr/bin/env node

/**
 * Enhanced Railway Entry Script for PDFSpark
 * 
 * This optimized script provides:
 * 1. Memory management and fallback mode enforcement
 * 2. Directory creation and verification
 * 3. Environment diagnostics
 * 4. Memory usage monitoring
 * 5. Robust application loading
 */

console.log('=======================================');
console.log('PDFSpark Railway Entry Script - v2.0');
console.log('=======================================');

// Configure for Railway's environment
if (process.env.RAILWAY_SERVICE_NAME) {
  console.log(`🚂 Running in Railway environment: ${process.env.RAILWAY_SERVICE_NAME}`);
  
  // CRITICAL: Force memory fallback mode in Railway
  if (process.env.USE_MEMORY_FALLBACK !== 'true') {
    console.log('⚠️ Setting USE_MEMORY_FALLBACK=true for Railway environment');
    process.env.USE_MEMORY_FALLBACK = 'true';
  }
  
  // Ensure Railway temp directories are set correctly
  if (!process.env.TEMP_DIR || !process.env.TEMP_DIR.startsWith('/tmp')) {
    console.log('⚠️ Setting TEMP_DIR to /tmp for Railway environment');
    process.env.TEMP_DIR = '/tmp';
  }
  
  if (!process.env.UPLOAD_DIR || !process.env.UPLOAD_DIR.startsWith('/tmp')) {
    console.log('⚠️ Setting UPLOAD_DIR to /tmp/uploads for Railway environment');
    process.env.UPLOAD_DIR = '/tmp/uploads';
  }
  
  if (!process.env.LOG_DIR || !process.env.LOG_DIR.startsWith('/tmp')) {
    console.log('⚠️ Setting LOG_DIR to /tmp/logs for Railway environment');
    process.env.LOG_DIR = '/tmp/logs';
  }
}

// Initialize global memory storage if memory fallback is enabled
if (process.env.USE_MEMORY_FALLBACK === 'true') {
  console.log('🧠 Initializing memory fallback storage');
  global.usingMemoryFallback = true;
  global.memoryStorage = {
    files: new Map(),
    operations: new Map(),
    
    // File storage methods
    storeFile(fileId, fileData) {
      this.files.set(fileId, fileData);
      return fileId;
    },
    
    getFile(fileId) {
      return this.files.get(fileId);
    },
    
    // Operation storage methods
    storeOperation(operation) {
      this.operations.set(operation._id.toString(), operation);
      return operation._id;
    },
    
    findOperation(operationId) {
      return this.operations.get(operationId.toString());
    },
    
    updateOperation(operationId, updates) {
      const operation = this.operations.get(operationId.toString());
      if (operation) {
        Object.assign(operation, updates);
        operation.updatedAt = new Date();
        this.operations.set(operationId.toString(), operation);
      }
      return operation;
    }
  };
}

// Log environment details
console.log('\n📊 Environment Configuration:');
console.log(`Node Version: ${process.version}`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`PORT: ${process.env.PORT || '3000'}`);
console.log(`MongoDB URI exists: ${!!process.env.MONGODB_URI}`);
console.log(`Railway Public Domain: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'not set'}`);
console.log(`Memory Fallback Enabled: ${process.env.USE_MEMORY_FALLBACK === 'true' ? 'YES' : 'NO'}`);
console.log(`Temp Directory: ${process.env.TEMP_DIR || '/app/temp'}`);
console.log(`Upload Directory: ${process.env.UPLOAD_DIR || '/app/uploads'}`);
console.log(`Log Directory: ${process.env.LOG_DIR || '/app/logs'}`);

// Check for Cloudinary configuration
const cloudinaryConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);
console.log(`Cloudinary Configured: ${cloudinaryConfigured ? 'YES' : 'NO'}`);

if (!cloudinaryConfigured) {
  console.warn('⚠️ WARNING: Cloudinary is not configured!');
  console.warn('⚠️ Cloudinary is REQUIRED for reliable operation in Railway!');
  console.warn('⚠️ Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET');
  
  // Force memory fallback if Cloudinary is not configured
  process.env.USE_MEMORY_FALLBACK = 'true';
  global.usingMemoryFallback = true;
} else {
  console.log('✅ Cloudinary configuration detected - using Cloudinary-First storage strategy');
  
  // Verify and set Cloudinary environment variables
  console.log('Cloudinary Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
  console.log('Cloudinary API Key:', process.env.CLOUDINARY_API_KEY ? '[SET]' : '[MISSING]');
  console.log('Cloudinary API Secret:', process.env.CLOUDINARY_API_SECRET ? '[SET]' : '[MISSING]');
  
  // Ensure Cloudinary URL is set for backwards compatibility
  if (!process.env.CLOUDINARY_URL && process.env.CLOUDINARY_CLOUD_NAME && 
      process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    process.env.CLOUDINARY_URL = `cloudinary://${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}@${process.env.CLOUDINARY_CLOUD_NAME}`;
    console.log('Set CLOUDINARY_URL for backward compatibility');
  }
  
  // Set Cloudinary folder settings
  if (!process.env.CLOUDINARY_SOURCE_FOLDER) {
    if (process.env.RAILWAY_SERVICE_NAME) {
      process.env.CLOUDINARY_SOURCE_FOLDER = 'pdfspark_railway_sources';
    } else {
      process.env.CLOUDINARY_SOURCE_FOLDER = 'pdfspark_sources';
    }
    console.log(`Set CLOUDINARY_SOURCE_FOLDER to ${process.env.CLOUDINARY_SOURCE_FOLDER}`);
  }
  
  if (!process.env.CLOUDINARY_RESULT_FOLDER) {
    if (process.env.RAILWAY_SERVICE_NAME) {
      process.env.CLOUDINARY_RESULT_FOLDER = 'pdfspark_railway_results';
    } else {
      process.env.CLOUDINARY_RESULT_FOLDER = 'pdfspark_results';
    }
    console.log(`Set CLOUDINARY_RESULT_FOLDER to ${process.env.CLOUDINARY_RESULT_FOLDER}`);
  }
  
  // Set Cloudinary performance settings
  if (!process.env.CLOUDINARY_MAX_CONCURRENT_UPLOADS) {
    process.env.CLOUDINARY_MAX_CONCURRENT_UPLOADS = '3';
    console.log('Set CLOUDINARY_MAX_CONCURRENT_UPLOADS to 3');
  }
  
  // Enable Cloudinary debug if in development mode
  if (process.env.NODE_ENV === 'development' && !process.env.CLOUDINARY_DEBUG) {
    process.env.CLOUDINARY_DEBUG = 'true';
    console.log('Enabled CLOUDINARY_DEBUG in development mode');
  }
}

// Create and verify required directories
console.log('\n📁 Checking required directories...');
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
      console.log(`✅ Directory ${path} exists and is writable`);
    } catch (error) {
      console.error(`❌ Error with directory ${path}: ${error.message}`);
      if (error.code === 'EACCES') {
        console.error(`  Permission denied - attempting chmod 777 on ${path}`);
        try {
          const { execSync } = require('child_process');
          execSync(`mkdir -p ${path} && chmod 777 ${path}`);
          console.log(`  Retry: Directory ${path} permissions updated`);
        } catch (chmodError) {
          console.error(`  Failed to update permissions: ${chmodError.message}`);
        }
      }
    }
  });
} catch (error) {
  console.error('❌ Error checking directories:', error);
}

// Setup enhanced memory management
console.log('\n🧠 Setting up memory management...');

// Format memory values to human-readable format
const formatMem = (bytes) => {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
};

// Log memory usage with thresholds
const logMemoryUsage = (label = 'Current') => {
  const memoryUsage = process.memoryUsage();
  const heapUsedPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
  
  console.log(`Memory Usage (${label}):`);
  console.log(`  RSS: ${formatMem(memoryUsage.rss)}`);
  console.log(`  Heap Total: ${formatMem(memoryUsage.heapTotal)}`);
  console.log(`  Heap Used: ${formatMem(memoryUsage.heapUsed)}`);
  console.log(`  External: ${formatMem(memoryUsage.external)}`);
  console.log(`  Heap Usage: ${heapUsedPercentage.toFixed(2)}%`);
  
  // Provide warnings based on memory thresholds
  if (heapUsedPercentage > 85) {
    console.log('  ❌ CRITICAL: Memory usage very high (>85%)');
    triggerMemoryCleanup(true);
  } else if (heapUsedPercentage > 70) {
    console.log('  ⚠️ WARNING: Memory usage high (>70%)');
    triggerMemoryCleanup();
  } else {
    console.log('  ✅ Memory usage normal');
  }
  
  return {
    rss: memoryUsage.rss,
    heapTotal: memoryUsage.heapTotal,
    heapUsed: memoryUsage.heapUsed,
    external: memoryUsage.external,
    heapUsedPercentage
  };
};

// Memory cleanup function
const triggerMemoryCleanup = (aggressive = false) => {
  console.log(`🧹 Triggering memory cleanup (${aggressive ? 'aggressive' : 'normal'})`);
  
  // Run garbage collection if available
  if (global.gc) {
    console.log('  Running forced garbage collection...');
    global.gc();
  } else {
    console.log('  Note: Run node with --expose-gc to enable forced garbage collection');
  }
  
  // If memory fallback storage is being used, clean up old entries
  if (global.memoryStorage) {
    // Clear old files (files older than 1 hour in aggressive mode, 4 hours otherwise)
    const maxAgeMs = aggressive ? 60 * 60 * 1000 : 4 * 60 * 60 * 1000;
    const now = Date.now();
    let filesCleared = 0;
    
    global.memoryStorage.files.forEach((fileData, fileId) => {
      if (fileData.uploadDate && (now - fileData.uploadDate.getTime() > maxAgeMs)) {
        global.memoryStorage.files.delete(fileId);
        filesCleared++;
      }
    });
    
    console.log(`  Cleared ${filesCleared} old files from memory storage`);
    
    // Log memory storage stats
    console.log(`  Memory storage stats: ${global.memoryStorage.files.size} files, ${global.memoryStorage.operations.size} operations`);
  }
};

// Create global memory check function
global.checkMemory = () => {
  const memStats = logMemoryUsage('On-Demand Check');
  if (memStats.heapUsedPercentage > 70) {
    triggerMemoryCleanup(memStats.heapUsedPercentage > 85);
  }
  return memStats;
};

// Set up memory cleanup on interval (every 5 minutes)
console.log('Setting up regular memory monitoring (every 5 minutes)');
setInterval(() => {
  logMemoryUsage('Scheduled Check');
}, 5 * 60 * 1000);

// Set up memory cleanup on low memory (every 30 seconds when under pressure)
if (process.env.MEMORY_MANAGEMENT_AGGRESSIVE === 'true') {
  console.log('Setting up aggressive memory management (every 30 seconds)');
  setInterval(() => {
    const memStats = logMemoryUsage('Aggressive Check');
    if (memStats.heapUsedPercentage > 60) {
      triggerMemoryCleanup(memStats.heapUsedPercentage > 80);
    }
  }, 30 * 1000);
}

// Log initial memory stats
logMemoryUsage('Initial');

// Start the application
console.log('\n🚀 Starting PDFSpark application...');
try {
  // Look for index.js in various locations
  console.log('Current directory files:');
  const fs = require('fs');
  fs.readdirSync('.').forEach(file => {
    console.log(`- ${file}`);
  });

  try {
    // Try to load from index.js directly (preferred)
    console.log('Attempting to load from ./index.js');
    require('./index.js');
    console.log('✅ Application started successfully from ./index.js');
  } catch (error) {
    console.log(`❌ Error loading ./index.js: ${error.message}`);
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
        console.log(`✅ Application started successfully from ${path}`);
        loaded = true;
        break;
      } catch (pathError) {
        console.log(`❌ Error loading from ${path}: ${pathError.message}`);
      }
    }
    
    if (!loaded) {
      console.error('❌ Failed to load the application from any location');
      throw new Error('Application entry point not found');
    }
  }
} catch (error) {
  console.error('❌ FATAL ERROR: Failed to start application:', error);
  
  // Log system status before exiting
  console.error('\n📊 System status at failure:');
  logMemoryUsage('At Failure');
  
  // Check if we're in Railway and create a failure report
  if (process.env.RAILWAY_SERVICE_NAME) {
    try {
      const fs = require('fs');
      const report = {
        timestamp: new Date().toISOString(),
        error: {
          message: error.message,
          stack: error.stack
        },
        environment: {
          nodeVersion: process.version,
          nodeEnv: process.env.NODE_ENV,
          railway: process.env.RAILWAY_SERVICE_NAME,
          memoryFallback: process.env.USE_MEMORY_FALLBACK
        },
        memory: process.memoryUsage()
      };
      
      fs.writeFileSync('/tmp/railway-failure-report.json', JSON.stringify(report, null, 2));
      console.error('📝 Created failure report at /tmp/railway-failure-report.json');
    } catch (reportError) {
      console.error('Failed to create failure report:', reportError);
    }
  }
  
  process.exit(1);
}