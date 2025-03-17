/**
 * Comprehensive System Diagnostic Tool
 * 
 * This module provides detailed diagnostics for the application,
 * focusing on environment variables, memory modes, and configuration issues.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Generates a comprehensive diagnostic report about the system
 * @returns {Object} Diagnostic report
 */
function generateSystemDiagnosticReport() {
  const report = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    platform: {
      os: os.platform(),
      version: os.release(),
      arch: os.arch(),
      cpus: os.cpus().length,
      memory: {
        total: Math.round(os.totalmem() / (1024 * 1024)) + ' MB',
        free: Math.round(os.freemem() / (1024 * 1024)) + ' MB',
        usage: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100) + '%'
      },
      hostname: os.hostname(),
      uptime: os.uptime() + ' seconds'
    },
    process: {
      pid: process.pid,
      ppid: process.ppid,
      title: process.title,
      argv: process.argv,
      execPath: process.execPath,
      cwd: process.cwd(),
      versions: process.versions,
      memoryUsage: process.memoryUsage(),
      resourceUsage: process.resourceUsage ? process.resourceUsage() : 'Not available',
      uptime: process.uptime() + ' seconds'
    },
    application: {
      globalVariables: getGlobalVariables(),
      memoryMode: getMemoryModeStatus(),
      envVars: getSanitizedEnvVars(),
      railwaySpecific: getRailwayInfo(),
      directories: checkDirectories(),
      mongoStatus: getMongoStatus(),
      cloudinaryStatus: getCloudinaryStatus()
    }
  };
  
  // Add execution order tracking
  report.executionTrace = getExecutionTrace();
  
  return report;
}

/**
 * Get global variables state
 */
function getGlobalVariables() {
  const safeGlobals = {};
  
  // List of known global variables to check
  const globalsToCheck = [
    'usingMemoryFallback',
    'memoryStorage',
    'mongoConnected',
    'isRailwayEnvironment',
    'fixesApplied',
    'lastResultFileId'
  ];
  
  // Check each global
  globalsToCheck.forEach(key => {
    if (typeof global[key] !== 'undefined') {
      if (key === 'memoryStorage') {
        // For memoryStorage, just show stats not the actual data
        safeGlobals[key] = {
          initialized: !!global[key],
          operations: global[key]?.operations?.length || 0,
          users: global[key]?.users?.length || 0,
          files: global[key]?.files?.length || 0
        };
      } else {
        safeGlobals[key] = global[key];
      }
    } else {
      safeGlobals[key] = 'Not defined';
    }
  });
  
  return safeGlobals;
}

/**
 * Get detailed information about memory mode status
 */
function getMemoryModeStatus() {
  return {
    envVarSetting: process.env.USE_MEMORY_FALLBACK,
    parsedValue: process.env.USE_MEMORY_FALLBACK === 'true',
    globalFlag: !!global.usingMemoryFallback,
    mongoConnection: !!global.mongoConnected,
    memoryStorageInitialized: !!global.memoryStorage,
    memoryConflict: global.usingMemoryFallback !== (process.env.USE_MEMORY_FALLBACK === 'true'),
    recommendedMode: isRailwayEnvironment() ? 'memory' : 'mongo'
  };
}

/**
 * Get sanitized environment variables
 */
function getSanitizedEnvVars() {
  const envVars = {};
  
  // Categories for organization
  const categories = {
    railway: [],
    mongodb: [],
    cloudinary: [],
    application: [],
    system: [],
    other: []
  };
  
  Object.keys(process.env).forEach(key => {
    // Skip sensitive values
    let value;
    if (key.includes('SECRET') || key.includes('KEY') || key.includes('PASS') || key.includes('TOKEN')) {
      value = '[HIDDEN]';
    } else if (key.includes('MONGODB_URI')) {
      value = '[SET BUT HIDDEN]';
    } else {
      value = process.env[key];
    }
    
    // Categorize variables
    if (key.startsWith('RAILWAY_')) {
      categories.railway.push({ key, value });
    } else if (key.startsWith('MONGO')) {
      categories.mongodb.push({ key, value });
    } else if (key.includes('CLOUDINARY')) {
      categories.cloudinary.push({ key, value });
    } else if (['NODE_ENV', 'PORT', 'USE_MEMORY_FALLBACK', 'CORS_ALLOW_ALL'].includes(key)) {
      categories.application.push({ key, value });
    } else if (['PATH', 'NODE_VERSION', 'HOME', 'HOSTNAME'].includes(key)) {
      categories.system.push({ key, value });
    } else {
      categories.other.push({ key, value });
    }
  });
  
  return categories;
}

/**
 * Check if running in Railway environment
 */
function isRailwayEnvironment() {
  return !!(process.env.RAILWAY_SERVICE_NAME || process.env.RAILWAY_ENVIRONMENT);
}

/**
 * Get Railway specific information
 */
function getRailwayInfo() {
  if (!isRailwayEnvironment()) {
    return { isRailway: false };
  }
  
  return {
    isRailway: true,
    serviceName: process.env.RAILWAY_SERVICE_NAME,
    environment: process.env.RAILWAY_ENVIRONMENT,
    publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN,
    projectName: process.env.RAILWAY_PROJECT_NAME,
    memoryFallbackStatus: {
      envVar: process.env.USE_MEMORY_FALLBACK,
      globalFlag: !!global.usingMemoryFallback,
      isConsistent: global.usingMemoryFallback === (process.env.USE_MEMORY_FALLBACK === 'true')
    },
    gitInfo: {
      branch: process.env.RAILWAY_GIT_BRANCH,
      commit: process.env.RAILWAY_GIT_COMMIT_SHA,
      message: process.env.RAILWAY_GIT_COMMIT_MESSAGE
    }
  };
}

/**
 * Check important directories
 */
function checkDirectories() {
  const directoryChecks = {};
  
  // Common directories to check
  const dirsToCheck = [
    {
      name: 'temp',
      path: process.env.TEMP_DIR || path.join(process.cwd(), 'temp')
    },
    {
      name: 'uploads',
      path: process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')
    },
    {
      name: 'cwd',
      path: process.cwd()
    },
    {
      name: 'osTempDir',
      path: os.tmpdir()
    }
  ];
  
  for (const dir of dirsToCheck) {
    const dirInfo = {
      path: dir.path,
      exists: fs.existsSync(dir.path)
    };
    
    if (dirInfo.exists) {
      try {
        // Get directory stats
        const stats = fs.statSync(dir.path);
        dirInfo.stats = {
          size: stats.size,
          isDirectory: stats.isDirectory(),
          mode: stats.mode.toString(8),
          uid: stats.uid,
          gid: stats.gid,
          mtime: stats.mtime
        };
        
        // Check if writable
        try {
          const testFile = path.join(dir.path, `test-${Date.now()}.txt`);
          fs.writeFileSync(testFile, 'Test write access');
          dirInfo.writable = true;
          fs.unlinkSync(testFile);
        } catch (writeError) {
          dirInfo.writable = false;
          dirInfo.writeError = writeError.message;
        }
        
        // List files
        try {
          const files = fs.readdirSync(dir.path);
          dirInfo.fileCount = files.length;
          dirInfo.files = files.slice(0, 10).map(file => {
            try {
              const filePath = path.join(dir.path, file);
              const fileStats = fs.statSync(filePath);
              return {
                name: file,
                size: fileStats.size,
                isDirectory: fileStats.isDirectory(),
                mtime: fileStats.mtime
              };
            } catch (e) {
              return { name: file, error: e.message };
            }
          });
          
          if (files.length > 10) {
            dirInfo.note = `Showing 10 of ${files.length} files`;
          }
        } catch (readError) {
          dirInfo.readError = readError.message;
        }
      } catch (error) {
        dirInfo.error = error.message;
      }
    }
    
    directoryChecks[dir.name] = dirInfo;
  }
  
  return directoryChecks;
}

/**
 * Get MongoDB connection status
 */
function getMongoStatus() {
  const mongoose = require('mongoose');
  
  const connStates = [
    'disconnected',
    'connected',
    'connecting',
    'disconnecting'
  ];
  
  return {
    connectionString: process.env.MONGODB_URI ? '[SET BUT HIDDEN]' : 'Not set',
    connectionState: mongoose.connection ? connStates[mongoose.connection.readyState] || 'unknown' : 'Not initialized',
    readyState: mongoose.connection ? mongoose.connection.readyState : -1,
    memoryFallback: global.usingMemoryFallback === true,
    connectionConfig: {
      connectionTimeoutMS: process.env.MONGODB_CONNECTION_TIMEOUT_MS,
      socketTimeoutMS: process.env.MONGODB_SOCKET_TIMEOUT_MS,
      serverSelectionTimeoutMS: process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS
    },
    hostInfo: mongoose.connection && mongoose.connection.host ? mongoose.connection.host : 'Not connected'
  };
}

/**
 * Get Cloudinary configuration status
 */
function getCloudinaryStatus() {
  const cloudinaryConfigured = !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
  
  return {
    configured: cloudinaryConfigured,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'Not set',
    hasApiKey: !!process.env.CLOUDINARY_API_KEY,
    hasApiSecret: !!process.env.CLOUDINARY_API_SECRET,
    cloudinaryUrl: process.env.CLOUDINARY_URL ? (
      process.env.CLOUDINARY_URL.startsWith('cloudinary://') ? 'Valid format' : 'Invalid format'
    ) : 'Not set',
    uploadFolder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'Not set'
  };
}

/**
 * Track execution order
 */
function getExecutionTrace() {
  // Check if we have a global execution trace
  if (!global._executionTrace) {
    global._executionTrace = [];
  }
  
  // Add current execution to trace
  global._executionTrace.push({
    point: 'SystemDiagnostic',
    timestamp: new Date().toISOString(),
    memoryMode: global.usingMemoryFallback,
    envMemoryMode: process.env.USE_MEMORY_FALLBACK
  });
  
  return global._executionTrace;
}

/**
 * Save diagnostic report to file
 */
function saveReportToFile() {
  try {
    const report = generateSystemDiagnosticReport();
    const reportDir = path.join(process.cwd(), 'logs');
    
    // Ensure directory exists
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const reportPath = path.join(reportDir, `diagnostic-${timestamp}.json`);
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📝 Diagnostic report saved to ${reportPath}`);
    
    return reportPath;
  } catch (error) {
    console.error('❌ Failed to save diagnostic report:', error);
    return null;
  }
}

/**
 * Record a diagnostic trace point
 */
function recordTracePoint(point, data = {}) {
  if (!global._executionTrace) {
    global._executionTrace = [];
  }
  
  global._executionTrace.push({
    point,
    timestamp: new Date().toISOString(),
    memoryMode: global.usingMemoryFallback,
    envMemoryMode: process.env.USE_MEMORY_FALLBACK,
    ...data
  });
  
  console.log(`📌 TRACE POINT: ${point}`);
  console.log(`- Memory mode (global): ${global.usingMemoryFallback}`);
  console.log(`- Memory mode (env): ${process.env.USE_MEMORY_FALLBACK}`);
  
  // Trace specific data
  Object.entries(data).forEach(([key, value]) => {
    console.log(`- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
  });
}

// Export the diagnostic functions
module.exports = {
  generateSystemDiagnosticReport,
  saveReportToFile,
  recordTracePoint
};