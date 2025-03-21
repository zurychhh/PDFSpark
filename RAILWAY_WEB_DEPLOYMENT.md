# PDFSpark Railway Web Deployment Guide

This guide walks you through deploying the PDFSpark backend to Railway using the web interface instead of the CLI.

## Step 1: Prepare Your Repository

Ensure your repository has the following essential files:

- `Dockerfile` - With proper port configuration and entry script
- `railway.json` - With correct healthcheck and startup configuration
- `railway-entry.js` - Entry script for Railway deployment

## Step 2: Sign In to Railway Web Interface

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Sign in with your account

## Step 3: Create a New Project

1. Click "New Project" button
2. Select "Deploy from GitHub repo"
3. Connect to your GitHub account if not already connected
4. Find and select your PDFSpark repository
5. Select the branch you want to deploy (typically `main`)

## Step 4: Configure the Deployment

Once the repository is connected:

1. Railway will detect the Dockerfile and use it automatically
2. Click on your newly created service
3. Go to the "Variables" tab
4. Add all required environment variables:
   - NODE_ENV=production
   - PORT=3000
   - USE_MEMORY_FALLBACK=true
   - CORS_ALLOW_ALL=true
   - TEMP_DIR=/app/temp
   - UPLOAD_DIR=/app/uploads
   - LOG_DIR=/app/logs
   - CLOUDINARY_CLOUD_NAME=dciln75i0
   - CLOUDINARY_API_KEY=756782232717326
   - CLOUDINARY_API_SECRET=(your secure API secret)

## Step 5: Deploy the Application

1. Go to the "Deployments" tab
2. Click "Deploy Now" to trigger a deployment
3. Wait for the build and deployment process to complete

## Step 6: Monitor the Deployment

1. Click on the latest deployment to see build logs
2. Review logs for any errors or warnings
3. Wait for the deployment status to change to "Success"

## Step 7: Access Your Application

Once deployed:

1. Go to the "Settings" tab for your service
2. Find the "Domains" section
3. Railway will automatically generate a domain for your app
4. Click on the domain to open your application
5. Test the health endpoint by adding `/health` to the URL

## Step 8: Configure Frontend

With a successful backend deployment:

1. Update your frontend's configuration files:
   - `vercel.json`
   - `.env.production`

2. Replace API URL references with your new Railway domain:
   ```
   VITE_API_URL=https://your-railway-domain.railway.app
   VITE_API_BASE_URL=https://your-railway-domain.railway.app/api
   ```

3. Redeploy your frontend on Vercel if needed

## Troubleshooting Common Issues

### Build Failures

- Check for syntax errors in your Dockerfile
- Ensure your package.json has all required dependencies
- Verify railway.json is formatted correctly

### Deployment Failures

- Check if the health endpoint is responding with a 200 status code
- Verify all environment variables are set correctly
- Look for memory issues or port binding problems in logs

### Health Check Failures

- Ensure the `/health` endpoint is implemented in your backend/index.js file
- Verify the health endpoint responds within the timeout period (30 seconds)
- Check logs for any startup errors that might prevent the health endpoint from functioning

### Cloudinary Integration Issues

- Verify all Cloudinary credentials are correct
- Ensure USE_MEMORY_FALLBACK=true is set if Cloudinary credentials are missing
