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