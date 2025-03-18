# PDFSpark Cloudinary Fallback Test Scripts

This document provides instructions for testing the Cloudinary fallback mechanism in PDFSpark.

## Available Test Scripts

The following test scripts are available for testing the Cloudinary fallback mechanism:

### 1. File Handler Test Script

The `test-file-handlers.js` script tests all three file handlers (preview, original, result) with a given file ID.

```bash
node test-file-handlers.js <file-id>
```

This script will:
- Test accessing the original file with different extensions
- Test accessing the file preview
- Test accessing the result file with different extensions

### 2. Cloudinary Fallback Test Script

The `test-cloudinary-fallback.js` script specifically tests the fallback mechanism by simulating different failure scenarios.

```bash
node test-cloudinary-fallback.js <file-id> [--simulate-railway]
```

Options:
- `--simulate-railway`: Simulates a Railway environment by setting the `RAILWAY_SERVICE_NAME` and `RAILWAY_MODE` environment variables.

This script will:
- Test basic file access (should work if files exist locally)
- Test fallback when local files are temporarily removed
- Simulate Railway environment to test fallback behavior

### 3. Cloudinary Integration Test Script

The `test-cloudinary-integration.js` script tests the core Cloudinary functionality.

```bash
node test-cloudinary-integration.js [<file-path>]
```

This script will:
- Test Cloudinary configuration
- Test uploading a file to Cloudinary
- Test accessing the uploaded file with different URL types
- Test URL signing and access control

### 4. File Path Verification Script

The `verify-file-paths.js` script verifies file path resolution and access.

```bash
node verify-file-paths.js
```

This script will:
- Check if directories exist and are accessible
- Test absolute and relative path resolution
- Verify file access permissions

## Testing Workflow

For comprehensive testing, follow this workflow:

1. **Basic File Access Test**:
   ```bash
   node test-file-handlers.js <file-id>
   ```

2. **Cloudinary Integration Test**:
   ```bash
   node test-cloudinary-integration.js
   ```

3. **Fallback Mechanism Test**:
   ```bash
   node test-cloudinary-fallback.js <file-id>
   ```

4. **Railway Simulation Test**:
   ```bash
   node test-cloudinary-fallback.js <file-id> --simulate-railway
   ```

## Troubleshooting

If tests fail, check the following:

1. **MongoDB Connection**: Ensure your MongoDB connection is working correctly
2. **Cloudinary Configuration**: Verify Cloudinary API keys are set in environment variables
3. **File Existence**: Confirm the file ID you're testing actually exists in the database
4. **Environment Variables**: Check that all required environment variables are set

## Adding New Tests

When adding new tests, follow these guidelines:

1. Create a new test script with clear purpose and documentation
2. Add the script to this document with usage instructions
3. Ensure the script handles errors and provides clear output
4. Add any new required environment variables to the documentation

## Test Environment Setup

Before running tests, make sure your environment is properly configured:

1. Copy `.env.example` to `.env` and fill in the required values
2. Ensure MongoDB is running and accessible
3. Verify Cloudinary credentials are set
4. Start the backend server in development mode