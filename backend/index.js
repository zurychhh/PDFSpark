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
console.log(`MongoDB host: ${process.env.MONGOHOST || 'Not set'}`);
console.log(`MongoDB connection info available: ${Boolean(process.env.MONGODB_URI || (process.env.MONGOHOST && process.env.MONGOUSER))}`);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
const connectDB = require('./config/db');
try {
  connectDB()
    .then(() => console.log('MongoDB Connected successfully'))
    .catch(err => {
      console.error('MongoDB connection error:', err);
      console.error('Will continue without database connection');
    });
} catch (error) {
  console.error('Failed to initialize MongoDB connection:', error);
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
  // Get MongoDB connection status
  const mongoStatus = mongoose.connection.readyState;
  const mongoStatusText = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  }[mongoStatus] || 'unknown';
  
  // Return detailed health information
  res.status(200).json({
    status: 'ok',
    message: 'Server is running',
    time: new Date().toISOString(),
    env: process.env.NODE_ENV,
    mongodb: {
      status: mongoStatusText,
      host: process.env.MONGOHOST || process.env.MONGODB_URI?.split('@')[1]?.split('/')[0] || 'not_set',
      database: 'pdfspark'
    },
    memory: process.memoryUsage(),
    uptime: process.uptime()
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