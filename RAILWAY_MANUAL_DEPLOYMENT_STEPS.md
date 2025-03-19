# Manual Railway Deployment Steps

This guide provides step-by-step instructions to fix the Railway deployment issue with the "MCP server scopes rename" error.

## Prerequisites

1. Make sure you have the Railway CLI installed:
   ```bash
   npm install -g @railway/cli
   ```

2. Make sure you're logged in to Railway:
   ```bash
   railway login
   ```

## Step 1: Check Available Projects

```bash
railway list
```

This will show your available projects. Note the name of the project you want to deploy to (e.g., `pdfspark-ch1`).

## Step 2: Link to Your Project

```bash
railway link
```

This will prompt you to select a project. Use arrow keys to navigate to your project and press Enter to select it.

## Step 3: Check Current Status

```bash
railway status
```

This will show the current status of your linked project.

## Step 4: Set Critical Environment Variables

```bash
# Memory configuration
railway variables set USE_MEMORY_FALLBACK=true

# Directory paths
railway variables set TEMP_DIR=/app/temp
railway variables set UPLOAD_DIR=/app/uploads
railway variables set LOG_DIR=/app/logs

# Server configuration
railway variables set PORT=3000
railway variables set NODE_ENV=production
railway variables set CORS_ALLOW_ALL=true

# Cloudinary configuration
railway variables set CLOUDINARY_CLOUD_NAME=dciln75i0
railway variables set CLOUDINARY_API_KEY=756782232717326
railway variables set CLOUDINARY_API_SECRET=your_secret_here
```

Make sure to replace `your_secret_here` with your actual Cloudinary API secret.

## Step 5: Deploy Your Application

```bash
railway up --detach
```

This will start the deployment process in detached mode.

## Step 6: Check Deployment Status

Wait a few minutes, then check the status:

```bash
railway status
```

## Step 7: Check Logs if Needed

If you encounter issues, check the logs:

```bash
railway logs
```

## Step 8: Access Your Application

Get your application's public domain:

```bash
railway variables get RAILWAY_PUBLIC_DOMAIN
```

Then visit `https://your-domain-here` in your browser.

## Common Issues and Solutions

### Issue: Train has not arrived at the station

This error means the deployment is still in progress or has failed. Check the status and logs to troubleshoot.

### Issue: Health check failing

Make sure the health check path (`/health`) exists in your application and is responding correctly.

### Issue: Memory errors

Increase the memory allowance with the `--max-old-space-size` flag, which is already set in the `railway.json` configuration.

### Issue: Cloudinary integration problems

Double-check that all Cloudinary variables are set correctly and that USE_MEMORY_FALLBACK is enabled.

## Maintenance Tips

- Regularly check for updates to Railway CLI:
  ```bash
  npm update -g @railway/cli
  ```

- Monitor your application's health with:
  ```bash
  railway status
  ```

- Check logs regularly:
  ```bash
  railway logs
  ```