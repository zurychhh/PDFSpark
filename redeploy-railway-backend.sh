#!/bin/bash
set -e

echo "===== PDFSpark Railway Backend Redeployment Script ====="

# Define URLs - Keep the same URLs for consistency
RAILWAY_BACKEND_URL="https://pdfspark-production-production.up.railway.app"
VERCEL_FRONTEND_URL="https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app"

echo "Backend URL: $RAILWAY_BACKEND_URL"
echo "Frontend URL: $VERCEL_FRONTEND_URL"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Railway CLI is not installed. Installing..."
    npm install -g @railway/cli
fi

# Print Railway CLI version
echo "Railway CLI version:"
railway --version

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

# Set critical environment variables for Railway's constrained environment
echo "Setting up environment variables for optimized Railway deployment..."

echo "Setting memory optimization variables..."
railway variables set USE_MEMORY_FALLBACK=true
railway variables set MEMORY_MANAGEMENT_AGGRESSIVE=true
railway variables set NODE_OPTIONS=--max-old-space-size=2048

echo "Setting file storage variables..."
railway variables set TEMP_DIR=/tmp
railway variables set UPLOAD_DIR=/tmp/uploads
railway variables set LOG_DIR=/tmp/logs

echo "Setting CORS configuration..."
railway variables set CORS_ALLOW_ALL=true
railway variables set CORS_ORIGIN=$VERCEL_FRONTEND_URL
railway variables set ALLOWED_ORIGINS=$VERCEL_FRONTEND_URL

echo "Setting core environment variables..."
railway variables set NODE_ENV=production
railway variables set PORT=3000

# Confirm Cloudinary variables
echo ""
echo "Cloudinary configuration is required for Railway deployment."
echo "Enter your Cloudinary Cloud Name (default: dciln75i0):"
read -r cloud_name
cloud_name=${cloud_name:-dciln75i0}

echo "Enter your Cloudinary API Key (default: 756782232717326):"
read -r api_key
api_key=${api_key:-756782232717326}

echo "Enter your Cloudinary API Secret:"
read -rs api_secret

if [ -n "$api_secret" ]; then
  echo "Setting Cloudinary variables..."
  railway variables set CLOUDINARY_CLOUD_NAME="$cloud_name"
  railway variables set CLOUDINARY_API_KEY="$api_key"
  railway variables set CLOUDINARY_API_SECRET="$api_secret"
  railway variables set CLOUDINARY_SOURCE_FOLDER="pdfspark_railway_sources"
  railway variables set CLOUDINARY_RESULT_FOLDER="pdfspark_railway_results"
  railway variables set CLOUDINARY_MAX_CONCURRENT_UPLOADS=3
else
  echo "⚠️ Cloudinary API Secret not provided. Deployment may not function correctly without Cloudinary!"
fi

# Deploy the app
echo ""
echo "===== Deploying to Railway ====="
echo "Starting deployment... This may take a few minutes."
railway up --detach

echo ""
echo "===== Next Steps ====="
echo "1. Check the Railway dashboard to monitor deployment status"
echo "2. Once deployed, run './verify-deployment.sh' to verify the deployment"
echo "3. Check CORS configuration with './railway-cors-fix.sh'"
echo "4. If needed, update frontend configuration with './update-frontend-config.sh'"