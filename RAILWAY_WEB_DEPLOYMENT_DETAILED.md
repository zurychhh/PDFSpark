# PDFSpark Railway Web Deployment - Detailed Guide

This detailed guide will walk you through deploying PDFSpark's backend to Railway using the web interface, with special focus on configuration details.

## Step 1: Prepare Repository for Deployment

First, ensure your repository has all the necessary files correctly configured:

- **Dockerfile** - With proper port settings and environment variables
- **railway.json** - With healthcheck and builder configuration
- **railway-entry.js** - Entry script with diagnostics
- **backend/index.js** - Contains the health endpoint implementation

## Step 2: Access Railway Dashboard

1. Open your browser and go to: **[https://railway.app/dashboard](https://railway.app/dashboard)**
2. Sign in with your account credentials
3. You should land on the main dashboard showing your existing projects (if any)

## Step 3: Create a New Project

1. Click the **"New Project"** button in the top-right corner
2. In the modal that appears, select **"Deploy from GitHub repo"**
3. If you haven't connected your GitHub account yet:
   - Click **"Connect GitHub"**
   - Authorize Railway to access your repositories
   - Choose whether to give access to all repositories or just select ones

4. Find your **react-pdfspark** repository in the list
5. Select it and click **"Deploy Now"**

## Step 4: Initial Deployment Configuration

Once you've selected your repository:

1. Railway will automatically detect your **Dockerfile** since it's at the project root
2. The system will use your **railway.json** file for deployment configuration
3. Your first deployment will start automatically
4. You'll be taken to the deployment overview page
5. Wait for the initial build to complete (it may fail due to missing environment variables)

## Step 5: Configure Environment Variables

1. Click on your newly created service (it should be named after your repository)
2. Go to the **"Variables"** tab
3. Click **"+ New Variable"** to add each of the following variables:

   ```
   NODE_ENV=production
   PORT=3000
   USE_MEMORY_FALLBACK=true
   CORS_ALLOW_ALL=true
   TEMP_DIR=/app/temp
   UPLOAD_DIR=/app/uploads
   LOG_DIR=/app/logs
   CLOUDINARY_CLOUD_NAME=dciln75i0
   CLOUDINARY_API_KEY=756782232717326
   CLOUDINARY_API_SECRET=your_secret_here
   ```

4. After adding all variables, click **"Save Variables"**
5. This will trigger a new deployment with your environment variables

## Step 6: Monitor Deployment Status

1. Go to the **"Deployments"** tab
2. Click on the latest deployment to see detailed logs
3. Watch for any errors or warnings
4. The successful deployment should show a green "Success" status

## Step 7: Configure Health Check (If Needed)

If your deployment fails due to health check issues:

1. Go to the **"Settings"** tab
2. Scroll down to the **"Health Check"** section
3. Ensure the path is set to **/health**
4. Increase the timeout to **30 seconds**
5. Click **"Save Changes"**

## Step 8: Access Your Deployed Application

Once deployment succeeds:

1. Go to the **"Settings"** tab
2. Find the **"Domains"** section
3. You'll see your automatically generated Railway domain (e.g., `pdfspark-production.up.railway.app`)
4. Click on this domain to open your application
5. Add `/health` to the URL to test your health endpoint
   - Example: `https://pdfspark-production.up.railway.app/health`
   - You should see: `{"status":"ok","message":"Server is running"}`

## Step 9: Configure Frontend to Use New Backend

1. Open your frontend configuration files:
   - `vercel.json`
   - `.env.production`

2. Update API URLs to use your new Railway domain:
   ```
   VITE_API_URL=https://your-railway-domain.up.railway.app
   VITE_API_BASE_URL=https://your-railway-domain.up.railway.app/api
   ```

3. Redeploy your frontend on Vercel

## Step 10: Verify Complete Integration

1. Test the full application flow:
   - File upload
   - Conversion operations
   - File download

2. Check Railway logs for any errors or performance issues

## Common Issues and Solutions

### Deployment Fails with "Health Check Failed"

**Problem**: Railway cannot access your health endpoint
**Solution**:
- Ensure `/health` endpoint exists in backend/index.js
- Check that the endpoint responds with a 200 status code
- Verify PORT=3000 is set consistently
- Increase healthcheck timeout to 30 seconds in Settings

### Memory Issues

**Problem**: Application crashes or becomes unresponsive
**Solution**:
- Ensure USE_MEMORY_FALLBACK=true is set
- Check the logs for memory-related errors
- Consider upgrading your Railway plan for more resources

### Cloudinary Integration Issues

**Problem**: Files not being stored or retrieved
**Solution**:
- Verify all three Cloudinary environment variables are set correctly
- Check logs for Cloudinary-related errors
- Ensure the API credentials have proper permissions

### Docker Build Failures

**Problem**: Deployment fails during build phase
**Solution**:
- Check logs for specific build errors
- Ensure Dockerfile is correctly formatted
- Verify all required files are present in the repository

## Adjusting Application Settings

After deployment, you can modify any settings through the Railway dashboard:

1. **Scale your application**:
   - Go to Settings > Resources
   - Adjust CPU and memory allocation as needed

2. **Update environment variables**:
   - Go to Variables tab
   - Modify, add, or remove variables as needed

3. **Set up custom domains**:
   - Go to Settings > Domains
   - Click "Add Custom Domain" and follow the instructions

## Useful Railway Features

1. **Metrics monitoring**:
   - Go to the Metrics tab to view CPU, memory usage, and request statistics

2. **Deployment history**:
   - Go to the Deployments tab to see all past deployments
   - You can roll back to a previous deployment if needed

3. **Logs**:
   - View real-time logs from the Logs tab
   - Filter logs by level or search for specific text

4. **Automatic deployments**:
   - Enable automatic deployments from GitHub in the Settings tab
   - Configure branch rules for deployment
