/**
 * Enhanced logger utility for PDFSpark
 * 
 * Provides structured logging with correlation IDs to track requests through the system
 */
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// File paths for different log levels
const logPaths = {
  error: path.join(logsDir, 'error.log'),
  info: path.join(logsDir, 'info.log'),
  conversion: path.join(logsDir, 'conversion.log'),
  request: path.join(logsDir, 'request.log')
};

/**
 * Formats a log message with timestamp and additional metadata
 */
function formatLogMessage(level, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  return JSON.stringify({
    timestamp,
    level,
    message,
    ...metadata
  }) + '\n';
}

/**
 * Writes a log message to the appropriate log file
 */
function writeToLogFile(logPath, formattedMessage) {
  try {
    fs.appendFileSync(logPath, formattedMessage);
  } catch (error) {
    console.error(`Failed to write to log file ${logPath}:`, error);
    // Fallback to console
    console.log(formattedMessage);
  }
}

/**
 * Main logger object
 */
const logger = {
  /**
   * Log an error message
   */
  error(message, metadata = {}) {
    const formattedMessage = formatLogMessage('error', message, metadata);
    writeToLogFile(logPaths.error, formattedMessage);
    
    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.error(`ERROR: ${message}`, metadata);
    }
  },

  /**
   * Log a warning message
   */
  warn(message, metadata = {}) {
    const formattedMessage = formatLogMessage('warning', message, metadata);
    writeToLogFile(logPaths.error, formattedMessage);
    
    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`WARNING: ${message}`, metadata);
    }
  },

  /**
   * Log an info message
   */
  info(message, metadata = {}) {
    const formattedMessage = formatLogMessage('info', message, metadata);
    writeToLogFile(logPaths.info, formattedMessage);
    
    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`INFO: ${message}`);
    }
  },
  
  /**
   * Log a debug message (using info level for now)
   */
  debug(message, metadata = {}) {
    // Use info level for debug messages to avoid changing too much code
    const formattedMessage = formatLogMessage('debug', message, metadata);
    writeToLogFile(logPaths.info, formattedMessage);
    
    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`DEBUG: ${message}`);
    }
  },

  /**
   * Log conversion-specific information
   */
  conversion(message, metadata = {}) {
    const formattedMessage = formatLogMessage('conversion', message, metadata);
    writeToLogFile(logPaths.conversion, formattedMessage);
  },

  /**
   * Log HTTP request information
   */
  request(req, res, metadata = {}) {
    const reqData = {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      correlationId: req.correlationId || 'unknown',
      ...metadata
    };
    
    const formattedMessage = formatLogMessage('request', `${req.method} ${req.originalUrl}`, reqData);
    writeToLogFile(logPaths.request, formattedMessage);
  },

  /**
   * Create a child logger with specific metadata (mainly correlationId)
   */
  child(metadata = {}) {
    const childLogger = {};
    
    // Copy all methods from the parent logger
    Object.keys(logger).forEach(key => {
      if (typeof logger[key] === 'function') {
        childLogger[key] = (message, additionalMetadata = {}) => {
          logger[key](message, { ...metadata, ...additionalMetadata });
        };
      }
    });
    
    return childLogger;
  },

  /**
   * Middleware to add correlation ID to requests
   */
  correlationMiddleware(req, res, next) {
    // Use existing ID from header or generate a new one
    req.correlationId = req.headers['x-correlation-id'] || uuidv4();
    
    // Add correlation ID to response headers
    res.setHeader('x-correlation-id', req.correlationId);
    
    // Create a request-specific logger instance
    req.logger = logger.child({ correlationId: req.correlationId });
    
    // Log the request
    logger.request(req, res);
    
    // Capture the original end method
    const originalEnd = res.end;
    
    // Override end method to log response
    res.end = function(chunk, encoding) {
      // Restore original end
      res.end = originalEnd;
      
      // Log response info
      if (req.logger) {
        req.logger.info(`Response: ${res.statusCode}`, {
          statusCode: res.statusCode,
          responseTime: Date.now() - req.startTime,
          contentLength: res.get('Content-Length'),
          contentType: res.get('Content-Type')
        });
      }
      
      // Call the original end method
      return originalEnd.call(this, chunk, encoding);
    };
    
    // Record start time
    req.startTime = Date.now();
    
    next();
  },

  /**
   * Generate a new correlation ID
   */
  generateCorrelationId() {
    return uuidv4();
  }
};

module.exports = logger;