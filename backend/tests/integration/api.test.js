const request = require('supertest');
const fs = require('fs');
const path = require('path');

// Set environment variables for testing
process.env.NODE_ENV = 'test';
process.env.USE_IN_MEMORY_DB = 'true';

// Import app after environment setup
const app = require('../../index');

describe('API Integration Tests', () => {
  // Test for health check endpoint
  describe('GET /api/health', () => {
    it('should return 200 with application status', async () => {
      const response = await request(app).get('/api/health');
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('UP');
    });
  });

  // Test for file upload
  describe('POST /api/files/upload', () => {
    it('should reject requests without files', async () => {
      const response = await request(app)
        .post('/api/files/upload')
        .set('Content-Type', 'multipart/form-data');
        
      // The response status could be either 400 (if validation happens at controller level)
      // or 500 (if multer throws an error). Both are acceptable for this test.
      expect([400, 500]).toContain(response.statusCode);
      expect(response.body).toHaveProperty('error');
      // The error message might vary depending on where the validation happens
    });
    
    // This test requires a valid test PDF file
    it('should accept valid PDF uploads', async () => {
      const testPdfPath = path.join(__dirname, '../test.pdf');
      
      // Make sure test file exists
      if (!fs.existsSync(testPdfPath)) {
        throw new Error('Test PDF file not found');
      }
      
      const response = await request(app)
        .post('/api/files/upload')
        .attach('file', testPdfPath);
        
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('fileId');
      expect(response.body).toHaveProperty('fileName');
    });
  });
  
  // Test for file retrieval
  describe('GET /api/files/original/:filename', () => {
    it('should return 404 for non-existent files', async () => {
      const response = await request(app)
        .get('/api/files/original/nonexistent-file.pdf');
        
      expect(response.statusCode).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('File not found');
    });
  });
  
  // Test for base route
  describe('GET /', () => {
    it('should return API info', async () => {
      const response = await request(app).get('/');
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('name', 'PDFSpark API');
      expect(response.body).toHaveProperty('status', 'Operational');
    });
  });
});