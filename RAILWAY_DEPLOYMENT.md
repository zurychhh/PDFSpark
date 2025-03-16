# Comprehensive Railway Deployment Guide for PDFSpark

This guide provides detailed instructions for deploying PDFSpark to Railway, focusing on solving common issues and ensuring proper MongoDB connectivity.

## Understanding the Railway Environment

Railway is a platform that simplifies deployment but has some specific behaviors that require careful configuration:

1. **Environment Variable Handling**: Railway sometimes has inconsistent behavior with environment variables
2. **MongoDB Connectivity**: Establishing reliable MongoDB connections requires specific configuration
3. **Memory Fallback Mode**: PDFSpark includes a memory fallback mode for when database connectivity fails

## Critical Environment Variables for Railway

These environment variables must be correctly configured in your Railway project:

| Variable | Description | Recommended Value |
|----------|-------------|------------------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://username:password@your-mongodb-host:port/database` |
| `USE_MEMORY_FALLBACK` | Whether to use in-memory storage instead of MongoDB | `false` (to attempt MongoDB connection) |
| `MONGODB_CONNECTION_TIMEOUT_MS` | Connection timeout for MongoDB | `60000` (60 seconds) |
| `MONGODB_SOCKET_TIMEOUT_MS` | Socket timeout for MongoDB operations | `90000` (90 seconds) |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | Timeout for MongoDB server selection | `60000` (60 seconds) |
| `CORS_ALLOW_ALL` | Allow all CORS origins | `true` (for Railway deployment) |

### Other Required Variables

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `JWT_SECRET` | Secret key for JWT authentication | `your-secret-key` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | `your-cloud-name` |
| `CLOUDINARY_API_KEY` | Cloudinary API key | `your-api-key` |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | `your-api-secret` |
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | `whsec_...` |

## Step-by-Step Deployment Process

### 1. Prepare Your MongoDB Database

1. Create a MongoDB database (Atlas or other provider)
2. Create a database user with read/write permissions
3. Get your MongoDB connection string
4. **Important:** Ensure your MongoDB instance allows connections from Railway's IP ranges (or use 0.0.0.0/0 for testing)

### 2. Configure Your Railway Project

1. Create a new project in Railway
2. Connect your GitHub repository
3. Add environment variables:
   ```
   MONGODB_URI=mongodb://username:password@your-mongodb-host:port/database
   USE_MEMORY_FALLBACK=false
   MONGODB_CONNECTION_TIMEOUT_MS=60000
   MONGODB_SOCKET_TIMEOUT_MS=90000
   MONGODB_SERVER_SELECTION_TIMEOUT_MS=60000
   CORS_ALLOW_ALL=true
   NODE_ENV=production
   ```
4. Add other required environment variables for your application (Stripe, Cloudinary, etc.)

### 3. Deploy Your Application

1. Navigate to the Deployments tab
2. Create a new deployment from the main branch
3. Wait for the deployment to complete
4. Check the logs for any errors

## Troubleshooting MongoDB Connectivity

If your application is running in memory fallback mode, follow these steps:

### 1. Check Environment Variables

Ensure `MONGODB_URI` is correctly set and properly formatted:
- Starts with `mongodb://` or `mongodb+srv://`
- Includes username and password
- Specifies host and port
- Optionally includes database name

### 2. Check MongoDB Access

1. Verify MongoDB is running and accessible
2. Ensure your MongoDB instance allows connections from Railway's IP addresses
3. Verify the database user has correct permissions

### 3. Check Application Logs

Look for these messages in your Railway logs:
- `MongoDB Connected: [hostname]` indicates successful connection
- `🚨 MEMORY FALLBACK MODE ENABLED` indicates the app is running without MongoDB
- `MongoDB connection error: [error message]` for specific connection errors

### 4. DNS Resolution Testing

Sometimes Railway has issues resolving MongoDB hostnames:

1. Check the application logs for DNS lookup results
2. If DNS resolution fails, try using an IP address instead of hostname in your connection string
3. For MongoDB Atlas, try using the `mongodb+srv://` protocol which includes SRV record resolution

### 5. Connection Timeouts

If connections time out, try:
1. Increasing timeout values in environment variables
2. Checking network rules and firewalls
3. Testing connection from another environment

## Understanding Memory Fallback Mode

PDFSpark includes a memory fallback mode that activates when:
1. `USE_MEMORY_FALLBACK` is explicitly set to `true`
2. MongoDB connection fails after all attempts

In memory fallback mode:
- All data is stored in server memory
- Data is lost when the server restarts
- All basic functionality works, but persistence is lost

## Diagnosing Deployment Issues

Railway provides several diagnostic endpoints:

1. `/api/system/health` - Overall system health check
2. `/api/system/mongodb-diagnostics` - MongoDB connection diagnostics
3. `/api/system/memory-diagnostics` - Memory usage information

## Known Issues and Solutions

### Problem: Forced Memory Fallback Mode

**Symptoms**: Application always uses memory storage even when MongoDB URI is set correctly.

**Solution**: Check the `railway-env-fix.js` file for any lines that force `USE_MEMORY_FALLBACK=true`. Our application contains advanced logic to detect good MongoDB connections and will automatically use memory fallback if connection fails.

### Problem: Connection String Not Recognized

**Symptoms**: Logs show "MONGODB_URI is invalid or malformed" even when it looks correct.

**Solution**: Try these alternative formats:
- `mongodb://username:password@host:port/database?authSource=admin` (Add authSource)
- `mongodb+srv://username:password@host/database?retryWrites=true&w=majority` (Use SRV format for Atlas)
- `mongodb://username:password@host:port/?authSource=admin` (No database name, authSource specified)

### Problem: MongoDB Connection Timeouts

**Symptoms**: Logs show "Server selection timeout" or similar errors.

**Solution**:
1. Increase timeout values in environment variables
2. Check network rules and firewalls
3. Verify the MongoDB host is reachable from Railway

## Performance Considerations

1. **Memory Usage**: In memory fallback mode, watch for increased memory usage
2. **Restart Behavior**: Data is lost on restart in memory fallback mode
3. **Connection Pooling**: MongoDB connections use connection pooling to improve performance

## Security Best Practices

1. Store sensitive environment variables as Railway secrets
2. Use strong, unique passwords for MongoDB
3. Limit MongoDB access to only Railway's IP ranges when possible
4. Enable MongoDB authentication

## Emergency Recovery

If the application is stuck in memory fallback mode and you need persistent storage:

1. Verify your MongoDB connection string is correct
2. Set `USE_MEMORY_FALLBACK=false` in Railway environment variables
3. Restart the application
4. Check the logs for MongoDB connection errors
5. Visit `/api/system/mongodb-diagnostics` to verify connection status

By following this guide, you should be able to successfully deploy PDFSpark to Railway with proper MongoDB connectivity and avoid common pitfalls in the deployment process.