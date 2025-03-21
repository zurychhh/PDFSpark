# PDFSpark Railway Web Deployment Quick Guide

If you're having issues with the Railway CLI, you can use the web interface:

## 1. Access Railway Dashboard

Go to [https://railway.app/dashboard](https://railway.app/dashboard) and log in

## 2. Create New Project

1. Click the "New Project" button
2. Select "Deploy from GitHub repo"
3. Connect your GitHub account if needed
4. Find and select your "react-pdfspark" repository
5. Select the branch to deploy (usually "main")

## 3. Configure Deployment

Once your repository is selected:

1. Click on your newly created service
2. Go to the "Variables" tab
3. Add all required environment variables:

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

## 4. Deploy

Deployment will automatically start after setting the variables. You can monitor progress in the "Deployments" tab.

## 5. Get Domain

1. Go to the "Settings" tab
2. Find your domain in the "Domains" section
3. This is your Railway domain to use in frontend configuration

## 6. Update Frontend

Update frontend configuration files with your new domain:

- vercel.json
- .env.production
