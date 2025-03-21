# PDFSpark Railway Deployment (Deployment Only)

Since all variables are already set in Railway, we can proceed directly to deployment:

## CLI Method (Preferred)

1. Login to Railway (if not already logged in):
   ```bash
   railway login
   ```

2. Link to your existing project:
   ```bash
   railway link --project pdfspark-ch1
   ```

3. Deploy the application:
   ```bash
   railway up
   ```

4. Check deployment status:
   ```bash
   railway status
   ```

5. Get your public domain:
   ```bash
   railway variables get RAILWAY_PUBLIC_DOMAIN
   ```

## Web Interface Method (Alternative)

1. Go to [https://railway.app/dashboard](https://railway.app/dashboard)

2. Select your existing "pdfspark-ch1" project

3. Go to the "Settings" tab for your service

4. Scroll down to "Deployment" section

5. Click "Deploy now" to trigger a new deployment

6. Monitor deployment in the "Deployments" tab

7. Once deployed, find your domain in the "Settings" > "Domains" section

## After Deployment

1. Test the health endpoint:
   ```bash
   curl https://YOUR_RAILWAY_DOMAIN/health
   ```

2. Update frontend configuration if needed:
   ```bash
   # Replace YOUR_RAILWAY_DOMAIN with your actual domain
   DOMAIN="YOUR_RAILWAY_DOMAIN"
   
   # Update vercel.json
   sed -i.bak "s|\"VITE_API_URL\": \".*\"|\"VITE_API_URL\": \"https://$DOMAIN\"|g" vercel.json
   sed -i.bak "s|\"VITE_API_BASE_URL\": \".*\"|\"VITE_API_BASE_URL\": \"https://$DOMAIN/api\"|g" vercel.json
   
   # Update .env.production
   sed -i.bak "s|VITE_API_URL=.*|VITE_API_URL=https://$DOMAIN|g" .env.production
   sed -i.bak "s|VITE_API_BASE_URL=.*|VITE_API_BASE_URL=https://$DOMAIN/api|g" .env.production
   ```

3. Redeploy frontend if needed:
   ```bash
   vercel --prod
   ```
