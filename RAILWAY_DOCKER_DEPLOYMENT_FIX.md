# PDFSpark Railway Docker Deployment Fix

This document provides a comprehensive guide to resolving Docker build failures in Railway for the PDFSpark application.

## Problem Description

The Railway deployment for PDFSpark was failing during the Docker build phase with errors like:

```
✕ COPY backend/ ./ 
failed to calculate checksum of ref: "/backend": not found

✕ COPY railway-entry.js ./ 
failed to calculate checksum of ref: "/railway-entry.js": not found
```

These errors occur because the Docker build context on Railway doesn't contain the expected files or directories. This can happen for several reasons:

1. Railway has a different build context than your local environment
2. Files referenced in the Dockerfile don't exist in the expected locations
3. Dockerfile commands rely on external files that aren't included in the build context
4. Multiple competing configuration files (`railway.json`) cause confusion

## Solution Implementation

This repository now contains three scripts to fix the deployment issues:

1. `test-docker-build.sh` - Tests the Docker build process locally
2. `fix-railway-docker-deploy.sh` - Interactive script to fix and deploy to Railway
3. `diagnose-railway-deployment.sh` - Diagnoses issues with Railway deployment
4. `quick-railway-docker-fix.sh` - Quick non-interactive fix and deploy script

### Key Improvements

1. **Self-Contained Dockerfile**:
   - The Dockerfile now generates all required files during the build process
   - No reliance on external files that might not exist in the build context
   - Creates a minimal Express app with health endpoint

2. **Consistent Railway Configuration**:
   - Single `railway.json` in the root directory
   - Configured to use the DOCKERFILE builder
   - Health check and restart policy properly configured

3. **Environment Variable Management**:
   - Setting critical environment variables for Railway
   - Using memory fallback for Railway's ephemeral environment
   - Using `/tmp` for file storage in Railway

4. **Memory Optimization**:
   - Node.js memory settings optimized for Railway
   - Memory fallback system to handle file storage
   - Garbage collection and memory monitoring

## How to Use

### Option 1: Quick Fix (Recommended for most users)

Run the quick fix script to automatically apply the most common fixes:

```bash
./quick-railway-docker-fix.sh
```

This script will:
1. Update `railway.json` to use Docker
2. Remove any competing configuration files
3. Set critical environment variables
4. Deploy to Railway

### Option 2: Interactive Fix

For more control, use the interactive fix script:

```bash
./fix-railway-docker-deploy.sh
```

This script will:
1. Check and update Docker configuration
2. Verify railway.json is correct
3. Check for competing configurations
4. Verify environment variables
5. Optionally clean Docker build cache
6. Deploy to Railway

### Option 3: Test First, Then Fix

For a cautious approach:

```bash
# First test the Docker build locally
./test-docker-build.sh

# Then fix and deploy to Railway
./fix-railway-docker-deploy.sh
```

### Option 4: Diagnose Existing Deployment

If you've already deployed and are having issues:

```bash
./diagnose-railway-deployment.sh
```

This script will:
1. Check Railway configuration
2. Verify environment variables
3. Check deployment logs
4. Test health endpoint
5. Provide recommendations

## Technical Details

### Key Files

1. **Dockerfile**:
   - Self-contained Docker build that generates all required files
   - Creates a minimal Express application with health endpoint
   - Sets up memory management and Cloudinary integration
   - Configures CORS and environment variables

2. **railway.json**:
   ```json
   {
     "build": {
       "builder": "DOCKERFILE",
       "dockerfilePath": "./Dockerfile"
     },
     "deploy": {
       "startCommand": "node --expose-gc --max-old-space-size=2048 railway-entry.js",
       "healthcheckPath": "/health",
       "healthcheckTimeout": 30,
       "restartPolicyType": "ON_FAILURE",
       "restartPolicyMaxRetries": 10
     }
   }
   ```

3. **railway-entry.js**:
   - Generated during Docker build
   - Initializes Cloudinary integration
   - Sets up memory fallback storage
   - Handles error reporting

### Critical Environment Variables

These variables must be set in Railway:

- `NODE_ENV=production` - Sets Node.js to production mode
- `USE_MEMORY_FALLBACK=true` - Enables in-memory storage fallback
- `CORS_ALLOW_ALL=true` - Enables CORS for all origins
- `TEMP_DIR=/tmp` - Sets temporary directory to Railway's temp space
- `UPLOAD_DIR=/tmp/uploads` - Sets upload directory in Railway's temp space
- `LOG_DIR=/tmp/logs` - Sets log directory in Railway's temp space
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name for file storage
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret
- `MEMORY_MANAGEMENT_AGGRESSIVE=true` - Enables aggressive memory management

## Troubleshooting

If you're still having issues after running the fix scripts:

1. **Check Railway Logs**:
   ```bash
   railway logs
   ```

2. **Verify Environment Variables**:
   ```bash
   railway variables list
   ```

3. **Check Deployment Status**:
   ```bash
   railway status
   ```

4. **Run Diagnostics**:
   ```bash
   ./diagnose-railway-deployment.sh
   ```

5. **Try Clean Deployment**:
   ```bash
   railway down
   railway up
   ```

## Further Reading

For more detailed information, refer to:

1. [Railway Deployment Guide](https://docs.railway.app/deploy/dockerfiles)
2. [Docker Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
3. [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
4. [Cloudinary Integration Guide](https://cloudinary.com/documentation/node_integration)