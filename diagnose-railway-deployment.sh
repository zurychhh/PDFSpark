#!/bin/bash

# Railway Deployment Diagnostic Script for PDFSpark
# This script collects information about the Railway deployment environment

echo "=== PDFSpark Railway Deployment Diagnostics ==="
echo "Diagnostic run at: $(date)"
echo

# Check for Railway CLI
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found"
    echo "Please install it with: npm i -g @railway/cli"
    exit 1
fi

# Check Railway login status
echo "=== Railway Authentication ==="
railway whoami || {
    echo "❌ Not logged in to Railway"
    echo "Please login with: railway login"
    exit 1
}

echo

# Get project details
echo "=== Railway Project Details ==="
railway status

echo

# Check environment variables
echo "=== Railway Environment Variables ==="
echo "Checking for required variables..."
railway variables > /tmp/railway_vars_check.txt

# Define critical variables
CRITICAL_VARS=(
    "NODE_ENV"
    "PORT"
    "USE_MEMORY_FALLBACK"
    "CLOUDINARY_CLOUD_NAME"
    "CLOUDINARY_API_KEY"
    "CLOUDINARY_API_SECRET"
    "CORS_ALLOW_ALL"
    "TEMP_DIR"
    "UPLOAD_DIR"
    "LOG_DIR"
)

# Check each variable
echo "Variable status:"
for var in "${CRITICAL_VARS[@]}"; do
    if grep -q "$var=" /tmp/railway_vars_check.txt; then
        echo "✅ $var: Set"
    else
        echo "❌ $var: Not set"
    fi
done

echo

# Check Railway configuration
echo "=== Railway Configuration ==="
if [[ -f "railway.json" ]]; then
    echo "railway.json exists:"
    cat railway.json
    
    # Check for DOCKERFILE builder
    if grep -q "DOCKERFILE" railway.json; then
        echo "✅ railway.json is configured for Docker"
    else
        echo "❌ railway.json is NOT configured for Docker"
    fi
else
    echo "❌ railway.json does not exist in the current directory"
fi

# Check for competing configurations
if [[ -f "backend/railway.json" ]]; then
    echo "⚠️ Found competing railway.json in backend directory:"
    cat backend/railway.json
fi

echo

# Check Dockerfile
echo "=== Dockerfile Status ==="
if [[ -f "Dockerfile" ]]; then
    echo "✅ Dockerfile exists"
    
    # Check for railway-entry.js reference
    if grep -q "railway-entry.js" Dockerfile; then
        echo "✅ Dockerfile references railway-entry.js"
    else
        echo "❌ Dockerfile does not reference railway-entry.js"
    fi
    
    # Check for self-contained approach
    if grep -q "echo.*package.json" Dockerfile; then
        echo "✅ Dockerfile appears to use self-contained approach"
    else
        echo "❌ Dockerfile may not be using self-contained approach"
    fi
else
    echo "❌ Dockerfile does not exist in the current directory"
fi

echo

# Check deployment logs if available
echo "=== Recent Railway Logs ==="
echo "Fetching last 50 log lines..."
railway logs --limit 50 | grep -E "error|failed|crash|FATAL|Error|ERROR|ENOENT|Cannot|not found" || echo "No error logs found"

echo

# Check health endpoint if available
echo "=== Health Endpoint Check ==="
RAILWAY_URL=$(railway variables get RAILWAY_PUBLIC_DOMAIN 2>/dev/null)

if [[ -n "$RAILWAY_URL" ]]; then
    echo "Railway URL: https://$RAILWAY_URL"
    
    if command -v curl &> /dev/null; then
        echo "Checking health endpoint..."
        curl -s "https://$RAILWAY_URL/health" || echo "❌ Health endpoint not responding"
    else
        echo "curl not available, skipping health check"
    fi
else
    echo "❌ Could not determine Railway URL"
fi

echo

# Collect memory diagnostics if available
echo "=== Memory Diagnostics ==="
if railway run "node -e 'console.table(process.memoryUsage())'" 2>/dev/null; then
    echo "✅ Memory usage retrieved successfully"
else
    echo "❌ Could not retrieve memory usage"
fi

# Try to run the monitor-memory.sh script if it exists
railway run "/app/monitor-memory.sh" 2>/dev/null || echo "❌ Could not run memory monitor script"

echo

# Check Cloudinary configuration
echo "=== Cloudinary Configuration ==="
if grep -q "CLOUDINARY_CLOUD_NAME=" /tmp/railway_vars_check.txt; then
    echo "✅ Cloudinary is configured"
    
    # Test Cloudinary access
    echo "Testing Cloudinary access..."
    CLOUD_NAME=$(grep "CLOUDINARY_CLOUD_NAME=" /tmp/railway_vars_check.txt | cut -d'=' -f2)
    echo "Cloud name: $CLOUD_NAME"
    
    # Try to ping Cloudinary through Railway
    railway run "node -e 'const cloudinary = require(\"cloudinary\").v2; cloudinary.api.ping().then(r => console.log(\"Cloudinary connection successful:\", r)).catch(e => console.error(\"Cloudinary connection failed:\", e))'" 2>/dev/null || echo "❌ Could not test Cloudinary connection"
else
    echo "❌ Cloudinary is not configured"
fi

echo

# Final diagnosis
echo "=== Diagnostic Summary ==="
echo "1. Check that you're using the self-contained Docker approach"
echo "2. Ensure railway.json is correctly configured for Docker"
echo "3. Make sure all critical environment variables are set"
echo "4. Look for error messages in the Railway logs"
echo "5. Verify that health endpoint is working"
echo

# Recommendations
echo "=== Recommendations ==="
echo "Based on diagnostics, you may want to try these commands:"
echo
echo "1. Fix deployment configuration:"
echo "   ./fix-railway-docker-deploy.sh"
echo
echo "2. Test Docker build locally before deploying:"
echo "   ./test-docker-build.sh"
echo
echo "3. Check Railway logs for detailed error messages:"
echo "   railway logs"
echo
echo "4. Redeploy to Railway after fixing issues:"
echo "   railway up"
echo

echo "=== Diagnostic Complete ==="
echo "Completed at: $(date)"