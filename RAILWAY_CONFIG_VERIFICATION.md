# PDFSpark Railway Configuration Verification

This document helps you verify all configuration files needed for successful Railway deployment.

## 1. Dockerfile

Ensure your Dockerfile has:

- The correct base image: `node:18-alpine`
- Proper working directory: `/app`
- Consistent port exposure: `EXPOSE 3000`
- Environment variables set correctly
- Correct entry point: `railway-entry.js`
- Memory limit: `--max-old-space-size=2048`

## 2. railway.json

Verify your railway.json has:

- Builder set to `DOCKERFILE`
- Path to Dockerfile: `./Dockerfile`
- Start command: `node --max-old-space-size=2048 railway-entry.js`
- Health check path: `/health`
- Health check timeout: `30` seconds (increased from default 10)
- Restart policy configured correctly

## 3. railway-entry.js

Check your entry script has:

- Directory verification and creation
- Memory usage monitoring
- Proper error handling
- Correct path to the main application file: `./index.js`

## 4. Environment Variables

Ensure these environment variables are set in Railway:

- NODE_ENV=production
- PORT=3000
- USE_MEMORY_FALLBACK=true
- CORS_ALLOW_ALL=true
- TEMP_DIR=/app/temp
- UPLOAD_DIR=/app/uploads
- LOG_DIR=/app/logs
- CLOUDINARY_CLOUD_NAME=dciln75i0
- CLOUDINARY_API_KEY=756782232717326
- CLOUDINARY_API_SECRET=(your secure API secret)

## 5. Health Endpoint

Verify the health endpoint in backend/index.js:

```javascript
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Server is running'
  });
});
```

## 6. Verify After Deployment

After deployment succeeds:

1. Test the health endpoint: `curl https://your-railway-domain.railway.app/health`
2. Verify environment variables: `railway variables list`
3. Check logs for any warnings: `railway logs`

## 7. Common Issues and Solutions

- Port binding issues: Ensure consistent PORT=3000 everywhere
- Memory issues: Verify USE_MEMORY_FALLBACK=true is set
- Directory access issues: Check TEMP_DIR, UPLOAD_DIR, and LOG_DIR settings
- Healthcheck timeout: Make sure healthcheck responds quickly and timeout is set to 30 seconds
- Cloudinary integration: Verify all Cloudinary credentials are correct
