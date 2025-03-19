#!/bin/bash
set -e

# Fix Railway Deployment Issue Script (Non-Interactive Version)
# This script handles the MCP server scopes rename issue and redeploys the application

# Set the project name to link to (just for display purposes)
PROJECT_NAME="pdfspark-ch1"

echo "==============================================="
echo "PDFSpark Railway Deployment Fix (Non-Interactive)"
echo "==============================================="
echo "This script will fix the Railway deployment issue"
echo "related to MCP server scopes rename ('project' to 'local')"
echo "Target project: $PROJECT_NAME"
echo ""

# Check Railway CLI version
echo "Checking Railway CLI version..."
if ! command -v railway &> /dev/null; then
    echo "Railway CLI is not installed. Installing..."
    npm install -g @railway/cli
fi

# Print Railway CLI version
railway --version

# Login to Railway if needed - this might still require interactive login
if ! railway whoami &> /dev/null; then
    echo "Please login to Railway first:"
    railway login
fi

# List available projects
echo "Listing available projects..."
railway list

echo "Note: You will need to manually select the project when prompted."
echo "Please select '$PROJECT_NAME' when the interactive prompt appears."
echo "Press Enter to continue with project linking..."
read -r

# Link to project (will require interactive selection)
echo "Linking to project..."
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

# Set Cloudinary variables
echo "Setting Cloudinary variables..."
railway variables set CLOUDINARY_CLOUD_NAME=dciln75i0
railway variables set CLOUDINARY_API_KEY=756782232717326

# Check if Cloudinary secret is already set
API_SECRET=$(railway variables get CLOUDINARY_API_SECRET 2>/dev/null || echo "missing")
if [ "$API_SECRET" = "missing" ]; then
    echo "CLOUDINARY_API_SECRET is not set."
    echo "Please set it manually after deployment with:"
    echo "railway variables set CLOUDINARY_API_SECRET=your_secret_here"
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