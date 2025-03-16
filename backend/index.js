require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs-extra');
const { errorHandler } = require('./utils/errorHandler');
const mongoose = require('mongoose');
const { runCleanup } = require('./utils/fileCleanup');

// Print environment info for debugging
console.log(`Running in ${process.env.NODE_ENV} mode`);
console.log('Environment vars check:');
console.log(`- PORT: ${process.env.PORT || 'Not set'}`);
console.log(`- MONGODB_URI: ${process.env.MONGODB_URI ? 'Set (value hidden)' : 'Not set'}`);
console.log(`- MONGOHOST: ${process.env.MONGOHOST || 'Not set'}`);
console.log(`- MONGOUSER: ${process.env.MONGOUSER ? 'Set (value hidden)' : 'Not set'}`);
console.log(`- NODE_ENV: ${process.env.NODE_ENV || 'Not set'}`);
console.log(`- RAILWAY_SERVICE_NAME: ${process.env.RAILWAY_SERVICE_NAME || 'Not set'}`);
console.log('All environment variables:');
console.log(Object.keys(process.env).join(', '));

// Initialize Express app
const app = express();

// Trust proxy - needed for Railway or any deployments behind a reverse proxy
// This is essential for rate limiting to work correctly with X-Forwarded-For headers
app.set('trust proxy', 1);

// IMPORTANT: Port Determination Logic
// Railway sets a PORT environment variable that must be used
// Our diagnostic analysis will help identify any port mismatches
const PORT = parseInt(process.env.PORT) || 8080;

// Print detailed port information
console.log('=== PORT CONFIGURATION ===');
console.log(`PORT environment variable: ${process.env.PORT}`);
console.log(`PORT after parsing: ${PORT}`);
console.log(`Default port if none provided: 8080`);
console.log('Active network interfaces:');

// Try to display network interfaces if available
try {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  Object.keys(networkInterfaces).forEach((interfaceName) => {
    console.log(`  ${interfaceName}:`);
    networkInterfaces[interfaceName].forEach((iface) => {
      console.log(`    ${iface.family} - ${iface.address}`);
    });
  });
} catch (error) {
  console.error('Error getting network interfaces:', error.message);
}
console.log('=========================');

// Connect to MongoDB with multiple retry attempts
const connectDB = require('./config/db');

// Function to attempt MongoDB connection with retries
const connectWithRetry = (attemptNumber = 1, maxAttempts = 3) => {
  console.log(`MongoDB connection attempt ${attemptNumber} of ${maxAttempts}`);
  
  connectDB()
    .then(() => {
      console.log('MongoDB Connected successfully');
      // Store connection success flag globally
      global.mongoConnected = true;
    })
    .catch(err => {
      console.error(`MongoDB connection error (attempt ${attemptNumber}):`, err.message);
      
      if (attemptNumber < maxAttempts) {
        const retryDelay = Math.min(1000 * Math.pow(2, attemptNumber), 10000); // Exponential backoff
        console.log(`Retrying in ${retryDelay}ms...`);
        
        setTimeout(() => {
          connectWithRetry(attemptNumber + 1, maxAttempts);
        }, retryDelay);
      } else {
        console.warn('Max connection attempts reached. App will continue without MongoDB.');
        // Set global flags indicating MongoDB is not available
        global.mongoConnected = false;
        global.usingMemoryFallback = true;
        console.log('IMPORTANT: Switched to memory fallback mode due to MongoDB connection failure');
      }
    });
};

// Start the connection process
try {
  // Check if memory fallback is explicitly enabled
  if (process.env.USE_MEMORY_FALLBACK === 'true') {
    console.log('Memory fallback mode explicitly enabled via USE_MEMORY_FALLBACK=true');
    global.mongoConnected = false;
    global.usingMemoryFallback = true;
  } else {
    connectWithRetry();
  }
} catch (error) {
  console.error('Failed to initialize MongoDB connection process:', error);
  console.error('Will continue without database connection');
  // Ensure fallback mode is enabled in case of error
  global.mongoConnected = false;
  global.usingMemoryFallback = true;
}

// Ensure upload and temp directories exist
try {
  if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
    console.log('Created uploads directory');
  }
  if (!fs.existsSync('./temp')) {
    fs.mkdirSync('./temp');
    console.log('Created temp directory');
  }
} catch (error) {
  console.error('Error creating directories:', error);
}

// Middleware
// Use appropriate logging format based on environment
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Create a simple console route for debugging (only in dev/test environments)
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug/cors', (req, res) => {
    const debugInfo = {
      environment: process.env.NODE_ENV,
      corsSettings: {
        allowAllCors: process.env.CORS_ALLOW_ALL === 'true',
        methods: corsOptions.methods,
        allowedHeaders: corsOptions.allowedHeaders,
        exposedHeaders: corsOptions.exposedHeaders,
        preflightContinue: corsOptions.preflightContinue,
        maxAge: corsOptions.maxAge
      },
      request: {
        origin: req.headers.origin,
        host: req.headers.host,
        referer: req.headers.referer
      }
    };
    
    res.json(debugInfo);
  });
}

// Configure Helmet with proper security headers - more permissive for Railway
const helmetConfig = {
  // Disable CSP for troubleshooting Railway deployment
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false
};

app.use(helmet(helmetConfig));

// Configure CORS - using a function for more flexibility
const corsOptions = {
  // Dynamic origin validation
  origin: function (origin, callback) {
    // Check if CORS_ALLOW_ALL env var is set - useful for development/testing
    const allowAllCors = process.env.CORS_ALLOW_ALL === 'true';
    
    if (allowAllCors) {
      console.log(`CORS_ALLOW_ALL is enabled - allowing request from origin: ${origin || 'no origin'}`);
      return callback(null, true);
    }
    
    // List of allowed origins
    const allowedOrigins = [
      'https://pdf-spark.vercel.app', 
      'https://pdfspark.vercel.app',
      'http://localhost:5173',
      'http://localhost:5174',
      'https://pdfspark-frontend.vercel.app',
      // Add more domains as needed for your production environment
      'https://www.pdfspark.com',
      'https://pdfspark.com',
      'https://app.pdfspark.com',
      'https://stage.pdfspark.com',
      // QuickSparks domains - all variations
      'https://www.quicksparks.dev',
      'https://quicksparks.dev',
      'http://www.quicksparks.dev',
      'http://quicksparks.dev',
      // Any other business domains should be added here
      'https://quickspark.ai',
      'https://www.quickspark.ai',
      'https://pdfspark.quickspark.ai',
      'https://pdfspark.co',
      'https://www.pdfspark.co'
    ];
    
    // Allow requests with no origin (like mobile apps, curl requests, etc)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if the origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // For development purposes, log the rejected origin
      console.log(`CORS blocked request from origin: ${origin}`);
      
      // In production, we'll be more strict, but for now allow all origins
      // This ensures maximum compatibility during development
      if (process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        try {
          // In production, check if it's a subdomain or known domain
          // Get the domain from the origin
          const originDomain = new URL(origin).hostname;
          
          // Log for debugging
          console.log(`Checking if domain ${originDomain} is allowed`);
          
          // Create an allow list of base domains and check if the origin's domain ends with any of them
          const allowedBaseDomains = [
            'pdfspark.com',
            'pdfspark.vercel.app',
            'quicksparks.dev',
            'pdf-spark.vercel.app',
            'localhost'
          ];
          
          const isAllowedDomain = allowedBaseDomains.some(domain => 
            originDomain === domain || originDomain.endsWith(`.${domain}`)
          );
          
          if (isAllowedDomain) {
            console.log(`Domain ${originDomain} is allowed as subdomain or exact match`);
            callback(null, true);
          } else {
            // Fallback to the original algorithm as a safety net
            const isSubdomainOfAllowed = allowedOrigins.some(allowed => {
              const allowedDomain = allowed.replace(/^https?:\/\//, '').split('/')[0];
              const matches = origin.includes(allowedDomain);
              if (matches) {
                console.log(`Domain ${originDomain} matched with ${allowedDomain}`);
              }
              return matches;
            });
            
            if (isSubdomainOfAllowed) {
              callback(null, true);
            } else {
              console.log(`Domain ${originDomain} is blocked by CORS policy`);
              callback(new Error('Not allowed by CORS'));
            }
          }
        } catch (error) {
          console.error(`Error checking CORS domain: ${error.message}`);
          // In case of URL parsing error, fall back to the original logic
          const isAllowedOrigin = allowedOrigins.includes(origin);
          if (isAllowedOrigin) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS - URL parsing failed'));
          }
        }
      }
    }
  },
  credentials: false, // Setting to false to avoid CORS issues with credentials
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Session-ID', 
    'x-session-id',
    'X-API-Key',
    'Origin', 
    'X-Requested-With', 
    'Accept'
  ],
  exposedHeaders: [
    'X-Session-ID', 
    'x-session-id',
    'X-Session-Id',
    'Access-Control-Allow-Origin'
  ],
  maxAge: 86400, // Cache preflight requests for 24 hours
  preflightContinue: false
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Service health check middleware
const { serviceHealthCheck } = require('./middlewares/serviceHealthCheck');
app.use(serviceHealthCheck);

// Rate limiting middleware
const rateLimit = require('express-rate-limit');

// Create a rate limiter for general API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { success: false, error: 'Too many requests, please try again later' }
});

// More strict rate limiting for authentication routes
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 auth requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts, please try again later' }
});

// More strict rate limiting for file uploads
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Limit each IP to 50 file uploads per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many file uploads, please try again later' }
});

// Apply rate limiting to specific routes
app.use('/api/files/upload', uploadLimiter);
app.use('/api/convert', apiLimiter);
app.use('/api/operations', apiLimiter);

// Static files for uploads preview
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Define routes
app.use('/api/cloudinary', require('./routes/cloudinaryRoutes'));
app.use('/api/files', require('./routes/fileRoutes'));

// Make sure conversion routes are properly mounted
// The routes are already defined with their own prefixes, so we mount them at /api
app.use('/api', require('./routes/conversionRoutes'));

// Create robust diagnostic endpoints for Railway troubleshooting

// Add enhanced debug endpoints for file upload troubleshooting
// These endpoints are always enabled since we need diagnostics in production

// Simple test endpoint that just logs basic info
app.post('/test-upload', (req, res) => {
  console.log('==== TEST UPLOAD ENDPOINT ====');
  console.log('Headers:', req.headers);
  console.log('Request method:', req.method);
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Content-Length:', req.headers['content-length']);
  
  // Create a basic multer configuration
  const multer = require('multer');
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB max for testing
  }).single('file');
  
  // Use a direct callback approach for better error tracking
  upload(req, res, function(err) {
    if (err) {
      console.error('Test upload multer error:', err);
      return res.status(400).json({
        success: false, 
        error: err.message,
        type: err.name,
        code: err.code
      });
    }
    
    // Check if file exists
    if (!req.file) {
      console.error('No file detected in test upload');
      console.log('Available fields in body:', Object.keys(req.body));
      
      return res.status(400).json({
        success: false,
        message: 'No file received',
        availableFields: Object.keys(req.body)
      });
    }
    
    // File exists, log details
    console.log('Test upload file received:', {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      encoding: req.file.encoding,
      mimetype: req.file.mimetype,
      size: req.file.size,
      buffer: `Buffer (${req.file.buffer.length} bytes)`
    });
    
    // Success response
    res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        name: req.file.originalname,
        type: req.file.mimetype,
        size: req.file.size,
        encoding: req.file.encoding
      }
    });
  });
});

// Detailed diagnostic endpoint with filesystem test
app.post('/api/diagnostic/upload', (req, res) => {
  console.log('==== DIAGNOSTIC UPLOAD ENDPOINT ====');
  console.log('Request headers:', req.headers);
  
  // Step 1: Test directories
  const fs = require('fs-extra');
  const os = require('os');
  const path = require('path');
  const { v4: uuidv4 } = require('uuid');
  
  // Check system resources
  console.log('System diagnostics:');
  console.log('- Memory:', process.memoryUsage());
  console.log('- CPU load:', os.loadavg());
  console.log('- Free memory:', os.freemem());
  console.log('- Total memory:', os.totalmem());
  
  // Test directory permissions
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const tempDir = process.env.TEMP_DIR || './temp';
  
  // Check and create directories
  const directoryChecks = {
    uploads: { exists: false, writable: false, testFile: null },
    temp: { exists: false, writable: false, testFile: null }
  };
  
  try {
    // Check uploads directory
    directoryChecks.uploads.exists = fs.existsSync(uploadDir);
    if (!directoryChecks.uploads.exists) {
      fs.mkdirSync(uploadDir, { recursive: true });
      directoryChecks.uploads.exists = true;
    }
    
    // Check temp directory
    directoryChecks.temp.exists = fs.existsSync(tempDir);
    if (!directoryChecks.temp.exists) {
      fs.mkdirSync(tempDir, { recursive: true });
      directoryChecks.temp.exists = true;
    }
    
    // Test write access to uploads directory
    const testUploadFile = path.join(uploadDir, `test-${Date.now()}.txt`);
    fs.writeFileSync(testUploadFile, 'test');
    directoryChecks.uploads.writable = true;
    directoryChecks.uploads.testFile = testUploadFile;
    
    // Test write access to temp directory
    const testTempFile = path.join(tempDir, `test-${Date.now()}.txt`);
    fs.writeFileSync(testTempFile, 'test');
    directoryChecks.temp.writable = true;
    directoryChecks.temp.testFile = testTempFile;
    
    console.log('Directory checks passed:', directoryChecks);
  } catch (err) {
    console.error('Directory check error:', err);
    directoryChecks.error = err.message;
  }
  
  // Step 2: Configure multer for diagnostic upload
  const multer = require('multer');
  
  // Use memory storage for quick diagnostic
  const storage = multer.memoryStorage();
  
  // Create diagnostic file filter
  const fileFilter = (req, file, cb) => {
    console.log('Diagnostic fileFilter received file:', file);
    // Accept all files for diagnostic
    cb(null, true);
  };
  
  // Create a special multer instance for diagnostics
  const diagnosticUpload = multer({
    storage: storage,
    limits: { 
      fileSize: 50 * 1024 * 1024, // 50MB limit for testing
      files: 1
    },
    fileFilter: fileFilter
  }).single('file');
  
  // Process the upload with enhanced error handling
  diagnosticUpload(req, res, function(err) {
    // Check for multer errors
    if (err) {
      console.error('Diagnostic upload multer error:', err);
      return res.status(400).json({
        success: false,
        directory_checks: directoryChecks,
        upload_error: {
          message: err.message,
          code: err.code,
          type: err.name
        }
      });
    }
    
    // Check if we received a file
    if (!req.file) {
      console.error('No file in diagnostic upload request');
      return res.status(400).json({
        success: false,
        directory_checks: directoryChecks,
        error: 'No file received',
        request_body: Object.keys(req.body)
      });
    }
    
    // Analyze the file
    console.log('Diagnostic file received:', {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      encoding: req.file.encoding,
      mimetype: req.file.mimetype,
      size: req.file.size,
      bufferSize: req.file.buffer ? req.file.buffer.length : 0
    });
    
    // Try to create a real file on disk for complete test
    let diskFileTest = { success: false, path: null };
    try {
      // Create a unique filename
      const diagFileName = `diag-${Date.now()}-${uuidv4()}.bin`;
      const diagFilePath = path.join(uploadDir, diagFileName);
      
      // Write the file to disk
      fs.writeFileSync(diagFilePath, req.file.buffer);
      
      // Check if the file exists and is the correct size
      const fileStats = fs.statSync(diagFilePath);
      
      diskFileTest = {
        success: true,
        path: diagFilePath,
        exists: fs.existsSync(diagFilePath),
        size: fileStats.size,
        size_match: fileStats.size === req.file.buffer.length
      };
      
      console.log('Diagnostic disk file creation successful:', diskFileTest);
      
      // Clean up by removing the file
      fs.unlinkSync(diagFilePath);
      diskFileTest.cleanup = 'success';
    } catch (fileErr) {
      console.error('Diagnostic disk file error:', fileErr);
      diskFileTest.error = fileErr.message;
    }
    
    // Return comprehensive results
    res.status(200).json({
      success: true,
      message: 'Diagnostic upload test complete',
      directory_checks: directoryChecks,
      disk_file_test: diskFileTest,
      file: {
        name: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        encoding: req.file.encoding
      },
      server_info: {
        platform: os.platform(),
        arch: os.arch(),
        node_version: process.version,
        uptime: Math.floor(process.uptime()) + ' seconds',
        memory_usage: process.memoryUsage(),
        cpu_load: os.loadavg()
      }
    });
    
    // Clean up test files
    try {
      if (directoryChecks.uploads.testFile) {
        fs.unlinkSync(directoryChecks.uploads.testFile);
      }
      if (directoryChecks.temp.testFile) {
        fs.unlinkSync(directoryChecks.temp.testFile);
      }
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr);
    }
  });
});

console.log('Diagnostic upload endpoints enabled at:');
console.log('- /test-upload - Basic upload test');
console.log('- /api/diagnostic/upload - Comprehensive diagnostic test');

// Main health check endpoint for Railway
app.get('/health', (req, res) => {
  // Always return OK (200) status to prevent Railway from restarting service
  res.status(200).json({
    status: 'ok',
    message: 'Server is running'
  });
});

// File upload statistics endpoint
app.get('/api/system/file-stats', (req, res) => {
  const fileCleanup = require('./utils/fileCleanup');
  
  try {
    const stats = fileCleanup.getStorageStats();
    
    res.status(200).json({
      success: true,
      stats: stats
    });
  } catch (error) {
    console.error('Error getting file statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve file statistics',
      error: error.message
    });
  }
});

// Detailed system health endpoint
app.get('/api/system/health', (req, res) => {
  // Try to get MongoDB connection status safely
  let mongoStatus = 0;
  let mongoStatusText = 'unknown';
  let mongoHost = 'unknown';
  
  try {
    mongoStatus = mongoose.connection.readyState;
    mongoStatusText = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    }[mongoStatus] || 'unknown';
    
    // Extract hostname from connection string
    if (mongoose.connection.host) {
      mongoHost = mongoose.connection.host;
    } else if (process.env.MONGODB_URI) {
      mongoHost = 'from_env_var';
    }
  } catch (error) {
    console.error('Error getting MongoDB status:', error.message);
    mongoStatusText = 'error';
  }
  
  // Get server info
  let serverInfo = {};
  try {
    if (server && typeof server.address === 'function') {
      const addressInfo = server.address();
      serverInfo = addressInfo || {};
    }
  } catch (error) {
    serverInfo = { error: error.message };
  }
  
  // Return detailed health information
  res.status(200).json({
    status: 'ok',
    message: 'Server is running',
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || 'unknown',
    railway: {
      service: process.env.RAILWAY_SERVICE_NAME || 'unknown',
      environment: process.env.RAILWAY_ENVIRONMENT_NAME || 'unknown',
      publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN || 'not set',
      serviceUrl: process.env.RAILWAY_SERVICE_PDFSPARK_URL || 'not set'
    },
    server: {
      port: PORT,
      addressInfo: serverInfo,
      uptime: Math.round(process.uptime()) + 's'
    },
    mongodb: {
      status: mongoStatusText,
      connectionSuccess: !!global.mongoConnected,
      readyState: mongoStatus,
      host: mongoHost
    },
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    },
    platform: {
      node: process.version,
      platform: process.platform,
      arch: process.arch
    }
  });
});

// File system cleanup endpoint
app.post('/api/system/cleanup', async (req, res) => {
  try {
    // Check for admin API key or IP restriction
    const apiKey = req.headers['x-api-key'] || req.query.key;
    const adminApiKey = process.env.ADMIN_API_KEY;
    
    if (adminApiKey && apiKey !== adminApiKey) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized access - invalid API key'
      });
    }
    
    // Run the cleanup operation
    console.log('Manual file cleanup triggered via API');
    const results = runCleanup();
    
    res.status(200).json({
      status: 'success',
      message: 'File cleanup executed successfully',
      results
    });
  } catch (error) {
    console.error('Error in cleanup endpoint:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to execute cleanup',
      error: error.message
    });
  }
});

// Network diagnostic endpoint
app.get('/api/system/network', async (req, res) => {
  const networkInfo = {};
  
  // Get network interfaces
  try {
    const os = require('os');
    networkInfo.interfaces = os.networkInterfaces();
  } catch (error) {
    networkInfo.interfaces = { error: error.message };
  }
  
  // Get DNS servers if possible
  try {
    const dns = require('dns');
    networkInfo.dnsServers = dns.getServers();
  } catch (error) {
    networkInfo.dnsServers = { error: error.message };
  }
  
  // Try to resolve some domains
  networkInfo.resolution = {};
  const domainTests = ['google.com', 'railway.app', 'mongodb.com'];
  
  for (const domain of domainTests) {
    try {
      const dns = require('dns');
      const addresses = await new Promise((resolve, reject) => {
        dns.resolve4(domain, (err, addresses) => {
          if (err) reject(err);
          else resolve(addresses);
        });
      });
      networkInfo.resolution[domain] = addresses;
    } catch (error) {
      networkInfo.resolution[domain] = { error: error.message };
    }
  }
  
  // Check if we can make outbound connections
  networkInfo.connectivity = {};
  const sites = ['https://google.com', 'https://railway.app'];
  
  for (const site of sites) {
    try {
      const https = require('https');
      const connected = await new Promise((resolve, reject) => {
        const req = https.get(site, { timeout: 5000 }, (res) => {
          resolve(res.statusCode);
        });
        req.on('error', (err) => {
          reject(err);
        });
      });
      networkInfo.connectivity[site] = { status: connected };
    } catch (error) {
      networkInfo.connectivity[site] = { error: error.message };
    }
  }
  
  res.status(200).json(networkInfo);
});

// Environment variables diagnostic endpoint (safe version)
app.get('/api/system/env', (req, res) => {
  const safeEnv = {};
  
  // Filter out sensitive environment variables
  Object.keys(process.env).forEach(key => {
    if (!key.includes('SECRET') && 
        !key.includes('PASSWORD') && 
        !key.includes('KEY') && 
        !key.includes('TOKEN')) {
      safeEnv[key] = process.env[key];
    } else {
      safeEnv[key] = '[REDACTED]';
    }
  });
  
  res.status(200).json(safeEnv);
});

// File system check endpoint
app.get('/api/system/fs', (req, res) => {
  const fsInfo = {};
  
  // Check if critical directories exist and are writable
  const criticalDirs = ['./uploads', './temp'];
  fsInfo.directories = {};
  
  for (const dir of criticalDirs) {
    try {
      const fs = require('fs');
      const stats = {
        exists: fs.existsSync(dir)
      };
      
      if (stats.exists) {
        try {
          fs.accessSync(dir, fs.constants.W_OK);
          stats.writable = true;
        } catch (e) {
          stats.writable = false;
          stats.writeError = e.message;
        }
        
        try {
          const testFilePath = `${dir}/test-${Date.now()}.txt`;
          fs.writeFileSync(testFilePath, 'Test write');
          fs.unlinkSync(testFilePath);
          stats.writeTest = 'passed';
        } catch (e) {
          stats.writeTest = 'failed';
          stats.writeTestError = e.message;
        }
      }
      
      fsInfo.directories[dir] = stats;
    } catch (error) {
      fsInfo.directories[dir] = { error: error.message };
    }
  }
  
  res.status(200).json(fsInfo);
});

// Root endpoint with comprehensive diagnostic information
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'PDFSpark API',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString(),
    server: {
      port: PORT,
      env: process.env.NODE_ENV,
      nodeVersion: process.version
    },
    railway: {
      service: process.env.RAILWAY_SERVICE_NAME || 'Not set',
      publicUrl: process.env.RAILWAY_PUBLIC_DOMAIN || 'Not set'
    },
    mongo: {
      connected: !!global.mongoConnected,
      readyState: mongoose.connection ? mongoose.connection.readyState : 'not_initialized'
    },
    endpoints: {
      health: '/health',
      detailed: '/api/system/health',
      network: '/api/system/network',
      environment: '/api/system/env',
      filesystem: '/api/system/fs'
    }
  });
});

// Use custom error handler
app.use(errorHandler);

// Start the server with multi-attempt binding
// First try Railway specific binding approach
let server;
try {
  console.log(`Attempting to start server on 0.0.0.0:${PORT}...`);
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server successfully running on 0.0.0.0:${PORT}`);
    console.log(`Railway service URL: ${process.env.RAILWAY_SERVICE_PDFSPARK_URL || 'Not available'}`);
    console.log(`Railway public domain: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'Not available'}`);
    
    // Schedule file cleanup every 2 hours
    console.log('Setting up scheduled file cleanup task...');
    // Run cleanup immediately on startup
    runCleanup();
    
    // Then schedule to run every 2 hours
    const CLEANUP_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
    setInterval(() => {
      console.log('Running scheduled file cleanup task...');
      runCleanup();
    }, CLEANUP_INTERVAL);
    console.log(`File cleanup scheduled to run every ${CLEANUP_INTERVAL/3600000} hours`);
    
    // Try to check if server is actually listening
    try {
      const addressInfo = server.address();
      console.log(`Server address info:`, addressInfo);
      if (addressInfo) {
        console.log(`Server confirmed listening on port ${addressInfo.port}`);
      } else {
        console.warn(`⚠️ Server address info not available`);
      }
    } catch (error) {
      console.error(`Error getting server address:`, error);
    }
  });
} catch (error) {
  console.error(`❌ Failed to start server on 0.0.0.0:${PORT}:`, error);
  
  // Second attempt - try binding without specifying host
  try {
    console.log(`Attempting fallback: starting server only on port ${PORT}...`);
    server = app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT} (fallback mode)`);
    });
  } catch (secondError) {
    console.error(`❌ Failed second attempt to start server:`, secondError);
    
    // Third attempt - try a completely different port
    const FALLBACK_PORT = 3000;
    if (PORT !== FALLBACK_PORT) {
      try {
        console.log(`Attempting emergency fallback on port ${FALLBACK_PORT}...`);
        server = app.listen(FALLBACK_PORT, '0.0.0.0', () => {
          console.log(`✅ SERVER RUNNING IN EMERGENCY MODE ON PORT ${FALLBACK_PORT}`);
          console.log(`⚠️ WARNING: Using fallback port ${FALLBACK_PORT} instead of configured ${PORT}`);
        });
      } catch (thirdError) {
        console.error(`❌ All server start attempts failed. Final error:`, thirdError);
        console.error('Application cannot start due to port binding failures');
      }
    }
  }
}

// Graceful shutdown handling
const gracefulShutdown = () => {
  console.log('Starting graceful shutdown...');
  
  // Check if server exists and is listening before trying to close it
  if (server && typeof server.close === 'function') {
    server.close(() => {
      console.log('HTTP server closed');
      closeDbAndExit(0);
    });
    
    // Force close if graceful shutdown takes too long
    setTimeout(() => {
      console.error('Forcing server shutdown after timeout');
      closeDbAndExit(1);
    }, 10000); // 10 seconds
  } else {
    console.log('No active server to close or server already closed');
    closeDbAndExit(0);
  }
};

// Helper function to close DB and exit
const closeDbAndExit = (exitCode) => {
  // Check MongoDB connection state before trying to close
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      mongoose.connection.close(false)
        .then(() => {
          console.log('MongoDB connection closed successfully');
          process.exit(exitCode);
        })
        .catch(err => {
          console.error('Error closing MongoDB connection:', err);
          // Still exit even if DB close fails
          process.exit(exitCode || 1);
        });
    } catch (error) {
      console.error('Exception during MongoDB connection close:', error);
      process.exit(exitCode || 1);
    }
  } else {
    console.log('No active MongoDB connection to close');
    process.exit(exitCode);
  }
};

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Don't shutdown for unhandled rejections to improve resilience
});

// Listen for shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);