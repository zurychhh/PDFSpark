# Manual Railway Deployment Guide

This guide provides step-by-step instructions for manually deploying the minimal health check application and the full PDFSpark application to Railway.

## Deploying the Minimal Health Check Application

### Step 1: Prepare the deployment package
The minimal health check application is already prepared in the `minimal-health-app` directory and zipped as `minimal-health-app.zip`.

### Step 2: Create a new Railway project
1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. If you don't want to use GitHub:
   - Select "Empty Project" instead
   - Once created, click "New Service" > "Deploy from GitHub repo"
   - Then choose "Deploy from Image"

### Step 3: Upload the application
1. In your new project, click "Deploy from Source"
2. Click "Browse" and select the `minimal-health-app.zip` file
3. Click "Deploy"

### Step 4: Configure the deployment
1. Once the upload is complete, go to the "Variables" tab
2. Add the following environment variables:
   - `PORT`: 3000
   - `NODE_ENV`: production

### Step 5: Monitor the deployment
1. Go to the "Deployments" tab to monitor the build and deployment progress
2. Once deployed, go to the "Settings" tab
3. Scroll down to "Health Check" settings:
   - Ensure the path is set to `/health`
   - Set Interval to 15 seconds
   - Set Timeout to 60 seconds
   - Save changes

### Step 6: Access the application
1. Once the deployment is successful, go to the "Deployments" tab
2. Click on the latest deployment
3. In the top-right corner, click "Generate Domain"
4. Access the generated domain to verify the application is working

## Deploying the Full PDFSpark Application

### Step 1: Prepare the full application
The optimized PDFSpark backend application is in the main directory.

### Step 2: Create a new Railway project
1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Select "Deploy from GitHub repo" or "Empty Project" as preferred

### Step 3: Upload the application
1. In your new project, click "Deploy from Source"
2. Click "Browse" and select the entire project directory or use ZIP file
3. Click "Deploy"

### Step 4: Configure the deployment
1. Go to the "Variables" tab
2. Add ALL required environment variables:
   - `PORT`: 3000
   - `NODE_ENV`: production
   - `MONGODB_URI`: (your MongoDB connection string)
   - `CLOUDINARY_CLOUD_NAME`: (your Cloudinary cloud name)
   - `CLOUDINARY_API_KEY`: (your Cloudinary API key)
   - `CLOUDINARY_API_SECRET`: (your Cloudinary API secret)
   - `USE_MEMORY_FALLBACK`: true
   - Any other required variables for your specific setup

### Step 5: Configure health check
1. Go to the "Settings" tab
2. Scroll down to "Health Check" settings:
   - Set the path to `/api/diagnostic/health`
   - Set Interval to 15 seconds
   - Set Timeout to 60 seconds
   - Save changes

### Step 6: Monitor the deployment
1. Go to the "Deployments" tab to monitor the build and deployment progress
2. Check the logs for any errors
3. Once deployed successfully, verify the health check is passing

### Step 7: Access the application
1. Once the deployment is successful, generate a domain
2. Access the generated domain to verify the application is working

## Troubleshooting

If deployment fails at the health check stage:

1. Check the logs to see what's happening
2. Verify the health check path is correct
3. Ensure the application is binding to `0.0.0.0` and not just localhost
4. Try increasing the health check timeout
5. Verify the Docker container is correctly exposing the port

## Once Deployed Successfully

After successfully deploying the minimal health check app and verifying it works:

1. Apply the same configuration patterns to the full application
2. Update your frontend configuration to point to the new backend URL
3. Test the complete application end-to-end