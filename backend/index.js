require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs-extra');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5001;

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

// Static files for uploads preview
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Define routes
app.use('/api/cloudinary', require('./routes/cloudinaryRoutes'));

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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Something went wrong on the server';
  
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
    }
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});