// Backend server setup for PdfSpark
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { 
  errorHandler, 
  notFoundHandler, 
  setupUnhandledRejectionHandler 
} = require('./middlewares/errorMiddleware');
const { serviceHealthCheck, healthCheck } = require('./middlewares/serviceHealthCheck');

// Import routes
const fileRoutes = require('./routes/fileRoutes');
const conversionRoutes = require('./routes/conversionRoutes');
const cloudinaryRoutes = require('./routes/cloudinaryRoutes');

// Create Express app
const app = express();
const PORT = process.env.PORT || 5001;

// Configure CORS to allow requests from the frontend and local development
let corsOrigins = process.env.FRONTEND_URL || 'http://localhost:5174';
// If we have multiple origins, split them by comma
if (corsOrigins.includes(',')) {
  corsOrigins = corsOrigins.split(',').map(origin => origin.trim());
}

// In development, also allow requests from other local development servers
if (process.env.NODE_ENV === 'development') {
  const devOrigins = Array.isArray(corsOrigins) ? corsOrigins : [corsOrigins];
  corsOrigins = [
    ...devOrigins,
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:8080'
  ];
}

console.log('CORS allowed origins:', corsOrigins);

const corsOptions = {
  origin: corsOrigins,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID', 'Content-Length'],
  exposedHeaders: ['Content-Length'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  maxAge: 86400 // 24 hours
};

// Middleware
app.use(cors(corsOptions));
app.use(morgan('dev'));
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' } // Allow serving files across origins
}));

// This route needs raw body for Stripe signature verification
app.use('/api/webhook', express.raw({ type: 'application/json' }));

// Parse JSON and URL-encoded bodies for all other routes
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Enable pre-flight requests for all routes
app.options('*', cors(corsOptions));

// Add middleware to log request info
app.use((req, res, next) => {
  // Log basic request info for all requests
  console.log(`${req.method} ${req.url}`);
  
  // For file uploads, log more details but not the full binary
  if (req.url.includes('/files/upload') && req.method === 'POST') {
    console.log('File upload request received. Headers:', {
      ...req.headers,
      authorization: req.headers.authorization ? '[REDACTED]' : undefined
    });
  }
  
  next();
});
app.use(cookieParser());

// Add health check middleware
app.use(serviceHealthCheck);

// Health check endpoint
app.get('/api/health', healthCheck);

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests, please try again later.'
  }
});
app.use(limiter);

// Create necessary directories
const createDirectories = () => {
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const tempDir = process.env.TEMP_DIR || './temp';
  
  const fs = require('fs');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
}
createDirectories();

// Mount routes
app.use('/api/files', fileRoutes);
app.use('/api', conversionRoutes);
app.use('/api/cloudinary', cloudinaryRoutes);

// Basic API info route
app.get('/', (req, res) => {
  res.json({
    name: 'PDFSpark API',
    version: '1.0.0',
    description: 'API for the PDFSpark PDF conversion service',
    endpoints: {
      files: '/api/files',
      convert: '/api/convert',
      operations: '/api/operations',
      payments: '/api/payments',
      cloudinary: '/api/cloudinary'
    },
    status: 'Operational'
  });
});

// MongoDB connection - for production
// For local development, we'll create a simple in-memory mock
const initializeMockDb = () => {
  // Simple in-memory storage for development
  const db = {
    users: [],
    operations: [],
    payments: []
  };
  
  // Make sure all required collections exist
  ['users', 'operations', 'payments', 'files'].forEach(collection => {
    if (!db[collection]) {
      db[collection] = [];
    }
  });
  
  // Override Mongoose model methods with in-memory equivalents
  const originalModel = mongoose.model;
  mongoose.model = function mockModel(name, schema) {
    const Model = function() {};
    
    // Get the collection name (handle both singular and plural forms)
    const getCollection = (name) => {
      const collectionName = name.toLowerCase();
      const pluralName = collectionName + 's';
      
      // Check if collection exists, create it if not
      if (!db[collectionName] && !db[pluralName]) {
        db[pluralName] = [];
        return pluralName;
      }
      
      // Return existing collection
      return db[pluralName] ? pluralName : collectionName;
    };
    
    const collection = getCollection(name);
    
    // Create methods
    Model.create = async function(data) {
      const id = Math.random().toString(36).substring(2, 15);
      const newItem = { _id: id, ...data };
      db[collection].push(newItem);
      return newItem;
    };
    
    // Find methods
    Model.find = async function(query = {}) { 
      if (Object.keys(query).length === 0) {
        return db[collection]; 
      }
      
      return db[collection].filter(item => {
        for (const key in query) {
          if (item[key] !== query[key]) return false;
        }
        return true;
      });
    };
    
    Model.findById = async function(id) { 
      return db[collection].find(item => item._id === id);
    };
    
    Model.findOne = async function(query) {
      return db[collection].find(item => {
        for (const key in query) {
          if (item[key] !== query[key]) return false;
        }
        return true;
      });
    };
    
    // Update methods
    Model.findByIdAndUpdate = async function(id, update) {
      const index = db[collection].findIndex(item => item._id === id);
      if (index !== -1) {
        db[collection][index] = { ...db[collection][index], ...update };
        return db[collection][index];
      }
      return null;
    };
    
    Model.updateOne = async function(query, update) {
      const item = await Model.findOne(query);
      if (item) {
        const index = db[collection].findIndex(i => i._id === item._id);
        db[collection][index] = { ...item, ...update.$set };
        return { acknowledged: true, modifiedCount: 1 };
      }
      return { acknowledged: true, modifiedCount: 0 };
    };
    
    // Instance methods
    Model.prototype.save = async function() { 
      if (this._id) {
        // Update existing item
        const index = db[collection].findIndex(item => item._id === this._id);
        if (index !== -1) {
          db[collection][index] = { ...this };
          return this;
        }
      }
      
      // Create new item
      const id = this._id || Math.random().toString(36).substring(2, 15);
      const newItem = { _id: id, ...this };
      db[collection].push(newItem);
      return newItem;
    };
    
    // Add schema methods to prototype
    if (schema && schema.methods) {
      for (const method in schema.methods) {
        Model.prototype[method] = schema.methods[method];
      }
    }
    
    return Model;
  };
  
  console.log('🧠 Using in-memory database for development');
};

// Connect to MongoDB with our proper connection function
const connectDB = require('./config/db');

// Ensure upload and temp directories exist
const ensureDirectoryExists = (directory) => {
  if (!fs.existsSync(directory)) {
    console.log(`Creating directory: ${directory}`);
    fs.mkdirSync(directory, { recursive: true });
  }
};

// Create necessary directories
ensureDirectoryExists(process.env.UPLOAD_DIR || './uploads');
ensureDirectoryExists(process.env.TEMP_DIR || './temp');

const setupDatabase = async () => {
  try {
    // Check if we should skip MongoDB and use in-memory DB directly
    if (process.env.USE_IN_MEMORY_DB === 'true' || !process.env.MONGODB_URI) {
      console.warn('⚠️ Using in-memory database as configured.');
      initializeMockDb();
      return;
    }
    
    try {
      // Try to connect to MongoDB with timeout
      const connectPromise = connectDB();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('MongoDB connection timeout')), 5000);
      });
      
      await Promise.race([connectPromise, timeoutPromise]);
      console.log('✅ Connected to MongoDB');
    } catch (err) {
      console.error('⚠️ MongoDB connection error:', err.message);
      console.log('Falling back to in-memory database');
      initializeMockDb();
    }
  } catch (error) {
    console.error('Fatal database setup error:', error);
    // Initialize in-memory DB as a last resort
    try {
      initializeMockDb();
    } catch (memDbError) {
      console.error('Could not initialize in-memory database:', memDbError);
      process.exit(1);
    }
  }
};

// 404 handler for undefined routes
app.use(notFoundHandler);

// Error handling middleware
app.use(errorHandler);

// Setup unhandled promise rejection handler
setupUnhandledRejectionHandler();

// Start the server after database setup
const startServer = () => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}`);
  });
};

// Only start the server if this file is run directly (not when imported)
if (require.main === module) {
  // Initialize database before starting server
  setupDatabase().then(() => {
    startServer();
  }).catch(err => {
    console.error('Fatal error during startup:', err);
    process.exit(1);
  });
}

// Export app for testing
module.exports = app;