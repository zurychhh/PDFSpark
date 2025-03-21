# PDFSpark Railway Deployment Options

This document outlines all available deployment options for the PDFSpark application on Railway.app.

## Deployment Packages

We've created the following deployment packages:

1. **minimal-health-app.zip**
   - Purpose: Test Railway health check functionality in isolation
   - Contents: Minimal Node.js app that only responds to health checks
   - Use this first to verify health checks work properly

2. **pdfspark-railway.zip**
   - Purpose: Deploy the full PDFSpark application
   - Contents: Complete backend application with health check fixes
   - Use this after confirming health checks work with the minimal app

3. **health-check-fix-only.zip**
   - Purpose: Fix health check issues on an existing deployment
   - Contents: Only the files needed to fix health checks
   - Use this if you need to update an existing deployment

## Deployment Methods

### Option 1: Railway Dashboard (Web UI)

**Pros:**
- Most reliable method
- Visual progress tracking
- Easy environment variable configuration
- No timeouts or CLI issues

**Steps:**
1. Log in to the [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Select "Deploy from Source"
4. Upload your chosen deployment package
5. Configure environment variables
6. Monitor the deployment

**Detailed Instructions:** See `RAILWAY_DEPLOYMENT_INSTRUCTIONS.md`

### Option 2: Railway CLI

**Pros:**
- Command-line automation
- Local directory deployment

**Known Issues:**
- Timeout problems with large projects
- Connection reliability issues

**Steps:**
```bash
# Log in to Railway
railway login

# Navigate to project directory
cd /path/to/project

# Deploy (with extended timeout)
RAILWAY_CLI_TIMEOUT=300 railway up --timeout 300 --detach

# Check status
railway status
```

**Note:** Due to persistent timeout issues, we recommend using the Dashboard or API methods instead.

### Option 3: Railway API (Advanced)

**Pros:**
- Fully automated deployment
- No timeout issues
- Suitable for CI/CD pipelines

**Cons:**
- More complex setup
- Requires API token

**Steps:**
1. Get an API token from Railway
2. Set the token as an environment variable
3. Run the API deployment script

```bash
# Set your Railway API token
export RAILWAY_API_TOKEN="your_token_here"

# Run deployment script
./railway-api-deploy.sh
```

**Customization Options:**
```bash
# Deploy with custom configuration
PROJECT_NAME="PDFSpark Test" \
ENVIRONMENT_NAME="staging" \
DEPLOYMENT_PACKAGE="minimal-health-app.zip" \
./railway-api-deploy.sh
```

## Environment Variable Configuration

Whichever deployment method you choose, configure these environment variables:

**Required Variables:**
```
PORT=3000
NODE_ENV=production
USE_MEMORY_FALLBACK=true
CORS_ALLOW_ALL=true
```

**Optional Variables (if using MongoDB):**
```
MONGODB_URI=your_mongodb_uri
```

**Optional Variables (if using Cloudinary):**
```
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## Health Check Verification

After deployment, verify your health check is working:

1. Access `/api/diagnostic/health` through your Railway domain
2. Should return a 200 response with JSON: `{"status":"ok",...}`
3. Check Railway logs for "Health check server started" message
4. Verify in the Railway dashboard that health checks are passing

## Troubleshooting

### Common Issues and Solutions

- **Deployment Times Out:** Use Dashboard or API deployment instead of CLI
- **Health Check Fails:** Verify the health check path in railway.json matches your endpoint
- **Container Crashes:** Check logs for errors, ensure USE_MEMORY_FALLBACK=true is set
- **Database Connection Fails:** Verify MONGODB_URI is correct, or set USE_MEMORY_FALLBACK=true

### Log Analysis

Railway provides logs for each deployment. Look for these specific messages:

- "Health check server started on port 3000" - Confirms health endpoint is running
- "Health check requested, responding with 200 OK" - Confirms Railway is checking the endpoint
- "Server successfully running on 0.0.0.0:3000" - Confirms main app started

## Next Steps After Successful Deployment

Once your backend is successfully deployed:

1. Generate a public domain for the service
2. Update your frontend configuration to point to the new backend URL
3. Deploy your frontend application
4. Test the complete system end-to-end