#!/bin/bash

# Railway Docker Deployment Fix Script
# This script checks and updates the Docker configuration for Railway deployment

set -e # Exit on error

echo "=== PDFSpark Railway Docker Deployment Fix ==="
echo "Started at: $(date)"
echo

# 1. Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found"
    echo "Please install it with: npm install -g @railway/cli"
    exit 1
fi

# 2. Verify Railway login
echo "Checking Railway login status..."
if ! railway whoami &> /dev/null; then
    echo "❌ Not logged in to Railway"
    echo "Please login with: railway login"
    exit 1
fi

echo "✅ Logged in to Railway"
echo

# 3. Verify docker files exist
echo "Checking Dockerfile..."
if [[ ! -f "Dockerfile" ]]; then
    echo "❌ Dockerfile not found in current directory!"
    exit 1
fi

echo "✅ Dockerfile exists"
echo

# 4. Verify railway.json
echo "Checking railway.json..."
if [[ ! -f "railway.json" ]]; then
    echo "❌ railway.json not found! Creating it..."
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
    echo "✅ Created railway.json with Docker configuration"
else
    echo "✅ railway.json exists - checking configuration..."
    # Check if railway.json has DOCKERFILE builder
    if ! grep -q "DOCKERFILE" railway.json; then
        echo "⚠️ railway.json doesn't seem to be configured for Docker"
        echo "Do you want to replace it with a Docker-configured version? (y/n)"
        read -r response
        if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
            mv railway.json railway.json.backup
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
            echo "✅ Updated railway.json with Docker configuration (backup at railway.json.backup)"
        else
            echo "Skipping railway.json update"
        fi
    else
        echo "✅ railway.json is configured for Docker"
    fi
fi

echo

# 5. Remove any potentially competing configuration
echo "Checking for other railway.json files..."
if [[ -f "backend/railway.json" ]]; then
    echo "⚠️ Found railway.json in backend directory. This might conflict with root railway.json."
    echo "Do you want to remove it? (y/n)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        mv backend/railway.json backend/railway.json.backup
        echo "✅ Moved backend/railway.json to backend/railway.json.backup"
    else
        echo "Skipping backend/railway.json removal"
    fi
fi

echo

# 6. Remove any Docker build cache if needed
echo "Do you want to clean Docker build cache in Railway? This might help with persistent build issues. (y/n)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo "Running railway down to remove build cache..."
    railway down
    echo "Railway project resources have been removed"
fi

echo

# 7. Verify critical environment variables
echo "Checking critical environment variables in Railway..."
railway variables list > /tmp/railway-vars-output.txt

REQUIRED_VARS=(
    "USE_MEMORY_FALLBACK"
    "CLOUDINARY_CLOUD_NAME"
    "CLOUDINARY_API_KEY" 
    "CLOUDINARY_API_SECRET"
    "CORS_ALLOW_ALL"
    "TEMP_DIR"
    "UPLOAD_DIR"
    "LOG_DIR"
)

MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "$var=" /tmp/railway-vars-output.txt; then
        MISSING_VARS+=("$var")
    fi
done

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
    echo "⚠️ The following critical environment variables are missing:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    
    echo "Do you want to set default values for these variables? (y/n)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        if [[ " ${MISSING_VARS[*]} " =~ " USE_MEMORY_FALLBACK " ]]; then
            railway variables --set USE_MEMORY_FALLBACK=true
            echo "✅ Set USE_MEMORY_FALLBACK=true"
        fi
        
        if [[ " ${MISSING_VARS[*]} " =~ " CORS_ALLOW_ALL " ]]; then
            railway variables --set CORS_ALLOW_ALL=true
            echo "✅ Set CORS_ALLOW_ALL=true"
        fi
        
        if [[ " ${MISSING_VARS[*]} " =~ " TEMP_DIR " ]]; then
            railway variables --set TEMP_DIR=/tmp
            echo "✅ Set TEMP_DIR=/tmp"
        fi
        
        if [[ " ${MISSING_VARS[*]} " =~ " UPLOAD_DIR " ]]; then
            railway variables --set UPLOAD_DIR=/tmp/uploads
            echo "✅ Set UPLOAD_DIR=/tmp/uploads"
        fi
        
        if [[ " ${MISSING_VARS[*]} " =~ " LOG_DIR " ]]; then
            railway variables --set LOG_DIR=/tmp/logs
            echo "✅ Set LOG_DIR=/tmp/logs"
        fi
        
        if [[ " ${MISSING_VARS[*]} " =~ " CLOUDINARY_CLOUD_NAME " || " ${MISSING_VARS[*]} " =~ " CLOUDINARY_API_KEY " || " ${MISSING_VARS[*]} " =~ " CLOUDINARY_API_SECRET " ]]; then
            echo "⚠️ Cloudinary credentials are missing. These are required for proper file handling in Railway."
            echo "Do you want to add your Cloudinary credentials now? (y/n)"
            read -r response
            if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
                echo "Enter your Cloudinary Cloud Name:"
                read -r cloudName
                echo "Enter your Cloudinary API Key:"
                read -r apiKey
                echo "Enter your Cloudinary API Secret:"
                read -r apiSecret
                
                railway variables --set CLOUDINARY_CLOUD_NAME="$cloudName"
                railway variables --set CLOUDINARY_API_KEY="$apiKey"
                railway variables --set CLOUDINARY_API_SECRET="$apiSecret"
                echo "✅ Set Cloudinary credentials"
            else
                echo "⚠️ Skipping Cloudinary credentials setup. App may not work properly!"
            fi
        fi
    else
        echo "⚠️ Skipping environment variable setup. App may not work properly!"
    fi
else
    echo "✅ All critical environment variables are set"
fi

echo

# 8. Deploy to Railway
echo "Ready to deploy to Railway with Docker!"
echo "Do you want to deploy now? (y/n)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo "Deploying to Railway..."
    railway up
    
    echo
    echo "Deployment initiated! To check status, run:"
    echo "railway status"
    echo
    echo "To view logs after deployment, run:"
    echo "railway logs"
else
    echo "Deployment skipped!"
fi

echo
echo "=== PDFSpark Railway Docker Deployment Fix Completed ==="
echo "Completed at: $(date)"