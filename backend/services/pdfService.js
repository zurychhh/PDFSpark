const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

// Helper function to create directories if they don't exist
const ensureDirectoriesExist = () => {
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const tempDir = process.env.TEMP_DIR || './temp';

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  return { uploadDir, tempDir };
};

// Save uploaded file to Cloudinary
const saveFile = (file) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Generate a unique ID for the file
      const fileId = uuidv4();
      
      // Get file extension from original name or use .pdf as default
      const originalName = file.originalname || 'document.pdf';
      const fileExtension = path.extname(originalName).toLowerCase() || '.pdf';
      
      console.log(`Processing file: ${originalName} (ID: ${fileId})`);
      
      // Ensure file buffer exists
      if (!file.buffer || file.buffer.length === 0) {
        return reject(new Error('Empty file buffer'));
      }
      
      // Instead of saving locally, upload to Cloudinary
      // We'll create a temporary file first if needed
      const { tempDir } = ensureDirectoriesExist();
      const tempFilename = `temp_${fileId}${fileExtension}`;
      const tempFilepath = path.join(tempDir, tempFilename);
      
      // Write to temp file
      fs.writeFileSync(tempFilepath, file.buffer);
      
      try {
        // Import Cloudinary service
        const cloudinaryService = require('./cloudinaryService');
        
        // Upload to Cloudinary
        const cloudinaryResult = await cloudinaryService.uploadFile(
          { path: tempFilepath, originalname },
          { 
            folder: 'pdfspark_uploads',
            public_id: fileId,
            resource_type: 'auto'
          }
        );
        
        // Remove temp file after upload
        try {
          fs.unlinkSync(tempFilepath);
        } catch (unlinkError) {
          console.warn('Could not remove temp file:', unlinkError);
        }
        
        console.log(`File uploaded to Cloudinary: ${cloudinaryResult.public_id}`);
        
        resolve({
          fileId: cloudinaryResult.public_id, // Use Cloudinary public_id as our fileId
          filename: `${fileId}${fileExtension}`, // Keep original format for compatibility
          originalname: originalName,
          filepath: tempFilepath, // Keep the temp file path for compatibility
          cloudinaryUrl: cloudinaryResult.secure_url, // Use Cloudinary URL
          size: file.size || file.buffer.length,
          mimetype: file.mimetype || 'application/pdf',
          cloudinaryData: cloudinaryResult // Include all Cloudinary data
        });
      } catch (cloudinaryError) {
        console.error(`Error uploading file to Cloudinary:`, cloudinaryError);
        reject(cloudinaryError);
      }
    } catch (error) {
      console.error('Error in saveFile function:', error);
      reject(error);
    }
  });
};

// Generate PDF preview (first page as image)
const generatePdfPreview = async (filepath) => {
  try {
    console.log(`Generating preview for file: ${filepath}`);

    // Check if file exists
    if (!fs.existsSync(filepath)) {
      console.error(`File does not exist: ${filepath}`);
      throw new Error(`File does not exist: ${filepath}`);
    }

    // Read the PDF file
    let pdfBytes;
    try {
      pdfBytes = fs.readFileSync(filepath);
    } catch (readError) {
      console.error(`Error reading file ${filepath}:`, readError);
      throw new Error(`Unable to read file: ${readError.message}`);
    }
    
    if (!pdfBytes || pdfBytes.length === 0) {
      console.error(`Empty PDF file: ${filepath}`);
      throw new Error('Empty PDF file');
    }
    
    // Create output directories if they don't exist
    const { tempDir } = ensureDirectoriesExist();
    
    // Ensure temp directory is writable
    try {
      fs.accessSync(tempDir, fs.constants.W_OK);
    } catch (accessError) {
      console.error(`Temp directory ${tempDir} is not writable:`, accessError);
      throw new Error('Service temporarily unavailable - storage issues');
    }
    
    const previewId = uuidv4();
    const previewImagePath = path.join(tempDir, `${previewId}.jpg`);
    
    try {
      // Try to load PDF with error handling
      let pdfDoc;
      try {
        pdfDoc = await PDFDocument.load(pdfBytes, { 
          ignoreEncryption: true,
          updateMetadata: false
        });
      } catch (pdfError) {
        console.error('Failed to parse PDF:', pdfError);
        throw new Error(`Invalid PDF document: ${pdfError.message}`);
      }
      
      // Get the first page
      const pages = pdfDoc.getPages();
      if (pages.length === 0) {
        console.error('PDF has no pages');
        
        // Create a fallback preview image with text "No preview available"
        return createFallbackPreview(tempDir, previewId);
      }
      
      const firstPage = pages[0];
      const { width, height } = firstPage.getSize();
      
      // Create a new document with just the first page
      const previewDoc = await PDFDocument.create();
      const [copiedPage] = await previewDoc.copyPages(pdfDoc, [0]);
      previewDoc.addPage(copiedPage);
      
      // Save the first page as a new PDF
      const previewPdfPath = path.join(tempDir, `${previewId}.pdf`);
      const previewBytes = await previewDoc.save();
      
      fs.writeFileSync(previewPdfPath, previewBytes);
      
      try {
        // Convert PDF to image using sharp
        const image = await sharp(previewPdfPath)
          .resize(Math.min(width, 800), null) // Resize to max width 800px
          .jpeg({ quality: 80 })
          .toFile(previewImagePath);
        
        // Remove temporary PDF file
        try {
          fs.unlinkSync(previewPdfPath);
        } catch (cleanupError) {
          console.warn('Could not clean up temporary PDF:', cleanupError);
        }
        
        return {
          previewImagePath,
          width: image.width,
          height: image.height
        };
      } catch (sharpError) {
        console.error('Error converting PDF to image:', sharpError);
        return createFallbackPreview(tempDir, previewId);
      }
    } catch (pdfError) {
      console.error('Error processing PDF:', pdfError);
      return createFallbackPreview(tempDir, previewId);
    }
  } catch (error) {
    console.error('Error generating PDF preview:', error);
    
    // Generate fallback preview
    const { tempDir } = ensureDirectoriesExist();
    const previewId = uuidv4();
    return createFallbackPreview(tempDir, previewId);
  }
};

// Create a fallback preview image
const createFallbackPreview = async (tempDir, previewId) => {
  const width = 800;
  const height = 600;
  const previewImagePath = path.join(tempDir, `${previewId}.jpg`);
  
  // Create a simple image with text
  try {
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f5f5f5"/>
        <text x="50%" y="50%" font-family="Arial" font-size="24" fill="#666" text-anchor="middle">No preview available</text>
      </svg>
    `;
    
    await sharp(Buffer.from(svg))
      .jpeg()
      .toFile(previewImagePath);
    
    return {
      previewImagePath,
      width,
      height
    };
  } catch (svgError) {
    console.error('Error creating fallback preview:', svgError);
    
    // As a last resort, create an empty JPEG
    try {
      await sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 240, g: 240, b: 240 }
        }
      })
      .jpeg()
      .toFile(previewImagePath);
      
      return {
        previewImagePath,
        width,
        height
      };
    } catch (emptyError) {
      console.error('Could not create empty preview:', emptyError);
      throw new Error('Failed to generate preview');
    }
  }
};

// Convert PDF to Word (docx)
const convertPdfToWord = async (filepath, options = {}) => {
  try {
    // Import required libraries
    const pdfParse = require('pdf-parse');
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Footer, Header, ImageRun } = require('docx');
    
    const { tempDir } = ensureDirectoriesExist();
    const outputId = uuidv4();
    const outputPath = path.join(tempDir, `${outputId}.docx`);

    // Read the PDF file
    const pdfBuffer = fs.readFileSync(filepath);
    const pdfSize = pdfBuffer.length;
    
    console.log(`Starting PDF to DOCX conversion for file: ${filepath}`);
    console.log(`File size: ${Math.round(pdfSize / 1024)} KB`);
    
    // Extract text content from PDF
    const pdfData = await pdfParse(pdfBuffer);
    
    // Process the text to maintain basic structure
    const lines = pdfData.text.split('\n').filter(line => line.trim() !== '');
    
    // Create paragraphs for each line
    const paragraphs = [];
    let currentHeadingLevel = 0;
    
    // Extract basic document metadata
    const metadata = {
      title: pdfData.info?.Title || path.basename(filepath),
      author: pdfData.info?.Author || 'PDFSpark',
      subject: pdfData.info?.Subject || 'Converted Document',
      keywords: pdfData.info?.Keywords || 'pdf, convert, docx',
      pageCount: pdfData.numpages || 1
    };
    
    // Add a title paragraph
    paragraphs.push(
      new Paragraph({
        text: metadata.title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
      })
    );
    
    // Process each line and create appropriate paragraphs
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) continue;
      
      // Simple heuristic for headings - shorter lines with no punctuation
      const isLikelyHeading = trimmedLine.length < 50 && 
        !trimmedLine.includes('.') && 
        !trimmedLine.includes(',') && 
        trimmedLine === trimmedLine.replace(/[.,:;!?()]/g, '');
      
      if (isLikelyHeading) {
        // Determine heading level based on text length and capitalization
        const headingLevel = 
          trimmedLine === trimmedLine.toUpperCase() ? HeadingLevel.HEADING_1 : 
          trimmedLine.length < 30 ? HeadingLevel.HEADING_2 : 
          HeadingLevel.HEADING_3;
        
        paragraphs.push(
          new Paragraph({
            text: trimmedLine,
            heading: headingLevel,
            spacing: {
              before: 200,
              after: 100,
            },
          })
        );
      } else {
        // Regular paragraph
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: trimmedLine,
                size: 24,
              }),
            ],
            spacing: {
              before: 100,
              after: 100,
              line: 276, // 1.15 line spacing
            },
          })
        );
      }
    }
    
    // Create the document with metadata
    const doc = new Document({
      title: metadata.title,
      subject: metadata.subject,
      creator: metadata.author,
      keywords: metadata.keywords,
      description: `Converted from PDF by PDFSpark. Original had ${metadata.pageCount} pages.`,
      styles: {
        paragraphStyles: [
          {
            id: "Normal",
            name: "Normal",
            basedOn: "Normal",
            run: {
              size: 24,
              font: "Calibri",
            },
            paragraph: {
              spacing: {
                line: 276,
              },
            },
          },
        ],
      },
      sections: [{
        properties: {},
        children: paragraphs,
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                text: metadata.title,
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                text: `Page`,
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
      }],
    });

    // Write the docx file
    const buffer = await doc.save();
    fs.writeFileSync(outputPath, buffer);
    
    console.log(`Successfully converted PDF to DOCX: ${outputPath}`);
    console.log(`Original size: ${Math.round(pdfSize / 1024)} KB, Result size: ${Math.round(fs.statSync(outputPath).size / 1024)} KB`);
    
    return {
      outputPath,
      outputFormat: 'docx',
      originalSize: pdfSize,
      resultSize: fs.statSync(outputPath).size
    };
  } catch (error) {
    console.error('Error converting PDF to DOCX:', error);
    throw error;
  }
};

// Convert PDF to Excel (xlsx)
const convertPdfToExcel = async (filepath, options = {}) => {
  // Simulate conversion
  return new Promise((resolve, reject) => {
    try {
      const { tempDir } = ensureDirectoriesExist();
      const outputId = uuidv4();
      const outputPath = path.join(tempDir, `${outputId}.xlsx`);
      
      // Read the PDF file to get its size
      const pdfSize = fs.statSync(filepath).size;
      
      // For demo purposes, create a simple XLSX structure
      const xlsxContent = `
        <html>
          <body>
            <table>
              <tr><td>Column A</td><td>Column B</td></tr>
              <tr><td>Data 1</td><td>Data 2</td></tr>
              <tr><td>Data 3</td><td>Data 4</td></tr>
            </table>
          </body>
        </html>
      `;
      
      // Write the content to a file
      fs.writeFileSync(outputPath, xlsxContent);
      
      setTimeout(() => {
        resolve({
          outputPath,
          outputFormat: 'xlsx',
          originalSize: pdfSize,
          resultSize: fs.statSync(outputPath).size
        });
      }, 3000); // Simulate processing time
    } catch (error) {
      reject(error);
    }
  });
};

// Convert PDF to PowerPoint (pptx)
const convertPdfToPowerPoint = async (filepath, options = {}) => {
  // Simulate conversion
  return new Promise((resolve, reject) => {
    try {
      const { tempDir } = ensureDirectoriesExist();
      const outputId = uuidv4();
      const outputPath = path.join(tempDir, `${outputId}.pptx`);
      
      // Read the PDF file to get its size
      const pdfSize = fs.statSync(filepath).size;
      
      // For demo purposes, create a simple PPTX structure
      const pptxContent = `
        <html>
          <body>
            <h1>Slide 1</h1>
            <p>This is a sample slide.</p>
          </body>
        </html>
      `;
      
      // Write the content to a file
      fs.writeFileSync(outputPath, pptxContent);
      
      setTimeout(() => {
        resolve({
          outputPath,
          outputFormat: 'pptx',
          originalSize: pdfSize,
          resultSize: fs.statSync(outputPath).size
        });
      }, 3500); // Simulate processing time
    } catch (error) {
      reject(error);
    }
  });
};

// Convert PDF to image (jpg)
const convertPdfToImage = async (filepath, options = {}) => {
  try {
    const { tempDir } = ensureDirectoriesExist();
    const outputId = uuidv4();
    const outputPath = path.join(tempDir, `${outputId}.jpg`);
    
    // Read the PDF file to get its size
    const pdfSize = fs.statSync(filepath).size;
    
    // Read the PDF file
    const pdfBytes = fs.readFileSync(filepath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    // Get the first page
    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
      throw new Error('PDF has no pages');
    }
    
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();
    
    // Create a new document with just the first page
    const pageDoc = await PDFDocument.create();
    const [copiedPage] = await pageDoc.copyPages(pdfDoc, [0]);
    pageDoc.addPage(copiedPage);
    
    // Save the page as a temporary PDF
    const tempPdfPath = path.join(tempDir, `${outputId}_temp.pdf`);
    const pageBytes = await pageDoc.save();
    
    fs.writeFileSync(tempPdfPath, pageBytes);
    
    // Convert PDF to image using sharp
    const dpi = options.dpi || 300;
    const quality = options.quality || 90;
    
    await sharp(tempPdfPath)
      .resize(Math.min(width * (dpi / 72), 2000)) // Limit max width to 2000px
      .jpeg({ quality })
      .toFile(outputPath);
    
    // Delete temporary PDF
    fs.unlinkSync(tempPdfPath);
    
    return {
      outputPath,
      outputFormat: 'jpg',
      originalSize: pdfSize,
      resultSize: fs.statSync(outputPath).size
    };
  } catch (error) {
    console.error('Error converting PDF to image:', error);
    throw error;
  }
};

// Convert PDF to text
const convertPdfToText = async (filepath, options = {}) => {
  // In a real implementation, this would use a PDF to text extraction library
  // For demo purposes, we'll create a simple text file
  
  return new Promise((resolve, reject) => {
    try {
      const { tempDir } = ensureDirectoriesExist();
      const outputId = uuidv4();
      const outputPath = path.join(tempDir, `${outputId}.txt`);
      
      // Read the PDF file to get its size
      const pdfSize = fs.statSync(filepath).size;
      
      // For demo purposes, create a simple text file
      const textContent = `
        This is a sample text extracted from a PDF document.
        
        In a real application, this would contain the actual text content
        extracted from the PDF using a library like pdf.js or pdfjs-dist.
        
        Original filename: ${path.basename(filepath)}
        Original size: ${Math.round(pdfSize / 1024)} KB
      `;
      
      // Write the content to a file
      fs.writeFileSync(outputPath, textContent);
      
      setTimeout(() => {
        resolve({
          outputPath,
          outputFormat: 'txt',
          originalSize: pdfSize,
          resultSize: fs.statSync(outputPath).size
        });
      }, 1000); // Simulate processing time
    } catch (error) {
      reject(error);
    }
  });
};

// Compress PDF
const compressPdf = async (filepath, options = {}) => {
  try {
    const { tempDir } = ensureDirectoriesExist();
    const outputId = uuidv4();
    const outputPath = path.join(tempDir, `${outputId}.pdf`);
    
    // Read the PDF file
    const pdfBytes = fs.readFileSync(filepath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    // In a real implementation, you would apply various compression techniques:
    // 1. Downsample images
    // 2. Optimize content streams
    // 3. Remove unnecessary metadata
    // 4. Flatten annotations
    
    // For this demo, we'll simulate compression
    const compressionLevel = options.compressionLevel || 'medium';
    let compressionRatio;
    
    switch (compressionLevel) {
      case 'low':
        compressionRatio = 0.8; // 20% reduction
        break;
      case 'medium':
        compressionRatio = 0.6; // 40% reduction
        break;
      case 'high':
        compressionRatio = 0.3; // 70% reduction
        break;
      default:
        compressionRatio = 0.6;
    }
    
    // Save the PDF
    const compressedBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, compressedBytes);
    
    // Simulate compression by calculating a smaller file size
    const originalSize = fs.statSync(filepath).size;
    const simulatedResultSize = Math.round(originalSize * compressionRatio);
    
    // In a real implementation, the actual result size would be used
    return {
      outputPath,
      outputFormat: 'pdf',
      originalSize,
      resultSize: simulatedResultSize,
      compressionRatio: 1 - compressionRatio,
      compressionLevel
    };
  } catch (error) {
    console.error('Error compressing PDF:', error);
    throw error;
  }
};

// Delete temporary file
const deleteFile = (filepath) => {
  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

// Get public URL for a file
const getFileUrl = (filename, type = 'result') => {
  // Make sure filename doesn't have any leading/trailing whitespace
  const cleanFilename = filename.trim();
  
  // Make sure type is valid
  const validTypes = ['result', 'original', 'preview'];
  const fileType = validTypes.includes(type) ? type : 'result';
  
  // In production, this would generate a URL for a CDN or cloud storage
  const baseUrl = process.env.API_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/files/${fileType}/${cleanFilename}`;
  
  console.log(`Generated URL for file: ${cleanFilename}`);
  console.log(`File type: ${fileType}`);
  console.log(`URL: ${url}`);
  
  return url;
};

// Check if a format conversion is premium
const isPremiumFormat = (format) => {
  const premiumFormats = ['xlsx', 'pptx'];
  return premiumFormats.includes(format);
};

// Get price for a conversion format
const getFormatPrice = (format) => {
  const formatPrices = {
    'xlsx': 1.99,
    'pptx': 1.99,
    'docx': 0.99,
    'jpg': 0.99,
    'txt': 0.49
  };
  
  return formatPrices[format] || 0.99;
};

module.exports = {
  saveFile,
  generatePdfPreview,
  convertPdfToWord,
  convertPdfToExcel,
  convertPdfToPowerPoint,
  convertPdfToImage,
  convertPdfToText,
  compressPdf,
  deleteFile,
  getFileUrl,
  isPremiumFormat,
  getFormatPrice,
  ensureDirectoriesExist // Export this so other modules can use it
};