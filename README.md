# PDFSpark React App

A modern React application built with TypeScript, Vite, ESLint, and Prettier for PDF processing. PDFSpark allows users to convert PDF files to various formats including Word, Excel, PowerPoint, images, and text.

## Features

### User Features
- PDF to Word/Excel/PowerPoint/Image/Text conversion
- Drag and drop file uploading
- Real-time conversion progress tracking
- Responsive design for mobile and desktop
- Premium features for advanced functionality
- Secure file processing with automatic cleanup
- Cloudinary integration for image hosting

## Getting Started

### Prerequisites

- Node.js (version 18 or higher)
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd react-pdfspark
```

2. Install dependencies
```bash
npm install
```

### Development

Start the development server:
```bash
npm run dev
```

The app will be available at http://localhost:5174

### Production Deployment

PDFSpark is configured for deployment to Vercel (frontend) and Railway (backend).

1. Configure your environment variables:
   ```bash
   # Frontend (.env)
   VITE_MOCK_API=false
   VITE_API_URL=https://pdfspark-api.up.railway.app
   VITE_API_BASE_URL=https://pdfspark-api.up.railway.app/api
   VITE_PREMIUM_ENABLED=true
   VITE_ANALYTICS_ENABLED=true
   VITE_CLOUDINARY_CLOUD_NAME=pdfspark
   VITE_MOCK_CLOUDINARY=true
   
   # Backend (backend/.env)
   PORT=5001
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/pdfspark
   JWT_SECRET=your-jwt-secret
   STRIPE_SECRET_KEY=sk_test_your_stripe_key
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   CLOUDINARY_CLOUD_NAME=pdfspark
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```

2. Deploy the entire application (frontend and backend):
   ```bash
   ./deploy.sh all prod
   ```

3. Or deploy components separately:
   ```bash
   # Deploy only the backend to Railway
   ./deploy.sh backend
   
   # Deploy only the frontend to Vercel (production)
   ./deploy.sh frontend prod
   
   # Set up Stripe webhook for local testing
   ./deploy.sh stripe
   ```

For more detailed deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md) and [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md).

### Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:prod` - Full production build with linting and type checking
- `npm run lint` - Check for linting errors
- `npm run lint:fix` - Fix linting errors automatically
- `npm run format` - Format code using Prettier
- `npm run format:check` - Check for formatting issues
- `npm run preview` - Preview production build locally
- `npm run analyze` - Analyze production bundle size

## Project Structure

```
react-pdfspark/
├── public/                  # Static frontend files
├── src/                     # Frontend source code
│   ├── assets/              # Images, fonts, etc.
│   ├── components/          # Reusable React components
│   ├── config/              # Configuration files
│   ├── pages/               # Page components
│   ├── services/            # API and service integrations
│   ├── App.tsx              # Main application component
│   └── main.tsx             # Application entry point
├── backend/                 # Backend server
│   ├── config/              # Backend configuration
│   ├── controllers/         # Request handlers
│   ├── middlewares/         # Express middlewares
│   ├── models/              # Mongoose models
│   ├── routes/              # API routes
│   ├── services/            # Business logic services
│   ├── utils/               # Utility functions
│   ├── tests/               # Backend tests
│   └── index.js             # Backend entry point
├── .prettierrc              # Prettier configuration
├── eslint.config.js         # ESLint configuration 
├── tsconfig.json            # TypeScript configuration
├── vite.config.ts           # Vite configuration
├── vercel.json              # Vercel deployment config
├── railway-deploy.sh        # Railway deployment script
├── deploy.sh                # Unified deployment script
├── DEPLOYMENT.md            # Deployment documentation
└── PRODUCTION_CHECKLIST.md  # Production readiness guide
```

### Technical Features
- Modern React (v19) with TypeScript
- Fast development with Vite
- Code quality enforced with ESLint
- Consistent code style with Prettier
- Full-stack application with Node.js backend
- RESTful API with Express.js
- MongoDB database integration
- Cloudinary file storage integration
- Stripe payment processing
- JWT authentication

## Advanced ESLint Configuration

For production applications, we can update the configuration to enable additional type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    ...tseslint.configs.recommendedTypeChecked,
    // For stricter rules, use:
    // ...tseslint.configs.strictTypeChecked,
    // For stylistic rules, use:
    // ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

## Backend Integration

The application is designed to work with a complete backend API for PDF processing. The backend is located in the `backend/` directory and provides all required endpoints for file processing, conversion, and payment handling.

### 1. Mock API Mode (for development)

For local development without a running backend, set `VITE_MOCK_API=true` in your `.env` file. This enables mock implementations of all API endpoints with simulated delays and responses.

### 2. Full Stack Development (frontend + backend)

To run the complete application with real backend:

1. Start the backend server:
   ```bash
   cd backend
   npm install
   npm run dev
   ```

2. Start the frontend with API mode enabled:
   ```bash
   # In a new terminal, from the project root
   VITE_MOCK_API=false npm run dev
   ```

3. The frontend will connect to the backend running on http://localhost:5001

### 3. Production API Mode

To connect to your production backend:

1. Set `VITE_MOCK_API=false` in your `.env` file
2. Configure the backend URL with `VITE_API_URL=https://pdfspark-api.up.railway.app` 
3. Ensure CORS is properly configured on your backend to accept requests from your frontend domain

### API Endpoints

The backend implements these endpoints:

| Endpoint | Method | Description | Request | Response |
|----------|--------|-------------|---------|----------|
| `/api/files/upload` | POST | Upload a file | FormData with 'file' field | `{ success, fileId, fileName, fileSize, uploadDate, expiryDate, previewUrl? }` |
| `/api/convert` | POST | Start conversion | `{ fileId, sourceFormat, targetFormat, options }` | `{ success, operationId, estimatedTime, isPremium, price?, currency? }` |
| `/api/operations/:id/status` | GET | Check conversion status | - | `{ operationId, status, progress, estimatedTimeRemaining, resultFileId?, errorMessage? }` |
| `/api/operations/:id/download` | GET | Get conversion result | - | `{ success, downloadUrl, expiryTime, fileName, fileSize }` |
| `/api/operations/:id/preview` | GET | Get result preview | - | `{ previewUrl }` |
| `/api/payments/create` | POST | Create payment | `{ operationId, paymentMethod, returnUrl? }` | `{ success, paymentId, status, checkoutUrl }` |
| `/api/payments/:id/status` | GET | Check payment status | - | `{ paymentId, status, operationId, canProceed }` |
| `/api/cloudinary/upload` | POST | Upload to Cloudinary | FormData with 'file' field | Cloudinary response |

For complete API specifications, check `src/services/pdfService.ts` and `backend/routes/`.

## Environment Variables

### Frontend Variables (`.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | https://pdfspark-api.up.railway.app |
| `VITE_API_BASE_URL` | Backend API base URL | https://pdfspark-api.up.railway.app/api |
| `VITE_API_TIMEOUT` | API request timeout (ms) | 30000 |
| `VITE_MOCK_API` | Enable/disable mock API | true (false in production) |
| `VITE_CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | pdfspark |
| `VITE_MOCK_CLOUDINARY` | Use mock Cloudinary | true (false in production) |
| `VITE_PREMIUM_ENABLED` | Enable premium features | true |
| `VITE_ANALYTICS_ENABLED` | Enable analytics | true |
| `VITE_MAX_FILE_SIZE_FREE` | Max file size for free tier (MB) | 5 |
| `VITE_MAX_FILE_SIZE_PREMIUM` | Max file size for premium tier (MB) | 100 |

### Backend Variables (`backend/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | Yes (default: 5001) |
| `NODE_ENV` | Environment | Yes (development/production) |
| `MONGODB_URI` | MongoDB connection string | Yes, for database functionality |
| `USE_MEMORY_FALLBACK` | Enable in-memory storage mode | No (default: false) |
| `CORS_ALLOW_ALL` | Allow all origins for CORS | No (default: false) |
| `JWT_SECRET` | Secret for JWT tokens | Yes, for auth |
| `UPLOAD_DIR` | Directory for uploaded files | Yes (default: ./uploads) |
| `TEMP_DIR` | Directory for temporary files | Yes (default: ./temp) |
| `FRONTEND_URL` | Frontend URL for CORS | Yes, in production |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | For Cloudinary integration |
| `CLOUDINARY_API_KEY` | Cloudinary API key | For Cloudinary integration |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | For Cloudinary integration |
| `STRIPE_SECRET_KEY` | Stripe secret key | For payment processing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | For Stripe webhooks |
| `STRIPE_API_VERSION` | Stripe API version | Recommended (default: 2023-10-16) |
| `ADMIN_API_KEY` | Admin API key for system maintenance | No |

## Testing

PDFSpark has a comprehensive test suite covering both frontend and backend functionality.

### Frontend Tests

To run frontend tests:

```bash
# From the project root
npm test
```

Our frontend tests use Jest and React Testing Library to validate component functionality.

For end-to-end testing, we use Cypress:

```bash
# Start the app in one terminal
npm run dev

# Run Cypress tests in another terminal
npm run cypress:open  # Interactive UI
npm run cypress:run   # Headless mode
```

### Backend Tests

To run backend tests:

```bash
# From the backend directory
cd backend
npm test

# Run specific test suite
npm test -- --testPathPattern=pdfService

# Run with coverage report
npm test -- --coverage
```

## Troubleshooting

### Critical Issue: PDF Conversion System

#### Technical Stack Overview

Our PDF conversion system is built on the following technology stack:

- **Frontend**: React 19 with TypeScript, Vite
- **Backend**: Node.js with Express
- **Database**: MongoDB (with in-memory fallback)
- **Cloud Storage**: Cloudinary for persistent file storage
- **Deployment**: Railway for backend, Vercel for frontend
- **PDF Libraries**:
  - pdf-lib for PDF manipulation
  - sharp for image processing
  - docx for Word document generation
  - pdf2json for text extraction
  - Various native Node.js file system operations

#### The Core Problem

We're experiencing a critical issue with our PDF conversion system, particularly when deployed to Railway. The main problems are:

1. **File Processing Inconsistency**: Conversions frequently fail in the production environment, despite working in development.
2. **State Management Issues**: Operation IDs and result file IDs become mismatched during processing.
3. **Ephemeral Storage Problems**: Railway's ephemeral filesystem means temporary files disappear between restarts.
4. **Variable Declaration Errors**: Duplicate variable declarations in the conversion controller cause deployment failures.
5. **Downloaded Files Corruption**: Files that appear to convert successfully are often corrupted or unreadable when downloaded.
6. **Memory Management**: Large PDF files cause memory issues on Railway's constrained environment.

#### Detailed Technical Analysis

##### 1. Ephemeral Filesystem Impact

Railway uses an ephemeral filesystem which means:
- Files written to disk are lost between deployments
- Temporary files created during conversions disappear
- Result files cannot be reliably stored or accessed locally

This affects several critical paths in our application:
- File upload → temporary storage → conversion → result storage → download
- In-progress conversions when a redeployment occurs
- Background file cleanup processes

##### 2. Memory Management Issues

Our PDF processing libraries (particularly pdf-lib) require significant memory to process larger files:
- 10MB PDF can require 50-100MB of memory during processing
- Railway instances typically have 512MB-1GB of available memory
- Multiple concurrent conversions exceed available memory
- Memory pressure causes process crashes and incomplete conversions

##### 3. State Management Problems

When tracking conversions across the system, we're encountering:
- Race conditions between conversion steps and database updates
- MongoDB connection issues causing operation tracking failures
- Mismatches between operation IDs and result file IDs
- Duplicate variable declarations in conversion controller:
  ```javascript
  // This appears twice in the code (Lines 1432 & 1469)
  const outputResultFileId = path.parse(outputFilename).name;
  ```

##### 4. File Download Workflow Failures

The download process involves multiple steps that can fail:
- Retrieval of operation metadata from database
- Locating the converted file on disk or in Cloudinary
- Building correct download URLs with proper parameters
- Handling CORS issues for cross-domain downloads
- Browser security restrictions on file downloads

#### Attempted Solutions

We've implemented multiple layers of solutions and fallbacks:

##### 1. Memory Fallback Mode

Created a complete in-memory fallback system when database connections fail:
```javascript
// Memory fallback activation
if (process.env.USE_MEMORY_FALLBACK === 'true' || !mongodbConnected) {
  console.log('🚨 Activating memory fallback storage mode');
  global.usingMemoryFallback = true;
  global.memoryStorage = {
    operations: [],
    files: [],
    addOperation: function(op) { 
      this.operations.push(op);
      return op;
    },
    findOperation: function(id) {
      return this.operations.find(op => op._id === id || op.id === id);
    },
    // More methods...
  };
}
```

##### 2. Cloudinary Integration

Implemented mandatory Cloudinary uploads for all conversion results:
```javascript
// Multiple Cloudinary upload attempts with error handling
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    cloudinaryResult = await cloudinaryService.uploadFile(
      { path: result.outputPath, originalname: cloudinaryFileName },
      {
        folder: 'pdfspark_results',
        public_id: `${outputFilename.split('.')[0]}_${timestamp}`,
        resource_type: 'auto',
        tags: [operation.targetFormat, 'conversion-result'],
        context: {
          operation_id: operation._id.toString(),
          source_file_id: operation.sourceFileId,
        },
        timeout: 60000
      }
    );
    
    // Store Cloudinary data in operation
    operation.cloudinaryData = {
      publicId: cloudinaryResult.public_id,
      url: cloudinaryResult.url,
      secureUrl: cloudinaryResult.secure_url,
      // More properties...
    };
    
    // Set download URL to Cloudinary
    operation.resultDownloadUrl = cloudinaryResult.secure_url;
    cloudinaryUploadSuccess = true;
    break;
  } catch (cloudinaryError) {
    // Error handling and retries...
  }
}
```

##### 3. Multi-Strategy File Finding

Created a cascade of strategies to locate files:
```javascript
// Array of strategies tried in sequence
const strategies = [
  // Strategy 1: Check for Cloudinary secureUrl in operation.cloudinaryData
  async () => {
    if (operation.cloudinaryData && operation.cloudinaryData.secureUrl) {
      downloadUrl = operation.cloudinaryData.secureUrl;
      return true;
    }
    return false;
  },
  
  // Strategy 2: Check for pre-saved Cloudinary URL
  async () => {
    if (operation.resultDownloadUrl && operation.resultDownloadUrl.includes('cloudinary.com')) {
      downloadUrl = operation.resultDownloadUrl;
      return true;
    }
    return false;
  },
  
  // Strategy 3: Try fresh MongoDB lookup for Railway
  // Strategy 4: Check local file system at stored path
  // Strategy 5: Try different file extensions in temp dir
  // Strategy 6: Look for files starting with resultFileId
  // Strategy 7: Generate fallback file on-the-fly for Railway
  // More strategies...
];

// Try each strategy until one succeeds
for (const strategy of strategies) {
  fileFound = await strategy();
  if (fileFound) break;
}
```

##### 4. Emergency Document Generation

Implemented on-the-fly document generation for missing files:
```javascript
// For Railway, create a fallback DOCX file on-the-fly
async () => {
  if (process.env.RAILWAY_SERVICE_NAME && operation.targetFormat === 'docx') {
    try {
      // Create a simple DOCX using the docx library
      const { Document, Paragraph, TextRun, Table } = require('docx');
      
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "PDFSpark - Generated Document",
                  bold: true,
                  size: 36
                })
              ]
            }),
            // More document content...
          ]
        }]
      });
      
      // Generate buffer and save to disk
      const buffer = await doc.save();
      const fallbackPath = path.join(process.env.TEMP_DIR || './temp', 
                                     `${operation.resultFileId}_fallback.docx`);
      fs.writeFileSync(fallbackPath, buffer);
      
      resultFilePath = fallbackPath;
      downloadUrl = pdfService.getFileUrl(`${operation.resultFileId}_fallback.docx`, 'result');
      return true;
    } catch (docxError) {
      console.error('Error generating fallback DOCX:', docxError);
    }
  }
  return false;
}
```

##### 5. Fixed Variable Declaration Errors

Fixed the duplicate variable declaration issue:
```javascript
// Original problematic code
const outputResultFileId = path.parse(outputFilename).name;
if (operation.resultFileId !== outputResultFileId) {
  // Logic...
}

// Fixed code
const filenameBase = path.parse(outputFilename).name;
if (operation.resultFileId !== filenameBase) {
  // Logic...
}
```

##### 6. Enhanced Environment Variable Handling

Added Railway-specific environment variable fixes:
```javascript
// Railway environment detected, applying fixes...
if (process.env.RAILWAY_SERVICE_NAME) {
  console.log('Railway environment detected, applying fixes...');
  
  // Force memory fallback mode in Railway
  if (process.env.USE_MEMORY_FALLBACK !== 'true') {
    console.log('🚨 CRITICAL: Setting USE_MEMORY_FALLBACK=true for Railway deployment');
    process.env.USE_MEMORY_FALLBACK = 'true';
  }
  
  // Allow all CORS in Railway for easier frontend integration
  if (process.env.CORS_ALLOW_ALL !== 'true') {
    console.log('Setting CORS_ALLOW_ALL=true for Railway environment');
    process.env.CORS_ALLOW_ALL = 'true';
  }
  
  // Verify MongoDB connection string
  if (!process.env.MONGODB_URI || process.env.MONGODB_URI.length < 20) {
    console.log('🚨 MONGODB_URI is not correctly set, applying emergency fix');
    // Apply emergency fix with fallback connection string
  }
}
```

#### Current Status and Ongoing Issues

Despite our multi-layered approach, we're still experiencing significant issues:

1. **Inconsistent File Access**: Even with Cloudinary integration, files are sometimes inaccessible.
2. **Memory Pressure Crashes**: Railway instances crash during high-load periods due to memory pressure.
3. **Variable Declaration Errors**: Fixed in our latest deployment, but may have caused previous failures.
4. **Cloudinary Upload Failures**: Cloudinary uploads sometimes fail due to network issues or timeouts.
5. **Database Operation Tracking**: Operations sometimes lose their tracking data in the database.

#### Next Steps & Consultation Needs

We need expert consultation on the following:

1. **Architecture Assessment**: Evaluate our overall architecture for handling PDF processing in a cloud environment.
2. **Memory Optimization**: Techniques for reducing memory usage during PDF conversions.
3. **Railway-Specific Optimizations**: Best practices for file handling on Railway's ephemeral filesystem.
4. **Scaling Strategy**: How to properly scale the system for handling multiple concurrent conversions.
5. **Monitoring & Diagnostics**: Implementing better monitoring to catch issues before they affect users.

We believe an experienced cloud architect with specific knowledge of Node.js memory management and PDF processing would be able to provide valuable insights into resolving these persistent issues.

### Common Issues

#### File Upload Problems

If you're experiencing issues with file uploads, check:

1. Verify file size is within limits (5MB for free tier, 100MB for premium)
2. Ensure proper CORS configuration when using a remote backend
3. Check browser console for detailed error messages
4. Test the diagnostic endpoints to identify system health issues
   - `/api/diagnostic/file-system` - Check file system accessibility
   - `/api/diagnostic/memory` - Check memory fallback status
   - `/api/diagnostic/upload` - Test file upload functionality
5. See [LESSONS_LEARNED.md](LESSONS_LEARNED.md) for more troubleshooting tips

#### File Download Issues

When experiencing issues with file downloads (especially in the browser console showing "pending" fetch requests):

1. **Cloudinary CORS Issues**: The download may fail with "Host is not supported" errors in the console. This happens because the browser is unable to download files from Cloudinary due to CORS restrictions.

2. **Multi-Strategy Download System Implemented**:
   - We've implemented a robust multi-strategy download system with automatic fallbacks:
     - **Enhanced Download Service**: Central download service that automatically selects the best strategy
     - **Iframe Approach**: For Cloudinary URLs, uses an iframe approach that bypasses CORS restrictions
     - **Fetch API with Blob**: For direct file downloads, uses fetch to get the file as a blob
     - **Direct window.open**: As a last resort fallback
     - **Automatic Retry & Recovery**: If one strategy fails, automatically tries next strategy

3. **Special Cloudinary URL Handling**:
   - Cloudinary URLs are automatically enhanced with parameters like `fl_attachment` for proper download
   - The application adds this parameter consistently in:
     - Frontend: `downloadFile()` function in `pdfService.ts`
     - Backend: `prepareCloudinaryUrlForDownload()` function in `conversionController.js`

4. **Railway Deployment Fallbacks**:
   - For Railway deployment, where local files can be lost, implemented multiple fallbacks:
     - Multiple file path search strategies to find files in various locations
     - Automatic DOCX generation for missing DOCX files
     - Automatic PDF generation for missing files of other types
     - Clear error documents with instructions when files cannot be found

5. **Diagnostic Endpoints**:
   - Comprehensive diagnostic endpoints added for troubleshooting:
     - `/api/diagnostic/memory` - Memory mode status check
     - `/api/diagnostic/file-system` - File system health check
     - `/api/diagnostic/database` - Database connectivity check
     - `/api/diagnostic/upload` - Upload system test endpoint
     - `/api/diagnostic/all` - Comprehensive system diagnostics
     - `/api/diagnostic/cloudinary` - Cloudinary configuration check

6. **Troubleshooting Steps**:
   - Try the enhanced download service: `pdfService.downloadConversionResult(operationId)`
   - Check browser console for specific errors
   - Verify the download URL includes `fl_attachment` for Cloudinary URLs
   - Use diagnostic endpoints to identify system issues
   - For detailed diagnostics, run `backend/test-api.js` script

#### Database Connection Issues

The application includes a resilient multi-strategy connection system:

1. **Multiple Connection Attempts**: The system tries to connect to MongoDB multiple times with exponential backoff
2. **Multiple Connection Strings**: If the primary connection fails, the system tries several fallback connection strings
3. **Memory Fallback Mode**: When all database connection attempts fail, the system automatically switches to an in-memory storage mode
4. **Connection Monitoring**: The system continuously monitors the database connection and switches to fallback mode if the connection drops

To explicitly enable memory fallback mode (useful for testing or in environments without MongoDB):
```bash
# In backend/.env
USE_MEMORY_FALLBACK=true
```

#### API Connection Issues

If the frontend can't connect to the backend:

1. Verify `VITE_MOCK_API=false` and `VITE_API_URL` is correctly set
2. Check that the backend server is running
3. Ensure network connectivity between frontend and backend
4. Verify CORS is properly configured on the backend

#### Payment Processing Issues

For payment-related troubleshooting:

1. Check Stripe dashboard for event logs and transaction status
2. Verify webhook configuration is correct
3. See [PAYMENT_TESTING.md](PAYMENT_TESTING.md) for comprehensive payment testing

### Debug Mode

Enable debug mode to get more detailed logging:

```bash
# Frontend
VITE_DEBUG=true npm run dev

# Backend
DEBUG=pdfspark:* npm run dev
```

## Contributing

Contributions to PDFSpark are welcome! 

### Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Development Guidelines

- Follow the existing code style and organization
- Write tests for new features
- Update documentation as needed
- Adhere to semantic versioning for releases

### Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Prioritize user experience and code quality

## Support

For support, please open an issue on the repository or contact the development team directly.

For local development issues, check the common troubleshooting steps in [LESSONS_LEARNED.md](LESSONS_LEARNED.md) which contains detailed solutions for:
- File upload problems
- CORS configuration issues
- API integration challenges
- Environment setup problems
- Authentication and session management

## Acknowledgements

- [PDF.js](https://mozilla.github.io/pdf.js/) for PDF rendering capabilities
- [React Dropzone](https://react-dropzone.js.org/) for drag and drop functionality
- [Node.js PDF libraries](https://www.npmjs.com/package/pdf-lib) for backend processing
- All contributors who have helped build PDFSpark

## License

This project is licensed under the MIT License.
