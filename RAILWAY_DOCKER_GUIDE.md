# Railway Docker Deployment Guide

This guide explains common issues with Docker builds in Railway and provides best practices to ensure successful deployments.

## Common Docker Build Issues in Railway

### 1. File Not Found Errors

The most common error in Railway Docker builds is files not being found during the Docker build process:

```
COPY backend/ ./
failed to calculate checksum: "/backend": not found
```

or

```
COPY railway-entry.js ./
failed to calculate checksum: "/railway-entry.js": not found
```

These errors occur because:
1. The build context in Railway is different from local development
2. The paths in COPY commands may be incorrect for the Railway environment
3. The order of operations might affect file availability

## Best Practices for Railway Docker Builds

### 1. Use Absolute Paths in COPY Commands

```dockerfile
# ❌ Problematic - may fail in Railway
COPY backend/ ./

# ✅ More reliable with absolute destination path
COPY backend/ /app/
```

### 2. Structure COPY Commands Correctly

```dockerfile
# ✅ Good practice: Copy package files first
COPY backend/package*.json ./
RUN npm install --omit=dev

# ✅ Then copy the rest of the application code
COPY backend/ /app/
```

### 3. Create Directories Before Copying Files

```dockerfile
# ✅ Create directories with permissions first
RUN mkdir -p /app/uploads /app/temp /app/logs
RUN chmod 777 /app/uploads /app/temp /app/logs

# Then copy files
COPY ... 
```

### 4. Copy Critical Files Separately

```dockerfile
# ✅ Copy critical entry files separately to ensure they exist
COPY railway-entry.js /app/
RUN chmod +x /app/railway-entry.js

# Then copy bulk files
COPY backend/ /app/
```

### 5. Use Explicit Entry Commands

```dockerfile
# ✅ Specify the exact entry command with full path
CMD ["node", "--max-old-space-size=2048", "railway-entry.js"]
```

## Debugging Docker Builds in Railway

If your Docker build fails in Railway, follow these debugging steps:

1. **Check Build Logs**: Look for "failed to calculate checksum" errors
2. **Test Locally**: Build the Docker image locally with the same Dockerfile
3. **Verify File Paths**: Ensure all file paths in COPY commands exist
4. **Inspect Build Context**: The build context in Railway may differ from local

### Using the Docker Build Context Debug Pattern

Add these lines to your Dockerfile to debug the build context:

```dockerfile
# Debug build context
RUN ls -la /
RUN ls -la .
RUN pwd
```

## Railway-Specific Docker Configuration

### Environment Variables

```dockerfile
# Set environment variables for Railway
ENV PORT=3000
ENV NODE_ENV=production
ENV USE_MEMORY_FALLBACK=true
ENV TEMP_DIR=/app/temp
ENV UPLOAD_DIR=/app/uploads
ENV LOG_DIR=/app/logs
```

### Health Check Script

Include a diagnostic startup script to help troubleshoot deployment issues:

```dockerfile
RUN echo '#!/bin/sh' > /app/startup.sh && \
    echo 'echo "===== STARTUP DIAGNOSTICS ======"' >> /app/startup.sh && \
    echo 'echo "Current directory: $(pwd)"' >> /app/startup.sh && \
    echo 'echo "Directory listing: $(ls -la)"' >> /app/startup.sh && \
    echo 'echo "Environment variables: $(env | grep -v PASSWORD | grep -v SECRET | sort)"' >> /app/startup.sh && \
    echo 'echo "===== STARTING SERVER ======"' >> /app/startup.sh && \
    echo 'exec node --max-old-space-size=2048 index.js' >> /app/startup.sh && \
    chmod +x /app/startup.sh
```

## Fixing Railway Deployment with Updated Dockerfile

If you're experiencing the "file not found" error, update your Dockerfile using this template:

```dockerfile
# Use official Node.js image as base
FROM node:18-alpine

# Install diagnostic tools
RUN apk add --no-cache curl iputils bash net-tools

# Set working directory
WORKDIR /app

# Copy package files 
COPY backend/package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Create directories with proper permissions first
RUN mkdir -p /app/uploads /app/temp /app/logs
RUN chmod 777 /app/uploads /app/temp /app/logs

# Copy entry script first (it exists in both root and backend)
COPY railway-entry.js /app/
RUN chmod +x /app/railway-entry.js

# Copy all backend files
COPY backend/ /app/

# Add startup diagnostic script
RUN echo '#!/bin/sh' > /app/startup.sh && \
    echo 'echo "===== STARTUP DIAGNOSTICS ======"' >> /app/startup.sh && \
    echo 'echo "Directory listing: $(ls -la)"' >> /app/startup.sh && \
    echo 'echo "===== STARTING SERVER ======"' >> /app/startup.sh && \
    echo 'exec node --max-old-space-size=2048 railway-entry.js' >> /app/startup.sh && \
    chmod +x /app/startup.sh

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=production
ENV USE_MEMORY_FALLBACK=true

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "--max-old-space-size=2048", "railway-entry.js"]
```

## Additional Railway Deployment Tips

1. **Use the Railway CLI**: Test deployments locally before pushing
2. **Set Variables in Railway Dashboard**: Use the Railway dashboard to set sensitive environment variables
3. **Enable Logs**: Check logs immediately after deployment
4. **Use Health Checks**: Configure proper health checks in your `railway.json`
5. **Set Resource Limits**: Configure appropriate memory and CPU limits

By following these practices, you should be able to avoid Docker build issues in Railway deployments.