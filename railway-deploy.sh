#!/bin/bash
set -e

# Script to prepare for Railway.app deployment
echo "Preparing PDFSpark for Railway.app deployment..."

# Create a backup of the current nginx.conf if it exists
if [ -f "nginx.conf" ]; then
  echo "Creating backup of current nginx.conf..."
  cp nginx.conf nginx.conf.backup-$(date +%Y%m%d%H%M%S)
fi

# Choose which configuration to use
if [ "$1" == "alternative" ]; then
  echo "Using alternative Nginx configuration..."
  if [ -f "nginx.conf.alternative" ]; then
    cp nginx.conf.alternative nginx.conf
  else
    echo "Error: nginx.conf.alternative not found!"
    exit 1
  fi
else
  echo "Using standard Nginx configuration..."
fi

# Validate the syntax of the nginx.conf if nginx is installed
if command -v nginx &> /dev/null; then
  echo "Checking Nginx configuration syntax..."
  nginx -t -c $(pwd)/nginx.conf
else
  echo "Warning: Nginx not installed, skipping configuration syntax check."
fi

# Check MongoDB Atlas integration
if [ -z "$MONGODB_URI" ]; then
  echo "Warning: MONGODB_URI environment variable is not set."
  echo "You'll need to set this in your Railway.app project settings."
  echo "To create a free MongoDB Atlas database:"
  echo "1. Go to https://www.mongodb.com/cloud/atlas/register"
  echo "2. Create a free tier account and cluster"
  echo "3. Get your connection string and add it to Railway.app environment variables"
fi

# Check Cloudinary configuration
if [ -z "$CLOUDINARY_CLOUD_NAME" ] || [ -z "$CLOUDINARY_API_KEY" ] || [ -z "$CLOUDINARY_API_SECRET" ]; then
  echo "Warning: Cloudinary environment variables are not completely set."
  echo "You'll need to set these in your Railway.app project settings:"
  echo "- CLOUDINARY_CLOUD_NAME"
  echo "- CLOUDINARY_API_KEY"
  echo "- CLOUDINARY_API_SECRET"
fi

# Check Stripe configuration
if [ -z "$STRIPE_SECRET_KEY" ] || [ -z "$STRIPE_WEBHOOK_SECRET" ]; then
  echo "Warning: Stripe environment variables are not completely set."
  echo "For payment processing, you'll need to set these in your Railway.app project settings:"
  echo "- STRIPE_SECRET_KEY"
  echo "- STRIPE_WEBHOOK_SECRET"
  echo "- STRIPE_PUBLISHABLE_KEY (for frontend)"
fi

# Create .env.production file for backend
if [ ! -f "backend/.env.production" ]; then
  echo "Creating .env.production file for backend..."
  cat > backend/.env.production << EOF
# Node environment
NODE_ENV=production

# Server port (Railway will override with PORT)
PORT=5001

# Frontend URL for CORS
FRONTEND_URL=https://pdfspark.vercel.app

# MongoDB
MONGODB_URI=mongodb+srv://oleksiakpiotrrafal:AsCz060689\!@pdfsparkfree.sflwc.mongodb.net/pdfspark?retryWrites=true&w=majority&appName=PDFSparkFree

# JWT secret for authentication
JWT_SECRET=pdfspark-jwt-secret-change-in-production

# File storage
UPLOAD_DIR=./uploads
TEMP_DIR=./temp

# Cloudinary
CLOUDINARY_CLOUD_NAME=dciln75i0
CLOUDINARY_API_KEY=646273781249237
CLOUDINARY_API_SECRET=1JCGYGxjRYtQla8--jcu-pRhGB0

# Stripe
STRIPE_SECRET_KEY=sk_test_51R3DdCDGuTzqKXNWt1AI0RNLMHGLcEdoUm24Vk0cME1LfAYnkYgJaxaJx6BpDSWvPW7F3GC8nPwV154YoKsgd5Wi00TBOpfHbD
STRIPE_WEBHOOK_SECRET=whsec_iNsFNFUW6zRLZ1tXPc3GY9KGtK0VH3V6
STRIPE_API_VERSION=2023-10-16
EOF
  echo "Created backend/.env.production"
fi

echo "Configuration is ready. You can now deploy to Railway.app."
echo ""
echo "To deploy to Railway.app, run:"
echo "railway up"
echo ""
echo "To check the status of your deployment, run:"
echo "railway status"