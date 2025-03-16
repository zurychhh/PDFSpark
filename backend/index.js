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
const PORT = process.env.PORT || 3000;

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
        // Set global flag indicating MongoDB is not available
        global.mongoConnected = false;
      }
    });
};

// Start the connection process
try {
  connectWithRetry();
} catch (error) {
  console.error('Failed to initialize MongoDB connection process:', error);
  console.error('Will continue without database connection');
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
app.use(morgan('dev'));

// Configure Helmet with proper security headers - more permissive for Railway
const helmetConfig = {
  // Disable CSP for troubleshooting Railway deployment
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false
};

app.use(helmet(helmetConfig));

// Configure CORS - allow all origins in Railway for testing
const corsOptions = {
  origin: '*', // Allow all origins temporarily for troubleshooting
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID', 'Origin', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['X-Session-ID']
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
app.use('/api', require('./routes/conversionRoutes'));

// Enhanced health check endpoint
app.get('/health', (req, res) => {
  // Always return OK (200) status for Railway health checks
  // to prevent service from restarting constantly due to MongoDB issues
  
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
  
  // Return detailed health information
  res.status(200).json({
    status: 'ok',
    message: 'Server is running',
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || 'unknown',
    railway: {
      service: process.env.RAILWAY_SERVICE_NAME || 'unknown',
      environment: process.env.RAILWAY_ENVIRONMENT_NAME || 'unknown'
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
    uptime: Math.round(process.uptime()) + 's'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'PDFSpark API',
    version: '1.0.0',
    status: 'online',
    documentation: '/api-docs',
    healthCheck: '/health'
  });
});

// Use custom error handler
app.use(errorHandler);

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});