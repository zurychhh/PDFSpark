# PDFSpark Docker Deployment Guide

This guide explains how to build and deploy PDFSpark using Docker containers.

## Prerequisites

- Docker installed on your system
- PDFSpark codebase

## Docker Configuration

PDFSpark provides two Dockerfile options:

1. **Root Dockerfile**: Located at the project root (`./Dockerfile`)
   - More versatile and handles various file structures
   - Uses a staging directory to verify file existence
   - Ideal for Railway deployment

2. **Backend Dockerfile**: Located in the backend directory (`./backend/Dockerfile`)
   - Simpler, focused specifically on the backend API
   - Assumes you're building from within the backend directory
   - Good for local development or when only deploying the API

## Building Docker Images

You can build the Docker images using the following commands:

### Root Dockerfile

```bash
# From project root
docker build -t pdfspark:latest .
```

### Backend Dockerfile

```bash
# From project root
docker build -t pdfspark-api:latest -f backend/Dockerfile backend/
```

## Automated Testing

For your convenience, a test script is provided to build and verify both Dockerfiles:

```bash
# From project root
./test-docker-build.sh
```

This script will:
1. Build both Docker images
2. Run quick verification tests
3. Report any issues

## Environment Variables

The Docker images are configured to use the following environment variables:

- `NODE_ENV`: Set to "production" by default
- `PORT`: Default is 3000
- `USE_MEMORY_FALLBACK`: Set to "true" for Railway deployment
- `MEMORY_MANAGEMENT_AGGRESSIVE`: Set to "true" for better memory management
- `TEMP_DIR`: Set to "/tmp" for Railway compatibility
- `UPLOAD_DIR`: Set to "/tmp/uploads" for Railway compatibility
- `LOG_DIR`: Set to "/tmp/logs" for Railway compatibility

## Cloudinary Integration

For proper functioning in Railway, Cloudinary must be configured:

- `CLOUDINARY_CLOUD_NAME`: Your Cloudinary cloud name
- `CLOUDINARY_API_KEY`: Your Cloudinary API key
- `CLOUDINARY_API_SECRET`: Your Cloudinary API secret

The Docker image will automatically set up additional Cloudinary configurations based on these values.

## Railway Deployment

When deploying to Railway:

1. Use the main Dockerfile at the project root
2. Use the `railway-entry.js` script for proper initialization
3. Make sure the following environment variables are set:
   - MongoDB connection string (`MONGODB_URI`)
   - Cloudinary credentials (see above)
   - `USE_MEMORY_FALLBACK=true`
   - `TEMP_DIR=/tmp`
   - `UPLOAD_DIR=/tmp/uploads`
   - `LOG_DIR=/tmp/logs`

## Running Locally

To run the Docker image locally:

```bash
docker run -p 3000:3000 \
  -e MONGODB_URI=your_mongodb_uri \
  -e CLOUDINARY_CLOUD_NAME=your_cloud_name \
  -e CLOUDINARY_API_KEY=your_api_key \
  -e CLOUDINARY_API_SECRET=your_api_secret \
  pdfspark:latest
```

## Troubleshooting

If you encounter issues with the Docker build:

1. **File not found errors**: The updated Dockerfiles handle missing files gracefully, but you can check if all expected files are in the correct locations
2. **Memory issues**: Increase the memory allocated to Docker in Docker Desktop settings
3. **Timeout issues**: Some large builds might time out - use the `--timeout` flag with higher values

## Health Checks

The Docker images include health check capabilities:

- HTTP health check on the `/health` endpoint
- Memory monitoring script at `/app/monitor-memory.sh`

These can be used by Docker or container orchestration systems to determine container health.