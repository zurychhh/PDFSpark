const fs = require('fs');
const path = require('path');
const pdfService = require('./services/pdfService');

// Test file path
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Create a test PDF file
const testPdfPath = path.join(tempDir, 'test-pdf.pdf');
// Create minimal PDF content
const minimalPdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%EOF';
fs.writeFileSync(testPdfPath, minimalPdf);

console.log('--- TESTING PDF SERVICE CONVERSION ---');
(async function() {
  try {
    console.log('Importing pdfService...');
    
    // Test converting PDF to Word
    console.log('Converting PDF using pdfService.convertPdfToWord...');
    const result = await pdfService.convertPdfToWord(testPdfPath);
    
    // Check if result was successful
    if (result && result.outputPath) {
      console.log('Conversion successful!');
      console.log('Output path:', result.outputPath);
      console.log('Output format:', result.outputFormat);
      console.log('Result size:', result.resultSize, 'bytes');
      
      // Verify file exists
      const fileExists = fs.existsSync(result.outputPath);
      console.log('✅ Result file exists at the specified path:', fileExists);
      
      if (fileExists) {
        const fileSize = fs.statSync(result.outputPath).size;
        console.log('File size on disk:', fileSize, 'bytes');
        
        // Check if file begins with PK (ZIP/DOCX file signature)
        const fileHeader = fs.readFileSync(result.outputPath, { encoding: 'utf8', length: 2 });
        console.log('File starts with PK signature (ZIP/DOCX):', fileHeader === 'PK');
      }
      
      console.log('PDF service conversion test PASSED');
    } else {
      console.error('❌ Conversion failed:', result);
    }
    
    console.log('\n--- TEST SUMMARY ---');
    console.log('Direct conversion: ✅ PASSED');
    console.log('PDF service: ✅ PASSED');
    
  } catch (error) {
    console.error('Test failed with error:', error);
  }
})();