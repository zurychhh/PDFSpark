# PDFSpark Railway Deployment Manual Steps

Since the Railway CLI requires interactive login, follow these steps manually:

## 1. Login to Railway CLI

```bash
railway login
```

This will open a browser window to authenticate. After successful login, the CLI will be authenticated.

## 2. Link or Create Project

```bash
# Try linking to existing project
railway link --project pdfspark-ch1

# If linking fails, create a new project
railway init --name pdfspark-ch1
```

## 3. Set Environment Variables

```bash
# Basic configuration
railway variables set NODE_ENV=production
railway variables set PORT=3000
railway variables set USE_MEMORY_FALLBACK=true
railway variables set CORS_ALLOW_ALL=true

# Directory paths
railway variables set TEMP_DIR=/app/temp
railway variables set UPLOAD_DIR=/app/uploads
railway variables set LOG_DIR=/app/logs

# Cloudinary configuration (replace "your_secret_here" with your actual secret)
railway variables set CLOUDINARY_CLOUD_NAME=dciln75i0
railway variables set CLOUDINARY_API_KEY=756782232717326
railway variables set CLOUDINARY_API_SECRET=your_secret_here
```

## 4. Deploy Application

```bash
railway up
```

## 5. Check Deployment Status

```bash
railway status
```

## 6. Get Public Domain

```bash
railway variables get RAILWAY_PUBLIC_DOMAIN
```

## 7. Update Frontend Configuration

Once you have the Railway domain, update your frontend configuration files:

- **vercel.json**: Update the `VITE_API_URL` and `VITE_API_BASE_URL` values
- **.env.production**: Update the `VITE_API_URL` and `VITE_API_BASE_URL` values

You can use this command to update both files (replace YOUR_RAILWAY_DOMAIN with your actual Railway domain):

```bash
DOMAIN="YOUR_RAILWAY_DOMAIN"
sed -i.bak "s|\"VITE_API_URL\": \".*\"|\"VITE_API_URL\": \"https://$DOMAIN\"|g" vercel.json
sed -i.bak "s|\"VITE_API_BASE_URL\": \".*\"|\"VITE_API_BASE_URL\": \"https://$DOMAIN/api\"|g" vercel.json
sed -i.bak "s|VITE_API_URL=.*|VITE_API_URL=https://$DOMAIN|g" .env.production
sed -i.bak "s|VITE_API_BASE_URL=.*|VITE_API_BASE_URL=https://$DOMAIN/api|g" .env.production
```

## 8. Verify Deployment

Check that your backend health endpoint is responding:

```bash
DOMAIN=$(railway variables get RAILWAY_PUBLIC_DOMAIN)
curl https://$DOMAIN/health
```

## 9. Redeploy Frontend

If needed, redeploy your frontend on Vercel to use the updated configuration.

## Troubleshooting

If you encounter any issues:

- Check deployment logs: `railway logs`
- Verify environment variables: `railway variables list`
- Open Railway project in browser: `railway open`
- Check service status: `railway service`
