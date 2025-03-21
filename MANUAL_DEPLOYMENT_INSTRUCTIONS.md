# PDFSpark Manual Deployment Instructions

Since we're experiencing issues with the Railway CLI deployment process, here are manual deployment instructions using the Railway dashboard.

## Step 1: Download Deployment Packages

We've created two optimized deployment packages:

1. **Minimal Health Check App** - For testing if Railway health checks can work
2. **Optimized PDFSpark Backend** - With enhanced health check implementation

Both packages contain all the necessary files for deployment.

## Step 2: Deploy Using Railway Dashboard

### Option 1: Deploy the Minimal Health Check First (Recommended)

1. Go to the Railway dashboard: https://railway.app/dashboard
2. Create a new project or use an existing one
3. Click "Deploy from Dockerfile"
4. Upload the `railway-deployment-minimal.zip` file
5. Configure the following settings:
   - Health Check Path: `/health`
   - Health Check Timeout: 60 seconds
   - Health Check Interval: 15 seconds
6. Deploy and wait for the health check to pass

### Option 2: Deploy the Full Optimized Backend

1. Go to the Railway dashboard: https://railway.app/dashboard
2. Create a new project or use an existing one
3. Click "Deploy from Dockerfile"
4. Upload the `railway-deployment-optimized.zip` file
5. Configure the following environment variables:
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
6. Configure health check settings:
   - Health Check Path: `/health`
   - Health Check Timeout: 300 seconds
   - Health Check Interval: 30 seconds
7. Deploy and monitor the logs

### Option 3: Deploy via GitHub (Alternative)

1. Go to the Railway dashboard
2. Create a new project
3. Click "Deploy from GitHub"
4. Connect your GitHub account if needed
5. Select the `zurychhh/PDFSpark` repository
6. Select the `fix-railway-health-check` branch
7. Configure the environment variables and health check settings as in Option 2
8. Deploy

## Step 3: Verify Deployment

After deploying, check the following:

1. Verify the deployment status in the Railway dashboard
2. Check if the health check is passing
3. Access the `/health` endpoint directly to test it
4. Review the logs for any errors

## Step 4: Update Frontend (If Needed)

If the backend deploys successfully:

1. Update the frontend configuration to point to the new Railway URL
2. Deploy the frontend to Vercel or your preferred hosting
3. Test end-to-end functionality

## Troubleshooting

If you continue to experience issues:

1. **Check Logs**: Railway provides detailed logs that can help identify issues
2. **Increase Timeouts**: Try increasing the health check timeout and interval even further
3. **Consider Alternative Hosting**: If Railway consistently fails, consider Render, Fly.io, or DigitalOcean

The optimized Dockerfile and configuration should address the health check issues that were preventing successful deployment.