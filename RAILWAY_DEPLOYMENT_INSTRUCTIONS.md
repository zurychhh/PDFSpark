# PDFSpark Railway Deployment Instructions

This document provides comprehensive step-by-step instructions for deploying the PDFSpark application to Railway.app, with a special focus on resolving health check issues.

## Deployment Strategy

We will use a two-phase deployment approach:

1. **Phase 1**: Deploy the minimal health check application to verify Railway's health check system configuration works.
2. **Phase 2**: Deploy the full PDFSpark application with the verified health check configuration.

This approach allows us to isolate and test the health check mechanism separately from the main application.

## Phase 1: Deploy Minimal Health Check App

### Step 1: Prepare the Minimal Health App

The minimal health check application is located in the `minimal-health-app` directory and includes:
- `health-app.js`: A basic Node.js server that only responds to health check requests
- `Dockerfile`: Container configuration optimized for Railway
- `railway.json`: Railway configuration with health check settings
- `package.json`: Node.js project configuration

### Step 2: Deploy to Railway via Dashboard

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Select "Deploy from Source"
4. Upload the `minimal-health-app.zip` file
5. Click "Deploy"

### Step 3: Monitor Deployment

1. Once the upload is complete, wait for the build to finish
2. Check the logs to see if the health check is passing
3. If successful, you'll see logs showing the health check server starting
4. If the health check fails, review the logs to identify the issue

### Step 4: Verify Health Check

1. Generate a domain for the deployed service
2. Visit the `/health` endpoint to manually verify it's responding

## Phase 2: Deploy Full PDFSpark Application

### Step 1: Prepare the Full Application

The following files in the main application have been modified to fix health check issues:

- `backend/health-endpoint.js`: Standalone health check server
- `backend/railway-entry.js`: Modified startup sequence
- `backend/Dockerfile`: Updated with health check configuration
- `railway.json`: Railway configuration file

### Step 2: Configure Environment Variables

Before deployment, prepare the following environment variables:

```
PORT=3000
NODE_ENV=production
USE_MEMORY_FALLBACK=true
CORS_ALLOW_ALL=true
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
MONGODB_URI=your_mongodb_uri
```

### Step 3: Deploy to Railway

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Select "Deploy from Source"
4. Upload the entire project directory or ZIP file
5. Click "Deploy"

### Step 4: Set Environment Variables

After deployment starts:

1. Go to the "Variables" tab
2. Add all the environment variables listed above
3. Save changes (this will trigger a new deployment)

### Step 5: Monitor Deployment

1. Go to the "Deployments" tab
2. Watch the build and deployment progress
3. Check logs for any errors
4. Verify the health check passes

### Step 6: Generate Domain and Test

1. Go to the "Settings" tab
2. Click "Generate Domain"
3. Test the API by accessing:
   - `/api/diagnostic/health` - Should return a 200 status
   - `/api/system/health` - Should provide detailed system information
   - `/` - Should return the API root information

## Troubleshooting Guide

### Health Check Failures

If health checks fail:

1. **Check Logs**: Look for messages from the health-endpoint.js server
2. **Verify Binding**: Confirm the server is binding to `0.0.0.0` and not localhost
3. **Check Port**: Verify the port matches between environment variables and Railway config
4. **Increase Timeout**: Try increasing the health check timeout in railway.json
5. **Verify Path**: Make sure the health check path is correct in Railway config

### MongoDB Connection Issues

If MongoDB connection fails:

1. **Check URI**: Verify the MONGODB_URI environment variable is set correctly
2. **Memory Fallback**: Ensure USE_MEMORY_FALLBACK=true is set
3. **Check Logs**: Look for MongoDB connection errors in the logs

### CORS Issues

If facing CORS problems:

1. **Set CORS_ALLOW_ALL**: Ensure CORS_ALLOW_ALL=true is set
2. **Check Headers**: Verify the response contains appropriate CORS headers
3. **Test Preflight**: Test OPTIONS requests to the API

## Validating the Deployment

To validate your deployment:

1. **Health Check**: `/api/diagnostic/health` should return `{"status":"ok",...}`
2. **System Health**: `/api/system/health` should return detailed system information
3. **Memory Mode**: `/api/diagnostic/memory` should confirm memory fallback is active

## Switching to Database Mode

Once deployment is stable, you can optionally switch from memory fallback to database mode:

1. Ensure MongoDB is properly configured
2. Set USE_MEMORY_FALLBACK=false
3. Redeploy the application
4. Monitor logs for successful MongoDB connection

## Connecting Frontend to Backend

After successful backend deployment:

1. Update your frontend configuration with the new API URL
2. Rebuild and deploy the frontend
3. Test the complete application

## Conclusion

Following this two-phase approach ensures a reliable deployment to Railway, with a special focus on passing health checks. The standalone health check server guarantees Railway can detect the application as healthy, even during application startup and initialization.