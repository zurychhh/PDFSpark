# PDFSpark Full Deployment Guide (Updated)

This comprehensive guide will walk you through the process of deploying the fixed PDFSpark application on both Railway (backend) and Vercel (frontend).

## Project Structure

The PDFSpark application consists of two main components:

1. **Frontend** - A React-based single-page application (in the root directory)
2. **Backend** - A Node.js/Express API server (in the `backend` directory)

## Prerequisites

1. A Railway account (https://railway.app)
2. A Vercel account (https://vercel.com)
3. Access to your GitHub repository
4. MongoDB database (production instance)
5. Cloudinary account for file storage

## Step 1: Deploy Backend to Railway

Since we're experiencing issues with the Railway CLI, we'll use the manual deployment approach:

### Option A: Deploy via Railway Dashboard (Recommended)

1. **Log in** to your Railway account at https://railway.app
2. **Create a new project** or use your existing PDFSpark project
3. **Add a new service** from the Railway dashboard:
   - Click "New Service" and select "GitHub Repo"
   - Connect to your GitHub repository and select the `react-pdfspark` repository
   - Select the `fix-railway-health-check` branch

4. **Configure the service**:
   - Build Command: Leave as default (Dockerfile detected)
   - Environment: Set the following variables:
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
   - Add any additional environment variables:
     ```
     MONGODB_URI=your_mongodb_uri
     CLOUDINARY_CLOUD_NAME=your_cloud_name
     CLOUDINARY_API_KEY=your_api_key
     CLOUDINARY_API_SECRET=your_api_secret
     ```

5. **Configure health check**:
   - In the "Settings" tab:
   - Health Check Path: `/health`
   - Health Check Timeout: 120 seconds
   - Health Check Interval: 15 seconds
   - Restart Policy: On Failure
   - Max Restarts: 10

6. **Deploy the service**:
   - Click "Deploy" and wait for the build to complete
   - Monitor the logs for any errors

### Option B: Manual Upload with Fixed Files

If you're still having issues with the GitHub integration:

1. **Download** the `fixed-railway-deployment.zip` file from this repository
2. **Extract** the files to a local directory
3. **Create a new project** in Railway dashboard
4. **Add a new service** from GitHub or direct upload:
   - If using direct upload, upload the extracted `fixed-railway-deployment` folder
5. **Configure the service** as described in Option A above
6. **Deploy** and monitor logs

## Step 2: Verify Railway Deployment

After deploying to Railway:

1. **Check the service logs** for any errors
2. **Test the health endpoint** at `your-railway-service-url/health`
3. **Copy the service URL** for configuring the frontend

## Step 3: Deploy Frontend to Vercel

Now that the backend is running, let's deploy the frontend:

1. **Log in** to your Vercel account at https://vercel.com
2. **Create a new project** or use your existing PDFSpark project
3. **Import your GitHub repository**:
   - Connect to GitHub and select the `react-pdfspark` repository
   - Select the `fix-railway-health-check` branch

4. **Configure the project**:
   - Framework Preset: Vite
   - Build Command: `vite build`
   - Output Directory: `dist`
   - Install Command: `npm install`

5. **Set environment variables**:
   ```
   VITE_API_URL=your_railway_service_url
   VITE_API_BASE_URL=your_railway_service_url/api
   VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
   VITE_MOCK_API=false
   VITE_MOCK_CLOUDINARY=false
   VITE_PREMIUM_ENABLED=true
   VITE_ANALYTICS_ENABLED=true
   VITE_MAX_FILE_SIZE_FREE=5
   VITE_MAX_FILE_SIZE_PREMIUM=100
   ```

6. **Deploy** the frontend
7. **Verify** the deployment by accessing the Vercel app URL

## Step 4: Test End-to-End Functionality

After both services are deployed:

1. **Access** the Vercel frontend URL
2. **Test file upload** functionality
3. **Test PDF conversion** with various formats
4. **Check Cloudinary integration** is working properly
5. **Verify error handling** and fallback mechanisms

## Troubleshooting Common Issues

### Backend (Railway) Issues

1. **Health Check Failures**:
   - Check logs for specific error messages
   - Ensure the health endpoint is accessible at `/health`
   - Verify the container is binding to `0.0.0.0` and not just localhost

2. **Memory Issues**:
   - If you see "out of memory" errors, consider upgrading your Railway plan
   - Ensure memory optimization settings are properly configured

3. **MongoDB Connection Issues**:
   - Verify your MongoDB URI is correctly configured
   - Check network rules to ensure Railway can access your MongoDB

### Frontend (Vercel) Issues

1. **API Connection Errors**:
   - Check that `VITE_API_URL` points to the correct Railway service URL
   - Ensure CORS is properly configured on the backend
   - Verify API requests in browser dev tools

2. **Cloudinary Integration Issues**:
   - Verify Cloudinary credentials are correctly set
   - Check browser console for Cloudinary-specific errors

## Monitoring & Maintenance

1. **Set up Railway monitoring**:
   - Enable notifications for service outages
   - Regularly check logs for memory warnings

2. **Configure Vercel analytics**:
   - Enable Vercel Analytics to track frontend usage
   - Monitor for client-side errors

3. **Regular database backups**:
   - Set up automated MongoDB backups

4. **Cloudinary monitoring**:
   - Monitor storage and bandwidth usage
   - Set up alerts for quota limits

## Next Steps

1. **Set up CI/CD**:
   - Configure automated deployments with GitHub Actions
   - Set up testing before deployment

2. **Implement monitoring**:
   - Add New Relic, Datadog, or similar monitoring solutions
   - Configure error tracking with Sentry

3. **Performance optimization**:
   - Implement caching strategies
   - Optimize conversion algorithms

For any issues with this deployment, please contact support or open an issue on the GitHub repository.