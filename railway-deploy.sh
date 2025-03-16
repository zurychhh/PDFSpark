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

echo "Configuration is ready. You can now deploy to Railway.app."
echo ""
echo "To deploy to Railway.app, run:"
echo "railway up"
echo ""
echo "To check the status of your deployment, run:"
echo "railway status"