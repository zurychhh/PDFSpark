#!/bin/bash
set -e

echo "===== PDFSpark Deployment Verification Script ====="

BACKEND_URL="https://pdfspark-production-production.up.railway.app"
FRONTEND_URL="https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app"

echo "Backend URL: $BACKEND_URL"
echo "Frontend URL: $FRONTEND_URL"

echo ""
echo "Step 1: Testing basic backend connectivity..."
if curl -s "$BACKEND_URL/health" | grep -q "status.*ok"; then
  echo "✅ Backend is responding - Health check passed"
else
  echo "❌ Backend health check failed - please check if the service is running"
  exit 1
fi

echo ""
echo "Step 2: Testing backend diagnostic endpoints..."
if curl -s "$BACKEND_URL/api/diagnostic/memory" > /dev/null; then
  echo "✅ Memory diagnostic endpoint is responding"
else
  echo "❌ Memory diagnostic endpoint failed - API may not be fully functional"
fi

echo ""
echo "Step 3: Checking CORS headers for frontend origin..."
CORS_OUTPUT=$(curl -s -I -X OPTIONS \
  -H "Origin: $FRONTEND_URL" \
  -H "Access-Control-Request-Method: GET" \
  "$BACKEND_URL/health")

if echo "$CORS_OUTPUT" | grep -q "Access-Control-Allow-Origin"; then
  echo "✅ CORS headers are present - Response includes Access-Control-Allow-Origin"
  echo "Headers found:"
  echo "$CORS_OUTPUT" | grep -i "Access-Control-"
else
  echo "❌ CORS headers missing - The backend is not configured to allow the frontend origin"
  echo "Response headers:"
  echo "$CORS_OUTPUT"
  echo ""
  echo "Please run the railway-cors-fix.sh script or manually configure CORS settings"
fi

echo ""
echo "Step 4: Testing frontend configuration..."
FRONTEND_CONFIG=$(curl -s "$FRONTEND_URL/config")
if echo "$FRONTEND_CONFIG" | grep -q "VITE_API_URL" || echo "$FRONTEND_CONFIG" | grep -q "apiUrl"; then
  echo "✅ Frontend configuration detected"
  echo "$FRONTEND_CONFIG"
else
  echo "❌ Could not verify frontend configuration"
  echo "This is expected if the frontend doesn't expose its configuration publicly"
  echo "Please check the frontend environment variables in the Vercel dashboard"
fi

echo ""
echo "Step 5: Simulating a simple file upload request..."
UPLOAD_RESPONSE=$(curl -s -X POST \
  -H "Origin: $FRONTEND_URL" \
  -H "Content-Type: application/json" \
  -d '{"diagnostic": true}' \
  "$BACKEND_URL/test-upload" || echo "Request failed")

if echo "$UPLOAD_RESPONSE" | grep -q "No file received" || echo "$UPLOAD_RESPONSE" | grep -q "success"; then
  echo "✅ Upload endpoint is responding correctly (expecting a 'no file' error since we're not actually uploading)"
else
  echo "❌ Upload endpoint test failed"
  echo "Response: $UPLOAD_RESPONSE"
  echo "This may indicate an issue with the file upload functionality"
fi

echo ""
echo "===== Deployment Verification Summary ====="
echo "✅ Backend health check: PASSED"
if echo "$CORS_OUTPUT" | grep -q "Access-Control-Allow-Origin"; then
  echo "✅ CORS configuration: PASSED"
else
  echo "❌ CORS configuration: FAILED"
fi
echo "⚠️ Frontend configuration check: MANUAL VERIFICATION REQUIRED"
echo ""
echo "Next steps:"
echo "1. If CORS configuration failed, follow the instructions in CORS_FIX_INSTRUCTIONS.md"
echo "2. Visit the frontend URL and check the browser console for CORS errors"
echo "3. Test the actual file upload and conversion functionality in the frontend"
echo ""
echo "For more detailed diagnostics, run the backend diagnostic endpoints:"
echo "- Memory status: $BACKEND_URL/api/diagnostic/memory"
echo "- File system: $BACKEND_URL/api/diagnostic/file-system"
echo "- Health detailed: $BACKEND_URL/api/system/health"
