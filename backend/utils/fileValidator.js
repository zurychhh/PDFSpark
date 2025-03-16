/**
 * File validation utilities
 */

const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

/**
 * Check if a file is a valid PDF
 * @param {string} filePath Path to the PDF file
 * @returns {Promise<{ valid: boolean, message: string, pageCount?: number }>} Validation result
 */
const isPdfValid = async (filePath) => {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return { valid: false, message: 'File does not exist' };
    }
    
    // Read file content
    let fileBuffer;
    try {
      fileBuffer = fs.readFileSync(filePath);
    } catch (readError) {
      console.error(`Error reading file ${filePath}:`, readError);
      return { valid: false, message: `Unable to read file: ${readError.message}` };
    }
    
    // Check if file is empty
    if (!fileBuffer || fileBuffer.length === 0) {
      return { valid: false, message: 'File is empty' };
    }
    
    // Check PDF format - make sure it starts with %PDF
    try {
      const header = fileBuffer.slice(0, 5).toString();
      if (!header.startsWith('%PDF')) {
        return { valid: false, message: 'Not a valid PDF file (incorrect header)' };
      }
    } catch (headerError) {
      console.error('Error reading PDF header:', headerError);
      return { valid: false, message: 'Failed to verify PDF header' };
    }
    
    // Try to parse the PDF
    try {
      const pdfDoc = await PDFDocument.load(fileBuffer, { 
        ignoreEncryption: true,
        updateMetadata: false
      });
      
      // Check if PDF has pages
      try {
        const pageCount = pdfDoc.getPageCount();
        if (pageCount === 0) {
          return { valid: false, message: 'PDF has no pages' };
        }
        
        // PDF is valid
        return { valid: true, message: 'Valid PDF', pageCount };
      } catch (pageError) {
        console.error('Error getting PDF page count:', pageError);
        return { valid: false, message: 'Could not determine PDF page count' };
      }
    } catch (pdfError) {
      console.error('PDF parsing error:', pdfError);
      return { valid: false, message: `Invalid PDF structure: ${pdfError.message}` };
    }
  } catch (error) {
    console.error('File validation error:', error);
    return { valid: false, message: `File validation error: ${error.message}` };
  }
};

module.exports = {
  isPdfValid,
};