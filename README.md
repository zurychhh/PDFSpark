# PDFSpark React App

A modern React application built with TypeScript, Vite, ESLint, and Prettier for PDF processing. PDFSpark allows users to convert PDF files to various formats including Word, Excel, PowerPoint, images, and text.

## Features

- PDF to Word/Excel/PowerPoint/Image/Text conversion
- Drag and drop file uploading
- Real-time conversion progress tracking
- Responsive design for mobile and desktop
- Premium features for advanced functionality

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

## Features

- Modern React (v19) with TypeScript
- Fast development with Vite
- Code quality enforced with ESLint
- Consistent code style with Prettier

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

## License

This project is licensed under the MIT License.
