#!/bin/bash

# PDFSpark Railway Docker Deployment Script
# This script builds the Docker image and deploys it to Railway

set -e # Exit on error

echo "=== PDFSpark Railway Docker Deployment ==="
echo "Deployment timestamp: $(date)"

# Verify we have the railway CLI installed
if ! command -v railway &> /dev/null; then
    echo "❌ ERROR: Railway CLI not found"
    echo "Please install it with: npm i -g @railway/cli"
    exit 1
fi

# Check if we are logged in to Railway
railway whoami || {
    echo "❌ ERROR: Not logged in to Railway"
    echo "Please login with: railway login"
    exit 1
}

# Verify required environment variables are set in Railway
echo "Verifying Railway environment variables..."
railway variables list > /tmp/railway_vars.txt

# Check for critical environment variables
CRITICAL_VARS=(
    "MONGODB_URI"
    "CLOUDINARY_CLOUD_NAME"
    "CLOUDINARY_API_KEY"
    "CLOUDINARY_API_SECRET"
    "USE_MEMORY_FALLBACK"
    "TEMP_DIR"
    "UPLOAD_DIR"
    "LOG_DIR"
)

MISSING_VARS=0
for var in "${CRITICAL_VARS[@]}"; do
    if ! grep -q "$var" /tmp/railway_vars.txt; then
        echo "⚠️ WARNING: $var is not set in Railway. This may cause issues."
        MISSING_VARS=$((MISSING_VARS + 1))
    fi
done

if [ $MISSING_VARS -gt 0 ]; then
    echo
    echo "⚠️ $MISSING_VARS critical environment variables are missing."
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled."
        exit 1
    fi
fi

# Build the Docker image
echo
echo "Building Docker image for deployment..."
docker build -t pdfspark-railway .

# Deploy to Railway using Dockerfile
echo
echo "Deploying to Railway..."
railway up --dockerfile ./Dockerfile

echo
echo "✅ Deployment command completed!"
echo
echo "To check deployment status, run:"
echo "railway status"
echo
echo "To view logs, run:"
echo "railway logs"
echo
echo "To open the Railway dashboard, run:"
echo "railway open"