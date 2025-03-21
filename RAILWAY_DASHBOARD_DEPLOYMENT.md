# Railway Dashboard Deployment Guide

This guide provides step-by-step instructions for deploying the PDFSpark application using the Railway dashboard.

## Step 1: Use the Railway Dashboard

1. Open your browser and go to: https://railway.app/dashboard
2. Log in with your credentials

## Step 2: Create a New Project

1. Click the "New Project" button
2. Select "Deploy from GitHub" option 
3. Connect to your GitHub account if not already connected
4. Select the `zurychhh/PDFSpark` repository
5. Choose the `fix-railway-health-check` branch we just created

## Step 3: Configure Deployment Settings

1. In the project settings, set the following:

   - **Docker Configuration**:
     - Under "Settings" choose "Builder: Dockerfile"
     - Set "Dockerfile Path" to `backend/Dockerfile`

   - **Health Check Settings**:
     - Path: `/health`
     - Timeout: 300 seconds
     - Interval: 30 seconds
     - Restart Policy: On Failure
     - Max Restarts: 10

   - **Environment Variables**:
     ```
     USE_MEMORY_FALLBACK=true
     MEMORY_MANAGEMENT_AGGRESSIVE=true
     NODE_OPTIONS=--max-old-space-size=2048 --expose-gc
     TEMP_DIR=/tmp
     UPLOAD_DIR=/tmp/uploads
     LOG_DIR=/tmp/logs
     MEMORY_WARNING_THRESHOLD=0.60
     MEMORY_CRITICAL_THRESHOLD=0.75
     MEMORY_EMERGENCY_THRESHOLD=0.85
     MAX_CONCURRENCY=2
     CORS_ALLOW_ALL=true
     ```

   - **Add your database and other credentials**:
     ```
     MONGODB_URI=your_mongodb_uri
     CLOUDINARY_CLOUD_NAME=your_cloud_name
     CLOUDINARY_API_KEY=your_api_key
     CLOUDINARY_API_SECRET=your_api_secret
     ```

## Step 4: Deploy and Monitor

1. Click "Deploy" to start the deployment process
2. Monitor the build logs for any errors
3. Watch the deployment status and health check status

## Step 5: Test the Deployment

1. Once deployed, click on the service URL to open the application
2. Test the `/health` endpoint by appending "/health" to the URL
3. Verify that the health check is returning a 200 status

## Step 6: Debug Health Check Issues (If Needed)

If health checks still fail after the optimized deployment:

1. Check the logs for specific error messages
2. Try increasing the health check timeout even further
3. Consider using the minimal health app first to test Railway's health check system

## Step 7: Update Frontend Configuration

If the backend deploys successfully:

1. Update the frontend configuration with the new Railway URL
2. Deploy the frontend to Vercel
3. Test end-to-end functionality

## Alternative: Deploy the Minimal Health Check App First

If you're still experiencing issues, try deploying the minimal health check app first:

1. Create a new project in Railway
2. Choose "Deploy from Dockerfile"
3. Upload the `railway-deployment-minimal.zip` file
4. Configure health check settings
5. Deploy and test

This minimal app will help verify if the Railway health check system is working properly before deploying the full application.

## Final Notes

The optimized Dockerfile and configuration we've created should address the health check issues. The key improvements are:

1. Binding to 0.0.0.0 explicitly
2. Starting the health check before the main application
3. Using a startup script to ensure health check availability
4. More lenient timeout settings for Railway health checks

If you continue to face issues, consider trying an alternative hosting provider like Render, Fly.io, or DigitalOcean.