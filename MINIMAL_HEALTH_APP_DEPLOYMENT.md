# Minimal Health Check App Deployment Guide

This guide outlines how to deploy just the minimal health check application to validate Railway's health check system before deploying the full PDFSpark application.

## What is the Minimal Health Check App?

This is an extremely simple application that does only one thing: respond to health check requests. It's designed to test if Railway's health check system is working correctly with the most basic possible setup.

## Files Included

- `health-app.js`: A simple Node.js HTTP server that responds to health check requests
- `Dockerfile`: Minimal Docker configuration
- `railway.json`: Basic Railway configuration

## Step 1: Access the Railway Dashboard

1. Open your browser and go to: https://railway.app/dashboard
2. Log in with your credentials

## Step 2: Create a New Project

1. Click the "New Project" button in Railway
2. Select "Deploy from GitHub" option
3. Connect your GitHub account if not already done
4. Choose to create a new repository or use a temporary repository
5. Upload the contents of the `minimal-health-app` directory

## Step 3: Manual Deployment

If you prefer not to use GitHub, you can deploy manually:

1. In the Railway dashboard, choose "Deploy from Dockerfile"
2. Upload the `railway-deployment-minimal.zip` file
3. Configure deployment settings:

   - **Health Check Settings**:
     - Path: `/health`
     - Timeout: 60 seconds (start with a generous timeout)
     - Interval: 15 seconds

## Step 4: Verify Deployment

1. After deployment, check if the health check is passing
2. Try accessing the application URL
3. Test the `/health` endpoint by appending "/health" to the URL
4. Check the logs for any health check-related messages

## Step 5: What to Look For

If the minimal health check app deploys successfully and the health check passes, this confirms that:

1. Railway's health check system is working correctly
2. The issue with the main application is specific to its implementation
3. The approach of binding to 0.0.0.0 and proper health check configuration works

If even this minimal app fails, there may be:
1. Issues with Railway's health check configuration
2. Network or infrastructure problems
3. Docker configuration issues

## Step 6: Apply Findings to Main App

Based on whether the minimal health app succeeds or fails:

- **If Successful**: Apply the same approach to the main PDFSpark application
- **If Failed**: Try different health check settings or consider alternative hosting

## Files in the Minimal Health App

### health-app.js
```javascript
const http = require('http');

// Create a simple HTTP server
const server = http.createServer((req, res) => {
  console.log(`Request received: ${req.method} ${req.url}`);

  // Respond to health check requests
  if (req.url === '/health') {
    console.log('Health check requested, responding with 200 OK');
    
    const healthData = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
    
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(healthData, null, 2));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// IMPORTANT: Bind to 0.0.0.0 to make accessible outside the container
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Health check server running on port ${PORT}`);
});
```

### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY health-app.js ./

EXPOSE 3000

CMD ["node", "health-app.js"]
```

## Conclusion

This minimal health check app provides a "bare minimum" test case for Railway's health check system. By deploying it first, you can isolate whether the health check issues are specific to the PDFSpark application's implementation or if there are more fundamental problems with the Railway configuration.