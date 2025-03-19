#!/bin/bash
set -e

# Verify Railway Deployment

echo "==============================================="
echo "PDFSpark Railway Deployment Verification"
echo "==============================================="

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Railway CLI is not installed. Installing..."
    npm install -g @railway/cli
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "You need to login to Railway first. Run 'railway login' and try again."
    exit 1
fi

# Check deployment status
echo "Checking deployment status..."
railway status

# Get service URL
echo "Fetching application URL..."
railway variables get RAILWAY_PUBLIC_DOMAIN || echo "Could not fetch public domain"

# Check application health
DOMAIN=$(railway variables get RAILWAY_PUBLIC_DOMAIN 2>/dev/null)
if [ -n "$DOMAIN" ]; then
    echo "Testing application health at https://$DOMAIN/health..."
    if command -v curl &> /dev/null; then
        curl -s "https://$DOMAIN/health" || echo "Failed to reach health endpoint"
    else
        echo "curl not available, skipping health check"
    fi
else
    echo "No public domain found, skipping health check"
fi

# Verify environment variables
echo "Checking critical environment variables..."
railway variables get USE_MEMORY_FALLBACK
railway variables get CLOUDINARY_CLOUD_NAME
railway variables get CLOUDINARY_API_KEY
railway variables get PORT

# Check deployment logs
echo "Fetching recent logs (last 10 lines)..."
railway logs --limit 10

echo "==============================================="
echo "Verification complete"
echo "==============================================="