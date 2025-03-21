# Minimal Railway Health Check App

This is an extremely minimal application designed to help diagnose and fix Railway health check issues. It does nothing but respond to health check requests, making it perfect for testing Railway's health check system.

## What's Included

- `health-app.js`: A minimal Node.js HTTP server that responds to health check requests
- `Dockerfile`: Optimized Docker configuration for Railway deployment
- `railway.json`: Railway configuration with health check settings

## How to Use

1. Deploy this application to Railway
2. Test if the health check passes
3. Once confirmed working, use the same approach for your main application

## Features

- Binds to `0.0.0.0` to be accessible from outside the container
- Detailed logging of all requests
- Proper signal handling for graceful shutdown
- Docker health check configuration
- Exposes both `/health` endpoint and informational root page

## Deployment

You can deploy this app to Railway in two ways:

### Option 1: GitHub Repository

1. Push this directory to a GitHub repository
2. Login to Railway
3. Create a new project
4. Choose "Deploy from GitHub"
5. Connect your repository
6. Deploy

### Option 2: Direct Upload

1. Zip this directory:
   ```bash
   zip -r minimal-health-app.zip .
   ```
2. Login to Railway
3. Create a new project
4. Upload the zip file
5. Deploy

## Verification

After deployment, access the root URL to see an information page, and visit `/health` to test the health check endpoint.

## Next Steps

Once this minimal application successfully deploys and passes health checks:

1. Examine its exact configuration
2. Apply the same approach to your main application
3. Gradually add complexity back, testing health checks at each step

This approach helps isolate the exact cause of health check failures.