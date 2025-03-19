# Fixing CORS Issues between Vercel Frontend and Railway Backend

This document provides step-by-step instructions to fix CORS (Cross-Origin Resource Sharing) issues between your Vercel-deployed frontend and Railway-deployed backend.

## Understanding the Problem

The frontend application hosted on Vercel cannot communicate with the backend API hosted on Railway due to CORS restrictions. The browser blocks these cross-origin requests because the backend server doesn't explicitly allow them.

## Solution Overview

1. Configure the Railway backend to allow requests from the Vercel frontend domain
2. Update the frontend configuration to correctly point to the Railway backend
3. Verify the connection is working

## Step 1: Configure Railway Backend

### Option A: Using Railway Dashboard (Recommended)

1. Log in to the [Railway Dashboard](https://railway.app/dashboard)
2. Navigate to your PDFSpark project
3. Select the backend service
4. Go to the "Variables" tab
5. Add or update the following environment variables:

```
CORS_ALLOW_ALL=true
CORS_ORIGIN=https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app
ALLOWED_ORIGINS=https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app
```

6. Also add these performance optimization variables:

```
USE_MEMORY_FALLBACK=true
MEMORY_MANAGEMENT_AGGRESSIVE=true
TEMP_DIR=/tmp
UPLOAD_DIR=/tmp/uploads
LOG_DIR=/tmp/logs
```

7. Click "Deploy" to apply changes

### Option B: Using Railway CLI (Advanced)

If you have the Railway CLI configured, you can run:

```bash
# Install Railway CLI if needed
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Set variables
railway variables set CORS_ALLOW_ALL=true
railway variables set CORS_ORIGIN=https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app
railway variables set ALLOWED_ORIGINS=https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app

# Redeploy
railway up --detach
```

## Step 2: Update Frontend Configuration

### Option A: Using Vercel Dashboard

1. Log in to the [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to your PDFSpark project
3. Go to the "Settings" tab
4. Select "Environment Variables" from the left sidebar
5. Add or update the following variables:

```
VITE_API_URL=https://pdfspark-production-production.up.railway.app
VITE_API_BASE_URL=https://pdfspark-production-production.up.railway.app
```

6. Redeploy the project to apply changes

### Option B: Using Local Script

Run the `update-frontend-config.sh` script locally:

```bash
# Make script executable
chmod +x update-frontend-config.sh

# Run script
./update-frontend-config.sh
```

Then redeploy to Vercel:

```bash
# Install Vercel CLI if needed
npm install -g vercel

# Deploy to Vercel
vercel --prod
```

## Step 3: Verify the Connection

### Test Backend Health Endpoint

```bash
curl https://pdfspark-production-production.up.railway.app/health
```

Expected response: `{"status":"ok","message":"Server is running"}`

### Test CORS Configuration

```bash
curl -s -I -X OPTIONS \
  -H "Origin: https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  https://pdfspark-production-production.up.railway.app/health
```

Look for response headers like:
```
Access-Control-Allow-Origin: https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app
Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE
```

### Test Frontend

Visit your Vercel deployment:
https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app

Open the browser developer console (F12) and check for:
- No CORS errors in the console
- Successful API requests to the Railway backend

## Troubleshooting

### If CORS Errors Persist

1. **Check the Backend Logs**:
   - Go to Railway Dashboard > Your Project > Backend Service > Logs
   - Look for any errors related to CORS configuration

2. **Verify Environment Variables**:
   - Double-check that your environment variables are correctly set and spelled
   - Make sure the URLs match exactly (including http/https)

3. **Force a Clean Redeploy**:
   - On Railway, try deleting the service and redeploying
   - On Vercel, try clearing the cache and redeploying

4. **Check Backend Code**:
   - The CORS configuration is in `backend/index.js`
   - Verify that the code correctly uses the environment variables

### If Frontend Can't Connect

1. **Check Network Requests**:
   - Use the browser's Network tab to see if requests are being made
   - Verify request URLs are correct
   - Look for any error responses

2. **API Service Configuration**:
   - Check `src/services/api.ts` to make sure it's correctly using environment variables

3. **Local Testing**:
   - Test locally with `.env.local` configured to point to the Railway backend

## Railway Optimization Reminders

Remember that our Railway deployment includes these optimizations:

1. **Memory Fallback Mode**:
   - `USE_MEMORY_FALLBACK=true` enables in-memory storage fallback
   - Crucial for operating in Railway's constrained environment

2. **Temporary File Storage**:
   - `TEMP_DIR=/tmp` and `UPLOAD_DIR=/tmp/uploads` for Railway compatibility
   - Ensures files are stored in appropriate ephemeral storage locations

3. **Memory Management**:
   - `MEMORY_MANAGEMENT_AGGRESSIVE=true` enables stricter memory cleanup
   - `NODE_OPTIONS=--max-old-space-size=2048` increases Node.js memory limit