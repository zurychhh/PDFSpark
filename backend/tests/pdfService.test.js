const fs = require('fs');
const path = require('path');
const pdfService = require('../services/pdfService');

describe('PDF Service Tests', () => {
  // Test directory path
  const testUploadsDir = './test-uploads';
  const testTempDir = './test-temp';
  
  // Sample PDF buffer
  const createSamplePdf = () => {
    // Create a very basic PDF file for testing
    const samplePdfPath = path.join(testUploadsDir, 'sample.pdf');
    
    // Simple PDF content (this is not a valid PDF but serves as test data)
    const pdfContent = '%PDF-1.5\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT\n/F1 12 Tf\n100 700 Td\n(Test PDF) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000010 00000 n\n0000000059 00000 n\n0000000118 00000 n\n0000000217 00000 n\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n307\n%%EOF';
    
    fs.writeFileSync(samplePdfPath, pdfContent);
    return samplePdfPath;
  };
  
  beforeEach(() => {
    // Ensure test directories exist
    if (!fs.existsSync(testUploadsDir)) {
      fs.mkdirSync(testUploadsDir, { recursive: true });
    }
    if (!fs.existsSync(testTempDir)) {
      fs.mkdirSync(testTempDir, { recursive: true });
    }
  });
  
  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testUploadsDir)) {
      const files = fs.readdirSync(testUploadsDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(testUploadsDir, file));
      });
    }
    
    if (fs.existsSync(testTempDir)) {
      const files = fs.readdirSync(testTempDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(testTempDir, file));
      });
    }
  });
  
  test('saveFile should save a file and return metadata', async () => {
    // Create mock file
    const mockFile = {
      originalname: 'test.pdf',
      buffer: Buffer.from('Test PDF content'),
      size: 16,
      mimetype: 'application/pdf'
    };
    
    // Call saveFile
    const result = await pdfService.saveFile(mockFile);
    
    // Check result
    expect(result).toBeDefined();
    expect(result.fileId).toBeDefined();
    expect(result.filename).toBeDefined();
    expect(result.filepath).toBeDefined();
    expect(result.size).toBe(16);
    expect(result.mimetype).toBe('application/pdf');
    
    // Check file exists
    expect(fs.existsSync(result.filepath)).toBe(true);
  });
  
  test('isPremiumFormat should correctly identify premium formats', () => {
    // Test premium formats
    expect(pdfService.isPremiumFormat('xlsx')).toBe(true);
    expect(pdfService.isPremiumFormat('pptx')).toBe(true);
    
    // Test non-premium formats
    expect(pdfService.isPremiumFormat('pdf')).toBe(false);
    expect(pdfService.isPremiumFormat('docx')).toBe(false);
    expect(pdfService.isPremiumFormat('jpg')).toBe(false);
    expect(pdfService.isPremiumFormat('txt')).toBe(false);
  });
  
  test('getFormatPrice should return correct prices', () => {
    // Test format prices
    expect(pdfService.getFormatPrice('xlsx')).toBe(1.99);
    expect(pdfService.getFormatPrice('pptx')).toBe(1.99);
    expect(pdfService.getFormatPrice('docx')).toBe(0.99);
    expect(pdfService.getFormatPrice('jpg')).toBe(0.99);
    expect(pdfService.getFormatPrice('txt')).toBe(0.49);
    
    // Test default price
    expect(pdfService.getFormatPrice('unknown')).toBe(0.99);
  });
});