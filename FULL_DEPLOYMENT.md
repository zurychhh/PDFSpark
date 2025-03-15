# PDFSpark Full Deployment Guide

This document explains how to deploy the entire PDFSpark application, including both the frontend and backend components.

## Project Structure

The PDFSpark application consists of two main components:

1. **Frontend** - A React-based single-page application (in the root directory)
2. **Backend** - A Node.js/Express API server (in the `backend` directory)

## Prerequisites

- Node.js (v18 or higher)
- MongoDB (v4.4 or higher)
- LibreOffice (optional, for better conversions)
- Docker (optional, for containerized deployment)

## Development Setup

### 1. Install Dependencies

First, install the dependencies for both the frontend and backend:

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

### 2. Configure Environment Variables

Create or update the `.env` files for both frontend and backend:

**Frontend (.env)**
```
# API Configuration
VITE_API_URL=http://localhost:4000
VITE_API_TIMEOUT=30000
VITE_MOCK_API=false
VITE_API_BASE_URL=http://localhost:4000/api

# Feature Flags
VITE_PREMIUM_ENABLED=true
VITE_ANALYTICS_ENABLED=true
```

**Backend (backend/.env)**
```
# Server Configuration
PORT=4000
NODE_ENV=development

# MongoDB Connection
MONGO_URI=mongodb://localhost:27017/pdfspark

# JWT Configuration
JWT_SECRET=development-jwt-secret-key-change-in-production
JWT_EXPIRES_IN=30d

# File Storage
UPLOAD_DIR=uploads
TEMP_DIR=temp
RESULT_DIR=results
MAX_SIZE_FREE=5
MAX_SIZE_PREMIUM=100
FILE_EXPIRY=24

# CORS Configuration
CORS_ORIGIN=http://localhost:5174
```

### 3. Start MongoDB

Make sure MongoDB is running on your local machine:

```bash
# Linux/macOS
mongod --dbpath=/data

# Windows
mongod --dbpath=C:\data\db
```

Alternatively, you can use MongoDB Atlas or a Docker container.

### 4. Start the Backend Server

```bash
cd backend
npm run dev
```

This will start the backend server on port 4000 (by default).

### 5. Start the Frontend Development Server

In a new terminal window:

```bash
npm run dev
```

This will start the frontend development server on port 5174 (by default).

### 6. Access the Application

Open your browser and navigate to:

```
http://localhost:5174
```

## Production Deployment

### Option 1: Traditional Deployment

#### Backend Deployment

1. Build the backend:
   ```bash
   cd backend
   npm run build
   ```

2. Set up a production MongoDB instance (Atlas, self-hosted, etc.)

3. Update the backend `.env` file with production values

4. Start the backend server:
   ```bash
   npm start
   ```

5. Consider using a process manager like PM2:
   ```bash
   pm2 start dist/index.js --name pdfspark-api
   ```

#### Frontend Deployment

1. Update the frontend `.env` file to point to your production backend

2. Build the frontend:
   ```bash
   npm run build:prod
   ```

3. Serve the static files from the `dist` directory using Nginx, Apache, or another web server

4. Configure your web server for SPA routing (redirect all routes to index.html)

### Option 2: Containerized Deployment

1. Build and deploy the backend container:
   ```bash
   cd backend
   docker build -t pdfspark-api .
   docker run -p 4000:4000 -e NODE_ENV=production -e MONGO_URI=your_mongo_uri pdfspark-api
   ```

2. Build and deploy the frontend container:
   ```bash
   docker build -t pdfspark-frontend .
   docker run -p 80:80 pdfspark-frontend
   ```

3. Alternatively, use Docker Compose:
   ```bash
   docker-compose up -d
   ```

### Option 3: Cloud Deployment

#### Backend:
- Deploy to a PaaS like Heroku, Render, or Railway
- Set up environment variables in your cloud provider's dashboard

#### Frontend:
- Deploy to Netlify, Vercel, or GitHub Pages
- Configure build commands and environment variables

## Going to Production Checklist

Before deploying to production, ensure you've completed these steps:

1. **Security**
   - [x] Update all secret keys in production `.env` files
   - [ ] Enable content security policy (CSP)
   - [ ] Set up HTTPS with proper SSL certificates
   - [ ] Configure proper CORS settings

2. **Performance**
   - [ ] Enable gzip compression
   - [ ] Configure proper caching headers
   - [ ] Set up a CDN for static assets and file downloads

3. **Monitoring**
   - [ ] Set up application monitoring
   - [ ] Configure error tracking (e.g., Sentry)
   - [ ] Set up performance monitoring

4. **Backup**
   - [ ] Configure regular database backups
   - [ ] Set up automated backup verification

5. **Scaling**
   - [ ] Consider horizontal scaling for the backend API
   - [ ] Set up auto-scaling configurations if needed

## Troubleshooting

### Common Issues

1. **Frontend can't connect to the backend**
   - Check that the backend is running
   - Verify the API URL in the frontend `.env` file
   - Check CORS settings in the backend

2. **File uploads failing**
   - Check file size limits
   - Ensure upload directories exist and have proper permissions
   - Verify network connectivity

3. **Conversions not working**
   - Check if LibreOffice is installed correctly
   - Verify the conversion services are configured properly
   - Check for errors in the backend logs

## Additional Resources

- [MongoDB Documentation](https://docs.mongodb.com/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [React Production Deployment](https://reactjs.org/docs/optimizing-performance.html)