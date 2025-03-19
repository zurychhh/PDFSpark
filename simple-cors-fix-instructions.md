# Simple CORS Fix Instructions for PDFSpark

Since the CLI commands might be causing issues, here's a simple, step-by-step manual approach to fix the CORS and backend deployment issues.

## Current Status
- Frontend URL: https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app
- Backend URL: https://pdfspark-production-production.up.railway.app
- Issue: CORS configuration needs to be updated and backend may need redeployment

## Step 1: Check Backend Status Manually

Run this command to check if the backend is accessible:

```bash
curl -I https://pdfspark-production-production.up.railway.app/health
```

If you don't get a successful response (HTTP 200), the backend needs to be redeployed.

## Step 2: Update Railway Configuration (Manual Approach)

### Log in to Railway Dashboard

1. Go to https://railway.app/dashboard
2. Log in with your credentials
3. Select the "pdfspark-ch1" project
4. Select the "pdfspark-ch1" service in the "production" environment

### Update Environment Variables

Add or update these critical environment variables:

```
# CORS Configuration
CORS_ALLOW_ALL=true
CORS_ORIGIN=https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app
ALLOWED_ORIGINS=https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app

# Memory optimization
USE_MEMORY_FALLBACK=true
MEMORY_MANAGEMENT_AGGRESSIVE=true
NODE_OPTIONS=--max-old-space-size=2048

# File storage
TEMP_DIR=/tmp
UPLOAD_DIR=/tmp/uploads
LOG_DIR=/tmp/logs

# Core settings
NODE_ENV=production
PORT=3000
```

### Cloudinary Configuration

Make sure these Cloudinary settings are also present:

```
CLOUDINARY_CLOUD_NAME=dciln75i0
CLOUDINARY_API_KEY=756782232717326
CLOUDINARY_API_SECRET=[your_secret]
CLOUDINARY_SOURCE_FOLDER=pdfspark_railway_sources
CLOUDINARY_RESULT_FOLDER=pdfspark_railway_results
CLOUDINARY_MAX_CONCURRENT_UPLOADS=3
```

### Redeploy the Service

After updating the environment variables:

1. Click the "Deploy" button in the Railway dashboard
2. Wait for the deployment to complete (this may take a few minutes)

## Step 3: Verify CORS Configuration Manually

After the deployment completes, check the CORS configuration:

```bash
curl -I -X OPTIONS \
  -H "Origin: https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  https://pdfspark-production-production.up.railway.app/health
```

Look for response headers like:
```
Access-Control-Allow-Origin: https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app
Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE
```

## Step 4: Update Frontend Configuration (if needed)

If the backend URL has changed, you'll need to update your frontend configuration in Vercel:

1. Go to https://vercel.com/dashboard
2. Select your PDFSpark project
3. Go to Settings > Environment Variables
4. Update the following environment variables:
   - `VITE_API_URL=https://pdfspark-production-production.up.railway.app`
   - `VITE_API_BASE_URL=https://pdfspark-production-production.up.railway.app/api`
5. Redeploy your frontend

## Step 5: Test the Application

Visit your frontend URL: https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app

Open your browser's developer console (F12) and check for:
- No CORS errors in the console
- Successful API requests to the backend
- Try uploading a file and converting it

## Troubleshooting

### If Backend Is Not Accessible

1. Check Railway logs for any errors
2. Verify that the service is running
3. Check the domain name is correct
4. Try restarting the service from the Railway dashboard

### If CORS Errors Persist

1. Double-check that `CORS_ALLOW_ALL=true` is set
2. Make sure `CORS_ORIGIN` exactly matches your frontend URL
3. Check if there are any typos in the URLs
4. Try clearing your browser cache or using incognito mode