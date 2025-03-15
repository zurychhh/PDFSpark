#!/bin/bash
# Production deployment script for PDFSpark

# Exit immediately if a command exits with a non-zero status
set -e

# Display commands being executed
set -x

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Variables - replace these with your actual values
S3_BUCKET="pdfspark.com"
CLOUDFRONT_DISTRIBUTION_ID="YOUR_CLOUDFRONT_DISTRIBUTION_ID"
REGION="us-east-1"

# Clean previous build
echo "Cleaning previous build..."
rm -rf dist

# Run linting and formatting checks
echo "Running linting and formatting checks..."
npm run lint
npm run format:check

# Build the project for production
echo "Building project for production..."
npm run build:prod

# Deploy to S3
echo "Deploying to S3..."
aws s3 sync dist s3://$S3_BUCKET/ --delete --region $REGION

# Set correct content types for different file types
echo "Setting content types..."
find dist -name "*.html" | xargs -I{} aws s3 cp {} s3://$S3_BUCKET/{} --content-type "text/html" --metadata-directive REPLACE --region $REGION
find dist -name "*.css" | xargs -I{} aws s3 cp {} s3://$S3_BUCKET/{} --content-type "text/css" --metadata-directive REPLACE --region $REGION
find dist -name "*.js" | xargs -I{} aws s3 cp {} s3://$S3_BUCKET/{} --content-type "application/javascript" --metadata-directive REPLACE --region $REGION
find dist -name "*.json" | xargs -I{} aws s3 cp {} s3://$S3_BUCKET/{} --content-type "application/json" --metadata-directive REPLACE --region $REGION
find dist -name "*.svg" | xargs -I{} aws s3 cp {} s3://$S3_BUCKET/{} --content-type "image/svg+xml" --metadata-directive REPLACE --region $REGION

# Set caching headers
echo "Setting caching headers..."
# Cache HTML files for 10 minutes (they might change often)
find dist -name "*.html" | xargs -I{} aws s3 cp {} s3://$S3_BUCKET/{} --cache-control "max-age=600" --metadata-directive REPLACE --region $REGION
# Cache assets with hash in filename for 1 year (they never change)
find dist -name "*.js" -o -name "*.css" | grep -E '\.[0-9a-f]{8}\.' | xargs -I{} aws s3 cp {} s3://$S3_BUCKET/{} --cache-control "public, max-age=31536000, immutable" --metadata-directive REPLACE --region $REGION
# Cache other assets for 1 day
find dist -name "*.js" -o -name "*.css" -o -name "*.svg" -o -name "*.png" | grep -v -E '\.[0-9a-f]{8}\.' | xargs -I{} aws s3 cp {} s3://$S3_BUCKET/{} --cache-control "max-age=86400" --metadata-directive REPLACE --region $REGION

# Invalidate CloudFront cache
echo "Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths "/*" --region $REGION

echo "Deployment completed successfully!"