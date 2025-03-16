# Railway Deployment Guide for PDFSpark

This document provides detailed instructions for deploying PDFSpark to Railway with proper database connectivity.

## Environment Variables Setup

For proper MongoDB connectivity, you must configure the following environment variables in your Railway project:

### Critical Variables

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://username:password@cluster.mongodb.net/dbname?retryWrites=true&w=majority` |
| `USE_MEMORY_FALLBACK` | Set to false to use MongoDB or true to use memory only | `false` |
| `MONGODB_CONNECTION_TIMEOUT_MS` | Timeout for MongoDB connection in milliseconds | `60000` |
| `MONGODB_SOCKET_TIMEOUT_MS` | Timeout for MongoDB operations in milliseconds | `90000` |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | Timeout for MongoDB server selection in milliseconds | `60000` |

### Other Required Variables

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `JWT_SECRET` | Secret key for JWT authentication | `your-secret-key` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | `your-cloud-name` |
| `CLOUDINARY_API_KEY` | Cloudinary API key | `your-api-key` |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | `your-api-secret` |
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | `whsec_...` |

## Troubleshooting Checklist

If your deployment is experiencing issues, check the following:

1. **MongoDB Connection**:
   - Verify that `MONGODB_URI` is correctly set in Railway environment variables
   - Ensure the database user has appropriate permissions
   - Check that your IP address or Railway's IP addresses are whitelisted in MongoDB Atlas

2. **Memory Fallback Mode**:
   - If `USE_MEMORY_FALLBACK=true`, the application is using in-memory storage only
   - All data will be lost when the application restarts
   - This should only be used for testing or when MongoDB is unavailable

3. **Checking Application Status**:
   - Visit `/api/system/health` to check the overall application health
   - Visit `/api/system/mongodb-diagnostics` for detailed MongoDB connectivity information
   - Visit `/api/system/memory-diagnostics` to check the status of in-memory storage

## Manual Database Setup

If you need to set up a new MongoDB database for PDFSpark:

1. Create a MongoDB Atlas account (free tier available)
2. Create a new cluster
3. Create a database user with read/write access
4. Whitelist all IPs (0.0.0.0/0) for development or specific IPs for production
5. Copy the connection string and replace username, password and dbname
6. Add the connection string as MONGODB_URI in Railway environment variables

## Emergency Recovery

If the application is stuck in memory fallback mode and you need persistent storage:

1. Verify your MongoDB connection string is correct
2. Set `USE_MEMORY_FALLBACK=false` in Railway environment variables
3. Restart the application
4. Check the logs for MongoDB connection errors
5. Visit `/api/system/mongodb-diagnostics` to verify connection status

## Checking Logs

To diagnose connection issues, look for these patterns in the logs:

- `🚨 MEMORY FALLBACK MODE ENABLED` indicates the app is running without a database
- `MongoDB Connected: [hostname]` indicates successful database connection
- `MongoDB connection error: [error message]` indicates a connection failure

Remember that in memory mode, all data is lost when the application restarts!