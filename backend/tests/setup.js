// Setup environment for testing
process.env.NODE_ENV = 'test';
process.env.USE_IN_MEMORY_DB = 'true';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.UPLOAD_DIR = './test-uploads';
process.env.TEMP_DIR = './test-temp';

const fs = require('fs');
const path = require('path');

// Create test directories
const ensureTestDirectories = () => {
  const dirs = ['./test-uploads', './test-temp'];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

// Clean test directories
const cleanTestDirectories = () => {
  const dirs = ['./test-uploads', './test-temp'];
  dirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        try {
          fs.unlinkSync(path.join(dir, file));
        } catch (err) {
          console.error(`Error cleaning test file ${file}:`, err);
        }
      });
    }
  });
};

// Setup before all tests
beforeAll(() => {
  ensureTestDirectories();
  
  // Create a simple mock implementation for console.error to reduce test output noise
  jest.spyOn(console, 'error').mockImplementation(() => {});
  
  // Add other global mocks if needed
});

// Clean up after each test
afterEach(() => {
  cleanTestDirectories();
});

// Restore console after all tests
afterAll(() => {
  console.error.mockRestore();
});

// Add global timeout for tests
jest.setTimeout(30000);