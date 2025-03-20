#!/bin/bash

# Non-interactive Railway deployment script with Cloudinary integration
# Usage: 
#   export CLOUDINARY_CLOUD_NAME=your_cloud_name
#   export CLOUDINARY_API_KEY=your_api_key
#   export CLOUDINARY_API_SECRET=your_api_secret
#   ./deploy-railway-noninteractive.sh

echo "Deploying PDFSpark with Cloudinary integration to Railway (non-interactive mode)..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Railway CLI is not installed. Please install it first:"
    echo "npm i -g @railway/cli"
    exit 1
fi

# Check if logged in to Railway
if ! railway whoami &> /dev/null; then
    echo "Not logged in to Railway. Please login first with: railway login"
    exit 1
fi

# Validate env variables
if [ -z "$CLOUDINARY_CLOUD_NAME" ] || [ -z "$CLOUDINARY_API_KEY" ] || [ -z "$CLOUDINARY_API_SECRET" ]; then
    echo "Error: Required environment variables not set. Please set:"
    echo "- CLOUDINARY_CLOUD_NAME"
    echo "- CLOUDINARY_API_KEY"
    echo "- CLOUDINARY_API_SECRET"
    exit 1
fi

echo "Starting Railway deployment with Cloudinary integration..."
echo "Using Cloud Name: $CLOUDINARY_CLOUD_NAME"
echo "API Key and Secret: [SET]"

# Deploy to Railway with environment variables
railway variables set CLOUDINARY_CLOUD_NAME="$CLOUDINARY_CLOUD_NAME"
railway variables set CLOUDINARY_API_KEY="$CLOUDINARY_API_KEY"
railway variables set CLOUDINARY_API_SECRET="$CLOUDINARY_API_SECRET"
railway variables set USE_MEMORY_FALLBACK="true"

# Deploy to Railway
railway up --detach

if [ $? -eq 0 ]; then
    echo "Deployment initiated successfully!"
    echo "To check status, run: railway status"
    echo "To view logs, run: railway logs"
    echo "To get the URL, run: railway service"
else
    echo "Deployment failed. Please check errors above."
    exit 1
fi

# Try to get service URL
SERVICE_URL=$(railway service | grep https | tr -s ' ' | cut -d ' ' -f5 2>/dev/null)
if [ ! -z "$SERVICE_URL" ]; then
    echo -e "\nDeployed service URL: $SERVICE_URL"
    echo "You can test the Cloudinary integration with:"
    echo "node test-cloudinary-connection.js $SERVICE_URL"
fi