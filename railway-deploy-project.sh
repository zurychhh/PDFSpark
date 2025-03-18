#!/bin/bash
set -e

# Ensure Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Verify railway CLI is logged in
echo "Verifying Railway CLI login..."
if ! railway whoami &> /dev/null; then
    echo "Error: Railway CLI is not logged in."
    echo "Please run 'railway login' before executing this script."
    exit 1
else
    echo "✅ Railway CLI is logged in"
fi

# Define project name
PROJECT_NAME="pdfspark"

# Try to find the project by name
echo "Looking for project: $PROJECT_NAME"
PROJECT_LIST=$(railway project list --json 2>/dev/null || echo "[]")
PROJECT_ID=$(echo "$PROJECT_LIST" | jq -r ".[] | select(.name==\"$PROJECT_NAME\") | .id")

if [ -z "$PROJECT_ID" ]; then
    echo "Creating new project: $PROJECT_NAME"
    PROJECT_ID=$(railway project create --name "$PROJECT_NAME" --json | jq -r '.id')
    
    if [ -z "$PROJECT_ID" ]; then
        echo "❌ Error: Failed to create project"
        exit 1
    fi
    echo "✅ Created new project with ID: $PROJECT_ID"
else
    echo "✅ Found existing project with ID: $PROJECT_ID"
fi

# Link to the project
echo "Linking to project ID: $PROJECT_ID"
railway project link "$PROJECT_ID"

# Verify project linking
if ! railway project list --json | jq -r ".[] | select(.id==\"$PROJECT_ID\" and .linked==true)" | grep -q .; then
    echo "❌ Error: Failed to link project"
    exit 1
else
    echo "✅ Successfully linked to project"
fi

# Set environment variables
echo "Setting up environment variables..."
if [ -n "$CLOUDINARY_CLOUD_NAME" ] && [ -n "$CLOUDINARY_API_KEY" ] && [ -n "$CLOUDINARY_API_SECRET" ]; then
    echo "Setting Cloudinary environment variables..."
    railway variables set CLOUDINARY_CLOUD_NAME="$CLOUDINARY_CLOUD_NAME"
    railway variables set CLOUDINARY_API_KEY="$CLOUDINARY_API_KEY"
    railway variables set CLOUDINARY_API_SECRET="$CLOUDINARY_API_SECRET"
    echo "✅ Cloudinary environment variables set."
else
    echo "⚠️ Cloudinary environment variables not provided, skipping..."
fi

# Set memory fallback to true
echo "Setting USE_MEMORY_FALLBACK=true..."
railway variables set USE_MEMORY_FALLBACK=true

# Set other important environment variables
echo "Setting additional environment variables..."
railway variables set NODE_ENV=production
railway variables set PORT=3000
railway variables set RAILWAY_STATIC_BUILDPACK=true

# Deploy to Railway
echo "Deploying to Railway..."
railway up --detach

# Wait for deployment to begin
echo "Deployment initiated. Waiting for deployment to begin processing..."
sleep 10

# Get deployment status
echo "Checking deployment status (this may take a few minutes)..."
DEPLOY_STATUS=$(railway status --json || echo '{"up": false}')
IS_UP=$(echo "$DEPLOY_STATUS" | jq -r '.up // false')

if [ "$IS_UP" = "true" ]; then
    echo "✅ Deployment successful!"
    
    # Try to get the public domain
    PUBLIC_DOMAIN=$(railway variables get RAILWAY_PUBLIC_DOMAIN 2>/dev/null || echo "unknown")
    if [ "$PUBLIC_DOMAIN" != "unknown" ]; then
        echo "🌐 Application deployed to: https://$PUBLIC_DOMAIN"
        
        # Update frontend environment if needed
        echo "Updating frontend to point to the new backend..."
        sed -i.bak "s|VITE_API_URL=.*|VITE_API_URL=https://$PUBLIC_DOMAIN|g" .env.production
        sed -i.bak "s|VITE_API_BASE_URL=.*|VITE_API_BASE_URL=https://$PUBLIC_DOMAIN/api|g" .env.production
        sed -i.bak "s|\"VITE_API_URL\": \".*\"|\"VITE_API_URL\": \"https://$PUBLIC_DOMAIN\"|g" vercel.json
        sed -i.bak "s|\"VITE_API_BASE_URL\": \".*\"|\"VITE_API_BASE_URL\": \"https://$PUBLIC_DOMAIN/api\"|g" vercel.json
        
        echo "Frontend environment updated. You may need to redeploy the frontend."
    else
        echo "⚠️ Application deployed, but couldn't determine the public domain."
    fi
    
    exit 0
else
    echo "⚠️ Deployment initiated but not confirmed as up yet."
    echo "Check the Railway dashboard for deployment status. It may take a few minutes to complete."
    exit 0
fi