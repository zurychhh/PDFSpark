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

To deploy to production:

1. Configure your environment
   ```bash
   # Make sure .env has the following settings
   VITE_MOCK_API=false
   VITE_API_URL=https://your-api-domain.com
   VITE_PREMIUM_ENABLED=true
   VITE_ANALYTICS_ENABLED=true
   ```

2. Build for production
   ```bash
   npm run build:prod
   ```

3. Deploy to your hosting provider
   ```bash
   # If using AWS S3 + CloudFront, customize the deploy.sh script with your settings
   ./deploy.sh
   ```

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
├── public/             # Static files
├── src/
│   ├── assets/         # Images, fonts, etc.
│   ├── components/     # Reusable components
│   ├── App.tsx         # Main application component
│   └── main.tsx        # Application entry point
├── .prettierrc         # Prettier configuration
├── eslint.config.js    # ESLint configuration
├── tsconfig.json       # TypeScript configuration
└── vite.config.ts      # Vite configuration
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

The application is designed to work with a backend API for PDF processing. Two modes are supported:

### 1. Mock API Mode (for development)

For local development without a backend, set `VITE_MOCK_API=true` in your `.env` file. This enables mock implementations of all API endpoints with simulated delays and responses.

### 2. Production API Mode

To connect to your production backend:

1. Set `VITE_MOCK_API=false` in your `.env` file
2. Configure the backend URL with `VITE_API_URL=https://your-api-url.com` 
3. Ensure CORS is properly configured on your backend to accept requests from your frontend domain
4. Ensure your backend implements the following API endpoints:

#### API Endpoints

| Endpoint | Method | Description | Request | Response |
|----------|--------|-------------|---------|----------|
| `/files/upload` | POST | Upload a file | FormData with 'file' field | `{ success, fileId, fileName, fileSize, uploadDate, expiryDate, previewUrl? }` |
| `/convert` | POST | Start conversion | `{ fileId, sourceFormat, targetFormat, options }` | `{ success, operationId, estimatedTime, isPremium, price?, currency? }` |
| `/operations/{id}/status` | GET | Check conversion status | - | `{ operationId, status, progress, estimatedTimeRemaining, resultFileId?, errorMessage? }` |
| `/operations/{id}/download` | GET | Get conversion result | - | `{ success, downloadUrl, expiryTime, fileName, fileSize }` |
| `/operations/{id}/preview` | GET | Get result preview | - | `{ previewUrl }` |

For complete API specifications, check `src/services/pdfService.ts`.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | https://api.pdfspark.com |
| `VITE_API_TIMEOUT` | API request timeout (ms) | 30000 |
| `VITE_MOCK_API` | Enable/disable mock API | true |
| `VITE_PREMIUM_ENABLED` | Enable premium features | true |
| `VITE_ANALYTICS_ENABLED` | Enable analytics | true |
| `VITE_MAX_FILE_SIZE_FREE` | Max file size for free tier (MB) | 5 |
| `VITE_MAX_FILE_SIZE_PREMIUM` | Max file size for premium tier (MB) | 100 |

## License

This project is licensed under the MIT License.
