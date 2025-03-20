# PDFSpark Railway Deployment Guide

This guide walks through deploying the PDFSpark backend API to Railway and connecting the frontend to this deployed API.

## Prerequisites

- [Railway CLI](https://docs.railway.app/develop/cli) installed
- [Node.js](https://nodejs.org/) v18 or later
- [npm](https://www.npmjs.com/) v8 or later
- Cloudinary account credentials

## Backend Deployment Steps

1. **Login to Railway**

   ```bash
   railway login
   ```

2. **Link to the Railway Project**

   ```bash
   railway link
   ```

   If you haven't created a project yet, create one:

   ```bash
   railway project create
   ```

3. **Deploy the Backend to Railway**

   We've created a deployment script that automates the process:

   ```bash
   ./deploy-railway-backend.sh
   ```

   This script will:
   - Check if you're logged in to Railway
   - Verify your current project
   - Optionally set environment variables
   - Deploy the backend to Railway
   - Show you the deployment URL

4. **Verify Required Environment Variables**

   Make sure the following environment variables are set in your Railway project:

   - `CLOUDINARY_CLOUD_NAME` - Your Cloudinary cloud name
   - `CLOUDINARY_API_KEY` - Your Cloudinary API key
   - `CLOUDINARY_API_SECRET` - Your Cloudinary API secret
   - `USE_MEMORY_FALLBACK` - Set to "true" for Railway deployment
   - `NODE_OPTIONS` - Set to "--max-old-space-size=2048" for better memory management

## Frontend Configuration

After deploying the backend, you need to update the frontend to point to your Railway backend URL:

1. **Update the API URL in the Frontend**

   We've created a script to automate this process:

   ```bash
   ./update-api-url.sh
   ```

   This script will:
   - Detect or ask for your Railway deployment URL
   - Update the API_URL in the frontend configuration
   - Optionally build the frontend with the new URL

2. **Manual Configuration (if needed)**

   If you prefer to update it manually, edit the file `src/config/config.ts`:

   ```typescript
   // Change this line:
   export const API_URL = import.meta.env.VITE_API_URL || 'https://pdfspark-production.up.railway.app';
   
   // To point to your Railway URL:
   export const API_URL = 'https://your-railway-url.up.railway.app';
   ```

3. **Build the Frontend**

   ```bash
   npm run build
   ```

4. **Deploy the Frontend**

   Deploy the built frontend (from the `dist` directory) to your preferred hosting service (Vercel, Netlify, GitHub Pages, etc.).

## Troubleshooting

### Common Issues

1. **CORS Errors**

   If you see CORS errors in the browser console, ensure:
   
   - Your frontend URL is allowed in the backend CORS configuration
   - You're using https for both frontend and backend URLs

2. **Memory Issues on Railway**

   If you encounter memory-related crashes:
   
   - Ensure `USE_MEMORY_FALLBACK=true` is set in Railway environment variables
   - Ensure `NODE_OPTIONS=--max-old-space-size=2048` is set
   - Check Railway logs for memory usage patterns

3. **Cloudinary Upload Failures**

   If file uploads to Cloudinary fail:
   
   - Verify Cloudinary credentials in Railway environment variables
   - Check your Cloudinary account limits and usage
   - Ensure your account has upload permissions

4. **Health Check Failures**

   If Railway shows health check failures:
   
   - Verify the `/health` endpoint is working correctly
   - Check Railway logs for application startup issues
   - Ensure the application is listening on the correct port (should be PORT environment variable or default 3000)

## Monitoring and Logs

- **View Logs in Railway**

  ```bash
  railway logs
  ```

- **Check Service Status**

  ```bash
  railway status
  ```

- **Monitor Memory Usage**

  Check the `/api/status` endpoint of your deployed API for memory usage statistics.

## Scaling

Railway allows you to scale your service as needed:

- Increase memory allocation in the Railway dashboard
- Adjust the number of replicas in `railway.json`
- Consider implementing database-based storage instead of memory fallback for multi-instance deployments

## Security Considerations

- Ensure all environment variables containing secrets are properly set in Railway
- Never commit sensitive credentials to your repository
- Consider implementing rate limiting for API endpoints
- Use HTTPS for all communications between frontend and backend

For additional help, consult the [Railway documentation](https://docs.railway.app/).