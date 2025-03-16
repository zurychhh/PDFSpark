/**
 * Service health check middleware
 * Checks if all required services are available before processing requests
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { ErrorResponse } = require('../utils/errorHandler');

// Check if required directories exist and are writable
const checkDirectories = (req, res, next) => {
  try {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const tempDir = process.env.TEMP_DIR || './temp';
    
    // Check if directories exist
    const dirs = [uploadDir, tempDir];
    const dirsStatus = dirs.map(dir => {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        // Check if directory is writable
        fs.accessSync(dir, fs.constants.W_OK);
        return { dir, exists: true, writable: true };
      } catch (error) {
        console.error(`Directory ${dir} is not accessible:`, error.message);
        return { dir, exists: fs.existsSync(dir), writable: false, error: error.message };
      }
    });
    
    // If any directory is not writable, return service unavailable
    const unavailableDirs = dirsStatus.filter(dir => !dir.writable);
    if (unavailableDirs.length > 0) {
      console.error('Service directories unavailable:', unavailableDirs);
      return next(new ErrorResponse('Service temporarily unavailable due to storage issues', 503));
    }
    
    // Set directories status on request for logging
    req.directoriesStatus = dirsStatus;
    next();
  } catch (error) {
    console.error('Error checking service directories:', error);
    next(new ErrorResponse('Service health check failed', 503));
  }
};

// Check if PDF processing service is available
const checkPdfService = (req, res, next) => {
  try {
    // Simple check that the required modules are loaded
    const pdfLib = require('pdf-lib');
    const sharp = require('sharp');
    
    next();
  } catch (error) {
    console.error('PDF processing service unavailable:', error);
    next(new ErrorResponse('PDF processing service temporarily unavailable', 503));
  }
};

// Main service health check middleware
const serviceHealthCheck = (req, res, next) => {
  // Skip health checks for the health endpoint itself and static assets
  if (req.path === '/api/health' || req.path.startsWith('/public/')) {
    return next();
  }
  
  // For file operations, check directories and PDF service
  if (req.path.includes('/api/files') || req.path.includes('/api/convert')) {
    try {
      // Check directories first
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      const tempDir = process.env.TEMP_DIR || './temp';
      
      // Check if directories exist
      const dirs = [uploadDir, tempDir];
      const dirsStatus = dirs.map(dir => {
        try {
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          
          // Check if directory is writable
          fs.accessSync(dir, fs.constants.W_OK);
          return { dir, exists: true, writable: true };
        } catch (error) {
          console.error(`Directory ${dir} is not accessible:`, error.message);
          return { dir, exists: fs.existsSync(dir), writable: false, error: error.message };
        }
      });
      
      // If any directory is not writable, return service unavailable
      const unavailableDirs = dirsStatus.filter(dir => !dir.writable);
      if (unavailableDirs.length > 0) {
        console.error('Service directories unavailable:', unavailableDirs);
        return next(new ErrorResponse('Service temporarily unavailable due to storage issues', 503));
      }
      
      // Set directories status on request for logging
      req.directoriesStatus = dirsStatus;
      
      // Now check PDF service
      try {
        // Simple check that the required modules are loaded
        const pdfLib = require('pdf-lib');
        const sharp = require('sharp');
      } catch (error) {
        console.error('PDF processing service unavailable:', error);
        return next(new ErrorResponse('PDF processing service temporarily unavailable', 503));
      }
    } catch (error) {
      console.error('Error in service health check:', error);
      return next(new ErrorResponse('Service health check failed', 503));
    }
  }
  
  // All checks passed or not required for this endpoint
  next();
};

// Health check endpoint handler
const healthCheck = (req, res) => {
  const status = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    mongodb: mongoose.connection.readyState === 1,
    memoryUsage: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };
  
  const isHealthy = status.mongodb || process.env.USE_IN_MEMORY_DB === 'true';
  
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'UP' : 'DOWN',
    ...status
  });
};

module.exports = {
  serviceHealthCheck,
  healthCheck
};