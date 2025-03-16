const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // These options are no longer needed in Mongoose 6+ but added for compatibility
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // Set a shorter connection timeout (default is 30000ms)
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
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