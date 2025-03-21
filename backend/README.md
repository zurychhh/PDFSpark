# PDFSpark Backend

This is the backend service for PDFSpark, a PDF conversion and manipulation application.

## Features

- PDF conversion to various formats
- Cloudinary integration for file storage
- Memory-optimized processing for Railway deployment
- Diagnostic and monitoring tools

## Installation

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

## Environment Variables

Create a `.env` file with the following variables:

```
PORT=5001
NODE_ENV=development
MONGODB_URI=mongodb+srv://your-connection-string
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
CORS_ALLOW_ALL=true
JWT_SECRET=your-jwt-secret
ADMIN_API_KEY=your-admin-key
```

## Memory Management Dashboard

The backend includes a memory monitoring dashboard for tracking memory usage and detecting potential memory leaks. 

### Accessing the Dashboard

The dashboard is available at:

```
http://your-server-url/admin/memory
```

In development mode, you can access it directly without an API key. In production, you need to provide the admin API key either via query parameter or through the dashboard interface.

See [Dashboard Documentation](/public/admin/README.md) for more details.

## API Endpoints

The API includes the following endpoints:

- `POST /api/files/upload` - Upload a file
- `POST /api/convert` - Convert a file
- `GET /api/operations/:id/status` - Check operation status
- `GET /api/operations/:id/download` - Download conversion result
- `GET /api/diagnostic/memory` - Check memory status
- `GET /api/diagnostic/file-system` - Check file system status
- `GET /health` - Service health check

## Deployment

The backend is configured for deployment on Railway. See [RAILWAY_DEPLOYMENT.md](/RAILWAY_DEPLOYMENT.md) for deployment instructions.

## Memory Management

The application includes advanced memory management features:

1. **Memory Fallback Mode**: Automatic switch to in-memory storage if MongoDB is unavailable
2. **Memory Monitoring**: Real-time tracking of memory usage and leak detection
3. **Garbage Collection Controls**: Standard, aggressive, and emergency garbage collection options
4. **Memory Trend Analysis**: Tools for analyzing memory usage over time

## License

This project is proprietary software. All rights reserved.