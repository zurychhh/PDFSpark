class ErrorResponse extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Create a logs directory if it doesn't exist
const ensureLogsDirectory = () => {
  const fs = require('fs');
  const logsDir = './logs';
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
};

// Log error to file
const logErrorToFile = (err, req) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const logsDir = ensureLogsDirectory();
    
    const today = new Date().toISOString().split('T')[0];
    const errorLogPath = path.join(logsDir, `error-${today}.log`);
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      errorName: err.name,
      errorMessage: err.message,
      errorStack: err.stack,
      params: req.params,
      query: req.query,
      body: req.method === 'POST' ? (
        req.is('multipart/form-data') ? '[MULTIPART FORM DATA]' : req.body
      ) : undefined
    };
    
    fs.appendFileSync(
      errorLogPath, 
      JSON.stringify(logEntry, null, 2) + '\n---\n', 
      { encoding: 'utf8' }
    );
  } catch (logError) {
    console.error('Error writing to error log:', logError);
  }
};

const errorHandler = (err, req, res, next) => {
  // Clone the error to avoid modifying the original
  let error = { ...err };
  error.message = err.message;
  
  // Log all errors to file in all environments
  logErrorToFile(err, req);

  // Log to console for dev
  console.error(`ERROR HANDLER (${req.method} ${req.originalUrl}):`);
  console.error(err.name, ':', err.message);
  console.error(err.stack);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors || {}).map(val => val.message).join(', ');
    error = new ErrorResponse(message || 'Validation Error', 400);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = new ErrorResponse(message, 400);
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = `Resource not found with id of ${err.value || 'unknown'}`;
    error = new ErrorResponse(message, 404);
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Not authorized to access this route';
    error = new ErrorResponse(message, 401);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Your token has expired. Please log in again';
    error = new ErrorResponse(message, 401);
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = 'File size exceeds the allowed limit';
    error = new ErrorResponse(message, 400);
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    const message = 'Unexpected file field in upload';
    error = new ErrorResponse(message, 400);
  }

  if (err.code === 'LIMIT_PART_COUNT') {
    const message = 'Too many parts in multipart upload';
    error = new ErrorResponse(message, 400);
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    const message = 'Too many files uploaded';
    error = new ErrorResponse(message, 400);
  }

  // File system errors
  if (err.code === 'ENOENT') {
    const message = `File not found: ${err.path || ''}`;
    error = new ErrorResponse(message, 404);
  }

  if (err.code === 'EACCES') {
    const message = `Permission denied to access file: ${err.path || ''}`;
    error = new ErrorResponse(message, 403);
  }

  // Database connection errors
  if (err.name === 'MongooseError' && err.message.includes('buffering timed out')) {
    const message = 'Database connection error. Please try again later.';
    error = new ErrorResponse(message, 503);
  }

  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    const message = 'Database error. Please try again later.';
    error = new ErrorResponse(message, 503);
  }

  // Handle PDF-lib specific errors
  if (err.message && (
    err.message.includes('PDF') || 
    err.message.includes('pdf') || 
    err.message.includes('document')
  )) {
    const message = 'Error processing PDF document. The file may be corrupted or invalid.';
    error = new ErrorResponse(message, 400);
  }

  const errorResponse = {
    success: false,
    error: error.message || 'Server Error',
    statusCode: error.statusCode || 500
  };

  // Add more details in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.detail = err.detail || err.message;
    errorResponse.name = err.name;
    errorResponse.code = err.code;
  }

  // Send error response
  res.status(error.statusCode || 500).json(errorResponse);
};

module.exports = {
  ErrorResponse,
  errorHandler
};