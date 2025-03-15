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

2. Log in to Vercel:
   ```bash
   vercel login
   ```

3. Configure environment variables:
   ```bash
   vercel env add VITE_MOCK_API
   # Enter "false" when prompted
   vercel env add VITE_API_URL 
   # Enter your API URL (e.g. https://api.pdfspark.com)
   vercel env add VITE_API_BASE_URL
   # Enter your API base URL (e.g. https://api.pdfspark.com/api)
   vercel env add VITE_PREMIUM_ENABLED
   # Enter "true" when prompted
   vercel env add VITE_ANALYTICS_ENABLED
   # Enter "true" when prompted
   vercel env add VITE_MAX_FILE_SIZE_FREE
   # Enter "5" when prompted
   vercel env add VITE_MAX_FILE_SIZE_PREMIUM
   # Enter "100" when prompted
   ```

4. Create or update vercel.json at the project root:
   ```json
   {
     "version": 2,
     "builds": [
       {
         "src": "package.json",
         "use": "@vercel/static-build",
         "config": {
           "distDir": "dist"
         }
       }
     ],
     "routes": [
       {
         "src": "/assets/(.*)",
         "headers": { "cache-control": "public, max-age=31536000, immutable" },
         "dest": "/assets/$1"
       },
       {
         "src": "/favicon.ico",
         "dest": "/favicon.ico"
       },
       {
         "src": "/(.*)",
         "dest": "/index.html"
       }
     ]
   }
   ```

5. Deploy to Vercel:
   ```bash
   vercel --prod
   ```

## Environment Configuration

### Frontend Environment Variables

Before deploying the frontend, make sure to set the appropriate environment variables in your deployment platform:

- `VITE_MOCK_API=false` - Ensures the app connects to a real backend
- `VITE_API_URL=https://api.pdfspark.com` - Points to your backend API
- `VITE_API_BASE_URL=https://api.pdfspark.com/api` - Points to your backend API with path
- `VITE_PREMIUM_ENABLED=true` - Enables premium features
- `VITE_ANALYTICS_ENABLED=true` - Enables analytics tracking
- `VITE_MAX_FILE_SIZE_FREE=5` - Maximum file size for free users (in MB)
- `VITE_MAX_FILE_SIZE_PREMIUM=100` - Maximum file size for premium users (in MB)

### Backend Environment Variables

The backend requires these environment variables:

- `PORT=5001` - Port the backend will run on
- `NODE_ENV=production` - Environment mode
- `MONGODB_URI=mongodb+srv://username:password@yourcluster.mongodb.net/pdfspark` - MongoDB connection URI
- `JWT_SECRET=your_secure_jwt_secret_here` - Secret for JWT token signing
- `JWT_EXPIRES_IN=7d` - JWT token expiration time
- `UPLOAD_DIR=./uploads` - Directory for uploaded files
- `TEMP_DIR=./temp` - Directory for temporary files
- `STRIPE_SECRET_KEY=sk_live_your_live_key_here` - Stripe live secret key
- `STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret` - Stripe webhook signing secret
- `STRIPE_PRICE_ID_BASIC=price_your_live_price_id` - Stripe price ID for basic subscription
- `STRIPE_PRICE_ID_PRO=price_your_live_price_id` - Stripe price ID for pro subscription
- `FRONTEND_URL=https://yourdomain.com` - URL of your frontend (for redirects)
- `STRIPE_API_VERSION=2023-10-16` - Stripe API version to use

## Stripe Integration Setup

### 1. Create Stripe Products and Prices

In your Stripe dashboard:
1. Create products for your premium features (e.g., PDF to XLSX conversion)
2. Create prices for those products
3. Note the price IDs and add them to your backend environment variables

### 2. Configure Stripe Webhooks

1. In your Stripe dashboard, navigate to Developers > Webhooks
2. Add an endpoint with URL: `https://api.yourdomain.com/api/webhook`
3. Select these events to listen for:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `customer.subscription.created` (if using subscriptions)
   - `customer.subscription.updated` (if using subscriptions)
   - `customer.subscription.deleted` (if using subscriptions)
4. Get the webhook signing secret and add it to your backend environment as `STRIPE_WEBHOOK_SECRET`

## Post-Deployment Verification

After deployment, verify that:

1. The application loads correctly
2. The production API is being used (mock mode is disabled)
3. File uploads and conversions work correctly
4. All pages and routes function properly
5. The site is secure (HTTPS) and performance is good
6. Analytics are being tracked correctly (if applicable)
7. **Payment processing** works correctly:
   - Test premium conversions (e.g., PDF to XLSX)
   - Verify Stripe Checkout loads properly
   - Complete test payments with Stripe test cards (4242 4242 4242 4242)
   - Confirm webhooks are being received and processed
   - Verify conversion completes after payment

## Troubleshooting

### Common Issues:

1. **404 errors on page refresh:** Ensure that your hosting is configured for SPA routing.
   - For S3/CloudFront: Set error page to index.html
   - For Nginx: Use the provided `nginx.conf`
   - For other platforms: Add appropriate redirect rules

2. **CORS errors:** Make sure your backend API allows requests from your frontend domain.

3. **API connection failures:** Check that environment variables are set correctly and the API is accessible from your hosting environment.

4. **Performance issues:** Verify that assets are being compressed and cached appropriately.

5. **Stripe webhook errors:** 
   - Verify the webhook signing secret is correct
   - Check server logs for any webhook signature verification errors
   - Ensure your server can receive external requests
   - Use Stripe CLI to test webhooks locally: `stripe listen --forward-to http://localhost:5001/api/webhook`

6. **Payment failures:**
   - Check Stripe Dashboard for any error messages
   - Verify you're using the correct API keys (test/live)
   - Ensure redirect URLs are correctly configured
   - Try with different test cards to isolate the issue

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