#!/bin/bash
set -e

echo "===== PDFSpark Frontend Config Update Script ====="

# Railway backend URL - updated for production
RAILWAY_BACKEND_URL="https://pdfspark-production-production.up.railway.app"
VERCEL_FRONTEND_URL="https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app"

echo "Using Railway backend URL: $RAILWAY_BACKEND_URL"
echo "Using Vercel frontend URL: $VERCEL_FRONTEND_URL"

# Update local .env file for testing
echo "Updating local .env file..."
cat > .env.local << EOF
VITE_API_URL=$RAILWAY_BACKEND_URL
VITE_API_BASE_URL=$RAILWAY_BACKEND_URL
EOF

echo "✅ Created local .env.local file with updated API URL"

# Create a .env.production file
echo "Creating .env.production file..."
cat > .env.production << EOF
VITE_API_URL=$RAILWAY_BACKEND_URL
VITE_API_BASE_URL=$RAILWAY_BACKEND_URL
EOF

echo "✅ Created .env.production file with updated API URL"

# Update vercel.json if it exists
if [ -f "vercel.json" ]; then
  echo "Checking vercel.json..."
  
  # Check if vercel.json has environment variables section
  if grep -q "\"env\"" vercel.json; then
    echo "Updating vercel.json environment variables..."
    # Use temporary file because sed -i behaves differently on macOS and Linux
    cat vercel.json | jq ".env.VITE_API_URL = \"$RAILWAY_BACKEND_URL\" | .env.VITE_API_BASE_URL = \"$RAILWAY_BACKEND_URL\"" > vercel.json.tmp
    mv vercel.json.tmp vercel.json
  else
    echo "Adding environment variables to vercel.json..."
    # Add env section if it doesn't exist
    cat vercel.json | jq ". += {\"env\": {\"VITE_API_URL\": \"$RAILWAY_BACKEND_URL\", \"VITE_API_BASE_URL\": \"$RAILWAY_BACKEND_URL\"}}" > vercel.json.tmp
    mv vercel.json.tmp vercel.json
  fi
  
  echo "✅ vercel.json updated"
else
  echo "Creating new vercel.json..."
  cat > vercel.json << EOF
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist"
      }
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ],
  "env": {
    "VITE_API_URL": "$RAILWAY_BACKEND_URL",
    "VITE_API_BASE_URL": "$RAILWAY_BACKEND_URL"
  }
}
EOF

  echo "✅ Created new vercel.json file with environment variables"
fi

echo "===== Configuration Update Complete ====="
echo ""
echo "Next steps:"
echo "1. Make sure the Railway backend has CORS_ALLOW_ALL=true set"
echo "2. Verify the Railway backend's configured allowed origins include: $VERCEL_FRONTEND_URL"
echo "3. Run the CORS fix script: ./railway-cors-fix.sh"
echo "4. Redeploy your frontend to Vercel with: vercel --prod"
echo "5. Test the frontend-backend connection"
