#!/bin/bash
set -e

echo "===== PDFSpark Railway Deployment Status Check ====="

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

# Check deployment status
echo ""
echo "===== Railway Deployment Status ====="
echo "Checking status of current deployment..."
railway status

# Check environment variables
echo ""
echo "===== Railway Environment Variables ====="
echo "Fetching current environment variables..."
railway variables list | grep -v "CLOUDINARY_API_SECRET"

# Try to make a simple HTTP request to check if the service is responding
echo ""
echo "===== Testing Backend Connectivity ====="
echo "Testing health endpoint: $RAILWAY_BACKEND_URL/health"
if curl -s --head --fail "$RAILWAY_BACKEND_URL/health" > /dev/null; then
    echo "✅ Backend health endpoint is responding"
else
    echo "❌ Backend health endpoint is not responding"
    echo "This could mean the service is not running or the URL is incorrect."
fi

# Check CORS configuration
echo ""
echo "===== Testing CORS Configuration ====="
echo "Testing CORS headers with frontend origin: $VERCEL_FRONTEND_URL"
CORS_HEADERS=$(curl -s -I -X OPTIONS \
  -H "Origin: $VERCEL_FRONTEND_URL" \
  -H "Access-Control-Request-Method: GET" \
  "$RAILWAY_BACKEND_URL/health" | grep -i "Access-Control-")

if [ -n "$CORS_HEADERS" ]; then
    echo "✅ CORS headers are present:"
    echo "$CORS_HEADERS"
else
    echo "❌ CORS headers are missing"
    echo "The backend may not be configured to allow requests from the frontend."
fi

echo ""
echo "===== Summary ====="
echo "To fix any issues detected:"
echo "1. If the backend is not responding, run './redeploy-railway-backend.sh'"
echo "2. If CORS headers are missing, update environment variables with './railway-cors-fix.sh'"
echo "3. If needed, update frontend configuration with './update-frontend-config.sh'"
echo "4. Run a complete verification with './verify-deployment.sh'"