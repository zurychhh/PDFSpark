#!/bin/bash
set -e

echo "===== Railway CORS Fix Script (Manual Version) ====="

# Define URLs
RAILWAY_BACKEND_URL="https://pdfspark-production-production.up.railway.app"
VERCEL_FRONTEND_URL="https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app"

echo "Backend URL: $RAILWAY_BACKEND_URL"
echo "Frontend URL: $VERCEL_FRONTEND_URL"

# Create a .env file with all the necessary CORS settings
cat > railway-cors-config.env << EOF
# CORS Configuration for Railway
CORS_ALLOW_ALL=true
CORS_ORIGIN=$VERCEL_FRONTEND_URL
ALLOWED_ORIGINS=$VERCEL_FRONTEND_URL

# Railway optimizations
NODE_ENV=production
PORT=3000
USE_MEMORY_FALLBACK=true
MEMORY_MANAGEMENT_AGGRESSIVE=true
TEMP_DIR=/tmp
UPLOAD_DIR=/tmp/uploads
LOG_DIR=/tmp/logs
CLOUDINARY_OPTIMIZED=true
NODE_OPTIONS=--max-old-space-size=2048
EOF

echo "✅ Created railway-cors-config.env with all required variables:"
cat railway-cors-config.env

echo ""
echo "===== CORS Fix Test ====="

# Test if the backend CORS is already set properly
echo "Testing backend CORS configuration..."
curl -s -I -X OPTIONS -H "Origin: $VERCEL_FRONTEND_URL" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Content-Type" \
     "$RAILWAY_BACKEND_URL/health" | grep -i "access-control-allow"

# Check also with the API endpoint 
echo ""
echo "Testing API endpoint CORS..."
curl -s -I -X OPTIONS -H "Origin: $VERCEL_FRONTEND_URL" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Content-Type" \
     "$RAILWAY_BACKEND_URL/api/diagnostic/health" | grep -i "access-control-allow"

echo ""
echo "===== MANUAL RAILWAY CONFIGURATION STEPS ====="
echo "Since Railway CLI often requires interactive authentication, please perform these steps manually:"
echo ""
echo "1. Log in to Railway dashboard: https://railway.app/dashboard"
echo "2. Go to your pdfspark-production project"
echo "3. Select the 'backend' service (or the main service in your project)"
echo "4. Click on the 'Variables' tab"
echo "5. Add or update these environment variables:"
echo ""
echo "   CORS_ALLOW_ALL = true"
echo "   CORS_ORIGIN = $VERCEL_FRONTEND_URL"
echo "   ALLOWED_ORIGINS = $VERCEL_FRONTEND_URL"
echo "   USE_MEMORY_FALLBACK = true"
echo "   MEMORY_MANAGEMENT_AGGRESSIVE = true"
echo "   TEMP_DIR = /tmp"
echo "   UPLOAD_DIR = /tmp/uploads"
echo "   LOG_DIR = /tmp/logs"
echo ""
echo "6. Click 'Deploy' to apply the changes"
echo "7. After deployment completes, test your application again"
echo ""
echo "===== FRONTEND CONFIGURATION ====="
echo "Make sure your frontend is properly configured with:"
echo ""
echo "   VITE_API_URL = $RAILWAY_BACKEND_URL"
echo "   VITE_API_BASE_URL = $RAILWAY_BACKEND_URL"
echo ""
echo "You can use the update-frontend-config.sh script to update these settings"
echo ""
echo "===== TESTING YOUR CONNECTION ====="
echo "Once you've completed the steps above, test your configuration with:"
echo ""
echo "1. Test backend health endpoint:"
echo "   curl $RAILWAY_BACKEND_URL/health"
echo ""
echo "2. Test CORS configuration:"
echo "   curl -s -I -X OPTIONS -H \"Origin: $VERCEL_FRONTEND_URL\" -H \"Access-Control-Request-Method: GET\" $RAILWAY_BACKEND_URL/health | grep -i \"access-control-allow\""
echo ""
echo "3. Visit your Vercel frontend and check browser console for CORS errors:"
echo "   $VERCEL_FRONTEND_URL"