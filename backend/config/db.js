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

// Fix MONGODB_URI environment variable if it's incorrectly set
if (process.env.MONGODB_URI === 'Not set' || process.env.MONGODB_URI === undefined) {
  console.log('MONGODB_URI is not properly set, forcing hardcoded connection string');
  process.env.MONGODB_URI = RAILWAY_MONGO_URI;
}

// Construct MongoDB connection string based on available environment variables
function getMongoConnectionString() {
  // 1. First check for direct MONGODB_URI environment variable
  if (process.env.MONGODB_URI && process.env.MONGODB_URI !== 'Not set') {
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
  
  // 3. Try all possible Railway connection string formats
  const possibleConnectionStrings = [
    // External proxy endpoint
    RAILWAY_MONGO_URI,
    // Internal Railway endpoint
    'mongodb://mongo:SUJgiSifJbajieQYydPMxpliFUJGmiBV@mongodb.railway.internal:27017/pdfspark?authSource=admin',
    // Railway with explicit auth source
    'mongodb://mongo:SUJgiSifJbajieQYydPMxpliFUJGmiBV@mainline.proxy.rlwy.net:27523/pdfspark?authSource=admin',
    // Try without database name
    'mongodb://mongo:SUJgiSifJbajieQYydPMxpliFUJGmiBV@mainline.proxy.rlwy.net:27523/?authSource=admin',
    // Try with IP address instead of hostname
    'mongodb://mongo:SUJgiSifJbajieQYydPMxpliFUJGmiBV@10.0.0.5:27017/pdfspark?authSource=admin'
  ];

  return {
    uri: RAILWAY_MONGO_URI,
    source: "Railway hardcoded connection string",
    fallbackStrings: possibleConnectionStrings
  };
}

const connectDB = async () => {
  // Check if we should use in-memory fallback
  if (USE_MEMORY_FALLBACK) {
    console.log('Using in-memory fallback instead of MongoDB (USE_MEMORY_FALLBACK=true)');
    // Set a global flag that other parts of the app can check
    global.usingMemoryFallback = true;
    global.mongoConnected = false;
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
      bufferTimeoutMS: 60000, // 60 seconds buffer timeout for operations
      // Additional options for more reliable connections
      useNewUrlParser: true,
      retryWrites: true,
      retryReads: true,
      // More aggressive reconnection strategy
      // The server will select faster
      heartbeatFrequencyMS: 5000
    };
    
    // Log connection attempt details
    console.log(`Connection options:`, JSON.stringify(options));
    
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

module.exports = connectDB;