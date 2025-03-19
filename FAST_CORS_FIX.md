# Fast CORS Fix for PDFSpark

This document provides a streamlined approach to fixing CORS issues between your Vercel frontend and Railway backend.

## The Problem

Your frontend app (on Vercel) cannot communicate with your backend API (on Railway) due to CORS restrictions, resulting in errors in the browser console when trying to make API calls.

## Quickest Solution

### Step 1: Check if Railway Backend is Running

First, we need to check if the backend is actually running:

1. Open a browser and go to: https://pdfspark-production-production.up.railway.app/health
2. If you see a response like `{"status":"ok"}`, the backend is running
3. If you get an error or no response, the backend needs to be redeployed

### Step 2: Fix CORS in Railway Dashboard

1. Log in to [Railway Dashboard](https://railway.app/dashboard)
2. Select the "pdfspark-ch1" project
3. Select the "pdfspark-ch1" service in the "production" environment
4. Go to the "Variables" tab
5. Add or update these critical CORS variables:
   ```
   CORS_ALLOW_ALL=true
   CORS_ORIGIN=https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app
   ALLOWED_ORIGINS=https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app
   ```
6. Also make sure these optimization variables are set:
   ```
   USE_MEMORY_FALLBACK=true
   MEMORY_MANAGEMENT_AGGRESSIVE=true
   TEMP_DIR=/tmp
   UPLOAD_DIR=/tmp/uploads
   LOG_DIR=/tmp/logs
   ```
7. Click "Deploy" to apply the changes

### Step 3: Redeploy Backend If Needed

If the backend wasn't responding in Step 1:

1. While still in the Railway dashboard, look for any errors in the "Logs" tab
2. Try clicking "Redeploy" from the top menu
3. Wait for the deployment to complete (may take a few minutes)
4. Check the health endpoint again to verify it's running

### Step 4: Test in Browser

1. Open the frontend URL: https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app
2. Open the browser developer console (F12)
3. Try to use the application and watch for any CORS errors
4. If you still see CORS errors, look for the specific error message which may provide clues

## If Still Not Working

### Check Backend Health Status

In a terminal on your local machine, run:
```bash
railway run -- curl -I https://pdfspark-production-production.up.railway.app/health
```

This uses Railway CLI to check the backend status.

### Verify CORS Headers

In a terminal on your local machine, run:
```bash
railway run -- curl -I -X OPTIONS \
  -H "Origin: https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  https://pdfspark-production-production.up.railway.app/health
```

Look for response headers that include `Access-Control-Allow-Origin`.

### Double-Check Frontend Configuration

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your PDFSpark project
3. Go to Settings > Environment Variables
4. Verify these variables are set:
   ```
   VITE_API_URL=https://pdfspark-production-production.up.railway.app
   VITE_API_BASE_URL=https://pdfspark-production-production.up.railway.app/api
   ```
5. If you update these, click "Deploy" to apply the changes

## Final Resort: Alternative Approach

If all else fails, consider using a CORS proxy service temporarily:

1. Update your frontend code to use a CORS proxy like:
   ```javascript
   const API_URL = process.env.VITE_API_URL || 'https://pdfspark-production-production.up.railway.app';
   const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';
   const apiUrl = `${CORS_PROXY}${API_URL}`;
   ```

2. However, this is not recommended for production use and should only be a temporary measure

## Important Notes

- Railway's file system is ephemeral, so always use `/tmp` for temporary files
- The memory fallback mode is essential for reliable operation on Railway
- Cloudinary integration is required for persistent file storage