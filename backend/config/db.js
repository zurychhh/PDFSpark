const mongoose = require('mongoose');

// MONGODB CONNECTION STRINGS
// These are hardcoded fallbacks used only when the environment variables are not set

// Primary Railway MongoDB connection string
const RAILWAY_MONGO_URI = 'mongodb://mongo:SUJgiSifJbajieQYydPMxpliFUJGmiBV@mainline.proxy.rlwy.net:27523';

// Alternative Railway connection formats to try
const RAILWAY_MONGO_URIS = [
  // Standard Railway proxy URL
  'mongodb://mongo:SUJgiSifJbajieQYydPMxpliFUJGmiBV@mainline.proxy.rlwy.net:27523',
  
  // Internal Railway URL
  'mongodb://mongo:SUJgiSifJbajieQYydPMxpliFUJGmiBV@mongodb.railway.internal:27017/pdfspark',
  
  // Railway with explicit auth source
  'mongodb://mongo:SUJgiSifJbajieQYydPMxpliFUJGmiBV@mainline.proxy.rlwy.net:27523/?authSource=admin',
  
  // With database name specified
  'mongodb://mongo:SUJgiSifJbajieQYydPMxpliFUJGmiBV@mainline.proxy.rlwy.net:27523/pdfspark',
  
  // Alternative port format - sometimes Railway documentation shows this
  'mongodb://mongo:SUJgiSifJbajieQYydPMxpliFUJGmiBV@mongo.railway.internal:27017'
];

// MongoDB Atlas fallback connection string (last resort)
const ATLAS_MONGO_URI = 'mongodb+srv://oleksiakpiotrrafal:AsCz060689!@pdfsparkfree.sflwc.mongodb.net/pdfspark?retryWrites=true&w=majority&appName=PDFSparkFree';

// In memory mode flag - check if explicitly set or derive from environment
const USE_MEMORY_FALLBACK = process.env.USE_MEMORY_FALLBACK === 'true' || false;

// This is a critical check to see if we have a properly formatted MongoDB URI
const hasValidMongoDbUri = () => {
  if (!process.env.MONGODB_URI) return false;
  if (process.env.MONGODB_URI === 'Not set') return false;
  if (process.env.MONGODB_URI === 'undefined') return false;
  
  // Basic format check - should start with mongodb:// or mongodb+srv://
  const validPrefix = process.env.MONGODB_URI.startsWith('mongodb://') || 
                      process.env.MONGODB_URI.startsWith('mongodb+srv://');
                      
  // Should have reasonable length
  const validLength = process.env.MONGODB_URI.length > 20;
  
  return validPrefix && validLength;
};

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

// Fix MONGODB_URI environment variable if it's incorrectly set
if (process.env.MONGODB_URI === 'Not set' || process.env.MONGODB_URI === undefined) {
  console.log('MONGODB_URI is not properly set, forcing hardcoded connection string');
  process.env.MONGODB_URI = RAILWAY_MONGO_URI;
}

// Construct MongoDB connection string based on available environment variables
function getMongoConnectionString() {
  let validationResult = '';
  
  // 1. First check for direct MONGODB_URI environment variable and validate it
  if (hasValidMongoDbUri()) {
    console.log('✅ Valid MONGODB_URI found in environment variables');
    validationResult = 'Valid MongoDB URI detected with proper format';
    
    // Print extra validation info for troubleshooting
    if (process.env.MONGODB_URI.includes('@')) {
      const [prefix, suffix] = process.env.MONGODB_URI.split('@');
      console.log(`MongoDB URI host part: ${suffix.split('/')[0]}`);
    }
    
    return {
      uri: process.env.MONGODB_URI,
      source: "MONGODB_URI environment variable",
      validation: validationResult
    };
  } else {
    console.log('❌ MONGODB_URI is invalid or not properly set');
    validationResult = 'Invalid or missing MongoDB URI';
  }
  
  // 2. Try to construct from Railway's component parts
  if (process.env.MONGOHOST && process.env.MONGOUSER && process.env.MONGOPASSWORD) {
    console.log('⚠️ Using component MONGO* vars to build connection string');
    
    const uri = `mongodb://${process.env.MONGOUSER}:${process.env.MONGOPASSWORD}@${process.env.MONGOHOST}:${process.env.MONGOPORT || '27017'}/${process.env.MONGODB || 'pdfspark'}`;
    return {
      uri,
      source: "Constructed from Railway MONGO* environment variables",
      validation: validationResult + '; Using component vars instead'
    };
  }
  
  // 3. Try all possible Railway connection string formats
  console.log('⚠️ Falling back to hardcoded MongoDB connection strings');
  
  // Add all the possible connection strings from our array
  return {
    uri: RAILWAY_MONGO_URI,
    source: "Railway hardcoded connection string",
    validation: validationResult + '; Using hardcoded fallback',
    fallbackStrings: RAILWAY_MONGO_URIS,
    isHardcoded: true
  };
}

const connectDB = async () => {
  console.log("\n===== DATABASE CONNECTION STRATEGY =====");
  
  // First a very detailed check of the USE_MEMORY_FALLBACK flag
  console.log(`USE_MEMORY_FALLBACK environment variable: "${process.env.USE_MEMORY_FALLBACK}"`);
  console.log(`USE_MEMORY_FALLBACK parsed value: ${USE_MEMORY_FALLBACK} (${typeof USE_MEMORY_FALLBACK})`);
  
  // PART 1: Check if we should use memory fallback
  // CRITICAL FIX: Always use memory fallback in Railway, regardless of environment variable
  const isRailwayEnvironment = process.env.RAILWAY_SERVICE_NAME || process.env.RAILWAY_ENVIRONMENT;
  if (isRailwayEnvironment) {
    console.log('🚨 CRITICAL: Railway environment detected - FORCING memory fallback mode regardless of settings');
    process.env.USE_MEMORY_FALLBACK = 'true';
  }
  
  // Re-check the flag after potentially updating it for Railway
  const useMemoryFallback = process.env.USE_MEMORY_FALLBACK === 'true' || false;
  
  if (useMemoryFallback) {
    console.log('⚠️ Using in-memory fallback instead of MongoDB (USE_MEMORY_FALLBACK=true)');
    console.log('⚠️ WARNING: All data will be lost when the server restarts!');
    
    // Set global flags for memory fallback mode
    global.usingMemoryFallback = true;
    global.mongoConnected = false;
    
    // Initialize memory storage if needed
    if (!global.memoryStorage) {
      console.log('Initializing memory storage...');
      initializeMemoryFallback();
    }
    
    return { connection: { host: 'in-memory-fallback' } };
  }
  
  // PART 2: If we're not using memory fallback, try to connect to MongoDB
  console.log('🔄 Attempting MongoDB connection...');

  try {
    // Get connection info
    const connectionInfo = getMongoConnectionString();
    console.log(`MongoDB connection attempt using ${connectionInfo.source}`);
    console.log(`MongoDB URI being used: ${connectionInfo.uri.substring(0, 15)}...`);
    
    // Enhanced logging for Railway debugging
    if (process.env.RAILWAY_SERVICE_NAME) {
      console.log('=== DETAILED RAILWAY MONGODB DIAGNOSTICS ===');
      console.log(`- Connection URI source: ${connectionInfo.source}`);
      console.log(`- URI validation result: ${connectionInfo.validation}`);
      console.log(`- Using hardcoded fallback: ${connectionInfo.isHardcoded ? 'Yes' : 'No'}`);
      console.log(`- Number of fallback URIs: ${connectionInfo.fallbackStrings?.length || 0}`);
      console.log(`- Current working directory: ${process.cwd()}`);
      
      // Check if hostname is resolvable
      try {
        const dns = require('dns');
        const url = new URL(connectionInfo.uri);
        dns.lookup(url.hostname, (err, address) => {
          console.log(`- DNS lookup for hostname: ${err ? 'Failed - ' + err.message : 'Success - ' + address}`);
        });
      } catch (err) {
        console.log(`- Failed to parse MongoDB URI: ${err.message}`);
      }
    }
    
    // Connection options with improved resilience
    const options = {
      // Increase timeouts for slower connections
      serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '60000'), 
      connectTimeoutMS: parseInt(process.env.MONGODB_CONNECTION_TIMEOUT_MS || '60000'),
      socketTimeoutMS: parseInt(process.env.MONGODB_SOCKET_TIMEOUT_MS || '90000'),
      // auto_reconnect: true,  // Usunięto - ta opcja nie jest wspierana w nowych wersjach MongoDB
      // Keep trying to send operations for 60 seconds
      maxIdleTimeMS: 60000,
      // Use shorter heartbeat for faster failure detection
      heartbeatFrequencyMS: 5000,
      // Pooling options
      maxPoolSize: 10,
      minPoolSize: 2,
      // Increase operation bufferTimeoutMS to prevent quick timeouts
      bufferTimeoutMS: 60000,
      // Additional options for more reliable connections
      retryWrites: true,
      retryReads: true
    };
    
    console.log('MongoDB connection options:', JSON.stringify(options));
    
    // Try the primary connection string first
    try {
      const conn = await mongoose.connect(connectionInfo.uri, options);
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      
      // Set global connected flag
      global.mongoConnected = true;
      global.usingMemoryFallback = false;
      
      // Initialize memory storage in case it's needed later
      initializeMemoryFallback();
      
      return conn;
    } catch (primaryError) {
      console.error(`Primary MongoDB connection failed: ${primaryError.message}`);
      
      // If there are fallback strings available, try each one in sequence
      if (connectionInfo.fallbackStrings && connectionInfo.fallbackStrings.length > 0) {
        console.log(`Trying ${connectionInfo.fallbackStrings.length} fallback connection strings...`);
        
        // Try each fallback string one by one
        for (let i = 0; i < connectionInfo.fallbackStrings.length; i++) {
          const fallbackUri = connectionInfo.fallbackStrings[i];
          try {
            console.log(`Trying fallback connection string #${i+1}...`);
            
            // Reconnection requires a fresh mongoose instance to reset state
            mongoose.connection.close().catch(err => console.log('Error closing connection:', err));
            
            const conn = await mongoose.connect(fallbackUri, options);
            console.log(`MongoDB Connected via fallback #${i+1}: ${conn.connection.host}`);
            
            // Set global connected flag
            global.mongoConnected = true;
            global.usingMemoryFallback = false;
            
            return conn;
          } catch (fallbackErr) {
            console.error(`Fallback connection #${i+1} failed: ${fallbackErr.message}`);
            // Continue to the next fallback
          }
        }
      }
      
      // If all Railway attempts failed, try Atlas as last resort
      console.log('Attempting fallback to MongoDB Atlas connection...');
      try {
        // Close any pending connections
        mongoose.connection.close().catch(err => console.log('Error closing connection:', err));
        
        const conn = await mongoose.connect(ATLAS_MONGO_URI, options);
        console.log(`MongoDB Connected via Atlas fallback: ${conn.connection.host}`);
        
        // Set global connected flag
        global.mongoConnected = true;
        global.usingMemoryFallback = false;
        
        return conn;
      } catch (atlasError) {
        console.error(`Atlas fallback connection also failed: ${atlasError.message}`);
        
        // All connection attempts failed, switch to memory fallback
        console.error('All MongoDB connection attempts failed');
        
        // Initialize memory fallback
        initializeMemoryFallback();
        
        // Throw the error to be handled by the caller
        throw atlasError;
      }
    }
  } catch (error) {
    console.error(`All MongoDB connection attempts failed: ${error.message}`);
    console.error('Connection error stack:', error.stack);
    
    console.log('The application will continue without MongoDB - some features may be limited');
    
    // Initialize memory fallback
    initializeMemoryFallback();
    
    throw error;
  }
};

// Helper function to initialize memory fallback mode
function initializeMemoryFallback() {
  // Set global flags
  global.mongoConnected = false;
  global.usingMemoryFallback = true;
  
  // Create an in-memory storage mechanism for basic operations
  if (!global.memoryStorage) {
    global.memoryStorage = {
      operations: [],
      files: [],
      addOperation: function(operation) {
        // Ensure operation has an ID
        if (!operation._id) {
          const { v4: uuidv4 } = require('uuid');
          operation._id = uuidv4();
        }
        this.operations.push(operation);
        console.log(`Added operation to memory storage, id: ${operation._id}`);
        return operation;
      },
      findOperation: function(id) {
        const found = this.operations.find(op => op._id === id || op._id.toString() === id.toString());
        console.log(`Looked up operation ${id} in memory: ${found ? 'found' : 'not found'}`);
        return found;
      },
      addFile: function(file) {
        // Ensure file has an ID
        if (!file._id) {
          const { v4: uuidv4 } = require('uuid');
          file._id = uuidv4();
        }
        this.files.push(file);
        console.log(`Added file to memory storage, id: ${file._id}`);
        return file;
      },
      findFile: function(id) {
        const found = this.files.find(f => f._id === id || f._id.toString() === id.toString());
        return found;
      }
    };
    
    console.log('🚨 MEMORY FALLBACK MODE INITIALIZED - OPERATING WITHOUT DATABASE 🚨');
  }
}

// Set up MongoDB connection event listeners
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
  global.mongoConnected = true;
  global.usingMemoryFallback = false;
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err.message);
  if (!global.usingMemoryFallback) {
    console.log('Switching to memory fallback due to connection error');
    global.mongoConnected = false;
    global.usingMemoryFallback = true;
    
    // Initialize memory fallback if not already done
    if (!global.memoryStorage) {
      console.log('Initializing memory storage due to connection error');
      global.memoryStorage = {
        operations: [],
        files: [],
        users: [],
        addOperation: function(operation) {
          if (!operation._id) {
            const { v4: uuidv4 } = require('uuid');
            operation._id = uuidv4();
          }
          this.operations.push(operation);
          return operation;
        },
        findOperation: function(id) {
          if (!id) return null;
          return this.operations.find(op => 
            op._id && (op._id.toString() === id.toString() || op.sourceFileId === id)
          );
        },
        findFile: function(id) {
          if (!id) return null;
          return this.files.find(f => f._id.toString() === id.toString());
        }
      };
    }
  }
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from MongoDB');
  if (!global.usingMemoryFallback) {
    console.log('Switching to memory fallback due to disconnection');
    global.mongoConnected = false;
    global.usingMemoryFallback = true;
  }
});

// Named exports for better importing
module.exports = {
  connectDB,
  hasValidMongoDbUri,
  initializeMemoryFallback
};