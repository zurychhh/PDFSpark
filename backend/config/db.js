const mongoose = require('mongoose');

// Fixed connection strings for Railway and fallback
const RAILWAY_MONGO_URI = 'mongodb://mongo:SUJgiSifJbajieQYydPMxpliFUJGmiBV@mainline.proxy.rlwy.net:27523';
const ATLAS_MONGO_URI = 'mongodb+srv://oleksiakpiotrrafal:AsCz060689!@pdfsparkfree.sflwc.mongodb.net/pdfspark?retryWrites=true&w=majority&appName=PDFSparkFree';
// Memory-based fallback for when MongoDB is not available
const USE_MEMORY_FALLBACK = process.env.USE_MEMORY_FALLBACK === 'true' || false;

// Enhanced MongoDB connection logging
console.log('==== MongoDB ENV VARS ====');
console.log(`Environment MONGODB_URI: ${process.env.MONGODB_URI ? 'Set (value hidden)' : 'Not set'}`);
// Log MongoDB-related environment variables
const mongoEnvVars = Object.keys(process.env)
  .filter(key => key.includes('MONGO'))
  .map(key => {
    const value = process.env[key];
    if (key.includes('PASSWORD') || key.includes('URI') || key.includes('URL')) {
      return `${key}: Set (value hidden)`;
    }
    return `${key}: ${value}`;
  });

console.log('MongoDB-related environment variables:');
if (mongoEnvVars.length > 0) {
  console.log(' ' + mongoEnvVars.join('\n '));
} else {
  console.log(' None found');
}

// Check for standard Railway MongoDB environment variables
const railwayVars = [];
if (process.env.RAILWAY_ENVIRONMENT) railwayVars.push('RAILWAY_ENVIRONMENT');
if (process.env.RAILWAY_VOLUME_MOUNT_PATH) railwayVars.push('RAILWAY_VOLUME_MOUNT_PATH');
if (process.env.RAILWAY_SERVICE_NAME) railwayVars.push('RAILWAY_SERVICE_NAME');

console.log(`Railway deployment detected: ${railwayVars.length > 0 ? 'Yes' : 'No'}`);
if (railwayVars.length > 0) {
  console.log('Railway environment variables found:', railwayVars.join(', '));
}

// Construct MongoDB connection string based on available environment variables
function getMongoConnectionString() {
  // 1. First check for direct MONGODB_URI environment variable
  if (process.env.MONGODB_URI) {
    return {
      uri: process.env.MONGODB_URI,
      source: "MONGODB_URI environment variable"
    };
  }
  
  // 2. Try to construct from Railway's component parts
  if (process.env.MONGOHOST && process.env.MONGOUSER && process.env.MONGOPASSWORD) {
    const uri = `mongodb://${process.env.MONGOUSER}:${process.env.MONGOPASSWORD}@${process.env.MONGOHOST}:${process.env.MONGOPORT || '27017'}/${process.env.MONGODB || 'pdfspark'}`;
    return {
      uri,
      source: "Constructed from Railway MONGO* environment variables"
    };
  }
  
  // 3. Try Railway hardcoded string
  return {
    uri: RAILWAY_MONGO_URI,
    source: "Railway hardcoded connection string"
  };
}

const connectDB = async () => {
  // Check if we should use in-memory fallback
  if (USE_MEMORY_FALLBACK) {
    console.log('Using in-memory fallback instead of MongoDB (USE_MEMORY_FALLBACK=true)');
    // Set a global flag that other parts of the app can check
    global.usingMemoryFallback = true;
    return { connection: { host: 'in-memory-fallback' } };
  }

  try {
    // Get connection info
    const connectionInfo = getMongoConnectionString();
    console.log(`MongoDB connection attempt using ${connectionInfo.source}`);
    
    // Connection options with improved resilience
    const options = {
      // Increase timeouts for slower connections
      serverSelectionTimeoutMS: 60000, // 60 seconds to select a server
      connectTimeoutMS: 60000, // 60 seconds to establish connection
      socketTimeoutMS: 90000, // 90 seconds for socket operations
      // Auto-reconnect functionality
      auto_reconnect: true,
      // Keep trying to send operations for 60 seconds
      maxIdleTimeMS: 60000,
      // Set longer heartbeat
      heartbeatFrequencyMS: 10000,
      // Pooling options
      maxPoolSize: 10,
      minPoolSize: 2,
      // Increase operation bufferTimeoutMS to prevent quick timeouts like in the error
      bufferTimeoutMS: 60000 // 60 seconds buffer timeout for operations
    };
    
    // Log connection attempt details
    console.log(`Connection options:`, JSON.stringify(options));
    
    // Try primary connection string
    try {
      const conn = await mongoose.connect(connectionInfo.uri, options);
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      
      // Set global connected flag
      global.mongoConnected = true;
      global.usingMemoryFallback = false;
      
      return conn;
    } catch (primaryError) {
      console.error(`Primary MongoDB connection failed: ${primaryError.message}`);
      console.log('Attempting fallback to MongoDB Atlas connection...');
      
      // Try fallback Atlas connection
      try {
        const conn = await mongoose.connect(ATLAS_MONGO_URI, options);
        console.log(`MongoDB Connected via Atlas fallback: ${conn.connection.host}`);
        
        // Set global connected flag
        global.mongoConnected = true;
        global.usingMemoryFallback = false;
        
        return conn;
      } catch (fallbackError) {
        console.error(`Fallback MongoDB connection also failed: ${fallbackError.message}`);
        throw fallbackError; // Re-throw to be handled by caller
      }
    }
  } catch (error) {
    console.error(`All MongoDB connection attempts failed: ${error.message}`);
    console.error('Connection error stack:', error.stack);
    
    console.log('The application will continue without MongoDB - some features may be limited');
    
    // Set global flags
    global.mongoConnected = false;
    global.usingMemoryFallback = true;
    
    throw error;
  }
};

module.exports = connectDB;