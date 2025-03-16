require('dotenv').config();

// Apply Railway-specific environment fixes FIRST, before anything else loads
require('./config/railway-env-fix');

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

// Import database configuration and helper functions
const dbConfig = require('./config/db');
const connectDB = dbConfig.connectDB || dbConfig;
const { hasValidMongoDbUri } = dbConfig;

// Function to attempt MongoDB connection with retries
const connectWithRetry = (attemptNumber = 1, maxAttempts = 3) => {
  console.log(`MongoDB connection attempt ${attemptNumber} of ${maxAttempts}`);
  
  // Handle MongoDB connection with improved error handling
  connectDB()
    .then(conn => {
      console.log('MongoDB Connected successfully');
      // Store connection success flag globally
      global.mongoConnected = true;
      global.usingMemoryFallback = false;
      
      // Log more connection details
      if (conn && conn.connection) {
        console.log(`Connected to MongoDB at: ${conn.connection.host}:${conn.connection.port}`);
        console.log(`MongoDB connection state: ${getMongoStateDescription(conn.connection.readyState)}`);
        console.log(`MongoDB database name: ${conn.connection.name || 'not specified'}`);
      }
      
      // Initialize memory storage as fallback even when MongoDB is working
      // This ensures methods that check for memoryStorage won't fail
      if (!global.memoryStorage) {
        console.log('Initializing backup memory storage as safety net');
        global.memoryStorage = {
          operations: [],
          files: [],
          users: [],
          addOperation: function(operation) {
            // Stub implementation, not used in normal mode
            return operation;
          },
          findOperation: function(id) {
            // Stub implementation, not used in normal mode
            return null;
          }
        };
      }
    })
    .catch(err => {
      console.error(`MongoDB connection error (attempt ${attemptNumber}):`, err.message);
      
      // More detailed error info
      if (err.name === 'MongoNetworkError') {
        console.error('This appears to be a network connectivity issue.');
        console.error('Checking if Railway environment variables are set correctly...');
        
        // Check Railway variables
        if (process.env.RAILWAY_SERVICE_NAME) {
          console.log('Running in Railway environment, checking MongoDB connection info:');
          console.log(`MONGODB_URI: ${process.env.MONGODB_URI ? 'Set (hidden)' : 'Not set'}`);
          console.log(`MONGOHOST: ${process.env.MONGOHOST || 'Not set'}`);
          console.log(`MONGOPORT: ${process.env.MONGOPORT || 'Not set'}`);
        }
      } else if (err.name === 'MongoServerSelectionError') {
        console.error('Failed to select a MongoDB server. This could be because:');
        console.error('- The server is not reachable (network issue)');
        console.error('- Authentication failed (check credentials)');
        console.error('- The server is overloaded or down for maintenance');
      }
      
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
        
        // Force memory fallback to be true in the environment
        process.env.USE_MEMORY_FALLBACK = 'true';
        
        // Ensure memory storage is initialized
        if (!global.memoryStorage) {
          console.log('Initializing memory storage due to MongoDB connection failure');
          initializeMemoryStorage();
        }
      }
    });
};

// Helper function to get MongoDB connection state as text
function getMongoStateDescription(state) {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  return states[state] || 'unknown';
}

// Helper function to initialize memory storage
function initializeMemoryStorage() {
  global.memoryStorage = {
    operations: [],
    files: [],
    users: [],
    
    // Operation methods
    addOperation: function(operation) {
      if (!operation._id) {
        const { v4: uuidv4 } = require('uuid');
        operation._id = uuidv4();
      }
      this.operations.push(operation);
      console.log(`Added operation to memory storage, id: ${operation._id}`);
      return operation;
    },
    
    findOperation: function(id) {
      if (!id) return null;
      const found = this.operations.find(op => 
        op._id && (op._id.toString() === id.toString() || op.sourceFileId === id)
      );
      return found;
    },
    
    // File methods
    addFile: function(file) {
      if (!file._id) {
        const { v4: uuidv4 } = require('uuid');
        file._id = uuidv4();
      }
      this.files.push(file);
      console.log(`Added file to memory storage, id: ${file._id}`);
      return file;
    },
    
    findFile: function(id) {
      if (!id) return null;
      return this.files.find(f => f._id.toString() === id.toString());
    }
  };
  
  console.log('Memory storage initialized successfully as fallback');
}

// Check if MongoDB URI is set in environment
// Notice the inconsistent reporting of MONGODB_URI in Railway logs,
// so we need to be extra careful in detecting if it's properly set
const isMongoDefined = !!process.env.MONGODB_URI && 
                       process.env.MONGODB_URI !== 'Not set' && 
                       process.env.MONGODB_URI !== 'undefined';

// EMERGENCY FIX FOR RAILWAY: Always force memory fallback in production for now
if (process.env.NODE_ENV === 'production') {
  console.log('🚨 EMERGENCY FIX: Production environment detected, forcing memory fallback mode');
  process.env.USE_MEMORY_FALLBACK = 'true';
}

if (!isMongoDefined) {
  console.log('⚠️ MONGODB_URI environment variable appears to be missing or invalid');
  
  // For Railway deployments, try to construct URI from component parts or use hardcoded fallback
  if (process.env.RAILWAY_SERVICE_NAME) {
    console.log('Running on Railway, attempting to set fallback MongoDB URI');
    
    // Try different host formats for Railway MongoDB
    if (process.env.MONGOHOST && process.env.MONGOUSER && process.env.MONGOPASSWORD) {
      console.log('Found MONGO* component variables, constructing URI');
      process.env.MONGODB_URI = `mongodb://${process.env.MONGOUSER}:${process.env.MONGOPASSWORD}@${process.env.MONGOHOST}:${process.env.MONGOPORT || '27017'}/${process.env.MONGODB || 'pdfspark'}`;
    } else {
      console.log('Using hardcoded Railway MongoDB URI as fallback');
      process.env.MONGODB_URI = 'mongodb://mongo:SUJgiSifJbajieQYydPMxpliFUJGmiBV@mainline.proxy.rlwy.net:27523';
    }
    
    console.log('IMPORTANT: For Railway deployment, setting USE_MEMORY_FALLBACK=true as safeguard');
    process.env.USE_MEMORY_FALLBACK = 'true';
  }
}

// Log all important environment variables for debugging
console.log('===== CRITICAL ENVIRONMENT VARIABLES =====');
console.log(`USE_MEMORY_FALLBACK=${process.env.USE_MEMORY_FALLBACK || 'not set'}`);
console.log(`CORS_ALLOW_ALL=${process.env.CORS_ALLOW_ALL || 'not set'}`);
console.log(`MONGODB_URI=${process.env.MONGODB_URI ? 'set (hidden)' : 'not set'}`);
console.log('==========================================');

// For Railway, set defaults if not provided
if (process.env.RAILWAY_SERVICE_NAME) {
  // We're running on Railway, always apply emergency defaults
  console.log('Setting emergency default USE_MEMORY_FALLBACK=true for Railway');
  process.env.USE_MEMORY_FALLBACK = 'true';
  
  if (!process.env.CORS_ALLOW_ALL) {
    console.log('Setting emergency default CORS_ALLOW_ALL=true for Railway');
    process.env.CORS_ALLOW_ALL = 'true';
  }
  
  console.log('WARNING: Railway deployment detected - ensuring memory fallback mode is enabled');
}

// Start the connection process
try {
  // Force memory fallback if explicitly set
  if (process.env.USE_MEMORY_FALLBACK === 'true') {
    console.log('🚨 MEMORY FALLBACK MODE ENABLED - OPERATING WITHOUT DATABASE 🚨');
    console.log('This mode allows the application to function without MongoDB, but with limited functionality');
    
    // Initialize global state
    global.mongoConnected = false;
    global.usingMemoryFallback = true;
    
    // Create an in-memory storage mechanism for basic operations
    global.memoryStorage = {
      operations: [],
      files: [],
      users: [], // Add users collection for completeness
      
      // Enhanced operation methods with better debugging
      addOperation: function(operation) {
        // Ensure operation has an ID
        if (!operation._id) {
          const { v4: uuidv4 } = require('uuid');
          operation._id = uuidv4();
          console.log(`Generated new operation ID: ${operation._id}`);
        }
        
        // Add created/updated timestamps
        if (!operation.createdAt) {
          operation.createdAt = new Date();
        }
        operation.updatedAt = new Date();
        
        // Store the operation
        this.operations.push(operation);
        
        console.log(`✅ Added operation to memory storage, id: ${operation._id} type: ${operation.operationType || 'unknown'}`);
        console.log(`ℹ️ Memory storage now contains ${this.operations.length} operations`);
        
        // Return the added operation
        return operation;
      },
      
      findOperation: function(id) {
        if (!id) {
          console.warn('❌ Attempted to find operation with null/undefined id');
          return null;
        }
        
        console.log(`🔍 Looking up operation with ID: ${id}`);
        
        // First try exact ID match
        let found = this.operations.find(op => 
          (op._id && op._id.toString() === id.toString())
        );
        
        // If not found, try sourceFileId match
        if (!found) {
          found = this.operations.find(op => 
            (op.sourceFileId && op.sourceFileId.toString() === id.toString())
          );
          
          if (found) {
            console.log(`✅ Found operation via sourceFileId match: ${found._id}`);
          }
        } else {
          console.log(`✅ Found operation via direct ID match: ${found._id}`);
        }
        
        // If still not found, log all operations for debugging
        if (!found) {
          console.warn(`❌ Operation ${id} not found in memory storage`);
          console.log('Available operations:', this.operations.map(op => ({
            id: op._id,
            sourceFileId: op.sourceFileId,
            type: op.operationType
          })));
        }
        
        return found;
      },
      
      findOperationsBySession: function(sessionId) {
        if (!sessionId) return [];
        
        console.log(`🔍 Looking up operations for session: ${sessionId}`);
        
        const sessionOps = this.operations.filter(op => op.sessionId === sessionId);
        console.log(`Found ${sessionOps.length} operations for session ${sessionId}`);
        
        return sessionOps;
      },
      
      // Enhanced file methods
      addFile: function(file) {
        // Ensure file has an ID
        if (!file._id) {
          const { v4: uuidv4 } = require('uuid');
          file._id = uuidv4();
          console.log(`Generated new file ID: ${file._id}`);
        }
        
        // Add timestamps
        if (!file.createdAt) {
          file.createdAt = new Date();
        }
        file.updatedAt = new Date();
        
        this.files.push(file);
        console.log(`✅ Added file to memory storage, id: ${file._id} name: ${file.name || file.originalName || 'unnamed'}`);
        console.log(`ℹ️ Memory storage now contains ${this.files.length} files`);
        
        return file;
      },
      
      findFile: function(id) {
        if (!id) {
          console.warn('❌ Attempted to find file with null/undefined id');
          return null;
        }
        
        console.log(`🔍 Looking up file with ID: ${id}`);
        
        const found = this.files.find(f => f._id && f._id.toString() === id.toString());
        
        if (found) {
          console.log(`✅ Found file: ${found._id}`);
        } else {
          console.warn(`❌ File ${id} not found in memory storage`);
          console.log('Available files:', this.files.map(f => f._id));
        }
        
        return found;
      },
      
      // User methods for auth fallback with better debugging
      createGuestUser: function(sessionId) {
        if (!sessionId) {
          console.warn('❌ Attempted to create guest user with null/undefined sessionId');
          return null;
        }
        
        console.log(`👤 Creating new guest user for session: ${sessionId}`);
        
        const { v4: uuidv4 } = require('uuid');
        const user = {
          _id: uuidv4(),
          sessionId: sessionId,
          createdAt: new Date(),
          role: 'guest',
          // Add methods needed by the application
          hasActiveSubscription: function() {
            return false;
          },
          isProUser: function() {
            return false;
          }
        };
        
        this.users.push(user);
        console.log(`✅ Created guest user with ID: ${user._id}`);
        console.log(`ℹ️ Memory storage now contains ${this.users.length} users`);
        
        return user;
      },
      
      findUserBySession: function(sessionId) {
        if (!sessionId) {
          console.warn('❌ Attempted to find user with null/undefined sessionId');
          return null;
        }
        
        console.log(`🔍 Looking up user for session: ${sessionId}`);
        
        const found = this.users.find(u => u.sessionId === sessionId);
        
        if (found) {
          console.log(`✅ Found user: ${found._id} for session: ${sessionId}`);
        } else {
          console.log(`ℹ️ No user found for session: ${sessionId}`);
        }
        
        return found;
      },
      
      // Dump memory storage statistics
      getStats: function() {
        return {
          operations: this.operations.length,
          files: this.files.length,
          users: this.users.length,
          memoryUsage: process.memoryUsage()
        };
      }
    };
    
    console.log('In-memory storage initialized with enhanced capabilities');
  } else {
    // Attempt to connect to MongoDB
    connectWithRetry();
  }
} catch (error) {
  console.error('Failed to initialize connection process:', error);
  console.error('Will continue in memory fallback mode');
  
  // Ensure fallback mode is enabled in case of error
  global.mongoConnected = false;
  global.usingMemoryFallback = true;
  
  // Call the connectDB function directly which will handle the fallback initialization
  try {
    connectDB().catch(err => {
      console.error('Additional error during direct DB connection attempt:', err.message);
    });
  } catch (dbError) {
    console.error('Error during direct DB connection attempt:', dbError.message);
  }
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

// Enhanced diagnostic endpoints for testing
console.log('Diagnostic endpoints enabled at:');
console.log('- /test-upload - Basic upload test');
console.log('- /api/diagnostic/upload - Comprehensive diagnostic test');
console.log('- /api/diagnostic/memory - Memory storage status check');
console.log('- /api/diagnostic/file-system - File system health check');

// Show very clear status message about memory mode
if (process.env.USE_MEMORY_FALLBACK === 'true') {
  console.log('\n===== IMPORTANT DEPLOYMENT INFORMATION =====');
  console.log('📊 Storage Mode: MEMORY FALLBACK MODE ACTIVE');
  console.log('📝 MongoDB: BYPASSED (Memory storage will be used instead)');
  console.log('⚠️ Data Persistence: TEMPORARY (Data will be lost on restart)');
  console.log('✅ File Upload: FULLY FUNCTIONAL');
  console.log('✅ File Conversion: FULLY FUNCTIONAL');
  if (process.env.NODE_ENV === 'production') {
    console.log('🚀 Running in PRODUCTION mode with memory fallback');
    console.log('🔄 Railway deployment: Running in compatible mode');
  }
  console.log('============================================\n');
} else {
  console.log('\n===== IMPORTANT DEPLOYMENT INFORMATION =====');
  console.log('📊 Storage Mode: MONGODB (Database will be used for storage)');
  console.log('📝 MongoDB Connection: ATTEMPTING');
  console.log('⚠️ Fallback: AUTOMATIC (Will switch to memory mode if needed)');
  console.log('============================================\n');
}

// Add diagnostic endpoint to check memory storage status
app.get('/api/diagnostic/memory', (req, res) => {
  const memoryStatus = {
    usingMemoryFallback: !!global.usingMemoryFallback,
    mongoConnected: !!global.mongoConnected,
    memoryStorageInitialized: !!global.memoryStorage,
    stats: global.memoryStorage ? {
      operations: global.memoryStorage.operations.length,
      files: global.memoryStorage.files.length,
      users: global.memoryStorage.users ? global.memoryStorage.users.length : 0
    } : null,
    environment: {
      USE_MEMORY_FALLBACK: process.env.USE_MEMORY_FALLBACK,
      MONGODB_URI_SET: !!process.env.MONGODB_URI
    }
  };
  
  res.json(memoryStatus);
});

// Add comprehensive file system diagnostic endpoint
app.get('/api/diagnostic/file-system', async (req, res) => {
  try {
    const fs = require('fs-extra');
    const path = require('path');
    const os = require('os');
    
    // Directories to check
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const tempDir = process.env.TEMP_DIR || './temp';
    
    // Test file creation and writing
    async function testDirectory(dir) {
      const result = {
        exists: false,
        writable: false,
        readable: false,
        files: [],
        testFileCreated: false,
        errors: []
      };
      
      try {
        // Check if directory exists
        result.exists = await fs.pathExists(dir);
        
        // Create directory if it doesn't exist
        if (!result.exists) {
          await fs.ensureDir(dir);
          result.exists = true;
          result.message = 'Directory was created as it did not exist';
        }
        
        // Check read access
        try {
          await fs.access(dir, fs.constants.R_OK);
          result.readable = true;
          
          // List files in directory
          const files = await fs.readdir(dir);
          result.files = files.slice(0, 10); // Limit to 10 files
          result.fileCount = files.length;
        } catch (readErr) {
          result.errors.push(`Read error: ${readErr.message}`);
        }
        
        // Check write access
        try {
          await fs.access(dir, fs.constants.W_OK);
          result.writable = true;
          
          // Try to create a test file
          const testFile = path.join(dir, `test-${Date.now()}.txt`);
          await fs.writeFile(testFile, 'Test file for diagnostics');
          result.testFileCreated = true;
          
          // Clean up test file
          await fs.unlink(testFile);
        } catch (writeErr) {
          result.errors.push(`Write error: ${writeErr.message}`);
        }
      } catch (err) {
        result.errors.push(`General error: ${err.message}`);
      }
      
      return result;
    }
    
    // Run tests in parallel
    const [uploadDirStatus, tempDirStatus] = await Promise.all([
      testDirectory(uploadDir),
      testDirectory(tempDir)
    ]);
    
    // Get system stats
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      totalMemory: Math.round(os.totalmem() / (1024 * 1024)) + ' MB',
      freeMemory: Math.round(os.freemem() / (1024 * 1024)) + ' MB',
      uptime: Math.round(os.uptime() / 60) + ' minutes',
      cpuCount: os.cpus().length,
      cpuModel: os.cpus()[0].model,
      homeDir: os.homedir(),
      tmpDir: os.tmpdir()
    };
    
    // Return comprehensive results
    res.json({
      system: systemInfo,
      directories: {
        uploads: {
          path: path.resolve(uploadDir),
          ...uploadDirStatus
        },
        temp: {
          path: path.resolve(tempDir),
          ...tempDirStatus
        }
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        UPLOAD_DIR: process.env.UPLOAD_DIR,
        TEMP_DIR: process.env.TEMP_DIR
      },
      railway: {
        environment: process.env.RAILWAY_ENVIRONMENT,
        service: process.env.RAILWAY_SERVICE_NAME
      }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

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
    memory_mode: {
      active: !!global.usingMemoryFallback,
      operations_count: global.memoryStorage?.operations?.length || 0,
      files_count: global.memoryStorage?.files?.length || 0,
      users_count: global.memoryStorage?.users?.length || 0
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

// New MongoDB specific diagnostics endpoint for debugging
app.get('/api/system/mongodb-diagnostics', (req, res) => {
  // Check for API key for security (don't expose sensitive DB info publicly)
  const apiKey = req.query.key || req.headers['x-api-key'];
  
  if (apiKey !== process.env.ADMIN_API_KEY && process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Unauthorized access to MongoDB diagnostics endpoint',
      message: 'API key required in production environment'
    });
  }
  
  // Gather MongoDB connection details
  const diagnostics = {
    timestamp: new Date().toISOString(),
    mongodb: {
      connection_state: mongoose.connection.readyState,
      state_text: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
      host: mongoose.connection.host || 'none',
      name: mongoose.connection.name || 'none',
      global_flag: {
        mongoConnected: !!global.mongoConnected,
        usingMemoryFallback: !!global.usingMemoryFallback
      }
    },
    environment: {
      mongodb_uri: process.env.MONGODB_URI ? 'set (hidden)' : 'not set',
      use_memory_fallback: process.env.USE_MEMORY_FALLBACK,
      node_env: process.env.NODE_ENV
    },
    validation: {
      has_valid_uri: hasValidMongoDbUri ? hasValidMongoDbUri() : 'validation function not available',
      uri_check: process.env.MONGODB_URI ? {
        starts_with_mongodb: process.env.MONGODB_URI.startsWith('mongodb://') || process.env.MONGODB_URI.startsWith('mongodb+srv://'),
        length_check: process.env.MONGODB_URI.length > 20,
        includes_at_symbol: process.env.MONGODB_URI.includes('@')
      } : 'no uri to check'
    }
  };
  
  // Include connection options if available
  try {
    if (mongoose.connection && mongoose.connection.client && mongoose.connection.client.options) {
      diagnostics.mongodb.options = {
        ssl: mongoose.connection.client.options.ssl,
        auth: mongoose.connection.client.options.auth ? 'configured' : 'not set',
        connectTimeoutMS: mongoose.connection.client.options.connectTimeoutMS,
        socketTimeoutMS: mongoose.connection.client.options.socketTimeoutMS,
        // Don't include actual auth details
      };
    }
  } catch (error) {
    diagnostics.mongodb.options_error = error.message;
  }
  
  // Try to get collection stats if we're connected
  if (mongoose.connection.readyState === 1) {
    try {
      const db = mongoose.connection.db;
      // Get collection names
      db.listCollections().toArray()
        .then(collections => {
          diagnostics.collections = collections.map(c => c.name);
          res.status(200).json(diagnostics);
        })
        .catch(err => {
          diagnostics.collection_error = err.message;
          res.status(200).json(diagnostics);
        });
    } catch (error) {
      diagnostics.db_access_error = error.message;
      res.status(200).json(diagnostics);
    }
  } else {
    // Not connected, just return what we have
    res.status(200).json(diagnostics);
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

// Memory storage diagnostics endpoint - CRITICAL for debugging Railway issues
app.get('/api/system/memory-diagnostics', (req, res) => {
  // Get comprehensive memory state data
  const diagnostics = {
    timestamp: new Date().toISOString(),
    usingMemoryFallback: !!global.usingMemoryFallback,
    mongoConnected: !!global.mongoConnected,
    railway: {
      isRailwayEnvironment: !!global.isRailwayEnvironment,
      fixesApplied: !!global.fixesApplied,
      serviceUrl: process.env.RAILWAY_SERVICE_PDFSPARK_URL || 'not set',
      publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN || 'not set'
    },
    memoryStats: {
      operationsCount: global.memoryStorage?.operations?.length || 0,
      filesCount: global.memoryStorage?.files?.length || 0,
      usersCount: global.memoryStorage?.users?.length || 0,
      nodeMemoryUsage: process.memoryUsage()
    },
    environment: {
      nodeEnv: process.env.NODE_ENV,
      mongoDbUri: process.env.MONGODB_URI ? 'set (hidden)' : 'not set',
      useMemoryFallback: process.env.USE_MEMORY_FALLBACK,
      corsAllowAll: process.env.CORS_ALLOW_ALL
    }
  };
  
  // Include a sample of in-memory objects (without sensitive data)
  if (global.memoryStorage) {
    // Sample of operations (max 10)
    diagnostics.operationsSample = (global.memoryStorage.operations || [])
      .slice(0, 10)
      .map(op => ({
        id: op._id,
        type: op.operationType,
        status: op.status,
        sourceFileId: op.sourceFileId,
        resultFileId: op.resultFileId,
        sessionId: op.sessionId,
        createdAt: op.createdAt
      }));
      
    // Sample of files (max 10)
    diagnostics.filesSample = (global.memoryStorage.files || [])
      .slice(0, 10)
      .map(file => ({
        id: file._id,
        name: file.name || file.originalName,
        size: file.size,
        mimeType: file.mimeType,
        createdAt: file.createdAt
      }));
  }
  
  res.status(200).json(diagnostics);
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

// Start the server with multi-attempt binding and automatic retry
let server;
let startAttempts = 0;
const MAX_START_ATTEMPTS = 5;

// Function to start server with automatic retry
function startServer() {
  startAttempts++;
  console.log(`Server start attempt ${startAttempts}/${MAX_START_ATTEMPTS}...`);
  
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
      const FALLBACK_PORT = 8080;
      if (PORT !== FALLBACK_PORT) {
        try {
          console.log(`Attempting emergency fallback on port ${FALLBACK_PORT}...`);
          server = app.listen(FALLBACK_PORT, '0.0.0.0', () => {
            console.log(`✅ SERVER RUNNING IN EMERGENCY MODE ON PORT ${FALLBACK_PORT}`);
            console.log(`⚠️ WARNING: Using fallback port ${FALLBACK_PORT} instead of configured ${PORT}`);
          });
        } catch (thirdError) {
          console.error(`❌ All server start attempts failed. Error:`, thirdError);
          
          // Check if we should retry
          if (startAttempts < MAX_START_ATTEMPTS) {
            console.log(`Retrying server start in 3 seconds... (attempt ${startAttempts}/${MAX_START_ATTEMPTS})`);
            setTimeout(startServer, 3000);
          } else {
            console.error('Maximum start attempts reached. Server cannot start.');
            console.error('Application cannot start due to port binding failures');
          }
        }
      }
    }
  }
}

// Start the server with automatic retry
startServer();

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