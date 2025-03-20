#!/bin/bash

# Test script for building and verifying Docker images for PDFSpark
# This script tests both the root Dockerfile and backend/Dockerfile

set -e # Exit on error

echo "=== PDFSpark Docker Build Test Script ==="
echo "Testing date: $(date)"
echo "Current directory: $(pwd)"

# Function to build and test a Docker image
build_and_test() {
  local dockerfile_path="$1"
  local tag_name="$2"
  local context_dir="$3"
  
  echo
  echo "===================================================="
  echo "Building image from Dockerfile at: $dockerfile_path"
  echo "Using context directory: $context_dir"
  echo "===================================================="
  
  # Build the image
  echo "Building Docker image: $tag_name"
  docker build -t "$tag_name" -f "$dockerfile_path" "$context_dir"
  
  echo "Verifying the built image..."
  docker images "$tag_name"
  
  echo "Testing a container from this image..."
  echo "Starting container for quick verification..."
  container_id=$(docker run -d --name "test-$tag_name" "$tag_name")
  
  # Wait a moment for the container to start
  sleep 3
  
  echo "Container logs:"
  docker logs "test-$tag_name"
  
  echo "Cleaning up test container..."
  docker stop "test-$tag_name" && docker rm "test-$tag_name"
  
  echo "✅ Successfully built and tested $tag_name"
}

# Test the main Dockerfile at the root
echo "Testing the main Dockerfile..."
build_and_test "./Dockerfile" "pdfspark-main" "."

# Test the backend Dockerfile
echo "Testing the backend Dockerfile..."
build_and_test "./backend/Dockerfile" "pdfspark-backend" "./backend"

echo
echo "🎉 All Docker builds completed successfully!"
echo "You can now use either pdfspark-main or pdfspark-backend for your deployments."