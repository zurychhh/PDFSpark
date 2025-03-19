#\!/bin/bash
set -e

# This script configures critical environment variables for Railway deployment

echo "Configuring environment variables for Railway..."

# Verify railway CLI is logged in
echo "Verifying Railway CLI login..."
if \! railway whoami &> /dev/null; then
    echo "Error: Railway CLI is not logged in."
    echo "Please run 'railway login' before executing this script."
    exit 1
else
    echo "✅ Railway CLI is logged in"
fi

# Memory and filesystem optimizations
echo "Setting memory and filesystem optimizations..."
railway variables set USE_MEMORY_FALLBACK=true
railway variables set TEMP_DIR=/tmp
railway variables set UPLOAD_DIR=/tmp/uploads
railway variables set LOG_DIR=/tmp/logs

# Node.js configuration
echo "Setting Node.js configuration..."
railway variables set NODE_ENV=production
railway variables set PORT=3000

# CORS and other configurations
echo "Setting CORS and other configurations..."
railway variables set CORS_ALLOW_ALL=true

echo "✅ Environment variables configured successfully\!"

# Prompt for Cloudinary verification
echo "Do you want to verify Cloudinary credentials? (y/n)"
read verify_cloudinary

if [[ "$verify_cloudinary" == "y" ]]; then
    echo "Please enter your Cloudinary cloud name (leave empty to skip):"
    read cloudinary_name
    if [[ -n "$cloudinary_name" ]]; then
        railway variables set CLOUDINARY_CLOUD_NAME="$cloudinary_name"
        echo "✅ CLOUDINARY_CLOUD_NAME set"
    fi
    
    echo "Please enter your Cloudinary API key (leave empty to skip):"
    read cloudinary_key
    if [[ -n "$cloudinary_key" ]]; then
        railway variables set CLOUDINARY_API_KEY="$cloudinary_key"
        echo "✅ CLOUDINARY_API_KEY set"
    fi
    
    echo "Please enter your Cloudinary API secret (leave empty to skip):"
    read -s cloudinary_secret
    if [[ -n "$cloudinary_secret" ]]; then
        railway variables set CLOUDINARY_API_SECRET="$cloudinary_secret"
        echo "✅ CLOUDINARY_API_SECRET set"
    fi
fi

echo "Do you want to verify MongoDB configuration? (y/n)"
read verify_mongodb

if [[ "$verify_mongodb" == "y" ]]; then
    echo "Please enter your MongoDB URI (leave empty to skip):"
    read -s mongodb_uri
    if [[ -n "$mongodb_uri" ]]; then
        railway variables set MONGODB_URI="$mongodb_uri"
        echo "✅ MONGODB_URI set"
    fi
fi

echo "Do you want to set advanced memory options? (y/n)"
read advanced_memory

if [[ "$advanced_memory" == "y" ]]; then
    # Increase memory allocation in the deployment configuration
    echo "Updating Railway configuration for memory optimization..."
    
    # Create or update .railway/config.json with increased memory allocation
    mkdir -p .railway
    echo '{
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "numReplicas": 1,
    "startCommand": "node --max-old-space-size=2048 railway-entry.js"
  }
}' > .railway/config.json
    
    echo "✅ Advanced memory configuration set"
fi

echo "Environment configuration complete\! Ready to deploy."
echo "Run 'railway up' to deploy your application with these settings."
