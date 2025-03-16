const path = require('path');
const { ErrorResponse } = require('../utils/errorHandler');
const fileController = require('../controllers/fileController');

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  accessSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
  statSync: jest.fn().mockReturnValue({ size: 1024 })
}));

// Import mocked fs
const fs = require('fs');

// Mock dependencies
jest.mock('../models/Operation');
jest.mock('../models/Payment');
jest.mock('../services/pdfService');
jest.mock('../utils/fileValidator', () => ({
  isPdfValid: jest.fn().mockResolvedValue({
    valid: true,
    message: 'Valid PDF',
    pageCount: 1
  })
}));

const pdfService = require('../services/pdfService');
const { isPdfValid } = require('../utils/fileValidator');

describe('File Controller Tests', () => {
  let res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
    cookie: jest.fn(),
    sendFile: jest.fn()
  };
  
  let req, next;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup mock response object
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      cookie: jest.fn(),
      sendFile: jest.fn()
    };
    
    // Common request object
    req = {
      file: {
        originalname: 'test.pdf',
        buffer: Buffer.from('Test PDF content'),
        size: 16,
        mimetype: 'application/pdf'
      },
      params: {},
      user: {
        hasActiveSubscription: jest.fn().mockReturnValue(false)
      },
      sessionId: 'test-session-id'
    };
    
    // Next function with error handling
    next = jest.fn(err => {
      if (err) {
        console.error('Error in test:', err);
      }
    });
    
    // Mock successful file validation
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'accessSync').mockReturnValue(undefined);
    jest.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
    
    // Reset isPdfValid mock
    isPdfValid.mockClear();
    
    // Mock successful file save
    pdfService.saveFile.mockResolvedValue({
      fileId: 'test-file-id',
      filename: 'test-file-id.pdf',
      originalname: 'test.pdf',
      filepath: '/path/to/test-file-id.pdf',
      size: 16,
      mimetype: 'application/pdf'
    });
  });
  
  test('uploadFile should handle request without file', async () => {
    // Remove file from request
    req.file = undefined;
    
    // Call controller
    await fileController.uploadFile(req, res, next);
    
    // Assert next was called with error
    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ErrorResponse);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Please upload a file');
  });
  
  test('uploadFile should successfully process a file', async () => {
    // Call controller
    await fileController.uploadFile(req, res, next);
    
    // Assert response
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();
    
    const jsonResponse = res.json.mock.calls[0][0];
    expect(jsonResponse.success).toBe(true);
    expect(jsonResponse.fileId).toBe('test-file-id');
    expect(jsonResponse.fileName).toBe('test.pdf');
    expect(jsonResponse.fileSize).toBe(16);
    expect(jsonResponse.uploadDate).toBeDefined();
    expect(jsonResponse.expiryDate).toBeDefined();
  });
  
  test('uploadFile should reject files exceeding size limit', async () => {
    // Set file size over the limit for free users (5MB)
    req.file.size = 6 * 1024 * 1024;
    
    // Call controller
    await fileController.uploadFile(req, res, next);
    
    // Assert next was called with error
    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ErrorResponse);
    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('File size exceeds limit');
  });
  
  test('uploadFile should accept larger files for premium users', async () => {
    // Set user as premium
    req.user.hasActiveSubscription.mockReturnValue(true);
    
    // Set file size over free limit but under premium limit
    req.file.size = 10 * 1024 * 1024;
    
    // Mock successful file save
    pdfService.saveFile.mockResolvedValue({
      fileId: 'test-file-id',
      filename: 'test-file-id.pdf',
      originalname: 'test.pdf',
      filepath: '/path/to/test-file-id.pdf',
      size: 10 * 1024 * 1024,
      mimetype: 'application/pdf'
    });
    
    // Call controller
    await fileController.uploadFile(req, res, next);
    
    // Assert success response
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});