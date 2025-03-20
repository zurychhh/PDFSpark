# PDFSpark Cloudinary Integration

This document explains the integration of Cloudinary into the PDFSpark application deployed on Railway.

## Implementation Summary

We've implemented step 1 (Etap 1) of the PDFSpark functionality restoration plan, which focuses on adding Cloudinary integration to the application. The implementation includes:

1. **Updated Dockerfile** with:
   - Installation of required packages (express, cors, cloudinary)
   - Creation of a basic Express server with Cloudinary configuration
   - Implementation of health and Cloudinary status endpoints

2. **Enhanced railway-entry.js** that:
   - Provides detailed startup diagnostics
   - Checks for Cloudinary configuration
   - Creates necessary temporary directories
   - Logs environment variables (without exposing secrets)

3. **Added deployment scripts**:
   - `deploy-cloudinary-railway.sh` - Interactive deployment script
   - `deploy-railway-noninteractive.sh` - Non-interactive deployment script
   - `test-cloudinary-connection.js` - Script to test Cloudinary connectivity

## Configuration

To use this integration, you need to set the following environment variables in Railway:

```
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
USE_MEMORY_FALLBACK=true
```

## API Endpoints

The current implementation includes the following endpoints:

1. **GET /** - Root endpoint returning a simple message
2. **GET /health** - Health check endpoint required by Railway
   - Returns: `{ status: "ok", message: "PDFSpark API is running", usingCloudinary: true|false }`
3. **GET /api/cloudinary/status** - Endpoint to check Cloudinary connectivity
   - Returns: `{ status: "ok", cloudinaryStatus: "ok" }` if configured correctly
   - Returns: `{ status: "not_configured", message: "Cloudinary is not configured" }` if not configured

## Deployment Instructions

### Option 1: Interactive Deployment

```bash
./deploy-cloudinary-railway.sh
```

This script will:
1. Check if Railway CLI is installed
2. Verify you're logged into Railway
3. Prompt for Cloudinary credentials
4. Deploy the application to Railway with these credentials

### Option 2: Non-interactive Deployment

```bash
export CLOUDINARY_CLOUD_NAME=your_cloud_name
export CLOUDINARY_API_KEY=your_api_key
export CLOUDINARY_API_SECRET=your_api_secret
./deploy-railway-noninteractive.sh
```

### Testing the Deployment

After deployment, you can test the Cloudinary integration:

```bash
# Get your Railway app URL
railway service

# Test your deployed app
node test-cloudinary-connection.js https://your-app-url.railway.app
```

## Next Steps

According to the restoration plan, the next steps are:

1. **Etap 2**: Add memory fallback mechanism
   - Implement in-memory storage for operations and files
   - Test the fallback mechanism

2. **Etap 3**: Add file handling and upload functionality
   - Implement file upload endpoints
   - Store uploaded files in Cloudinary (with fallback to local/memory)

3. **Etap 4**: Restore PDF conversion capabilities
   - Implement conversion endpoints
   - Add necessary libraries for PDF processing

## Troubleshooting

If you encounter issues with the Cloudinary integration:

1. **Check environment variables** 
   - Use the Railway dashboard to verify the Cloudinary variables are set correctly
   - Look at application logs to ensure they're being properly loaded

2. **Verify Cloudinary account**
   - Confirm your Cloudinary account is active
   - Check if you have necessary permissions and usage limits

3. **Review application logs**
   - Run `railway logs` to see detailed application logs
   - Look for Cloudinary-related error messages