const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Ping endpoint to check API connectivity
 */
exports.ping = (req, res) => {
  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
};

/**
 * Check file system accessibility
 */
exports.checkFileSystem = (req, res) => {
  try {
    // Get configured directories
    const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
    const tempDir = process.env.TEMP_DIR || path.join(__dirname, '..', 'temp');
    
    // Ensure directories exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Check write permissions by creating test files
    const uploadTestFile = path.join(uploadDir, `test-${Date.now()}.txt`);
    const tempTestFile = path.join(tempDir, `test-${Date.now()}.txt`);
    
    fs.writeFileSync(uploadTestFile, 'Test file');
    fs.writeFileSync(tempTestFile, 'Test file');
    
    // Cleanup test files
    fs.unlinkSync(uploadTestFile);
    fs.unlinkSync(tempTestFile);
    
    // Get disk space info
    const systemDrive = os.platform() === 'win32' ? 'C:' : '/';
    
    return res.json({
      status: 'ok',
      filesystem: {
        uploadDir: {
          path: uploadDir,
          exists: true,
          writable: true
        },
        tempDir: {
          path: tempDir,
          exists: true,
          writable: true
        },
        systemInfo: {
          platform: os.platform(),
          freemem: os.freemem(),
          totalmem: os.totalmem(),
          tmpdir: os.tmpdir()
        }
      }
    });
  } catch (error) {
    console.error('File system check error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Check memory status
 */
exports.checkMemory = (req, res) => {
  try {
    const memoryFallbackEnabled = process.env.USE_MEMORY_FALLBACK === 'true';
    
    // Basic memory info
    const memoryInfo = {
      memoryFallbackEnabled,
      freeMemory: os.freemem(),
      totalMemory: os.totalmem(),
      memoryUsage: process.memoryUsage()
    };
    
    // Try to get enhanced memory metrics if available
    let enhancedMemoryData = null;
    try {
      // Import the memory manager if available
      const { memoryManager } = require('../utils/processingQueue');
      if (memoryManager) {
        enhancedMemoryData = memoryManager.getMemoryStatus();
        
        // Add memory trend data if available
        if (memoryManager.memoryTrend && Array.isArray(memoryManager.memoryTrend)) {
          memoryInfo.trend = memoryManager.memoryTrend.map(point => ({
            timestamp: point.timestamp,
            usedPercentage: point.usedPercentage,
            heapUsedMB: Math.round(point.heapUsed / (1024 * 1024)),
            rssMB: point.rss ? Math.round(point.rss / (1024 * 1024)) : undefined
          }));
        }
        
        // Add memory leak detection if available
        if (typeof memoryManager.detectMemoryLeak === 'function') {
          memoryInfo.leakProbability = memoryManager.detectMemoryLeak();
        }
      }
    } catch (memoryManagerError) {
      console.warn('Enhanced memory metrics unavailable:', memoryManagerError.message);
      memoryInfo.enhancedMetricsAvailable = false;
    }
    
    // Combine basic and enhanced data
    if (enhancedMemoryData) {
      memoryInfo.enhancedMetricsAvailable = true;
      memoryInfo.status = {
        isWarning: enhancedMemoryData.isWarning,
        isCritical: enhancedMemoryData.isCritical,
        isEmergency: enhancedMemoryData.isEmergency,
        usedPercentage: Math.round(enhancedMemoryData.usedPercentage * 100) / 100,
        availableMB: enhancedMemoryData.availableMB
      };
      
      // Add V8 heap statistics if available
      if (enhancedMemoryData.heapSizeLimit) {
        memoryInfo.v8HeapStats = {
          heapSizeLimitMB: Math.round(enhancedMemoryData.heapSizeLimit / (1024 * 1024)),
          totalHeapSizeMB: Math.round(enhancedMemoryData.totalHeapSize / (1024 * 1024)),
          usedHeapSizeMB: Math.round(enhancedMemoryData.usedHeapSize / (1024 * 1024)),
          heapFragmentation: Math.round(enhancedMemoryData.fragmentation * 100) / 100
        };
      }
    }
    
    // Add global memory storage stats if available
    if (global.memoryStorage) {
      memoryInfo.memoryStorage = {
        operations: global.memoryStorage.operations?.length || 0,
        files: global.memoryStorage.files?.length || 0,
        users: global.memoryStorage.users?.length || 0
      };
    }
    
    return res.json({
      status: 'ok',
      memory: memoryInfo
    });
  } catch (error) {
    console.error('Memory check error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Check Cloudinary configuration
 */
exports.checkCloudinary = (req, res) => {
  try {
    const cloudinaryConfigured = !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    );
    
    return res.json({
      status: 'ok',
      cloudinary: {
        configured: cloudinaryConfigured,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || '(not set)'
      }
    });
  } catch (error) {
    console.error('Cloudinary check error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Check MongoDB connectivity
 */
exports.checkDatabase = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    
    // Check current connection state
    const connectionState = mongoose.connection.readyState;
    const connectionStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    
    // Try to list collections if connected
    let collections = [];
    if (connectionState === 1) { // 1 = connected
      try {
        collections = await mongoose.connection.db.listCollections().toArray();
        collections = collections.map(c => c.name);
      } catch (err) {
        console.error('Error listing collections:', err);
      }
    }
    
    return res.json({
      status: 'ok',
      database: {
        connected: connectionState === 1,
        state: connectionStates[connectionState] || 'unknown',
        usingMemoryFallback: !!global.usingMemoryFallback,
        mongoHost: mongoose.connection.host || 'not connected',
        mongoDbName: mongoose.connection.name || 'not connected',
        collections: collections,
        memoryStats: global.memoryStorage ? {
          operations: global.memoryStorage.operations?.length || 0,
          files: global.memoryStorage.files?.length || 0,
          users: global.memoryStorage.users?.length || 0
        } : null
      }
    });
  } catch (error) {
    console.error('Database check error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Test upload endpoint (only creates a file record, doesn't save files)
 */
exports.testUpload = (req, res) => {
  try {
    // Validate if request has a file
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file provided'
      });
    }
    
    // Return basic file information
    return res.json({
      status: 'ok',
      file: {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer ? `Buffer (${req.file.buffer.length} bytes)` : null
      }
    });
  } catch (error) {
    console.error('Test upload error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Get all diagnostic information combined
 */
exports.getAllDiagnostics = async (req, res) => {
  try {
    console.log('🔍 Running comprehensive system diagnostics...');
    
    // Load both diagnostic tools
    const fileSystemCheck = require('../utils/diagnostic/fileSystemCheck');
    const systemDiagnostic = require('../utils/diagnostic/systemDiagnostic');
    
    // Record trace point
    systemDiagnostic.recordTracePoint('DiagnosticControllerStart', {
      requestPath: req.originalUrl,
      method: req.method
    });
    
    // Run both diagnostic systems in parallel for comprehensive coverage
    console.log('Running enhanced file system diagnostics...');
    const fileSystemPromise = fileSystemCheck.runDiagnostics();
    
    // Generate comprehensive system report
    console.log('Generating comprehensive system report...');
    const systemReport = systemDiagnostic.generateSystemDiagnosticReport();
    
    // Save diagnostic report to file for later analysis
    const reportPath = systemDiagnostic.saveReportToFile();
    console.log(`Diagnostic report saved to: ${reportPath || 'Failed to save'}`);
    
    // Wait for file system diagnostics to complete
    const enhancedDiagnostics = await fileSystemPromise;
    
    // Record trace point after diagnostics
    systemDiagnostic.recordTracePoint('DiagnosticsCompleted', {
      fileSystemSuccess: !!enhancedDiagnostics,
      systemReportSuccess: !!systemReport
    });
    
    // Record critical environment variables
    console.log('CRITICAL ENVIRONMENT VARIABLE CHECK:');
    console.log(`- USE_MEMORY_FALLBACK: "${process.env.USE_MEMORY_FALLBACK}"`);
    console.log(`- NODE_ENV: "${process.env.NODE_ENV}"`);
    console.log(`- RAILWAY_SERVICE_NAME: "${process.env.RAILWAY_SERVICE_NAME || 'not set'}"`);
    console.log(`- Global usingMemoryFallback: ${global.usingMemoryFallback ? 'true' : 'false'}`);
    console.log(`- Memory storage initialized: ${global.memoryStorage ? 'YES' : 'NO'}`);
    
    // If memory storage is initialized, log its contents
    if (global.memoryStorage) {
      console.log(`- Memory storage operations: ${global.memoryStorage.operations?.length || 0}`);
      console.log(`- Memory storage users: ${global.memoryStorage.users?.length || 0}`);
      console.log(`- Memory storage files: ${global.memoryStorage.files?.length || 0}`);
    }
    
    // Run specific test for PDF conversion
    console.log('Testing PDF conversion specifically...');
    let conversionTest = null;
    try {
      conversionTest = await fileSystemCheck.testCreateAndConvertFile();
      systemDiagnostic.recordTracePoint('ConversionTest', {
        success: conversionTest.success,
        steps: conversionTest.steps?.length || 0
      });
      console.log('Conversion test result:', conversionTest.success ? 'Success' : 'Failed');
    } catch (convError) {
      console.error('Error during conversion test:', convError);
      systemDiagnostic.recordTracePoint('ConversionTestError', {
        error: convError.message
      });
      conversionTest = {
        success: false,
        error: convError.message
      };
    }
    
    // Create detailed response combining both diagnostic systems
    const responseData = {
      timestamp: new Date().toISOString(),
      reportSaved: !!reportPath,
      reportPath: reportPath,
      
      // Environment information
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        isRailway: !!process.env.RAILWAY_SERVICE_NAME,
        memoryModeEnv: process.env.USE_MEMORY_FALLBACK,
        memoryModeGlobal: global.usingMemoryFallback,
        memoryConflict: global.usingMemoryFallback !== (process.env.USE_MEMORY_FALLBACK === 'true')
      },
      
      // Comprehensive system information
      system: systemReport.platform,
      
      // File system diagnostics
      filesystem: {
        status: enhancedDiagnostics.summary.status,
        issues: enhancedDiagnostics.summary.issues,
        recommendations: enhancedDiagnostics.summary.recommendations,
        directories: enhancedDiagnostics.directories
      },
      
      // PDF conversion test results
      conversionTest: conversionTest,
      
      // Database status
      database: systemReport.application.mongoStatus,
      
      // Memory storage stats
      memoryStorage: systemReport.application.globalVariables.memoryStorage,
      
      // Cloudinary configuration
      cloudinary: systemReport.application.cloudinaryStatus,
      
      // Railway specific information
      railway: systemReport.application.railwaySpecific,
      
      // Execution tracing for debugging
      executionTrace: systemReport.executionTrace
    };
    
    // Record trace point before sending response
    systemDiagnostic.recordTracePoint('DiagnosticResponseSending', {
      responseSize: JSON.stringify(responseData).length
    });
    
    return res.json(responseData);
  } catch (error) {
    console.error('⚠️ CRITICAL ERROR in diagnostics:', error);
    
    try {
      // Attempt to record the error
      const systemDiagnostic = require('../utils/diagnostic/systemDiagnostic');
      systemDiagnostic.recordTracePoint('DiagnosticError', {
        error: error.message,
        stack: error.stack
      });
    } catch (e) {
      console.error('Could not record diagnostic error:', e);
    }
    
    return res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
      trace: global._executionTrace || [],
      memoryMode: {
        env: process.env.USE_MEMORY_FALLBACK,
        global: global.usingMemoryFallback
      },
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Helper to check if a directory is writable
async function isWritable(dir) {
  try {
    const testFile = path.join(dir, `write-test-${Date.now()}.tmp`);
    fs.writeFileSync(testFile, 'Test');
    fs.unlinkSync(testFile);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * CORS test endpoint that returns current CORS settings
 */
exports.corsTest = (req, res) => {
  try {
    // Get the origins from environment
    const corsAllowAll = process.env.CORS_ALLOW_ALL === 'true';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',') 
      : [frontendUrl];
    
    // Get the request origin
    const requestOrigin = req.headers.origin || 'Not provided';
    
    return res.json({
      status: 'ok',
      cors: {
        allowAll: corsAllowAll,
        allowedOrigins,
        requestOrigin,
        isAllowed: corsAllowAll || allowedOrigins.includes(requestOrigin),
        corsEnabled: process.env.DISABLE_CORS !== 'true'
      }
    });
  } catch (error) {
    console.error('CORS test error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Advanced memory diagnostics endpoint
 * Provides detailed memory metrics, trend analysis, leak detection,
 * and recommendations for memory optimization.
 */
exports.advancedMemoryDiagnostics = async (req, res) => {
  try {
    console.log('Running advanced memory diagnostics...');
    
    // Basic memory info
    const memoryData = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      isRailway: !!process.env.RAILWAY_SERVICE_NAME,
      memoryFallbackEnabled: process.env.USE_MEMORY_FALLBACK === 'true',
      processUptime: process.uptime(),
      nodeVersion: process.version,
      platform: os.platform(),
      cpus: os.cpus().length,
      
      // Basic metrics
      system: {
        totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
        freeMemoryMB: Math.round(os.freemem() / (1024 * 1024)),
        usedPercentage: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(2) + '%'
      },
      
      process: {
        memoryUsage: process.memoryUsage(),
        heapUsedMB: Math.round(process.memoryUsage().heapUsed / (1024 * 1024)),
        heapTotalMB: Math.round(process.memoryUsage().heapTotal / (1024 * 1024)),
        externalMB: Math.round(process.memoryUsage().external / (1024 * 1024)),
        arrayBuffersMB: Math.round((process.memoryUsage().arrayBuffers || 0) / (1024 * 1024))
      }
    };
    
    // Try to get enhanced memory metrics from MemoryManager
    try {
      const { memoryManager } = require('../utils/processingQueue');
      if (memoryManager) {
        console.log('MemoryManager found, collecting enhanced metrics...');
        const enhancedData = memoryManager.getMemoryStatus();
        
        // Add enhanced memory data
        memoryData.enhanced = {
          thresholds: {
            warning: (memoryManager.warningThreshold * 100).toFixed(0) + '%',
            critical: (memoryManager.criticalThreshold * 100).toFixed(0) + '%',
            emergency: (memoryManager.emergencyThreshold * 100).toFixed(0) + '%'
          },
          status: {
            isWarning: enhancedData.isWarning,
            isCritical: enhancedData.isCritical,
            isEmergency: enhancedData.isEmergency,
            usedPercentage: (enhancedData.usedPercentage * 100).toFixed(2) + '%',
            availableMB: enhancedData.availableMB,
            availablePercentage: (enhancedData.availablePercentage * 100).toFixed(2) + '%'
          },
          gcEnabled: memoryManager.gcEnabled,
          lastGC: memoryManager.lastGC ? new Date(memoryManager.lastGC).toISOString() : 'never'
        };
        
        // Add V8 heap statistics if available
        if (enhancedData.heapSizeLimit) {
          memoryData.enhanced.v8HeapStats = {
            heapSizeLimitMB: Math.round(enhancedData.heapSizeLimit / (1024 * 1024)),
            totalHeapSizeMB: Math.round(enhancedData.totalHeapSize / (1024 * 1024)),
            usedHeapSizeMB: Math.round(enhancedData.usedHeapSize / (1024 * 1024)),
            fragmentation: (enhancedData.fragmentation * 100).toFixed(2) + '%'
          };
        }
        
        // Get memory leak analysis if available
        if (memoryManager.memoryLeakDetectionEnabled) {
          const leakProbability = memoryManager.detectMemoryLeak();
          memoryData.leakAnalysis = {
            enabled: true,
            probability: leakProbability,
            risk: leakProbability > 0.8 ? 'high' : 
                  leakProbability > 0.5 ? 'medium' : 'low',
            trendDataPoints: memoryManager.memoryTrend.length
          };
          
          // Add recent trend data (just show the most recent 10 points)
          const recentTrend = memoryManager.memoryTrend.slice(-10);
          memoryData.leakAnalysis.recentTrend = recentTrend.map(point => ({
            timestamp: new Date(point.timestamp).toISOString(),
            usedPercentage: (point.usedPercentage * 100).toFixed(2) + '%',
            heapUsedMB: Math.round(point.heapUsed / (1024 * 1024))
          }));
        }
        
        // Trigger a memory free to see how much can be recovered
        if (req.query.freeMemory === 'true' && memoryManager.tryFreeMemory) {
          console.log('Testing memory recovery...');
          const beforeMemory = process.memoryUsage().heapUsed;
          const memoryAfterGC = await new Promise(resolve => {
            memoryManager.tryFreeMemory(req.query.aggressive === 'true');
            // Wait a moment for GC to complete
            setTimeout(() => {
              resolve(process.memoryUsage().heapUsed);
            }, 500);
          });
          
          const freedBytes = beforeMemory - memoryAfterGC;
          const freedMB = freedBytes / (1024 * 1024);
          
          memoryData.memoryRecoveryTest = {
            performed: true,
            beforeMB: Math.round(beforeMemory / (1024 * 1024)),
            afterMB: Math.round(memoryAfterGC / (1024 * 1024)),
            freedMB: Math.round(freedMB),
            percentRecovered: ((freedBytes / beforeMemory) * 100).toFixed(2) + '%'
          };
        }
      } else {
        memoryData.enhanced = {
          available: false,
          reason: 'MemoryManager not found in processingQueue'
        };
      }
    } catch (memoryManagerError) {
      console.error('Error getting enhanced memory metrics:', memoryManagerError);
      memoryData.enhanced = {
        available: false,
        error: memoryManagerError.message
      };
    }
    
    // Add memory storage information if available
    if (global.memoryStorage) {
      memoryData.memoryStorage = {
        enabled: true,
        items: {
          operations: global.memoryStorage.operations?.length || 0,
          files: global.memoryStorage.files?.length || 0,
          users: global.memoryStorage.users?.length || 0
        },
        // Add sizes if possible
        estimatedSizeMB: estimateMemoryStorageSize(global.memoryStorage)
      };
    } else {
      memoryData.memoryStorage = {
        enabled: false
      };
    }
    
    // Get active file handles
    try {
      if (req.query.detailed === 'true' && process.env.NODE_ENV === 'development') {
        try {
          const { exec } = require('child_process');
          exec(`lsof -p ${process.pid}`, (error, stdout, stderr) => {
            if (error) {
              memoryData.fileHandles = { error: error.message };
              return res.json(memoryData);
            }
            
            const lines = stdout.split('\n');
            memoryData.fileHandles = {
              count: lines.length - 1,
              sample: lines.slice(0, 20).map(line => line.trim())
            };
            
            return res.json(memoryData);
          });
        } catch (fileHandlesError) {
          memoryData.fileHandles = { error: fileHandlesError.message };
          return res.json(memoryData);
        }
      } else {
        // Return data immediately if not getting detailed file handles
        return res.json(memoryData);
      }
    } catch (finalError) {
      console.error('Error in final diagnostic step:', finalError);
      return res.json(memoryData);
    }
  } catch (error) {
    console.error('Error in advanced memory diagnostics:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Helper function to estimate memory storage size
 */
function estimateMemoryStorageSize(storage) {
  if (!storage) return 0;
  
  let totalSize = 0;
  
  // Function to estimate object size recursively
  function estimateObjectSize(obj, visited = new Set()) {
    if (obj === null || obj === undefined) return 0;
    if (typeof obj !== 'object') return 8; // Primitive values
    if (visited.has(obj)) return 0; // Avoid circular references
    
    visited.add(obj);
    let size = 0;
    
    if (Array.isArray(obj)) {
      size = 40; // Base array size
      for (const item of obj) {
        size += estimateObjectSize(item, visited);
      }
    } else {
      size = 40; // Base object size
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          size += key.length * 2; // Key size (2 bytes per char)
          size += estimateObjectSize(obj[key], visited);
        }
      }
    }
    
    return size;
  }
  
  // Estimate size of each collection
  for (const key in storage) {
    if (Object.prototype.hasOwnProperty.call(storage, key)) {
      totalSize += estimateObjectSize(storage[key], new Set());
    }
  }
  
  // Convert to MB
  return Math.round(totalSize / (1024 * 1024));
}

// In-memory store for memory history tracking
// Limited to 100 data points to prevent memory leaks
const memoryHistory = {
  dataPoints: [],
  maxSize: 100,
  lastSampleTime: 0,
  sampleIntervalMs: 60000, // 1 minute between samples by default
  enabled: false,
  anomalies: []
};

/**
 * Memory history endpoint - tracks memory usage over time
 * Provides historical data for trend analysis
 */
exports.memoryHistory = (req, res) => {
  try {
    // Check for commands in the request
    if (req.query.command) {
      switch (req.query.command) {
        case 'start':
          memoryHistory.enabled = true;
          memoryHistory.sampleIntervalMs = req.query.interval ? 
            parseInt(req.query.interval) : 60000;
          startMemoryHistoryTracking();
          return res.json({
            status: 'ok',
            message: `Memory history tracking started with ${memoryHistory.sampleIntervalMs}ms interval`,
            enabled: memoryHistory.enabled
          });
          
        case 'stop':
          memoryHistory.enabled = false;
          return res.json({
            status: 'ok',
            message: 'Memory history tracking stopped',
            enabled: memoryHistory.enabled
          });
          
        case 'clear':
          memoryHistory.dataPoints = [];
          memoryHistory.anomalies = [];
          return res.json({
            status: 'ok',
            message: 'Memory history cleared'
          });
          
        case 'status':
          return res.json({
            status: 'ok',
            enabled: memoryHistory.enabled,
            dataPoints: memoryHistory.dataPoints.length,
            sampleIntervalMs: memoryHistory.sampleIntervalMs,
            startTime: memoryHistory.dataPoints.length > 0 ? 
              memoryHistory.dataPoints[0].timestamp : null,
            endTime: memoryHistory.dataPoints.length > 0 ? 
              memoryHistory.dataPoints[memoryHistory.dataPoints.length - 1].timestamp : null,
            anomalies: memoryHistory.anomalies.length
          });
      }
    }

    // If no command or 'get' command, return the memory history
    let history = memoryHistory.dataPoints;
    
    // Allow filtering by time range
    if (req.query.from) {
      const fromTime = new Date(req.query.from).getTime();
      history = history.filter(point => new Date(point.timestamp).getTime() >= fromTime);
    }
    
    if (req.query.to) {
      const toTime = new Date(req.query.to).getTime();
      history = history.filter(point => new Date(point.timestamp).getTime() <= toTime);
    }
    
    // Allow limiting results
    if (req.query.limit) {
      const limit = parseInt(req.query.limit);
      history = history.slice(-limit);
    }
    
    return res.json({
      status: 'ok',
      enabled: memoryHistory.enabled,
      dataPoints: history.length,
      sampleIntervalMs: memoryHistory.sampleIntervalMs,
      history,
      anomalies: memoryHistory.anomalies
    });
  } catch (error) {
    console.error('Memory history error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Start tracking memory history at regular intervals
 */
function startMemoryHistoryTracking() {
  if (!memoryHistory.enabled) {
    memoryHistory.enabled = true;
  }
  
  // Add initial data point immediately
  addMemoryDataPoint();
  
  // Schedule regular checks using recursive setTimeout
  // This is better than setInterval for variable timing and avoiding overlaps
  scheduleNextMemoryCheck();
}

/**
 * Schedule the next memory check
 */
function scheduleNextMemoryCheck() {
  if (!memoryHistory.enabled) return;
  
  const now = Date.now();
  const nextCheckTime = memoryHistory.lastSampleTime + memoryHistory.sampleIntervalMs;
  const delay = Math.max(0, nextCheckTime - now);
  
  setTimeout(() => {
    if (memoryHistory.enabled) {
      addMemoryDataPoint();
      scheduleNextMemoryCheck();
    }
  }, delay);
}

/**
 * Add a memory data point to the history
 */
function addMemoryDataPoint() {
  try {
    // Record current time
    memoryHistory.lastSampleTime = Date.now();
    
    // Get basic memory info
    const memoryUsage = process.memoryUsage();
    const dataPoint = {
      timestamp: new Date().toISOString(),
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      rss: memoryUsage.rss,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers || 0,
      heapUsedMB: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
      rssMB: Math.round(memoryUsage.rss / (1024 * 1024)),
      usedPercentage: memoryUsage.heapUsed / memoryUsage.heapTotal
    };
    
    // Try to get enhanced memory metrics from MemoryManager
    try {
      const { memoryManager } = require('../utils/processingQueue');
      if (memoryManager) {
        const enhancedData = memoryManager.getMemoryStatus();
        dataPoint.enhanced = {
          usedPercentage: enhancedData.usedPercentage,
          isWarning: enhancedData.isWarning,
          isCritical: enhancedData.isCritical,
          isEmergency: enhancedData.isEmergency,
          availableMB: enhancedData.availableMB
        };
        
        // Check for memory leak
        if (memoryManager.memoryLeakDetectionEnabled) {
          dataPoint.leakProbability = memoryManager.detectMemoryLeak();
        }
        
        // Add v8 heap stats if available
        if (enhancedData.heapSizeLimit) {
          dataPoint.v8 = {
            heapSizeLimit: enhancedData.heapSizeLimit,
            totalHeapSize: enhancedData.totalHeapSize,
            usedHeapSize: enhancedData.usedHeapSize,
            fragmentation: enhancedData.fragmentation
          };
        }
      }
    } catch (error) {
      // Just skip enhanced metrics if not available
    }
    
    // Add to history
    memoryHistory.dataPoints.push(dataPoint);
    
    // Trim to max size
    if (memoryHistory.dataPoints.length > memoryHistory.maxSize) {
      memoryHistory.dataPoints.shift();
    }
    
    // Detect anomalies
    detectMemoryAnomalies();
    
  } catch (error) {
    console.error('Error adding memory data point:', error);
  }
}

/**
 * Detect anomalies in memory usage
 */
function detectMemoryAnomalies() {
  const points = memoryHistory.dataPoints;
  if (points.length < 3) return; // Need at least 3 points for anomaly detection
  
  const currentPoint = points[points.length - 1];
  const previousPoint = points[points.length - 2];
  
  // Check for sudden large increases in memory usage
  const heapUsedChange = currentPoint.heapUsed - previousPoint.heapUsed;
  const heapUsedPercentChange = heapUsedChange / previousPoint.heapUsed;
  
  // Consider it an anomaly if heap usage increases by more than 20% in one step
  if (heapUsedPercentChange > 0.2) {
    const anomaly = {
      timestamp: currentPoint.timestamp,
      type: 'sudden_increase',
      metric: 'heapUsed',
      previous: previousPoint.heapUsedMB,
      current: currentPoint.heapUsedMB,
      percentChange: (heapUsedPercentChange * 100).toFixed(2) + '%',
      absoluteChangeMB: Math.round(heapUsedChange / (1024 * 1024))
    };
    
    memoryHistory.anomalies.push(anomaly);
    
    // Limit anomalies array
    if (memoryHistory.anomalies.length > 20) {
      memoryHistory.anomalies.shift();
    }
    
    console.warn(`Memory anomaly detected: Heap usage increased by ${anomaly.percentChange}`);
  }
}

/**
 * Advanced diagnostics for PDF conversion issues
 */
exports.diagnosePdfConversion = async (req, res) => {
  try {
    const fileSystemCheck = require('../utils/diagnostic/fileSystemCheck');
    const pdfService = require('../services/pdfService');
    const fs = require('fs');
    const path = require('path');
    const { v4: uuidv4 } = require('uuid');
    
    console.log('Running detailed PDF conversion diagnostics...');
    
    // Create test directory
    const testDir = path.join(__dirname, '..', 'temp', `diag-${Date.now()}`);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Results object
    const results = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      isRailway: !!process.env.RAILWAY_SERVICE_NAME,
      memoryFallbackEnabled: process.env.USE_MEMORY_FALLBACK === 'true',
      tests: [],
      summary: {
        success: false,
        issues: [],
        recommendations: []
      }
    };
    
    // TEST 1: Create a minimal PDF file
    const testId = uuidv4();
    const minimalPdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%EOF';
    const testPdfPath = path.join(testDir, `test-${testId}.pdf`);
    
    try {
      fs.writeFileSync(testPdfPath, minimalPdf);
      const pdfStats = fs.statSync(testPdfPath);
      
      results.tests.push({
        name: 'Create minimal PDF',
        success: true,
        path: testPdfPath,
        size: pdfStats.size
      });
    } catch (error) {
      results.tests.push({
        name: 'Create minimal PDF',
        success: false,
        error: error.message
      });
      
      results.summary.issues.push('Failed to create test PDF file');
      results.summary.recommendations.push('Check file system permissions');
      return res.json(results);
    }
    
    // TEST 2: Try to parse the PDF
    try {
      const pdfParse = require('pdf-parse');
      const pdfBuffer = fs.readFileSync(testPdfPath);
      const pdfData = await pdfParse(pdfBuffer);
      
      results.tests.push({
        name: 'Parse PDF content',
        success: true,
        pageCount: pdfData.numpages,
        textLength: pdfData.text.length
      });
    } catch (error) {
      results.tests.push({
        name: 'Parse PDF content',
        success: false,
        error: error.message
      });
      
      results.summary.issues.push('Failed to parse PDF content: ' + error.message);
      results.summary.recommendations.push('Check if pdf-parse dependency is installed correctly');
    }
    
    // TEST 3: Check DOCX generation dependency
    try {
      const { Document, Paragraph } = require('docx');
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              text: 'Test document'
            })
          ]
        }]
      });
      
      results.tests.push({
        name: 'DOCX module check',
        success: true,
        details: 'docx module loaded successfully'
      });
    } catch (error) {
      results.tests.push({
        name: 'DOCX module check',
        success: false,
        error: error.message
      });
      
      results.summary.issues.push('Failed to load DOCX module: ' + error.message);
      results.summary.recommendations.push('Check if docx dependency is installed correctly');
    }
    
    // TEST 4: Try full conversion with detailed logging
    try {
      // Temporarily enhance logging
      const originalLog = console.log;
      const originalError = console.error;
      
      const logs = [];
      console.log = (...args) => {
        logs.push({ type: 'log', message: args.map(a => String(a)).join(' ') });
        originalLog.apply(console, args);
      };
      
      console.error = (...args) => {
        logs.push({ type: 'error', message: args.map(a => String(a)).join(' ') });
        originalError.apply(console, args);
      };
      
      // Attempt conversion
      try {
        const conversionResult = await pdfService.convertPdfToWord(testPdfPath);
        
        results.tests.push({
          name: 'Full PDF to DOCX conversion',
          success: true,
          outputPath: conversionResult.outputPath,
          exists: fs.existsSync(conversionResult.outputPath),
          size: fs.existsSync(conversionResult.outputPath) ? 
                 fs.statSync(conversionResult.outputPath).size : 0
        });
        
        // Verify the generated DOCX
        if (fs.existsSync(conversionResult.outputPath)) {
          const docxStats = fs.statSync(conversionResult.outputPath);
          
          if (docxStats.size > 0) {
            results.tests.push({
              name: 'Verify DOCX file',
              success: true,
              size: docxStats.size,
              path: conversionResult.outputPath
            });
          } else {
            results.tests.push({
              name: 'Verify DOCX file',
              success: false,
              error: 'DOCX file is empty (0 bytes)'
            });
            
            results.summary.issues.push('Generated DOCX file is empty');
          }
        } else {
          results.tests.push({
            name: 'Verify DOCX file',
            success: false,
            error: 'DOCX file not found at expected path'
          });
          
          results.summary.issues.push('DOCX file was not created at the expected location');
        }
      } catch (convError) {
        results.tests.push({
          name: 'Full PDF to DOCX conversion',
          success: false,
          error: convError.message,
          stack: convError.stack
        });
        
        results.summary.issues.push('PDF to DOCX conversion failed: ' + convError.message);
      }
      
      // Restore console functions
      console.log = originalLog;
      console.error = originalError;
      
      // Add logs to results
      results.conversionLogs = logs;
      
    } catch (error) {
      results.tests.push({
        name: 'Full PDF to DOCX conversion (outer)',
        success: false,
        error: error.message,
        stack: error.stack
      });
      
      results.summary.issues.push('Fatal error during conversion test: ' + error.message);
    }
    
    // TEST 5: Check memory mode operation if applicable
    if (process.env.USE_MEMORY_FALLBACK === 'true') {
      try {
        // Check if we have the global memory storage
        if (global.memoryStorage) {
          // Look for the operations related to our test
          const opsCount = global.memoryStorage.operations?.length || 0;
          const filesCount = global.memoryStorage.files?.length || 0;
          
          results.tests.push({
            name: 'Memory storage check',
            success: true,
            operationsCount: opsCount,
            filesCount: filesCount,
            memoryStats: process.memoryUsage()
          });
        } else {
          results.tests.push({
            name: 'Memory storage check',
            success: false,
            error: 'Memory storage is not initialized'
          });
          
          results.summary.issues.push('Memory fallback is enabled but storage is not initialized');
          results.summary.recommendations.push('Check memory fallback implementation in the application');
        }
      } catch (memError) {
        results.tests.push({
          name: 'Memory storage check',
          success: false,
          error: memError.message
        });
      }
    }
    
    // Clean up test directory if still exists
    try {
      // Use recursive deletion with caution - only delete our test directory
      if (fs.existsSync(testDir) && testDir.includes('diag-')) {
        const testFiles = fs.readdirSync(testDir);
        for (const file of testFiles) {
          fs.unlinkSync(path.join(testDir, file));
        }
        fs.rmdirSync(testDir);
      }
    } catch (cleanupError) {
      console.error('Error cleaning up test directory:', cleanupError);
      // Non-critical error, don't add to issues
    }
    
    // Generate final summary
    const successCount = results.tests.filter(t => t.success).length;
    const totalTests = results.tests.length;
    
    results.summary.success = successCount === totalTests;
    results.summary.successRate = `${successCount}/${totalTests} tests passed`;
    
    if (results.summary.issues.length === 0 && !results.summary.success) {
      results.summary.issues.push('Some tests failed but no specific issues were identified');
    }
    
    // Add recommendations if none exist
    if (results.summary.recommendations.length === 0) {
      if (!results.summary.success) {
        results.summary.recommendations.push('Check the detailed test results for specific error messages');
        results.summary.recommendations.push('Verify all dependencies are correctly installed (pdf-parse, docx)');
        results.summary.recommendations.push('Ensure temp directory is writable');
        
        if (process.env.RAILWAY_SERVICE_NAME) {
          results.summary.recommendations.push('For Railway deployments, ensure USE_MEMORY_FALLBACK=true is set');
        }
      }
    }
    
    return res.json(results);
  } catch (error) {
    console.error('PDF conversion diagnostics error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};