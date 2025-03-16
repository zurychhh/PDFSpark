const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { ErrorResponse } = require('../utils/errorHandler');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');

// Protect routes
exports.protect = async (req, res, next) => {
  let token;

  // Check for Bearer token in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    // Set token from Bearer token in header
    token = req.headers.authorization.split(' ')[1];
  } 
  // Check for token in cookies
  else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  // Make sure token exists
  if (!token) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id);

    if (!req.user) {
      return next(new ErrorResponse('User not found', 401));
    }

    // Update lastSeen
    req.user.lastSeen = new Date();
    await req.user.save({ validateBeforeSave: false });

    next();
  } catch (err) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }
};

// Get user by session or create guest user
exports.getSessionUser = async (req, res, next) => {
  try {
    // Check for session ID in header or cookies
    let sessionId = req.headers['x-session-id'] || req.cookies?.sessionId;
    console.log('Session ID from request:', sessionId);

    if (!sessionId) {
      // Create a new session ID
      sessionId = uuidv4();
      console.log('Created new session ID:', sessionId);
      
      // Set as cookie for future requests (if client accepts cookies)
      res.cookie('sessionId', sessionId, {
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });
      
      // Also set a custom header for clients that don't support cookies
      res.setHeader('X-Session-ID', sessionId);
    }

    // For testing, add the session ID to every response
    res.setHeader('X-Session-ID', sessionId);
    
    // Set sessionId on request early so it's available even if DB operations fail
    req.sessionId = sessionId;
    
    // Check if we're in memory fallback mode
    if (global.usingMemoryFallback && global.memoryStorage) {
      console.log('Memory fallback mode active, using in-memory user storage');
      
      // Look for user in memory storage
      let user = global.memoryStorage.findUserBySession(sessionId);
      
      if (!user) {
        // Create guest user in memory storage
        console.log('Creating new guest user in memory with sessionId:', sessionId);
        try {
          user = global.memoryStorage.createGuestUser(sessionId);
          console.log('Created guest user in memory:', user._id);
        } catch (createError) {
          console.error('Error creating in-memory guest user:', createError);
          // Continue without user object
          return next();
        }
      }
      
      // Add hasActiveSubscription method to memory user
      if (user && !user.hasActiveSubscription) {
        user.hasActiveSubscription = function() {
          return false; // Default to false for memory users
        };
        user.isProUser = function() {
          return false; // Default to false for memory users
        };
      }
      
      // Set the user on the request
      req.user = user;
      return next();
    }
    
    // Standard MongoDB path
    // Check if we have MongoDB connection - if not, skip user lookup
    if (mongoose.connection.readyState !== 1 && process.env.USE_IN_MEMORY_DB !== 'true') {
      console.log('MongoDB not connected, skipping user lookup. Using session-only auth.');
      return next();
    }
    
    try {
      // Try to find existing user with this sessionId
      let user = await User.findOne({ sessionId }).maxTimeMS(3000);
  
      if (!user) {
        // Create a new guest user
        console.log('Creating new guest user with sessionId:', sessionId);
        try {
          user = await User.create({
            sessionId,
            isGuest: true
          });
        } catch (createError) {
          console.error('Error creating guest user:', createError);
          // Continue without user object
          return next();
        }
      }
  
      // Update lastSeen
      try {
        user.lastSeen = new Date();
        await user.save({ validateBeforeSave: false });
      } catch (updateError) {
        console.warn('Could not update lastSeen timestamp:', updateError.message);
        // Continue with existing user
      }
  
      // Set the user on the request
      req.user = user;
    } catch (userError) {
      console.error('Error finding/creating user:', userError);
      // Continue without user object
      // The sessionId is already set earlier
    }

    next();
  } catch (err) {
    console.error('Session handling error:', err);
    // Continue without user to avoid breaking the app
    // Create a new session ID as fallback
    const fallbackSessionId = uuidv4();
    req.sessionId = fallbackSessionId;
    console.log('Fallback sessionId created:', fallbackSessionId);
    
    // Set a header so the client gets it anyway
    res.setHeader('X-Session-ID', fallbackSessionId);
    next();
  }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ErrorResponse('Not authorized to access this route', 401));
    }
    
    if (!roles.includes(req.user.role)) {
      return next(new ErrorResponse(`User role ${req.user.role} is not authorized to access this route`, 403));
    }
    
    next();
  };
};

// Check subscription for premium features
exports.requireSubscription = async (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }

  if (!req.user.hasActiveSubscription()) {
    return next(new ErrorResponse('This feature requires an active subscription', 403));
  }

  next();
};

// Check if user is Pro for advanced features
exports.requireProPlan = async (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }

  if (!req.user.isProUser()) {
    return next(new ErrorResponse('This feature requires a Pro subscription', 403));
  }

  next();
};