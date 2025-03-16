const mongoose = require('mongoose');

// Fixed connection strings for Railway
const PUBLIC_MONGO_URI = 'mongodb://mongo:SUJgiSifJbajieQYydPMxpliFUJGmiBV@mainline.proxy.rlwy.net:27523';
const FALLBACK_MONGO_URI = 'mongodb+srv://oleksiakpiotrrafal:AsCz060689!@pdfsparkfree.sflwc.mongodb.net/pdfspark?retryWrites=true&w=majority&appName=PDFSparkFree';

// Print available environment variables related to MongoDB
console.log('==== MongoDB ENV VARS ====');
console.log(`Environment MONGODB_URI: ${process.env.MONGODB_URI ? 'Present (value hidden)' : 'Not set'}`);
// Get all env vars with MONGO in the name
const mongoEnvVars = Object.keys(process.env).filter(key => key.includes('MONGO')).map(key => `${key}: ${key.includes('PASSWORD') ? 'Present (value hidden)' : process.env[key]}`);
console.log('MongoDB-related environment variables:');
console.log(mongoEnvVars.join('\n'));

const connectDB = async () => {
  try {
    // Prioritize direct MONGODB_URI from environment
    let mongoURI = process.env.MONGODB_URI;
    let connectionSource = "MONGODB_URI from environment";
    
    if (!mongoURI) {
      // Next try PUBLIC_MONGO_URI from Railway
      mongoURI = PUBLIC_MONGO_URI;
      connectionSource = "PUBLIC_MONGO_URI hardcoded value";
      console.log(`Falling back to PUBLIC_MONGO_URI`);
    }
    
    // If all else fails, use the MongoDB Atlas connection string
    if (!mongoURI) {
      mongoURI = FALLBACK_MONGO_URI;
      connectionSource = "MongoDB Atlas fallback";
      console.log(`Falling back to MongoDB Atlas connection`);
    }
    
    console.log(`Attempting MongoDB connection using ${connectionSource}`);
    
    const conn = await mongoose.connect(mongoURI, {
      // Increase timeouts
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