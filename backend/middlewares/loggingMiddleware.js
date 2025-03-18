/**
 * Enhanced logging middleware for PDFSpark
 * 
 * Provides detailed logging for API requests, file operations, and error tracking
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Main logging middleware
 */
const loggingMiddleware = (req, res, next) => {
  // Apply correlation middleware first
  logger.correlationMiddleware(req, res, () => {
    // For file upload operations, add specialized logging
    if (req.originalUrl.includes('/files/upload')) {
      const originalLogger = req.logger;
      
      // Enhanced logging for file operations
      req.logger = {
        ...originalLogger,
        // Override info method to provide more detailed file info
        info: (message, metadata = {}) => {
          // Add file information if available
          if (req.file) {
            metadata.file = {
              originalName: req.file.originalname,
              size: req.file.size,
              mimeType: req.file.mimetype,
              filename: req.file.filename
            };
          } else if (req.files && Object.keys(req.files).length > 0) {
            metadata.files = Object.keys(req.files).map(key => ({
              fieldname: key,
              originalName: req.files[key].originalname,
              size: req.files[key].size,
              mimeType: req.files[key].mimetype
            }));
          }
          
          originalLogger.info(message, metadata);
        },
        // Override error method for file-specific errors
        error: (message, metadata = {}) => {
          // Add file information if available
          if (req.file) {
            metadata.file = {
              originalName: req.file.originalname,
              size: req.file.size,
              mimeType: req.file.mimetype,
              filename: req.file.filename
            };
          }
          
          originalLogger.error(message, metadata);
        }
      };
    }
    
    // For conversion operations, add specialized logging
    if (req.originalUrl.includes('/convert') || req.originalUrl.includes('/operations')) {
      const originalLogger = req.logger;
      
      req.logger = {
        ...originalLogger,
        conversion: (message, metadata = {}) => {
          logger.conversion(message, {
            correlationId: req.correlationId,
            ...metadata
          });
        }
      };
      
      // Initialize conversion logging if this is a new conversion request
      if (req.method === 'POST' && req.originalUrl.includes('/convert')) {
        req.logger.conversion('Starting conversion', {
          body: req.body,
          url: req.originalUrl
        });
      }
    }
    
    // Log memory usage for performance tracking on certain endpoints
    const memoryIntensiveEndpoints = ['/convert', '/operations', '/files/upload'];
    if (memoryIntensiveEndpoints.some(endpoint => req.originalUrl.includes(endpoint))) {
      const memUsage = process.memoryUsage();
      req.logger.info('Memory usage at request start', {
        memoryUsage: {
          rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
          external: Math.round(memUsage.external / 1024 / 1024) + ' MB'
        }
      });
      
      // Also log memory usage at the end of the request
      res.on('finish', () => {
        const endMemUsage = process.memoryUsage();
        req.logger.info('Memory usage at request end', {
          memoryUsage: {
            rss: Math.round(endMemUsage.rss / 1024 / 1024) + ' MB',
            heapTotal: Math.round(endMemUsage.heapTotal / 1024 / 1024) + ' MB',
            heapUsed: Math.round(endMemUsage.heapUsed / 1024 / 1024) + ' MB',
            external: Math.round(endMemUsage.external / 1024 / 1024) + ' MB'
          }
        });
      });
    }
    
    next();
  });
};

module.exports = loggingMiddleware;