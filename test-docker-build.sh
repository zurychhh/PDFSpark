#!/bin/bash

# Enhanced Docker Build Test Script for PDFSpark
# This script tests the Docker build process and provides detailed diagnostics

set -e # Exit on error

echo "=== PDFSpark Enhanced Docker Build Test ==="
echo "Test started at: $(date)"
echo "Current directory: $(pwd)"

# Function to verify presence of Docker
verify_docker() {
  if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker to continue."
    exit 1
  else
    echo "✅ Docker is installed"
    docker --version
  fi
}

# Function to see what files are in the context
check_context_files() {
  echo
  echo "=== Checking Files in Context ==="
  echo "Files in current directory:"
  ls -la
  
  echo
  echo "Looking for key files:"
  files_to_check=("Dockerfile" "railway.json" "railway-entry.js" "backend/index.js" "backend/Dockerfile")
  
  for file in "${files_to_check[@]}"; do
    if [[ -f "$file" ]]; then
      echo "✅ $file exists"
    else
      echo "❌ $file not found"
    fi
  done
}

# Function to test the Dockerfile directly
test_dockerfile() {
  local tag_name="pdfspark-railway-test"
  
  echo
  echo "=== Building Docker Image ==="
  echo "Building image with tag: $tag_name"
  
  # Clean up any previous test container and image
  docker rm -f "$tag_name" &>/dev/null || true
  docker rmi -f "$tag_name" &>/dev/null || true
  
  # Build the image with detailed output
  echo "Running Docker build..."
  docker build -t "$tag_name" . 
  
  if [[ $? -ne 0 ]]; then
    echo "❌ Docker build failed!"
    return 1
  fi
  
  echo "✅ Docker build successful!"
  docker images "$tag_name"
  
  echo
  echo "=== Testing Docker Container ==="
  echo "Starting test container..."
  
  # Run the container in detached mode
  container_id=$(docker run -d --name "$tag_name" -p 3000:3000 "$tag_name")
  
  echo "Container started with ID: $container_id"
  echo "Waiting 5 seconds for container to initialize..."
  sleep 5
  
  echo "Container logs:"
  docker logs "$tag_name"
  
  echo
  echo "=== Testing Health Endpoint ==="
  echo "Trying to access the /health endpoint..."
  
  if command -v curl &> /dev/null; then
    curl -s http://localhost:3000/health | grep -q "status" && {
      echo "✅ Health endpoint is working!"
      curl -s http://localhost:3000/health
    } || {
      echo "❌ Health endpoint is not responding correctly"
    }
  else
    echo "⚠️ curl not found, skipping health endpoint test"
  fi
  
  echo
  echo "=== Container Information ==="
  echo "Docker processes:"
  docker ps -a | grep "$tag_name"
  
  echo
  echo "Container details:"
  docker inspect "$tag_name" | grep -E '"Status"|"StartedAt"|"FinishedAt"|"Error"|"ExitCode"'
  
  # Check for exec to run diagnostics inside container
  if [[ $(docker inspect --format='{{.State.Running}}' "$tag_name") == "true" ]]; then
    echo
    echo "=== In-Container Diagnostics ==="
    
    echo "Directory structure in container:"
    docker exec "$tag_name" ls -la /app
    
    echo
    echo "Checking environment variables in container:"
    docker exec "$tag_name" env | grep -E 'NODE_|CORS|CLOUDINARY|TEMP_DIR|UPLOAD_DIR|LOG_DIR|MEMORY'
    
    echo
    echo "Checking memory status in container:"
    docker exec "$tag_name" node -e "console.table(process.memoryUsage())" || true
    
    echo
    echo "Checking file permissions in temp directories:"
    docker exec "$tag_name" ls -la /tmp || true
  fi
  
  # Clean up
  echo
  echo "=== Cleaning Up ==="
  echo "Stopping and removing test container..."
  docker stop "$tag_name"
  docker rm "$tag_name"
  
  echo "Removing test image..."
  docker rmi "$tag_name"
  
  echo "✅ Cleanup complete!"
}

# Main execution
verify_docker
check_context_files
test_dockerfile

echo
echo "=== Test Summary ==="
echo "Docker build test completed at: $(date)"
echo "The Docker build process has been tested."
echo 
echo "If the build was successful, you can deploy to Railway using:"
echo "./fix-railway-docker-deploy.sh"