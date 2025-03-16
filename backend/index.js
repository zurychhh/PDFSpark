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

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB if MONGODB_URI is provided
const connectDB = require('./config/db');
if (process.env.MONGODB_URI) {
  connectDB()
    .then(() => console.log('MongoDB Connected via DB config'))
    .catch(err => console.error('MongoDB connection error:', err));
} else {
  console.log('MongoDB connection URI not provided - running without database');
}

// Ensure upload and temp directories exist
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}
if (!fs.existsSync('./temp')) {
  fs.mkdirSync('./temp');
}

// Middleware
app.use(morgan('dev'));

// Configure Helmet with proper security headers
const helmetConfig = {
  // In production, enable Content Security Policy
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://*.stripe.com"],
      connectSrc: ["'self'", 
        "https://api.pdfspark.up.railway.app", 
        "https://pdfspark.vercel.app",
        "https://*.stripe.com"
      ],
      frameSrc: ["'self'", "https://js.stripe.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    }
  } : false,
  crossOriginEmbedderPolicy: false
};

app.use(helmet(helmetConfig));

// Configure CORS properly for production and development
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? 
    [process.env.FRONTEND_URL || 'https://pdfspark.vercel.app'] : 
    ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'PDFSpark API',
    version: '1.0.0',
    documentation: '/api-docs'
  });
});

// Use custom error handler
app.use(errorHandler);

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});