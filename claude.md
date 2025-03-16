# PDFSpark Technical Documentation

## Overview

PDFSpark is a comprehensive PDF processing application with a React frontend and Node.js backend. It allows users to convert PDF files to various formats including Word, Excel, PowerPoint, images, and text.

## Core Features

- PDF conversion to multiple formats
- Multi-method file upload with automatic fallbacks
- Robust error handling and recovery
- Premium features with Stripe payment integration
- Session management for anonymous users
- Cloudinary integration for file storage
- Automatic file cleanup

## Architecture

```
[Frontend (React/TypeScript)] <---> [Backend API (Express.js)] <---> [File Processing Services]
                                        ^
                                        |
                            [MongoDB, Local Storage, Cloudinary]
```

## File Upload System

### Multi-strategy Upload Implementation

PDFSpark implements a sophisticated upload system with multiple fallback strategies to maximize reliability. The system automatically tries different upload approaches if one fails, ensuring maximum upload success rates.

#### Upload Strategies

1. **XMLHttpRequest with FormData** (Primary strategy)
   - Most compatible approach with detailed progress tracking
   - Benefits: Direct control over request lifecycle, progress monitoring
   - Implemented in `uploadWithXHR()` function

2. **Fetch API with FormData** (First fallback)
   - Modern approach using the Fetch API
   - Benefits: Clean Promise-based API, good browser support
   - Implemented in `uploadWithFetch()` function

3. **Axios with FormData** (Second fallback)
   - Fallback using the Axios library
   - Benefits: Consistent API, automatic transforms
   - Implemented in `uploadWithAxios()` function

4. **JSON with Base64** (Last resort fallback)
   - When all FormData approaches fail
   - Benefits: Bypasses FormData issues by encoding file as base64 in JSON
   - Implemented in `uploadWithBase64JSON()` function

### Implementation Details

```javascript
const uploadStrategies = [
  { name: 'xhr-formdata', method: uploadWithXHR },
  { name: 'fetch-formdata', method: uploadWithFetch },
  { name: 'axios-formdata', method: uploadWithAxios },
  { name: 'json-base64', method: uploadWithBase64JSON }
];

// Try each strategy in sequence until one succeeds
for (let i = 0; i < uploadStrategies.length; i++) {
  const strategy = uploadStrategies[i];
  try {
    // Try this upload strategy
    const result = await strategy.method(file, progressCallback);
    // Success - return the result
    return result;
  } catch (error) {
    // Log error and try next strategy if available
    console.error(`Upload failed with ${strategy.name} strategy:`, error);
    if (i === uploadStrategies.length - 1) {
      throw error; // Last strategy failed, propagate error
    }
  }
}
```

### Session Management

- Anonymous sessions tracked via `X-Session-ID` header
- Session ID stored in localStorage for persistence
- Backend associates uploads and operations with sessions
- Enables anonymous users to access their files across page reloads

### Error Handling and Reconnection

When upload fails, PDFSpark:

1. Logs detailed error information
2. Falls back to next upload strategy
3. Passes progress information between strategies
4. Maintains consistent state through failures
5. Provides meaningful error messages to users

### Critical Error Scenarios and Solutions

| Error Scenario | Solution |
|----------------|----------|
| Network interruption | Automatic retry with exponential backoff |
| FormData compatibility | Fallback to alternative upload methods |
| CORS issues | Comprehensive CORS configuration |
| File size limits | Clear validation and user feedback |
| Server errors | Fallback to client-side processing |

## Backend File Handling

### File Storage Strategy

PDFSpark uses a hybrid storage approach:

1. **Local filesystem** - Primary storage for uploaded and processed files
2. **Cloudinary** - Optional cloud storage for scalability
3. **MongoDB** - Stores file metadata and relationships

### Security Measures

- File signature validation
- MIME type verification 
- Sanitized filenames
- Maximum file size limits
- Automatic file cleanup
- Content type restriction

### Automatic Cleanup

- Temporary files automatically removed after 24 hours
- Scheduled cleanup process runs every 2 hours
- Manual cleanup endpoint available for administration

## Sessions and Progress Tracking

- Real-time conversion progress tracking
- WebSocket-like progress updates
- Session persistence across page reloads
- Anonymous user tracking with session IDs

## CORS Configuration

The backend implements a sophisticated CORS configuration to enable cross-origin requests while maintaining security:

- Dynamic origin validation with subdomain support
- Development mode with relaxed CORS for easier testing
- Production mode with strict origin checking
- Comprehensive header configuration

## Deployment Considerations

- Railway.app specific configuration
- Environment variable management
- Port binding strategies
- Health check endpoints for monitoring
- Graceful shutdown handling

## Troubleshooting Guide

### Client-Side Upload Issues

1. **Check browser console for errors**
   - Look for CORS errors, network failures, or JavaScript exceptions

2. **Verify file size limits**
   - Free tier: 5MB maximum
   - Premium tier: 100MB maximum

3. **Try refreshing and re-uploading**
   - This will reset the upload strategies and session

4. **Clear browser cache and cookies**
   - This resolves many persistent issues

5. **Try a different browser**
   - Some upload issues are browser-specific

### Server-Side Upload Issues

1. **Check server logs**
   - Look for file handling errors, permission issues, or storage problems

2. **Verify CORS configuration**
   - Ensure correct origins are allowed in backend config

3. **Check directory permissions**
   - Ensure `/uploads` and `/temp` directories are writable

4. **Verify MongoDB connection**
   - File metadata cannot be saved without database connection

5. **Check network connectivity**
   - Server must be able to communicate with Cloudinary if enabled

## Debugging Tools

### Frontend Debugging

- Set `VITE_DEBUG=true` environment variable
- Check browser console with detailed logging
- Use network tab to inspect request/response cycles

### Backend Debugging

- Check logs with `NODE_ENV=development`
- Use diagnostic endpoints:
  - `/api/system/health` - Overall system health
  - `/api/system/network` - Network connectivity
  - `/api/system/fs` - Filesystem status
  - `/test-upload` - Basic upload testing
  - `/api/diagnostic/upload` - Comprehensive upload diagnostics

## Common Error Messages and Solutions

| Error Message | Possible Cause | Solution |
|---------------|----------------|----------|
| "Failed to fetch" | Network connectivity issue | Check internet connection, try again later |
| "CORS error" | Cross-origin request blocked | Ensure frontend origin is allowed in backend config |
| "File too large" | File exceeds size limits | Reduce file size or upgrade to premium |
| "Invalid file format" | File is not a valid PDF | Verify file is a proper PDF document |
| "Upload timed out" | Slow network or server | Try on a better connection or smaller file |
| "Server error" | Backend processing failed | Check server logs for details |

## Performance Optimization

- Progress tracking optimized to reduce UI updates
- Buffered file processing to handle large files
- Connection pooling for database operations
- Exponential backoff for retries
- Lazy loading of non-critical components

## Session Management Details

1. **Session Creation**
   - Generated on first visit via UUID
   - Stored in localStorage for persistence
   - Sent with every API request via header

2. **Server Handling**
   - Backend validates and returns session ID in response headers
   - Associates uploads and operations with session
   - MongoDB tracks all session operations

3. **Benefits**
   - Anonymous user tracking without accounts
   - File operation history for users
   - Persistent access to conversions
   - Better error recovery

## Environment Variables Reference

### Frontend Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| VITE_API_URL | Backend API URL | https://pdfspark-production.up.railway.app |
| VITE_MOCK_API | Enable mock API | false |
| VITE_DEBUG | Enable debug mode | false |

### Backend Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| PORT | Server port | 8080 |
| MONGODB_URI | MongoDB connection string | - |
| UPLOAD_DIR | Directory for uploads | ./uploads |
| TEMP_DIR | Directory for temp files | ./temp |
| CORS_ALLOW_ALL | Allow all CORS origins | false |

## Best Practices for Development

1. **Frontend Development**
   - Use the mock API mode for faster iterations
   - Test all upload scenarios regularly
   - Handle progress and errors consistently

2. **Backend Development**
   - Comprehensive error handling
   - Proper cleanup of temporary files
   - Detailed logging for troubleshooting

## Common Commands

### Development

```bash
# Start frontend development server
npm run dev

# Start backend development server
cd backend && npm run dev

# Run tests
npm test

# Run end-to-end tests
npm run cypress:open
```

### Build and Deployment

```bash
# Build frontend for production
npm run build:prod

# Deploy to Railway
./railway-deploy.sh

# Deploy everything 
./deploy.sh all
```

## Resources

- [MongoDB Documentation](https://docs.mongodb.com/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [React Documentation](https://reactjs.org/docs/getting-started.html)
- [Railway Deployment Guide](https://docs.railway.app/deploy/railway-up)