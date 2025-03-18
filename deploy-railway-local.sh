#!/bin/bash
set -e

# This script is meant to be run locally to deploy to Railway

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Check if user is logged in to Railway
if ! railway whoami &> /dev/null; then
    echo "Please login to Railway first by running: railway login"
    exit 1
fi

# Create/set project
echo "Creating or linking to Railway project..."
PROJECT_NAME="pdfspark-production"

# Try to find the project by name
PROJECT_LIST=$(railway project list --json 2>/dev/null || echo "[]")
PROJECT_ID=$(echo "$PROJECT_LIST" | jq -r ".[] | select(.name==\"$PROJECT_NAME\") | .id")

if [ -z "$PROJECT_ID" ]; then
    echo "Creating new project: $PROJECT_NAME"
    railway project create --name "$PROJECT_NAME"
else
    echo "Found existing project. Linking to $PROJECT_NAME"
    railway project switch "$PROJECT_NAME"
fi

# Set environment variables
echo "Setting environment variables..."
railway variables set NODE_ENV=production
railway variables set PORT=3000
railway variables set FRONTEND_URL=https://react-pdfspark-jznh8pntd-zurychhhs-projects.vercel.app
railway variables set USE_MEMORY_FALLBACK=true

# Get Cloudinary details from local secrets
if [ -f ".env.cloudinary" ]; then
    source .env.cloudinary
    railway variables set CLOUDINARY_CLOUD_NAME="$CLOUDINARY_CLOUD_NAME"
    railway variables set CLOUDINARY_API_KEY="$CLOUDINARY_API_KEY"
    railway variables set CLOUDINARY_API_SECRET="$CLOUDINARY_API_SECRET"
    echo "Added Cloudinary environment variables from .env.cloudinary"
else
    echo "No .env.cloudinary file found. Please set Cloudinary variables manually in the Railway dashboard."
fi

# Deploy to Railway
echo "Deploying to Railway..."
railway up

echo "Deployment completed! Check the Railway dashboard for details."
echo "You can access your project at: https://$PROJECT_NAME.up.railway.app"