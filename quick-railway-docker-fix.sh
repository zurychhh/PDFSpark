#!/bin/bash

# Quick Railway Docker Deployment Fix Script for PDFSpark
# This script implements the most likely fixes for Railway Docker deployment issues
# It's a non-interactive version for quick application of fixes

set -e # Exit on error

echo "=== PDFSpark Quick Railway Docker Fix ==="
echo "Started at: $(date)"

# Check for Railway CLI
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found"
    echo "Please install it with: npm i -g @railway/cli"
    exit 1
fi

# Verify Railway login
if ! railway whoami &> /dev/null; then
    echo "❌ Not logged in to Railway"
    echo "Please login with: railway login"
    exit 1
fi

echo "✅ Railway CLI is installed and authenticated"

# Ensure proper railway.json exists
cat > railway.json << 'EOF'
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "./Dockerfile"
  },
  "deploy": {
    "startCommand": "node --expose-gc --max-old-space-size=2048 railway-entry.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
EOF

echo "✅ Updated railway.json with Docker configuration"

# Remove any competing configuration
if [[ -f "backend/railway.json" ]]; then
    mv backend/railway.json backend/railway.json.backup
    echo "✅ Moved competing backend/railway.json to backup"
fi

# Set critical environment variables
echo "Setting critical environment variables..."
railway variables --set USE_MEMORY_FALLBACK=true
railway variables --set TEMP_DIR=/tmp
railway variables --set UPLOAD_DIR=/tmp/uploads
railway variables --set LOG_DIR=/tmp/logs
railway variables --set CORS_ALLOW_ALL=true
railway variables --set MEMORY_MANAGEMENT_AGGRESSIVE=true

echo "✅ Set critical environment variables"

# Verify the Dockerfile exists
if [[ ! -f "Dockerfile" ]]; then
    echo "❌ Dockerfile not found!"
    exit 1
fi

echo "✅ Dockerfile exists"

# Deploy to Railway
echo "Deploying to Railway with Docker..."
railway up

echo "✅ Deployment initiated"

echo
echo "=== Checking Deployment Status ==="
sleep 5  # Give it a moment to start deployment
railway status

echo
echo "=== Recent Logs ==="
railway logs --limit 20

echo
echo "=== Quick Fix Complete ==="
echo "To check deployment status, run: railway status"
echo "To view logs, run: railway logs"
echo "For more detailed diagnostics, run: ./diagnose-railway-deployment.sh"
echo
echo "Completed at: $(date)"