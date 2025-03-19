#!/bin/bash
set -e

# This script is meant to be run locally to deploy to Railway with updated CLI commands

# Generate a configuration summary before deploying
echo "==============================================="
echo "PDFSpark Railway Deployment Configuration"
echo "==============================================="

echo "PORT: 3000"
echo "NODE_ENV: production"
echo "USE_MEMORY_FALLBACK: true"
echo "TEMP_DIR: /app/temp"
echo "UPLOAD_DIR: /app/uploads"
echo "LOG_DIR: /app/logs"
echo "CORS_ALLOW_ALL: true"
echo "RAILWAY_STATIC_BUILDPACK: true"
echo "FRONTEND_URL: https://react-pdfspark-jznh8pntd-zurychhhs-projects.vercel.app"
echo "RAILWAY ENTRY SCRIPT: railway-entry.js"
echo "HEALTH CHECK PATH: /health"
echo "HEALTH CHECK TIMEOUT: 30 seconds"

echo ""
echo "DEPLOYMENT INSTRUCTIONS FOR NEW RAILWAY CLI:"
echo "1. Run 'railway login' to authenticate with Railway"
echo "2. Run 'railway link' to connect to your Railway project"
echo "3. Set Cloudinary environment variables:"
echo "   railway variables set CLOUDINARY_CLOUD_NAME=dciln75i0"
echo "   railway variables set CLOUDINARY_API_KEY=756782232717326"
echo "   railway variables set CLOUDINARY_API_SECRET=<your_secret>"
echo "4. Set critical environment variables:"
echo "   railway variables set NODE_ENV=production"
echo "   railway variables set PORT=3000"
echo "   railway variables set USE_MEMORY_FALLBACK=true"
echo "   railway variables set CORS_ALLOW_ALL=true"
echo "   railway variables set TEMP_DIR=/app/temp"
echo "   railway variables set UPLOAD_DIR=/app/uploads"
echo "   railway variables set LOG_DIR=/app/logs"
echo "5. Run 'railway up' to deploy"
echo "6. Check deployment status with 'railway status'"
echo ""
echo "Modifications made to fix deployment:"
echo "- Updated to use new Railway CLI commands"
echo "- Fixed port mismatch (now consistently using port 3000)"
echo "- Updated railway-entry.js as the entry point"
echo "- Added correct environment variables for memory fallback"
echo "- Increased healthcheck timeout to 30 seconds"
echo "- Ensured CORS_ALLOW_ALL is set for easier testing"
echo "==============================================="

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Railway CLI is not installed. Installing..."
    npm install -g @railway/cli
fi

# Print Railway CLI version
echo "Railway CLI version:"
railway --version

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "You need to login to Railway first. Run 'railway login' and try again."
    exit 1
fi

# Link to project (interactive)
echo "Linking to Railway project..."
railway link

# Set environment variables
echo "Setting environment variables..."
railway variables set NODE_ENV=production
railway variables set PORT=3000
railway variables set USE_MEMORY_FALLBACK=true
railway variables set CORS_ALLOW_ALL=true
railway variables set TEMP_DIR=/app/temp
railway variables set UPLOAD_DIR=/app/uploads
railway variables set LOG_DIR=/app/logs
railway variables set RAILWAY_STATIC_BUILDPACK=true

# Confirm Cloudinary variables
echo "Do you want to set Cloudinary variables? (y/n)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo "Setting Cloudinary variables..."
    railway variables set CLOUDINARY_CLOUD_NAME=dciln75i0
    railway variables set CLOUDINARY_API_KEY=756782232717326
    
    echo "Enter your Cloudinary API Secret:"
    read -rs cloudinary_secret
    railway variables set CLOUDINARY_API_SECRET="$cloudinary_secret"
fi

# Deploy the app
echo "Deploying to Railway..."
railway up --detach

echo "Deployment started. Check status with 'railway status'"