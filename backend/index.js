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
const PORT = process.env.PORT || 5001;

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
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for development
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 
    [process.env.FRONTEND_URL || 'https://pdfspark.vercel.app'] : 
    ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Service health check middleware
const { serviceHealthCheck } = require('./middlewares/serviceHealthCheck');
app.use(serviceHealthCheck);

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