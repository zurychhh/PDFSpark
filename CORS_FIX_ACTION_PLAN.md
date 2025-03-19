# PDFSpark CORS Fix Action Plan

This document outlines the step-by-step plan to fix CORS issues between the Vercel frontend and Railway backend, along with instructions for checking and redeploying the backend if necessary.

## Current Status

- **Frontend**: Deployed at https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app
- **Backend**: Deployed at https://pdfspark-production-production.up.railway.app
- **Issue**: The backend health check is failing, and CORS configuration needs to be updated to allow cross-origin requests from the frontend.

## Action Plan Scripts

We've created several scripts to help diagnose and fix these issues:

1. **check-railway-status.sh** - Checks the current status of the Railway deployment and CORS configuration
2. **redeploy-railway-backend.sh** - Redeploys the backend to Railway with optimized settings
3. **enhanced-cors-fix.sh** - Updates CORS configuration to allow requests from the frontend
4. **verify-deployment.sh** - Runs a comprehensive verification of the deployment

## Step-by-Step Instructions

### Step 1: Check Current Status

Run the status check script to see if the backend is accessible and properly configured:

```bash
./check-railway-status.sh
```

This will:
- Check if the Railway CLI is set up correctly
- Link to your Railway project
- Show deployment status
- Test backend connectivity
- Check current CORS configuration

### Step 2: Redeploy the Backend (if needed)

If the backend is not accessible or not configured correctly, redeploy it:

```bash
./redeploy-railway-backend.sh
```

This will:
- Set up all required environment variables for Railway's constrained environment
- Configure memory fallback mode, temporary directory settings, and CORS
- Set up Cloudinary integration (you'll need your Cloudinary credentials)
- Deploy the application to Railway

### Step 3: Fix CORS Configuration

After the backend is deployed and accessible, configure CORS:

```bash
./enhanced-cors-fix.sh
```

This will:
- Test if the backend is accessible
- Check current CORS configuration
- Set appropriate CORS environment variables
- Prompt for redeployment to apply changes

### Step 4: Verify the Deployment

After redeployment is complete, verify that everything is working correctly:

```bash
./verify-deployment.sh
```

This will:
- Test backend connectivity
- Check CORS headers
- Test API endpoints
- Simulate a file upload request

### Step 5: Update Frontend Configuration (if needed)

If the backend URL has changed or the frontend isn't configured correctly:

```bash
./update-frontend-config.sh
```

This will:
- Update local environment files
- Update Vercel configuration
- Prepare for frontend redeployment

## Troubleshooting

### Backend Not Accessible

If the backend health check fails:
- Check the Railway dashboard to see if the service is running
- Look for deployment errors in Railway logs
- Make sure the URL is correct (https://pdfspark-production-production.up.railway.app)
- Try redeploying with `redeploy-railway-backend.sh`

### CORS Still Not Working

If CORS errors persist after applying fixes:
- Verify that `CORS_ALLOW_ALL=true`, `CORS_ORIGIN`, and `ALLOWED_ORIGINS` are correctly set
- Make sure the frontend URL is exact (https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app)
- Check the Railway logs for any CORS-related messages
- Try testing with a different browser
- Use the browser developer console to see detailed error messages

### Frontend Can't Connect

If the frontend can't connect to the backend:
- Check network requests in the browser developer tools
- Verify that the frontend is configured with the correct backend URL
- Test API endpoints directly using `curl` or Postman
- Ensure the backend is accessible from public internet

## Important Notes

1. **Railway Environment Constraints**: 
   - Railway uses an ephemeral filesystem, so temporary files must be in `/tmp`
   - Memory is constrained, so memory fallback mode is important

2. **Cloudinary Integration**:
   - Cloudinary is essential for storing files in Railway's environment
   - Make sure your Cloudinary credentials are correctly set

3. **Memory Management**:
   - `USE_MEMORY_FALLBACK=true` enables in-memory storage as a fallback
   - `MEMORY_MANAGEMENT_AGGRESSIVE=true` enables proactive memory cleanup

4. **Deployment Time**:
   - Railway deployments can take several minutes to complete
   - Check the Railway dashboard for deployment status