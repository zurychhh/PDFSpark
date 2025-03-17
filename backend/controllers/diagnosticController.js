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
    
    return res.json({
      status: 'ok',
      memory: {
        memoryFallbackEnabled,
        freeMemory: os.freemem(),
        totalMemory: os.totalmem(),
        memoryUsage: process.memoryUsage()
      }
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
    // Get file system info
    const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
    const tempDir = process.env.TEMP_DIR || path.join(__dirname, '..', 'temp');
    
    let fileSystemInfo = {
      status: 'error',
      message: 'File system check failed'
    };
    
    try {
      // Ensure directories exist
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      fileSystemInfo = {
        status: 'ok',
        uploadDir: {
          path: uploadDir,
          exists: fs.existsSync(uploadDir),
          writable: await isWritable(uploadDir)
        },
        tempDir: {
          path: tempDir,
          exists: fs.existsSync(tempDir),
          writable: await isWritable(tempDir)
        }
      };
    } catch (fsError) {
      fileSystemInfo.error = fsError.message;
    }
    
    // Get database info
    const mongoose = require('mongoose');
    const connectionState = mongoose.connection.readyState;
    const connectionStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    
    // Get system info
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      memory: {
        total: Math.round(os.totalmem() / (1024 * 1024)) + 'MB',
        free: Math.round(os.freemem() / (1024 * 1024)) + 'MB',
        usage: process.memoryUsage()
      },
      uptime: Math.round(os.uptime() / 60) + ' minutes',
      nodeVersion: process.version,
      env: process.env.NODE_ENV || 'development'
    };
    
    // Return all diagnostics
    return res.json({
      timestamp: new Date().toISOString(),
      system: systemInfo,
      filesystem: fileSystemInfo,
      database: {
        connected: connectionState === 1,
        state: connectionStates[connectionState] || 'unknown',
        usingMemoryFallback: !!global.usingMemoryFallback,
        mongoHost: mongoose.connection.host || 'not connected',
        memoryStats: global.memoryStorage ? {
          operations: global.memoryStorage.operations?.length || 0,
          files: global.memoryStorage.files?.length || 0,
          users: global.memoryStorage.users?.length || 0
        } : null
      },
      cloudinary: {
        configured: !!(
          process.env.CLOUDINARY_CLOUD_NAME &&
          process.env.CLOUDINARY_API_KEY &&
          process.env.CLOUDINARY_API_SECRET
        ),
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || '(not set)'
      }
    });
  } catch (error) {
    console.error('All diagnostics error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
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