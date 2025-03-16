const fs = require('fs');
const path = require('path');
const pdfService = require('../../services/pdfService');

// Mock dependencies
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  accessSync: jest.fn(),
  statSync: jest.fn().mockReturnValue({ size: 1024 })
}));

jest.mock('pdf-lib', () => {
  return {
    PDFDocument: {
      create: jest.fn().mockResolvedValue({
        copyPages: jest.fn().mockResolvedValue([{}]),
        addPage: jest.fn(),
        save: jest.fn().mockResolvedValue(Buffer.from('PDF content'))
      }),
      load: jest.fn().mockResolvedValue({
        getPages: jest.fn().mockReturnValue([
          {
            getSize: jest.fn().mockReturnValue({ width: 612, height: 792 })
          }
        ]),
        getPageCount: jest.fn().mockReturnValue(1),
        copyPages: jest.fn().mockResolvedValue([{}]),
        addPage: jest.fn(),
        save: jest.fn().mockResolvedValue(Buffer.from('PDF content'))
      })
    }
  };
});

jest.mock('sharp', () => {
  return jest.fn().mockReturnValue({
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toFile: jest.fn().mockResolvedValue({ width: 600, height: 800 })
  });
});

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid')
}));

describe('PDF Service', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Default mock implementations
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(Buffer.from('%PDF-1.5\nTest content'));
  });
  
  describe('saveFile function', () => {
    it('should save file and return metadata', async () => {
      // Mock file
      const mockFile = {
        originalname: 'test.pdf',
        buffer: Buffer.from('Test content'),
        size: 12,
        mimetype: 'application/pdf'
      };
      
      // Call function
      const result = await pdfService.saveFile(mockFile);
      
      // Assertions
      expect(result).toBeDefined();
      expect(result.fileId).toBeDefined();
      expect(result.filename).toContain('.pdf');
      expect(result.originalname).toBe('test.pdf');
      expect(result.mimetype).toBe('application/pdf');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
    
    it('should throw error on file write failure', async () => {
      // Mock file
      const mockFile = {
        originalname: 'test.pdf',
        buffer: Buffer.from('Test content'),
        size: 12,
        mimetype: 'application/pdf'
      };
      
      // Mock write failure
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failure');
      });
      
      // Call function and expect error
      await expect(pdfService.saveFile(mockFile)).rejects.toThrow('Write failure');
    });
  });
  
  describe('isPremiumFormat function', () => {
    it('should identify premium formats correctly', () => {
      expect(pdfService.isPremiumFormat('xlsx')).toBe(true);
      expect(pdfService.isPremiumFormat('pptx')).toBe(true);
      
      expect(pdfService.isPremiumFormat('pdf')).toBe(false);
      expect(pdfService.isPremiumFormat('docx')).toBe(false);
      expect(pdfService.isPremiumFormat('jpg')).toBe(false);
    });
  });
  
  describe('getFormatPrice function', () => {
    it('should return correct prices for different formats', () => {
      expect(pdfService.getFormatPrice('xlsx')).toBe(1.99);
      expect(pdfService.getFormatPrice('pptx')).toBe(1.99);
      expect(pdfService.getFormatPrice('docx')).toBe(0.99);
      expect(pdfService.getFormatPrice('txt')).toBe(0.49);
      expect(pdfService.getFormatPrice('unknown')).toBe(0.99); // Default price
    });
  });
});