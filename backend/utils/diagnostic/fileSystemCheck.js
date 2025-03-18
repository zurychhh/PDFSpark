/**
 * File System Diagnostic Tool
 * 
 * This utility performs deep diagnostics on the file system
 * to identify issues with file creation, conversion, and access.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { execSync } = require('child_process');

// Configuration
const DIAGNOSTIC_FILE_SIZE = 5 * 1024; // 5KB test file
// Better-formatted minimal PDF for testing
const TEST_PDF_CONTENT = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /MediaBox [0 0 612 792] /Parent 2 0 R >>
endobj
xref
0 4
0000000000 65535 f 
0000000015 00000 n 
0000000066 00000 n 
0000000125 00000 n 
trailer
<< /Root 1 0 R /Size 4 >>
startxref
195
%%EOF`;

/**
 * Run comprehensive file system diagnostics
 */
async function runDiagnostics() {
  console.log('🔍 Starting comprehensive file system diagnostics');
  const results = {
    timestamp: new Date().toISOString(),
    system: getSystemInfo(),
    directories: {},
    tests: {}
  };
  
  // Check environment and directories
  results.environment = checkEnvironmentVariables();
  results.directories = await checkDirectories();
  
  // Run file operation tests
  try {
    results.tests.createAndRead = await testCreateAndReadFile();
    results.tests.createAndConvert = await testCreateAndConvertFile();
    results.tests.pathPermissions = checkPathPermissions();
    results.tests.diskSpace = checkDiskSpace();
    
    // Run Railway-specific tests if in Railway environment
    if (process.env.RAILWAY_SERVICE_NAME) {
      results.tests.railway = await testRailwaySpecificIssues();
    }
  } catch (error) {
    console.error('Error during diagnostic tests:', error);
    results.error = {
      message: error.message,
      stack: error.stack
    };
  }
  
  // Generate summary
  results.summary = generateSummary(results);
  
  return results;
}

/**
 * Get detailed system information
 */
function getSystemInfo() {
  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: os.uptime(),
    cwd: process.cwd(),
    nodeVersion: process.version,
    env: process.env.NODE_ENV || 'development'
  };
}

/**
 * Check all relevant environment variables
 */
function checkEnvironmentVariables() {
  const relevantVars = [
    'NODE_ENV',
    'TEMP_DIR',
    'UPLOAD_DIR',
    'RAILWAY_SERVICE_NAME',
    'RAILWAY_STATIC_URL',
    'PORT',
    'MEMORY_FALLBACK',
    'USE_MEMORY_FALLBACK',
    'MEMORY_STORAGE_LIMIT',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'MONGODB_URI'
  ];
  
  const envVars = {};
  
  relevantVars.forEach(varName => {
    // Only show that variable exists, not its value for security
    const value = process.env[varName];
    envVars[varName] = {
      set: value !== undefined,
      value: varName.includes('URI') || varName.includes('KEY') || varName.includes('SECRET') 
        ? (value ? '[REDACTED]' : undefined)
        : value
    };
  });
  
  return envVars;
}

/**
 * Check all relevant directories for accessibility and writeability
 */
async function checkDirectories() {
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
    
    // Create directory if it doesn't exist
    if (!dirInfo.exists) {
      try {
        fs.mkdirSync(dir.path, { recursive: true });
        dirInfo.created = true;
        dirInfo.exists = true;
      } catch (error) {
        dirInfo.error = {
          message: error.message,
          code: error.code
        };
      }
    }
    
    // Check if directory is writable by creating a test file
    if (dirInfo.exists) {
      const testFilePath = path.join(dir.path, `test-${Date.now()}.txt`);
      try {
        fs.writeFileSync(testFilePath, 'Test write access');
        dirInfo.writable = true;
        
        // Check if file can be read
        try {
          const content = fs.readFileSync(testFilePath, 'utf8');
          dirInfo.readable = content === 'Test write access';
        } catch (readError) {
          dirInfo.readable = false;
          dirInfo.readError = {
            message: readError.message,
            code: readError.code
          };
        }
        
        // Clean up test file
        try {
          fs.unlinkSync(testFilePath);
          dirInfo.deletable = true;
        } catch (unlinkError) {
          dirInfo.deletable = false;
          dirInfo.unlinkError = {
            message: unlinkError.message,
            code: unlinkError.code
          };
        }
      } catch (writeError) {
        dirInfo.writable = false;
        dirInfo.writeError = {
          message: writeError.message,
          code: writeError.code
        };
      }
      
      // Get directory stats
      try {
        const stats = fs.statSync(dir.path);
        dirInfo.stats = {
          size: stats.size,
          isDirectory: stats.isDirectory(),
          mode: stats.mode.toString(8), // File permissions in octal
          uid: stats.uid,
          gid: stats.gid,
          mtime: stats.mtime
        };
      } catch (statError) {
        dirInfo.statError = {
          message: statError.message,
          code: statError.code
        };
      }
      
      // List files in directory
      try {
        const files = fs.readdirSync(dir.path);
        dirInfo.fileCount = files.length;
        
        // Only list up to 10 files to avoid huge outputs
        dirInfo.files = files.slice(0, 10).map(file => {
          const filePath = path.join(dir.path, file);
          try {
            const stats = fs.statSync(filePath);
            return {
              name: file,
              size: stats.size,
              isDirectory: stats.isDirectory(),
              mtime: stats.mtime
            };
          } catch (e) {
            return { name: file, error: e.message };
          }
        });
        
        if (files.length > 10) {
          dirInfo.filesNote = `Showing 10 of ${files.length} files`;
        }
      } catch (readdirError) {
        dirInfo.readdirError = {
          message: readdirError.message,
          code: readdirError.code
        };
      }
    }
    
    directoryChecks[dir.name] = dirInfo;
  }
  
  return directoryChecks;
}

/**
 * Test creating and reading a file
 */
async function testCreateAndReadFile() {
  const result = {
    success: false,
    steps: []
  };
  
  try {
    // 1. Create temp directory if it doesn't exist
    const tempDir = process.env.TEMP_DIR || path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    result.steps.push({ name: 'Create temp directory', success: true, path: tempDir });
    
    // 2. Generate a unique test file path
    const testId = uuidv4();
    const testFilePath = path.join(tempDir, `test-${testId}.txt`);
    const testContent = 'This is a test file for diagnostic purposes.\n'.repeat(100);
    result.steps.push({ name: 'Generate test file path', success: true, path: testFilePath });
    
    // 3. Write test file
    fs.writeFileSync(testFilePath, testContent);
    const writeStats = fs.statSync(testFilePath);
    result.steps.push({ 
      name: 'Write test file', 
      success: true, 
      fileSize: writeStats.size,
      expectedSize: testContent.length
    });
    
    // 4. Read test file
    const readContent = fs.readFileSync(testFilePath, 'utf8');
    result.steps.push({ 
      name: 'Read test file', 
      success: readContent === testContent,
      contentLength: readContent.length,
      expectedLength: testContent.length,
      contentMatch: readContent === testContent
    });
    
    // 5. Delete test file
    fs.unlinkSync(testFilePath);
    const fileExists = fs.existsSync(testFilePath);
    result.steps.push({ 
      name: 'Delete test file', 
      success: !fileExists,
      fileExists
    });
    
    result.success = true;
  } catch (error) {
    result.steps.push({ 
      name: 'Error occurred', 
      success: false,
      error: {
        message: error.message,
        code: error.code,
        stack: error.stack
      }
    });
    result.success = false;
    result.error = {
      message: error.message,
      code: error.code
    };
  }
  
  return result;
}

/**
 * Test creating and converting a PDF file
 */
async function testCreateAndConvertFile() {
  const result = {
    success: false,
    steps: []
  };
  
  try {
    // 1. Create temp directory if it doesn't exist
    const tempDir = process.env.TEMP_DIR || path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    result.steps.push({ name: 'Create temp directory', success: true, path: tempDir });
    
    // 2. Generate test PDF file
    const testId = uuidv4();
    const testPdfPath = path.join(tempDir, `test-${testId}.pdf`);
    fs.writeFileSync(testPdfPath, TEST_PDF_CONTENT);
    const pdfStats = fs.statSync(testPdfPath);
    result.steps.push({ 
      name: 'Create test PDF file', 
      success: true, 
      path: testPdfPath,
      fileSize: pdfStats.size
    });
    
    // 3. Check if PDF is valid
    try {
      // Just read the file to verify it exists
      const pdfBuffer = fs.readFileSync(testPdfPath);
      result.steps.push({ 
        name: 'Verify PDF file', 
        success: true,
        fileSize: pdfBuffer.length,
        validPdf: pdfBuffer.toString().startsWith('%PDF')
      });
    } catch (verifyError) {
      result.steps.push({ 
        name: 'Verify PDF file', 
        success: false,
        error: {
          message: verifyError.message,
          code: verifyError.code
        }
      });
      throw verifyError;
    }
    
    // 4. Set up DOCX output path
    const docxOutputPath = path.join(tempDir, `test-${testId}.docx`);
    result.steps.push({ 
      name: 'Prepare DOCX output path', 
      success: true,
      outputPath: docxOutputPath
    });
    
    // 5. Try to convert using imported function
    try {
      // Import the conversion function dynamically
      const pdfService = require('../../services/pdfService');
      if (typeof pdfService.convertPdfToWord !== 'function') {
        throw new Error('convertPdfToWord function not found in pdfService');
      }
      
      // Log that we're attempting conversion
      result.steps.push({ 
        name: 'PDF service imported', 
        success: true
      });
      
      // Try to convert
      const conversionResult = await pdfService.convertPdfToWord(testPdfPath);
      
      result.steps.push({ 
        name: 'Convert PDF to DOCX', 
        success: true,
        conversionResult
      });
      
      // Verify result file exists
      if (conversionResult && conversionResult.outputPath) {
        const resultExists = fs.existsSync(conversionResult.outputPath);
        const resultStats = resultExists ? fs.statSync(conversionResult.outputPath) : null;
        
        result.steps.push({ 
          name: 'Verify conversion result', 
          success: resultExists,
          resultPath: conversionResult.outputPath,
          resultExists,
          resultSize: resultStats ? resultStats.size : 0
        });
        
        // Clean up result file
        if (resultExists) {
          fs.unlinkSync(conversionResult.outputPath);
        }
      } else {
        result.steps.push({ 
          name: 'Verify conversion result', 
          success: false,
          error: 'Conversion result missing outputPath'
        });
      }
    } catch (conversionError) {
      result.steps.push({ 
        name: 'Convert PDF to DOCX', 
        success: false,
        error: {
          message: conversionError.message,
          stack: conversionError.stack
        }
      });
      
      // Don't throw here - we want to continue with the test
      result.conversionError = {
        message: conversionError.message,
        code: conversionError.code
      };
    }
    
    // 6. Clean up test PDF file
    fs.unlinkSync(testPdfPath);
    const pdfExists = fs.existsSync(testPdfPath);
    result.steps.push({ 
      name: 'Delete test PDF', 
      success: !pdfExists,
      fileExists: pdfExists
    });
    
    // If we got this far without throwing, mark overall success
    result.success = !result.conversionError;
  } catch (error) {
    result.steps.push({ 
      name: 'Error occurred', 
      success: false,
      error: {
        message: error.message,
        code: error.code,
        stack: error.stack
      }
    });
    result.success = false;
    result.error = {
      message: error.message,
      code: error.code
    };
  }
  
  return result;
}

/**
 * Check permissions on all relevant paths
 */
function checkPathPermissions() {
  const result = {};
  
  // Paths to check
  const pathsToCheck = [
    process.cwd(),
    os.tmpdir(),
    process.env.TEMP_DIR || path.join(process.cwd(), 'temp'),
    process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')
  ];
  
  for (const pathToCheck of pathsToCheck) {
    try {
      if (!fs.existsSync(pathToCheck)) {
        result[pathToCheck] = {
          exists: false,
          error: 'Path does not exist'
        };
        continue;
      }
      
      const stats = fs.statSync(pathToCheck);
      
      // On Unix-like systems, check permissions directly
      if (os.platform() !== 'win32') {
        result[pathToCheck] = {
          exists: true,
          mode: stats.mode.toString(8),
          uid: stats.uid,
          gid: stats.gid,
          isDirectory: stats.isDirectory()
        };
        
        try {
          // Try to use Unix commands to get more info
          try {
            const lsOutput = execSync(`ls -ld "${pathToCheck}"`, { encoding: 'utf8' });
            result[pathToCheck].lsOutput = lsOutput.trim();
          } catch (e) {
            // Ignore if command fails
          }
          
          try {
            const statOutput = execSync(`stat "${pathToCheck}"`, { encoding: 'utf8' });
            result[pathToCheck].statOutput = statOutput.trim();
          } catch (e) {
            // Ignore if command fails
          }
        } catch (e) {
          // Ignore command execution errors
        }
      } else {
        // On Windows, just record basic info
        result[pathToCheck] = {
          exists: true,
          isDirectory: stats.isDirectory(),
          mtime: stats.mtime
        };
      }
      
      // Check write access by creating and deleting a test file
      const testFilePath = path.join(pathToCheck, `perm-test-${Date.now()}.txt`);
      try {
        fs.writeFileSync(testFilePath, 'Test permissions');
        result[pathToCheck].writable = true;
        
        try {
          fs.unlinkSync(testFilePath);
          result[pathToCheck].deletable = true;
        } catch (unlinkError) {
          result[pathToCheck].deletable = false;
          result[pathToCheck].unlinkError = unlinkError.message;
        }
      } catch (writeError) {
        result[pathToCheck].writable = false;
        result[pathToCheck].writeError = writeError.message;
      }
    } catch (error) {
      result[pathToCheck] = {
        exists: true,
        error: error.message
      };
    }
  }
  
  return result;
}

/**
 * Check available disk space on all relevant paths
 */
function checkDiskSpace() {
  const result = {};
  
  // Paths to check
  const pathsToCheck = [
    process.cwd(),
    os.tmpdir(),
    process.env.TEMP_DIR || path.join(process.cwd(), 'temp'),
    process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')
  ];
  
  // For Unix-like systems, we can use the df command
  if (os.platform() !== 'win32') {
    for (const pathToCheck of pathsToCheck) {
      try {
        const dfOutput = execSync(`df -h "${pathToCheck}"`, { encoding: 'utf8' });
        result[pathToCheck] = {
          dfOutput: dfOutput.trim()
        };
      } catch (error) {
        result[pathToCheck] = {
          error: error.message
        };
      }
    }
  } else {
    // On Windows, just note we can't check disk space easily
    result.note = 'Disk space check not implemented for Windows';
  }
  
  // General system storage info
  result.freemem = os.freemem();
  result.totalmem = os.totalmem();
  result.memoryUsagePercentage = Math.round((1 - (os.freemem() / os.totalmem())) * 100);
  
  return result;
}

/**
 * Test Railway-specific issues
 */
async function testRailwaySpecificIssues() {
  const result = {
    isRailway: !!process.env.RAILWAY_SERVICE_NAME,
    steps: []
  };
  
  if (!process.env.RAILWAY_SERVICE_NAME) {
    return result;
  }
  
  // Check memory mode
  result.memoryFallbackEnabled = process.env.USE_MEMORY_FALLBACK === 'true';
  result.steps.push({
    name: 'Check memory fallback mode',
    status: result.memoryFallbackEnabled ? 'enabled' : 'disabled'
  });
  
  // Test environmental limitations
  const tempDir = process.env.TEMP_DIR || path.join(process.cwd(), 'temp');
  
  // Create a larger test file (1MB) to check for memory/storage constraints
  try {
    const largeTestId = uuidv4();
    const largeTestPath = path.join(tempDir, `large-test-${largeTestId}.bin`);
    
    // Create a 1MB file
    const buffer = Buffer.alloc(1024 * 1024, 'A');
    fs.writeFileSync(largeTestPath, buffer);
    
    result.steps.push({
      name: 'Create 1MB test file',
      success: true,
      path: largeTestPath,
      size: fs.statSync(largeTestPath).size
    });
    
    // Clean up
    fs.unlinkSync(largeTestPath);
  } catch (error) {
    result.steps.push({
      name: 'Create 1MB test file',
      success: false,
      error: error.message
    });
  }
  
  // Check file persistence across requests
  try {
    const persistenceId = uuidv4();
    const persistencePath = path.join(tempDir, `persistence-test-${persistenceId}.txt`);
    
    fs.writeFileSync(persistencePath, `Test persistence at ${new Date().toISOString()}`);
    
    result.steps.push({
      name: 'Create persistence test file',
      success: true,
      path: persistencePath,
      content: fs.readFileSync(persistencePath, 'utf8')
    });
    
    // Note: In a real test, you would check this file in a subsequent request
    // For now, we just note that the file needs to be checked later
    result.steps.push({
      name: 'Check persistence across requests',
      note: 'This test is informational only. In Railway, files may not persist across deploys or service restarts.'
    });
  } catch (error) {
    result.steps.push({
      name: 'Test file persistence',
      success: false,
      error: error.message
    });
  }
  
  return result;
}

/**
 * Generate a summary of all test results
 */
function generateSummary(results) {
  const summary = {
    status: 'unknown',
    issues: [],
    recommendations: []
  };
  
  // Check for critical errors
  if (results.error) {
    summary.status = 'critical';
    summary.issues.push(`Critical diagnostic error: ${results.error.message}`);
    summary.recommendations.push('Review server logs for more details on the diagnostic error');
    return summary;
  }
  
  // Count failures
  let failures = 0;
  
  // Check directory access
  Object.keys(results.directories).forEach(dirName => {
    const dir = results.directories[dirName];
    
    if (!dir.exists) {
      failures++;
      summary.issues.push(`Directory does not exist: ${dir.path}`);
      summary.recommendations.push(`Create directory with 'mkdir -p ${dir.path}'`);
    } else if (!dir.writable) {
      failures++;
      summary.issues.push(`Directory not writable: ${dir.path}`);
      summary.recommendations.push(`Change permissions with 'chmod 755 ${dir.path}'`);
    }
  });
  
  // Check file operations
  if (results.tests.createAndRead && !results.tests.createAndRead.success) {
    failures++;
    summary.issues.push('Basic file operations (create/read) failed');
    if (results.tests.createAndRead.error) {
      summary.issues.push(`Error: ${results.tests.createAndRead.error.message}`);
    }
    summary.recommendations.push('Check file system permissions and available space');
  }
  
  // Check conversion operations
  if (results.tests.createAndConvert && !results.tests.createAndConvert.success) {
    failures++;
    summary.issues.push('PDF conversion operations failed');
    
    if (results.tests.createAndConvert.conversionError) {
      summary.issues.push(`Conversion error: ${results.tests.createAndConvert.conversionError.message}`);
    }
    
    // Analyze conversion steps for more specific issues
    if (results.tests.createAndConvert.steps) {
      const conversionSteps = results.tests.createAndConvert.steps;
      const failedSteps = conversionSteps.filter(step => !step.success);
      
      failedSteps.forEach(step => {
        if (step.error) {
          const errorMsg = typeof step.error === 'string' ? step.error : step.error.message;
          summary.issues.push(`Failed at '${step.name}': ${errorMsg}`);
        }
      });
    }
    
    summary.recommendations.push('Check PDF service dependencies and configurations');
  }
  
  // Check Railway-specific issues
  if (process.env.RAILWAY_SERVICE_NAME) {
    if (!results.tests.railway || !results.tests.railway.memoryFallbackEnabled) {
      summary.issues.push('Railway environment detected but memory fallback not enabled');
      summary.recommendations.push('Set USE_MEMORY_FALLBACK=true for Railway deployment');
    }
    
    // Check if any Railway-specific tests failed
    if (results.tests.railway && results.tests.railway.steps) {
      const railwaySteps = results.tests.railway.steps;
      const failedRailwaySteps = railwaySteps.filter(step => step.success === false);
      
      failedRailwaySteps.forEach(step => {
        failures++;
        summary.issues.push(`Railway test '${step.name}' failed: ${step.error}`);
      });
      
      if (failedRailwaySteps.length > 0) {
        summary.recommendations.push('Review Railway-specific configurations and limitations');
      }
    }
  }
  
  // Determine overall status
  if (failures === 0) {
    summary.status = 'healthy';
  } else if (failures <= 2) {
    summary.status = 'warning';
  } else {
    summary.status = 'critical';
  }
  
  return summary;
}

module.exports = {
  runDiagnostics,
  getSystemInfo,
  checkDirectories,
  testCreateAndReadFile,
  testCreateAndConvertFile,
  checkPathPermissions,
  checkDiskSpace
};