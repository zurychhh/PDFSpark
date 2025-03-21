#!/bin/bash

# Create Railway deployment packages
# This script creates two deployment packages:
# 1. A minimal health check application for testing Railway's health check
# 2. The full PDFSpark application with health check fixes

set -e  # Exit on error

echo "Creating Railway deployment packages..."

# Create temporary directory for packaging
TEMP_DIR=$(mktemp -d)
echo "Using temporary directory: $TEMP_DIR"

# Function to clean up temporary directory
cleanup() {
  echo "Cleaning up temporary files..."
  rm -rf "$TEMP_DIR"
  echo "Done."
}

# Register cleanup function to run on exit
trap cleanup EXIT

# Get current directory
CURRENT_DIR=$(pwd)

# Create minimal health check app package
echo "Creating minimal health check app package..."
MINIMAL_DIR="$TEMP_DIR/minimal-health-app"
mkdir -p "$MINIMAL_DIR"

# Copy minimal health app files
cp -r "$CURRENT_DIR/minimal-health-app"/* "$MINIMAL_DIR/"

# Create zip file
echo "Creating minimal-health-app.zip..."
cd "$TEMP_DIR"
zip -r "$CURRENT_DIR/minimal-health-app.zip" minimal-health-app
cd "$CURRENT_DIR"
echo "Minimal health app package created: minimal-health-app.zip"

# Create full application package
echo "Creating full PDFSpark application package..."

# Create a list of files to include
INCLUDE_FILES=(
  # Backend files
  "backend/Dockerfile"
  "backend/health-endpoint.js"
  "backend/railway-entry.js"
  "backend/package.json"
  "backend/index.js"
  "backend/config"
  "backend/controllers"
  "backend/middlewares"
  "backend/models"
  "backend/routes"
  "backend/services"
  "backend/utils"
  
  # Configuration files
  "railway.json"
  "RAILWAY_DEPLOYMENT_INSTRUCTIONS.md"
  "RAILWAY_HEALTH_CHECK_FIX.md"
)

# Create a list of directories to create
DIRS_TO_CREATE=(
  "backend/config"
  "backend/controllers"
  "backend/middlewares"
  "backend/models"
  "backend/routes"
  "backend/services"
  "backend/utils"
  "backend/utils/diagnostic"
)

# Create full app directory
FULL_DIR="$TEMP_DIR/pdfspark-railway"
mkdir -p "$FULL_DIR"

# Create required directories
for dir in "${DIRS_TO_CREATE[@]}"; do
  mkdir -p "$FULL_DIR/$dir"
done

# Copy files
for file in "${INCLUDE_FILES[@]}"; do
  # Check if it's a directory or file
  if [ -d "$CURRENT_DIR/$file" ]; then
    # It's a directory, copy contents
    mkdir -p "$FULL_DIR/$file"
    cp -r "$CURRENT_DIR/$file"/* "$FULL_DIR/$file/"
  elif [ -f "$CURRENT_DIR/$file" ]; then
    # It's a file, copy it
    cp "$CURRENT_DIR/$file" "$FULL_DIR/$file"
  else
    echo "Warning: $file not found!"
  fi
done

# Create zip file
echo "Creating pdfspark-railway.zip..."
cd "$TEMP_DIR"
zip -r "$CURRENT_DIR/pdfspark-railway.zip" pdfspark-railway
cd "$CURRENT_DIR"
echo "Full application package created: pdfspark-railway.zip"

# Create a package with only the updated files for an existing deployment
echo "Creating health-check-fix-only.zip..."
HEALTH_FIX_DIR="$TEMP_DIR/health-check-fix"
mkdir -p "$HEALTH_FIX_DIR/backend"

# Copy only the files that need to be updated
cp "$CURRENT_DIR/backend/health-endpoint.js" "$HEALTH_FIX_DIR/backend/"
cp "$CURRENT_DIR/backend/railway-entry.js" "$HEALTH_FIX_DIR/backend/"
cp "$CURRENT_DIR/railway.json" "$HEALTH_FIX_DIR/"
cp "$CURRENT_DIR/RAILWAY_HEALTH_CHECK_FIX.md" "$HEALTH_FIX_DIR/"

# Create zip file
cd "$TEMP_DIR"
zip -r "$CURRENT_DIR/health-check-fix-only.zip" health-check-fix
cd "$CURRENT_DIR"
echo "Health check fix package created: health-check-fix-only.zip"

echo "All deployment packages created successfully!"
echo "  - minimal-health-app.zip: Minimal health check application for testing"
echo "  - pdfspark-railway.zip: Full PDFSpark application with health check fixes"
echo "  - health-check-fix-only.zip: Just the files needed to fix health checks on an existing deployment"
echo ""
echo "Instructions for deployment can be found in RAILWAY_DEPLOYMENT_INSTRUCTIONS.md"