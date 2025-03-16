const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Try to use Railway MongoDB connection string if available
    // Otherwise fall back to regular MONGODB_URI
    let mongoURI = process.env.MONGODB_URI;
    
    if (process.env.MONGOHOST && process.env.MONGOUSER && process.env.MONGOPASSWORD) {
      // Construct connection string from Railway variables
      mongoURI = `mongodb://${process.env.MONGOUSER}:${process.env.MONGOPASSWORD}@${process.env.MONGOHOST}:${process.env.MONGOPORT || '27017'}/pdfspark?authSource=admin`;
      console.log(`Using Railway MongoDB configuration. Host: ${process.env.MONGOHOST}`);
    }
    
    if (!mongoURI) {
      throw new Error('MongoDB connection string not provided');
    }

    const conn = await mongoose.connect(mongoURI, {
      // These options are no longer needed in Mongoose 6+ but added for compatibility
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // Increase timeouts for Railway
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    // Don't exit the process, just throw the error so it can be caught by the caller
    throw error;
  }
};

module.exports = connectDB;