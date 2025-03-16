const mongoose = require('mongoose');

// Hardcoded MongoDB connection details for Railway - these should match the variables
// in Railway MongoDB service when deployed there
const RAILWAY_MONGO_CONFIG = {
  user: 'mongo',
  password: 'SUJgiSifJbajieQYydPMxpliFUJGmiBV',
  host: 'mongodb.railway.internal',
  port: '27017',
  database: 'pdfspark',
  authSource: 'admin'
};

const connectDB = async () => {
  try {
    // First try with explicit environment variables
    let mongoURI = process.env.MONGODB_URI;
    let connectionSource = "MONGODB_URI";
    
    // Then with individual connection parameters
    if (!mongoURI && process.env.MONGOUSER && process.env.MONGOPASSWORD && process.env.MONGOHOST) {
      const host = process.env.MONGOHOST;
      const port = process.env.MONGOPORT || '27017';
      const user = process.env.MONGOUSER;
      const password = process.env.MONGOPASSWORD;
      const database = 'pdfspark';
      
      mongoURI = `mongodb://${user}:${password}@${host}:${port}/${database}?authSource=admin`;
      connectionSource = "MONGO environment variables";
      console.log(`Using connection string built from env vars. Host: ${host}`);
    }
    
    // Finally, use hardcoded Railway values if nothing else works
    if (!mongoURI) {
      const { user, password, host, port, database, authSource } = RAILWAY_MONGO_CONFIG;
      mongoURI = `mongodb://${user}:${password}@${host}:${port}/${database}?authSource=${authSource}`;
      connectionSource = "hardcoded Railway values";
      console.log(`Using hardcoded MongoDB configuration. Host: ${host}`);
    }
    
    console.log(`Attempting MongoDB connection using ${connectionSource}`);
    
    const conn = await mongoose.connect(mongoURI, {
      // These options are no longer needed in Mongoose 6+ but added for compatibility
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // Increase timeouts for Railway
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 60000,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    console.error('Connection error stack:', error.stack);
    // Don't exit the process, just throw the error so it can be caught by the caller
    throw error;
  }
};

module.exports = connectDB;