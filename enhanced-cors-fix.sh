#!/bin/bash
set -e

echo "===== Enhanced Railway CORS Fix Script ====="

# Define URLs
RAILWAY_BACKEND_URL="https://pdfspark-production-production.up.railway.app"
VERCEL_FRONTEND_URL="https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app"

echo "Backend URL: $RAILWAY_BACKEND_URL"
echo "Frontend URL: $VERCEL_FRONTEND_URL"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Railway CLI is not installed. Installing..."
    npm install -g @railway/cli
fi

# Check if logged in
echo "Checking Railway CLI login status..."
if ! railway whoami &> /dev/null; then
    echo "You need to login to Railway first."
    echo "Run 'railway login' and then run this script again."
    exit 1
fi

echo "✅ Successfully logged in to Railway CLI"

# Link to project (interactive)
echo "Linking to Railway project... (Interactive prompt will follow)"
railway link

# Test if the backend is accessible
echo "Testing backend accessibility..."
if curl -s --head --fail "$RAILWAY_BACKEND_URL/health" > /dev/null; then
    echo "✅ Backend is accessible"
else
    echo "❌ Backend is not accessible"
    echo "The backend appears to be down or not deployed correctly."
    echo "Would you like to redeploy the backend? (y/n)"
    read -r redeploy
    if [[ "$redeploy" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        ./redeploy-railway-backend.sh
        echo "Backend redeployment initiated. Please wait for it to complete."
        echo "Once deployed, run this script again to configure CORS."
        exit 1
    else
        echo "Continuing with CORS configuration, but it may not take effect until the backend is accessible."
    fi
fi

# Test current CORS configuration
echo "Testing current CORS configuration..."
CORS_HEADERS=$(curl -s -I -X OPTIONS \
  -H "Origin: $VERCEL_FRONTEND_URL" \
  -H "Access-Control-Request-Method: GET" \
  "$RAILWAY_BACKEND_URL/health" | grep -i "Access-Control-")

if [ -n "$CORS_HEADERS" ]; then
    echo "Current CORS headers:"
    echo "$CORS_HEADERS"
    
    if echo "$CORS_HEADERS" | grep -q "$VERCEL_FRONTEND_URL"; then
        echo "✅ CORS appears to be correctly configured for the frontend origin"
        echo "Would you like to update the CORS configuration anyway? (y/n)"
        read -r update_cors
        if [[ ! "$update_cors" =~ ^([yY][eE][sS]|[yY])$ ]]; then
            echo "Skipping CORS configuration update."
            exit 0
        fi
    else
        echo "⚠️ CORS headers exist but don't include the frontend origin"
    fi
else
    echo "❌ No CORS headers detected"
fi

# Set CORS environment variables
echo "Setting CORS environment variables..."
railway variables set CORS_ALLOW_ALL=true
railway variables set CORS_ORIGIN=$VERCEL_FRONTEND_URL
railway variables set ALLOWED_ORIGINS=$VERCEL_FRONTEND_URL

echo "✅ CORS environment variables set successfully"

# Set memory optimization variables
echo "Setting memory optimization variables as well..."
railway variables set USE_MEMORY_FALLBACK=true
railway variables set MEMORY_MANAGEMENT_AGGRESSIVE=true

echo "✅ Memory optimization variables set"

# Prompt for redeploy
echo "Environment variables have been set, but to apply the changes, a redeployment is needed."
echo "Would you like to redeploy the backend now? (y/n)"
read -r redeploy
if [[ "$redeploy" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo "Redeploying backend..."
    railway up --detach
    echo "Redeployment initiated."
    echo "Please wait for the deployment to complete (this can take several minutes)."
else
    echo "CORS configuration is updated but won't take effect until you redeploy."
    echo "You can redeploy later using 'railway up' or through the Railway dashboard."
fi

echo ""
echo "===== Next Steps ====="
echo "1. After redeployment completes, run './verify-deployment.sh' to verify CORS configuration"
echo "2. If needed, update frontend configuration with './update-frontend-config.sh'"
echo "3. Test the application by visiting $VERCEL_FRONTEND_URL and checking browser console for CORS errors"