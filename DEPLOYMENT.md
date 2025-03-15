# PDFSpark Deployment Guide

This document outlines the steps for deploying the PDFSpark frontend application to various environments.

## Prerequisites

- Node.js 18+ for local builds
- Docker and Docker Compose for containerized deployment
- AWS CLI for S3/CloudFront deployment
- Access to your chosen hosting environment (AWS, Netlify, Vercel, etc.)

## Deployment Options

### 1. Standard Web Hosting (S3 + CloudFront)

This is the recommended approach for production deployments.

#### Setup:

1. Create an S3 bucket for your website:
   ```bash
   aws s3 mb s3://pdfspark.com
   ```

2. Configure the bucket for website hosting:
   ```bash
   aws s3 website s3://pdfspark.com --index-document index.html --error-document index.html
   ```

3. Set the appropriate bucket policy to allow public read access.

4. Create a CloudFront distribution pointing to the S3 bucket.

#### Deployment:

Use the included `deploy.sh` script:

1. Update the script with your S3 bucket name and CloudFront distribution ID:
   ```bash
   # Variables - replace these with your actual values
   S3_BUCKET="pdfspark.com" 
   CLOUDFRONT_DISTRIBUTION_ID="YOUR_DISTRIBUTION_ID"
   REGION="us-east-1"
   ```

2. Make the script executable and run it:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

### 2. Docker Container Deployment

For container-based environments like AWS ECS, Kubernetes, or simple VPS hosting.

#### Build and Test Locally:

1. Build the Docker image:
   ```bash
   docker build -t pdfspark-frontend .
   ```

2. Run the container locally:
   ```bash
   docker run -p 8080:80 pdfspark-frontend
   ```

3. Open http://localhost:8080 to verify it works.

#### Using Docker Compose:

1. Start the application:
   ```bash
   docker-compose up -d
   ```

2. Stop the application:
   ```bash
   docker-compose down
   ```

### 3. Platform Deployments

#### Netlify:

1. Install the Netlify CLI:
   ```bash
   npm install -g netlify-cli
   ```

2. Configure the build settings in `netlify.toml`:
   ```toml
   [build]
     command = "npm run build:prod"
     publish = "dist"
     
   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

3. Deploy to Netlify:
   ```bash
   netlify deploy --prod
   ```

#### Vercel:

1. Install the Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Deploy to Vercel:
   ```bash
   vercel --prod
   ```

## Environment Configuration

Before deploying, make sure to set the appropriate environment variables in your deployment platform:

- `VITE_MOCK_API=false` - Ensures the app connects to a real backend
- `VITE_API_URL=https://api.pdfspark.com` - Points to your backend API
- `VITE_PREMIUM_ENABLED=true` - Enables premium features
- `VITE_ANALYTICS_ENABLED=true` - Enables analytics tracking

## Post-Deployment Verification

After deployment, verify that:

1. The application loads correctly
2. The production API is being used (mock mode is disabled)
3. File uploads and conversions work correctly
4. All pages and routes function properly
5. The site is secure (HTTPS) and performance is good
6. Analytics are being tracked correctly (if applicable)

## Troubleshooting

### Common Issues:

1. **404 errors on page refresh:** Ensure that your hosting is configured for SPA routing.
   - For S3/CloudFront: Set error page to index.html
   - For Nginx: Use the provided `nginx.conf`
   - For other platforms: Add appropriate redirect rules

2. **CORS errors:** Make sure your backend API allows requests from your frontend domain.

3. **API connection failures:** Check that environment variables are set correctly and the API is accessible from your hosting environment.

4. **Performance issues:** Verify that assets are being compressed and cached appropriately.

## Maintenance

1. **Monitoring:** Set up uptime monitoring for your application
2. **Analytics:** Review analytics data to track usage patterns
3. **Updates:** Regularly update dependencies and redeploy

## Backups and Disaster Recovery

Always maintain backups of your:
- Source code (GitHub/GitLab)
- Environment configurations
- Deployment scripts

For critical deployments, consider using blue-green deployment strategies to minimize downtime.