# PDFSpark Railway Deployment Guide

This guide provides step-by-step instructions for deploying the PDFSpark backend to Railway.

## Prerequisites

- Railway account
- Railway CLI installed (`npm install -g @railway/cli`)
- Cloudinary account with API credentials

## Step 1: Authentication and Project Setup

1. Login to Railway:
   ```bash
   railway login
   ```

2. Link to existing project or create a new one:
   ```bash
   # To create a new project:
   railway init --name pdfspark-ch1
   
   # OR to link to an existing project:
   railway link --project pdfspark-ch1
   ```

## Step 2: Configure Environment Variables

Set all required environment variables:

```bash
# Basic configuration
railway variables set NODE_ENV=production
railway variables set PORT=3000
railway variables set USE_MEMORY_FALLBACK=true
railway variables set CORS_ALLOW_ALL=true

# Directory paths
railway variables set TEMP_DIR=/app/temp
railway variables set UPLOAD_DIR=/app/uploads
railway variables set LOG_DIR=/app/logs

# Cloudinary configuration
railway variables set CLOUDINARY_CLOUD_NAME=dciln75i0
railway variables set CLOUDINARY_API_KEY=756782232717326
railway variables set CLOUDINARY_API_SECRET=your_secret_here
```

## Step 3: Deploy Application

Verify configuration files are correct:

1. **railway.json** - Ensure it has proper healthcheck and builder settings
2. **Dockerfile** - Verify port and environment variables are set correctly
3. **railway-entry.js** - Check the entry script is properly configured

Then deploy:

```bash
railway up
```

## Step 4: Monitor Deployment

Check deployment status:

```bash
railway status
```

View logs:

```bash
railway logs
```

## Step 5: Verify Deployment

Once deployment succeeds, get your public domain:

```bash
railway variables get RAILWAY_PUBLIC_DOMAIN
```

Test the health endpoint:

```bash
curl https://your-railway-domain.railway.app/health
```

## Step 6: Update Frontend Configuration

If deployment is successful, update frontend environment variables to point to your new backend:

1. Update vercel.json:
   ```json
   {
     "env": {
       "VITE_API_URL": "https://your-railway-domain.railway.app",
       "VITE_API_BASE_URL": "https://your-railway-domain.railway.app/api"
     }
   }
   ```

2. Update .env.production:
   ```
   VITE_API_URL=https://your-railway-domain.railway.app
   VITE_API_BASE_URL=https://your-railway-domain.railway.app/api
   ```

## Troubleshooting

If deployment fails:

1. Check logs for errors: `railway logs`
2. Verify healthcheck is passing: API should respond to `/health` endpoint
3. Ensure all environment variables are properly set
4. Check if Docker build is successful
5. Verify Cloudinary credentials are correct

Use the diagnostic script to help identify issues:
```bash
./railway-diagnose.sh
```
