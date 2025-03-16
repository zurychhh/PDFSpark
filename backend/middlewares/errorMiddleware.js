/**
 * Custom error handling middleware to catch and handle all errors in Express
 */

const { errorHandler } = require('../utils/errorHandler');

// Catch async errors in routes
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Catch 404 errors and forward to error handler
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Endpoint not found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

// Handle unhandled promise rejections
const setupUnhandledRejectionHandler = () => {
  process.on('unhandledRejection', (err, promise) => {
    console.error('UNHANDLED PROMISE REJECTION:', err);
    // Log to error tracking service in production
    if (process.env.NODE_ENV === 'production') {
      // logErrorToService(err);
    }
    // Don't crash the app in production
    if (process.env.NODE_ENV !== 'production') {
      // In development, crash the app to make errors more visible
      // process.exit(1);
    }
  });
};

module.exports = {
  asyncHandler,
  notFoundHandler,
  errorHandler,
  setupUnhandledRejectionHandler
};