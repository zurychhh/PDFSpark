#!/bin/bash
set -e

echo "===== PDFSpark Railway Deployment Fix Script ====="

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

echo ""
echo "===== Fixing Railway Configuration ====="

# Backup current files
echo "Creating backups of current configuration..."
cp railway.json railway.json.backup
cp backend/railway.json backend/railway.json.backup
cp backend/Dockerfile backend/Dockerfile.backup
cp Dockerfile Dockerfile.backup

# Update railway.json to use backend/Dockerfile
echo "Updating railway.json to use DOCKERFILE builder..."
cat > railway.json << 'EOF'
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "backend/Dockerfile"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "numReplicas": 1,
    "startCommand": "node --max-old-space-size=2048 --expose-gc index.js"
  }
}
EOF

# Update backend Dockerfile
echo "Updating backend/Dockerfile with optimizations..."
cat > backend/Dockerfile << 'EOF'
FROM node:18-alpine

# Install diagnostic and utility tools
RUN apk add --no-cache curl iputils bash

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Copy app source
COPY . .

# Create required directories for file operations with proper permissions
RUN mkdir -p /tmp/uploads /tmp/temp /tmp/logs && \
    chmod 777 /tmp/uploads /tmp/temp /tmp/logs && \
    mkdir -p /app/uploads /app/temp /app/logs && \
    chmod 777 /app/uploads /app/temp /app/logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV USE_MEMORY_FALLBACK=true
ENV MEMORY_MANAGEMENT_AGGRESSIVE=true
ENV TEMP_DIR=/tmp
ENV UPLOAD_DIR=/tmp/uploads
ENV LOG_DIR=/tmp/logs
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Simple health check script
RUN echo '#!/bin/sh' > /app/health-check.sh && \
    echo 'curl -s http://localhost:$PORT/health || exit 1' >> /app/health-check.sh && \
    chmod +x /app/health-check.sh

# Expose the port app runs on
EXPOSE 3000

# Start the app with memory optimizations
CMD ["node", "--expose-gc", "--max-old-space-size=2048", "index.js"]
EOF

echo "✅ Configuration files updated"

# Set environment variables
echo "Setting environment variables..."
railway variables set NODE_ENV=production
railway variables set PORT=3000
railway variables set USE_MEMORY_FALLBACK=true
railway variables set MEMORY_MANAGEMENT_AGGRESSIVE=true
railway variables set TEMP_DIR=/tmp
railway variables set UPLOAD_DIR=/tmp/uploads
railway variables set LOG_DIR=/tmp/logs

# Set CORS variables
railway variables set CORS_ALLOW_ALL=true
railway variables set CORS_ORIGIN=https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app
railway variables set ALLOWED_ORIGINS=https://pdf-spark-fdvlzlm83-zurychhhs-projects.vercel.app

echo "✅ Environment variables set"

# Commit changes
echo "Committing changes..."
git add railway.json backend/Dockerfile
git commit -m "Fix Railway deployment configuration" || true

# Deploy to Railway
echo "Deploying to Railway..."
railway up --detach

echo ""
echo "===== Deployment Fix Complete ====="
echo "A new deployment has been started. Check the Railway dashboard to monitor progress."
echo "If the deployment is successful, you should be able to access your application at:"
echo "https://pdfspark-production-production.up.railway.app"
echo ""
echo "After deployment completes, verify CORS settings with the check-railway-status.sh script"