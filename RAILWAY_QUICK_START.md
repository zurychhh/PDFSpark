# PDFSpark Railway Deployment - Quick Start Guide

## Step 1: Select Your Deployment Method

Choose one of these three methods:

### Option A: Railway Dashboard (Recommended)

1. Download the deployment packages:
   - `minimal-health-app.zip` (Test app)
   - `pdfspark-railway.zip` (Full app)

2. Open [Railway Dashboard](https://railway.app/dashboard)

3. Follow the detailed steps in `RAILWAY_DEPLOYMENT_INSTRUCTIONS.md`

### Option B: Railway API Script

1. Get your Railway API token:
   ```bash
   # In an interactive terminal:
   railway login
   # Find token in ~/.railway/config.json
   ```

2. Run the deployment script:
   ```bash
   export RAILWAY_API_TOKEN="your_token"
   ./railway-api-deploy.sh
   ```

### Option C: Manual CLI Method (Not Recommended)

```bash
# Attempt with extended timeout:
RAILWAY_CLI_TIMEOUT=300 railway up --timeout 300 --detach
```

## Step 2: Configure Environment Variables

Set these critical variables:

```
PORT=3000
NODE_ENV=production
USE_MEMORY_FALLBACK=true
CORS_ALLOW_ALL=true
```

Optional (if using MongoDB/Cloudinary):
```
MONGODB_URI=your_mongodb_uri
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## Step 3: Verify Deployment

1. Generate a domain for your service in Railway
2. Check these endpoints:
   - `/api/diagnostic/health` → Should return `{"status":"ok",...}`
   - `/` → Should show API overview

## Step 4: Update Frontend Configuration

Update your frontend to use the new backend URL

## Need More Details?

See these documents:
- `RAILWAY_DEPLOYMENT_INSTRUCTIONS.md` - Detailed step-by-step guide
- `RAILWAY_HEALTH_CHECK_FIX.md` - Technical explanation of the fix
- `RAILWAY_DEPLOYMENT_OPTIONS.md` - Overview of all deployment methods

## Troubleshooting

If deployment fails:
1. Check Railway logs for errors
2. Verify the health check path is correct
3. Ensure environment variables are set correctly
4. Try deploying the minimal test app first

## Support

If you need further assistance, refer to the comprehensive documentation or reach out to the development team.