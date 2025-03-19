#!/bin/bash
set -e

# Fix Railway Deployment Issue Script
# This script handles the MCP server scopes rename issue and redeploys the application

echo "==============================================="
echo "PDFSpark Railway Deployment Fix"
echo "==============================================="
echo "This script will fix the Railway deployment issue"
echo "related to MCP server scopes rename ('project' to 'local')"
echo ""

# Check Railway CLI version
echo "Checking Railway CLI version..."
if ! command -v railway &> /dev/null; then
    echo "Railway CLI is not installed. Installing..."
    npm install -g @railway/cli
fi

# Print Railway CLI version
railway --version

# Login to Railway if needed
if ! railway whoami &> /dev/null; then
    echo "Please login to Railway first:"
    railway login
fi

# List available projects
echo "Listing available projects..."
railway list

# Link to project
echo "Select your project to connect to:"
railway link

# Check current status
echo "Checking current deployment status..."
railway status

# Set critical environment variables
echo "Setting critical environment variables..."
railway variables set USE_MEMORY_FALLBACK=true
railway variables set TEMP_DIR=/app/temp
railway variables set UPLOAD_DIR=/app/uploads
railway variables set LOG_DIR=/app/logs
railway variables set PORT=3000
railway variables set NODE_ENV=production
railway variables set CORS_ALLOW_ALL=true

# Verify Cloudinary variables
echo "Verifying Cloudinary variables..."
CLOUD_NAME=$(railway variables get CLOUDINARY_CLOUD_NAME 2>/dev/null || echo "missing")
API_KEY=$(railway variables get CLOUDINARY_API_KEY 2>/dev/null || echo "missing")
API_SECRET=$(railway variables get CLOUDINARY_API_SECRET 2>/dev/null || echo "missing")

if [ "$CLOUD_NAME" = "missing" ] || [ "$API_KEY" = "missing" ] || [ "$API_SECRET" = "missing" ]; then
    echo "Cloudinary variables are missing. Let's set them:"
    
    echo "Setting Cloudinary variables..."
    railway variables set CLOUDINARY_CLOUD_NAME=dciln75i0
    railway variables set CLOUDINARY_API_KEY=756782232717326
    
    echo "Enter your Cloudinary API Secret:"
    read -rs cloudinary_secret
    railway variables set CLOUDINARY_API_SECRET="$cloudinary_secret"
fi

# Deploy the application
echo "Deploying the application..."
railway up --detach

echo "Deployment initiated. Checking status..."
sleep 10
railway status

echo "==============================================="
echo "If the deployment is still in progress, wait a few minutes"
echo "and then check the status with: railway status"
echo "You can also check the logs with: railway logs"
echo "==============================================="