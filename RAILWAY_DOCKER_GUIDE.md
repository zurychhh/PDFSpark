# Railway Docker Deployment Guide for PDFSpark

This guide documents the Docker deployment process for PDFSpark on Railway and explains the solutions to common deployment issues.

## Common Docker Build Issues in Railway

When deploying to Railway with Docker, several issues can occur:

1. **Build Context Issues**: Railway's build context may not include all necessary files.
2. **Failed to Calculate Checksum Errors**: This typically indicates missing files in the build context.
3. **Multi-stage Build Failures**: Complex multi-stage builds can fail in Railway's environment.
4. **File Path Issues**: Incorrect file paths in the Dockerfile.
5. **Missing Directories**: Required directories not created or with incorrect permissions.

## Our Solution

We've implemented a simplified yet robust Docker deployment approach:

### 1. Simplified Dockerfile

We switched from a complex multi-stage build to a simpler single-stage build that is more reliable in Railway's environment. Key aspects:

- Single FROM statement for clarity and reliability
- Explicit directory creation with proper permissions
- Diagnostic output during build and startup
- Optimized build caching with proper COPY order
- Health check configuration

### 2. Fixed .railwayignore Configuration

The `.railwayignore` file needs to ensure that while we ignore unnecessary files, we explicitly include critical files for the build:

```
# Ignore these files for Railway deployment
node_modules/
.git/
.github/
**/.DS_Store
.vscode/
coverage/
*.log
logs/
test-temp/
deploy-package/

# Keep necessary files for Docker build
!railway-entry.js
!Dockerfile
!backend/Dockerfile
!railway.json
!backend/railway.json
!backend/**/*  # Critical: include all backend files

# Don't ignore critical deployment files
!.dockerignore
!backend/.dockerignore

# Keep all railway-specific files
!RAILWAY_*.md
!**/railway.json
```

The critical addition is `!backend/**/*` which ensures all backend files are included in the build context.

### 3. Diagnostic Tools

We've added several diagnostics to help troubleshoot deployment issues:

1. **Build Context Inspection**: Outputs the contents of the build directory during build
2. **Startup Diagnostics**: A script that runs before the application starts to verify:
   - Environment configuration
   - Directory structure and permissions
   - File presence and permissions
   - Node.js environment

3. **Health Check**: Configured to monitor application health and trigger restarts if needed

### 4. Environment Variables

We've set key environment variables in the Dockerfile:

```dockerfile
ENV NODE_ENV=production
ENV PORT=3000
ENV USE_MEMORY_FALLBACK=true
ENV TEMP_DIR=/app/temp
ENV UPLOAD_DIR=/app/uploads
ENV LOG_DIR=/app/logs
```

This ensures consistent configuration even if the platform variables aren't set.

## Railway.json Configuration

The `railway.json` file configures how Railway builds and deploys your application:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "./Dockerfile"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "numReplicas": 1
  }
}
```

The key configuration:
- Using `DOCKERFILE` as builder to use our custom Dockerfile
- Setting up health checks at `/health`
- Configuring restart policies for resilience

## Troubleshooting Railway Deployments

If you encounter issues:

1. **Check Railway Build Logs**: Look for errors in the build process
2. **Verify File Inclusion**: Ensure critical files are not being ignored
3. **Check Startup Diagnostics**: The diagnostic output will show what's wrong
4. **Check Health Check Status**: Verify the health check is passing

## Common Issues and Solutions

### "Failed to Calculate Checksum" Error

**Solution**: Update `.railwayignore` to include backend files with `!backend/**/*`

### "Command Not Found" Error

**Solution**: Ensure the entry script is properly copied and has executable permissions

### Missing Directories or Permissions Issues

**Solution**: The Dockerfile explicitly creates required directories with proper permissions

### Application Crashes on Startup

**Solution**: Check startup diagnostics for missing files or configuration issues

## Managing Environment Variables

For sensitive information like API keys:

1. Use Railway's web interface to set environment variables
2. Never hardcode secrets in the Dockerfile
3. Use the railway CLI to set variables programmatically:

```bash
railway variables set CLOUDINARY_CLOUD_NAME=your-cloud-name
railway variables set CLOUDINARY_API_KEY=your-api-key
railway variables set CLOUDINARY_API_SECRET=your-api-secret
```

## Conclusion

By following this approach, you'll have a more reliable Docker deployment on Railway. The key principles are:
- Simplicity over complexity
- Explicit configuration over implicit assumptions
- Thorough diagnostics
- Proper build context management