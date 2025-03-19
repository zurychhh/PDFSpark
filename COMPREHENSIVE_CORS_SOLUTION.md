# Comprehensive CORS Solution for PDFSpark

## The Problem

Your PDFSpark application is experiencing Cross-Origin Resource Sharing (CORS) errors. These occur because:

1. Your frontend is hosted on Vercel (https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app)
2. Your backend is hosted on Railway (https://pdfspark-production-production.up.railway.app)
3. The backend is not properly configured to allow requests from the frontend domain

Additionally, the backend may not be running or accessible, which needs to be fixed first.

## Solution Options

### Option A: Fix Through Railway Dashboard (Recommended)

#### Step 1: Verify Backend Status

1. Open a browser and visit: 
   ```
   https://pdfspark-production-production.up.railway.app/health
   ```
2. If you see a response like `{"status":"ok"}`, the backend is running
3. If you get an error or no response, continue to Step 2 to redeploy

#### Step 2: Update Railway Configuration

1. Log in to [Railway Dashboard](https://railway.app/dashboard)
2. Select the "pdfspark-ch1" project
3. Select the "pdfspark-ch1" service in the "production" environment
4. Go to the "Variables" tab

5. Add or update these CORS variables:
   ```
   CORS_ALLOW_ALL=true
   CORS_ORIGIN=https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app
   ALLOWED_ORIGINS=https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app
   ```

6. Also add these optimization variables:
   ```
   USE_MEMORY_FALLBACK=true
   MEMORY_MANAGEMENT_AGGRESSIVE=true
   TEMP_DIR=/tmp
   UPLOAD_DIR=/tmp/uploads
   LOG_DIR=/tmp/logs
   NODE_ENV=production
   PORT=3000
   NODE_OPTIONS=--max-old-space-size=2048
   ```

7. Ensure Cloudinary variables are set:
   ```
   CLOUDINARY_CLOUD_NAME=dciln75i0
   CLOUDINARY_API_KEY=756782232717326
   CLOUDINARY_API_SECRET=[your_secret_here]
   CLOUDINARY_SOURCE_FOLDER=pdfspark_railway_sources
   CLOUDINARY_RESULT_FOLDER=pdfspark_railway_results
   CLOUDINARY_MAX_CONCURRENT_UPLOADS=3
   ```

8. Click "Deploy" to apply the changes and restart the service

#### Step 3: Test CORS Configuration

1. Open the frontend URL in your browser:
   ```
   https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app
   ```

2. Open browser developer tools (F12) and go to the Console tab

3. Try using the application and watch for CORS errors

4. If the backend is running but CORS errors persist, double-check your environment variables for typos

### Option B: Using Railway CLI (Alternative)

If you're comfortable with the command line:

1. Open a terminal window
2. Log in to Railway CLI:
   ```bash
   railway login
   ```

3. Link to your project:
   ```bash
   railway link
   ```
   (Select pdfspark-ch1 project, production environment, pdfspark-ch1 service)

4. Set CORS variables:
   ```bash
   railway variables set CORS_ALLOW_ALL=true
   railway variables set CORS_ORIGIN=https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app
   railway variables set ALLOWED_ORIGINS=https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app
   ```

5. Set optimization variables:
   ```bash
   railway variables set USE_MEMORY_FALLBACK=true
   railway variables set MEMORY_MANAGEMENT_AGGRESSIVE=true
   railway variables set TEMP_DIR=/tmp
   railway variables set UPLOAD_DIR=/tmp/uploads
   railway variables set LOG_DIR=/tmp/logs
   ```

6. Redeploy:
   ```bash
   railway up
   ```

### Option C: Temporary CORS Proxy (Last Resort)

If you need an immediate fix and can't wait for Railway deployment:

1. Modify your frontend code to use a CORS proxy

2. In `src/services/api.ts` or similar file, change:
   ```javascript
   const API_URL = process.env.VITE_API_URL || 'https://pdfspark-production-production.up.railway.app';
   ```
   to:
   ```javascript
   const API_URL = process.env.VITE_API_URL || 'https://pdfspark-production-production.up.railway.app';
   const CORS_PROXY = 'https://corsproxy.io/?';
   const apiUrl = `${CORS_PROXY}${API_URL}`;
   ```

3. Redeploy your frontend to Vercel

Note: This is not recommended for production use and should only be a temporary measure.

## Verify Frontend Configuration

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your PDFSpark project
3. Go to Settings > Environment Variables
4. Verify these variables are set:
   ```
   VITE_API_URL=https://pdfspark-production-production.up.railway.app
   VITE_API_BASE_URL=https://pdfspark-production-production.up.railway.app/api
   ```
5. If you update these, redeploy the frontend

## Understanding CORS in PDFSpark

PDFSpark's backend is configured to check CORS in two ways:

1. If `CORS_ALLOW_ALL=true`, it will allow requests from any origin (useful for testing but not secure for production)

2. Otherwise, it checks if the request origin matches:
   - The `CORS_ORIGIN` variable
   - Any origins listed in the `ALLOWED_ORIGINS` variable (comma-separated)

The relevant code is in `backend/index.js` where the CORS middleware is configured.

## Common Issues and Solutions

### Backend Not Running

**Symptoms**: Health endpoint doesn't respond, you can't access https://pdfspark-production-production.up.railway.app/health

**Solution**: 
- Check Railway dashboard for logs and errors
- Redeploy the service from Railway dashboard
- Make sure environment variables are properly set
- Verify Railway has access to GitHub repository

### CORS Errors in Console

**Symptoms**: Browser console shows errors like:
```
Access to fetch at 'https://pdfspark-production-production.up.railway.app/api/files/upload' from origin 'https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app' has been blocked by CORS policy
```

**Solution**:
- Verify CORS variables are correctly set
- Make sure the frontend URL is exactly right (no trailing slash)
- Check that backend is running and accessible
- Try clearing browser cache or using incognito mode

### Backend Runs But Returns Errors

**Symptoms**: Backend responds but returns error status codes

**Solution**:
- Check Railway logs for specific error messages
- Make sure Cloudinary settings are correct
- Verify that `USE_MEMORY_FALLBACK=true` is set
- Ensure temporary directories are set correctly

## Testing Successfully Fixed CORS

When CORS is properly configured, you should see:

1. No CORS errors in browser console
2. Successful requests to the Railway backend
3. The ability to upload and convert files
4. Network tab in developer tools should show 200 OK responses from the backend

## Next Steps After Fixing CORS

1. Test the full application functionality
2. Monitor Railway logs for any errors
3. Set up alerts for service downtime
4. Consider implementing frontend error handling for backend connection issues