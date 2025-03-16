const fs = require('fs');
const path = require('path');
const { isPdfValid } = require('../../utils/fileValidator');

// Mock dependencies
jest.mock('pdf-lib', () => {
  const mockPDFDocument = {
    load: jest.fn().mockImplementation(async (buffer, options) => {
      // Simulate PDF parsing
      if (buffer.toString().startsWith('%PDF')) {
        return {
          getPageCount: jest.fn().mockReturnValue(2)
        };
      } else {
        throw new Error('Invalid PDF format');
      }
    })
  };
  
  return { PDFDocument: mockPDFDocument };
});

// Mock fs functions
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  accessSync: jest.fn()
}));

describe('File Validator Utils', () => {
  beforeEach(() => {
    // Reset mock calls between tests
    jest.clearAllMocks();
  });
  
  describe('isPdfValid function', () => {
    it('should return false for non-existent files', async () => {
      // Setup mock to return false for file existence
      fs.existsSync.mockReturnValue(false);
      
      const result = await isPdfValid('/path/to/nonexistent.pdf');
      
      expect(result.valid).toBe(false);
      expect(result.message).toContain('does not exist');
      expect(fs.existsSync).toHaveBeenCalledTimes(1);
    });
    
    it('should return false for empty files', async () => {
      // Setup mocks
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(Buffer.from(''));
      
      const result = await isPdfValid('/path/to/empty.pdf');
      
      expect(result.valid).toBe(false);
      expect(result.message).toContain('empty');
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });
    
    it('should return false for non-PDF files', async () => {
      // Setup mocks
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(Buffer.from('Not a PDF file'));
      
      const result = await isPdfValid('/path/to/fake.pdf');
      
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Not a valid PDF file');
    });
    
    it('should return true for valid PDF files', async () => {
      // Setup mocks
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(Buffer.from('%PDF-1.5\nSome PDF content'));
      
      const result = await isPdfValid('/path/to/valid.pdf');
      
      expect(result.valid).toBe(true);
      expect(result.pageCount).toBe(2);
      expect(result.message).toContain('Valid PDF');
    });
    
    it('should handle file reading errors', async () => {
      // Setup mocks
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      
      const result = await isPdfValid('/path/to/protected.pdf');
      
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Unable to read file');
    });
  });
});