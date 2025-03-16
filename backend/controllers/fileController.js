const path = require('path');
const fs = require('fs');
const { ErrorResponse } = require('../utils/errorHandler');
const pdfService = require('../services/pdfService');
const { isPdfValid } = require('../utils/fileValidator');
const Operation = require('../models/Operation');
const Payment = require('../models/Payment');
const { v4: uuidv4 } = require('uuid');

// Helper function to sanitize filenames to prevent path traversal attacks
const sanitizeFilename = (filename) => {
  // Remove any path components
  const sanitized = path.basename(filename);
  
  // Replace any potentially dangerous characters
  return sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');
};

// Helper function to get content type from file extension
const getContentType = (filename) => {
  const extension = path.extname(filename).toLowerCase();
  
  const contentTypes = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.txt': 'text/plain'
  };
  
  return contentTypes[extension] || 'application/octet-stream';
};

// @desc    Upload a file
// @route   POST /api/files/upload
// @access  Public
exports.uploadFile = async (req, res, next) => {
  try {
    console.log('========== STARTING FILE UPLOAD ==========');
    console.log('File upload request received');
    console.log('- Headers:', JSON.stringify(req.headers));
    console.log('- Session ID:', req.sessionId);
    console.log('- User:', req.user ? req.user._id : 'No user');
    
    // Ensure the response includes the session ID
    if (req.sessionId) {
      res.setHeader('X-Session-ID', req.sessionId);
      console.log('Set session ID in response header:', req.sessionId);
    }
    
    // Log request file information
    if (req.file) {
      console.log('File details:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
    } else if (req.files) {
      console.log('Files uploaded:', Object.keys(req.files).length);
    } else {
      console.log('No file found in request');
      console.log('Request body keys:', Object.keys(req.body));
      return next(new ErrorResponse('No file uploaded', 400));
    }
    
    // Make sure service is healthy
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const tempDir = process.env.TEMP_DIR || './temp';
    
    // Ensure directories exist and are writable
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Test write access
      fs.accessSync(uploadDir, fs.constants.W_OK);
      fs.accessSync(tempDir, fs.constants.W_OK);
    } catch (fsError) {
      console.error('Directory access error:', fsError);
      return next(new ErrorResponse('Service temporarily unavailable. Please try again later.', 503));
    }
    
    // Check if file exists in the request
    if (!req.file) {
      console.error('No file in request');
      return next(new ErrorResponse('Please upload a file', 400));
    }

    console.log(`File received: ${req.file.originalname}, size: ${req.file.size}, mimetype: ${req.file.mimetype}`);

    // Akceptujemy wszystkie typy plików tymczasowo dla celów debugowania
    console.log(`File mimetype: ${req.file.mimetype}, name: ${req.file.originalname}`);

    // Check file size
    const maxSizeFree = 5 * 1024 * 1024; // 5MB
    const maxSizePremium = 100 * 1024 * 1024; // 100MB
    
    // Check if user has a subscription
    const hasSubscription = req.user && req.user.hasActiveSubscription && req.user.hasActiveSubscription();
    console.log(`User subscription status: ${hasSubscription ? 'Active' : 'None/Inactive'}`);
    
    if (req.file.size > (hasSubscription ? maxSizePremium : maxSizeFree)) {
      const sizeLimit = hasSubscription ? '100MB' : '5MB';
      console.error(`File size ${req.file.size} exceeds limit ${sizeLimit}`);
      return next(new ErrorResponse(`File size exceeds limit (${sizeLimit})`, 400));
    }
    
    // Basic malware/virus scanning
    try {
      // Check for suspicious file signatures
      const buffer = req.file.buffer;
      const fileSignature = buffer.slice(0, 8).toString('hex');
      
      // Simple list of suspicious file signatures (hexadecimal)
      const suspiciousSignatures = [
        '4d5a9000', // MZ header (Windows executable)
        '504b0304', // PK.. (ZIP that might contain malware)
        '7f454c46', // ELF header (Linux executable)
        '23212f62', // #!/b (shell script)
        '424d', // BM (bitmap, might be malware disguised)
        '000000000000', // Zero bytes (suspicious)
      ];
      
      // Check file header against suspicious signatures
      if (suspiciousSignatures.some(sig => fileSignature.includes(sig))) {
        console.error(`Suspicious file signature detected: ${fileSignature}`);
        return next(new ErrorResponse('File appears to be malicious or contains executable code. Only PDF files are accepted.', 400));
      }
      
      // Check filename for suspicious extensions (double extensions)
      const originalName = req.file.originalname.toLowerCase();
      if (originalName.includes('.exe.') || 
          originalName.includes('.php.') || 
          originalName.includes('.js.') || 
          originalName.includes('.vbs.') ||
          originalName.includes('.bat.') ||
          originalName.includes('.cmd.')) {
        console.error(`Suspicious filename detected: ${originalName}`);
        return next(new ErrorResponse('Filename contains suspicious patterns.', 400));
      }
      
      // Check for PDF-specific file format validity
      if (req.file.mimetype === 'application/pdf') {
        // Check for the PDF header signature (%PDF)
        const pdfSignature = buffer.slice(0, 4).toString('ascii');
        if (pdfSignature !== '%PDF') {
          console.error(`Invalid PDF header signature: ${pdfSignature}`);
          return next(new ErrorResponse('Invalid PDF file format.', 400));
        }
      }
      
      console.log('File passed basic security checks');
    } catch (scanError) {
      console.error('Error during file security scanning:', scanError);
      return next(new ErrorResponse('Error verifying file security.', 500));
    }

    try {
      // Bardzo prosty upload bez żadnych dodatkowych operacji
      // Generujemy unikalny ID dla pliku
      const fileId = uuidv4();
      
      // SIMPLIFIED APPROACH: Store file locally
      console.log('Using simple local file storage approach for maximum reliability');
      
      // Create directories if they don't exist
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      // Get file extension or default to .pdf
      const extension = path.extname(req.file.originalname).toLowerCase() || '.pdf';
      const filename = `${fileId}${extension}`;
      const filepath = path.join(uploadDir, filename);
      
      console.log(`Saving file to: ${filepath}`);
      
      // Write file directly to uploads directory
      fs.writeFileSync(filepath, req.file.buffer);
      
      // Verify file was written successfully
      if (!fs.existsSync(filepath)) {
        throw new Error(`Failed to save file to ${filepath}`);
      }
      
      const fileSize = fs.statSync(filepath).size;
      console.log(`Successfully saved file, size: ${fileSize} bytes`);
      
      // Create a simplified result object that mimics Cloudinary
      const fileResult = {
        public_id: fileId,
        url: `/api/files/original/${filename}`,
        secure_url: `/api/files/original/${filename}`,
        format: extension.replace('.', ''),
        resource_type: req.file.mimetype.startsWith('image') ? 'image' : 'raw'
      };
      
      // Save minimal metadata to MongoDB
      const Operation = require('../models/Operation');
      const fileOperation = new Operation({
        userId: req.user ? req.user._id : null,
        sessionId: req.sessionId,
        operationType: 'file_upload',
        sourceFormat: 'upload',
        status: 'completed',
        sourceFileId: fileId,
        resultDownloadUrl: fileResult.secure_url,
        fileData: {
          originalName: req.file.originalname,
          size: req.file.size,
          mimeType: req.file.mimetype,
          filePath: filepath
        }
      });
      
      await fileOperation.save();
      console.log('File operation saved to MongoDB with ID:', fileOperation._id);
      console.log('File storage completed successfully');
      
      // Default values for non-PDF files
      let pageCount = undefined;
      
      // For PDFs, we would validate the structure
      // But we'll skip detailed PDF validation since we're using Cloudinary
      if (req.file.mimetype === 'application/pdf') {
        // Basic validation: check if buffer starts with PDF signature
        if (req.file.buffer.length > 4 && 
            req.file.buffer.toString('ascii', 0, 4) === '%PDF') {
          // Set a default page count since we can't easily count pages
          pageCount = 1; // We'll set to 1 as a default
          console.log(`PDF file uploaded to Cloudinary`);
        } else {
          console.warn('File does not have PDF signature - might not be a valid PDF');
        }
      }
      
      // Return success response with file data
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 1);
      
      console.log('Sending success response to client');
      
      // Response that's compatible with frontend expectations
      res.status(200).json({
        success: true,
        fileId: fileId, // This is the most important field the frontend needs
        fileName: req.file.originalname,
        fileSize: req.file.size,
        uploadDate: new Date().toISOString(),
        expiryDate: expiryDate.toISOString(),
        previewUrl: fileResult.secure_url, // Use our local URL for preview
        operationId: fileOperation._id, // Include the MongoDB operation ID
        pageCount: pageCount
      });
      
      console.log('========== FILE UPLOAD COMPLETED SUCCESSFULLY ==========');
    } catch (fileError) {
      console.error('Error processing file upload:', fileError);
      return next(new ErrorResponse(`Error processing file upload: ${fileError.message}`, 500));
    }
  } catch (error) {
    console.error('Unexpected error in file upload:', error);
    next(error);
  }
};

// @desc    Get file preview
// @route   GET /api/files/preview/:filename
// @access  Public
exports.getFilePreview = async (req, res, next) => {
  try {
    const previewPath = path.join(process.env.TEMP_DIR || './temp', req.params.filename);
    
    // Check if file exists
    if (!fs.existsSync(previewPath)) {
      return next(new ErrorResponse('Preview not found', 404));
    }
    
    // Send the file
    res.sendFile(previewPath);
  } catch (error) {
    next(error);
  }
};

// @desc    Get result file
// @route   GET /api/files/result/:filename
// @access  Public
exports.getResultFile = async (req, res, next) => {
  try {
    console.log(`Requested result file: ${req.params.filename}`);
    
    // Make sure the filename parameter exists
    if (!req.params.filename) {
      return next(new ErrorResponse('Filename parameter is missing', 400));
    }
    
    const resultPath = path.join(process.env.TEMP_DIR || './temp', req.params.filename);
    console.log(`Looking for result file at: ${resultPath}`);
    
    // Check if file exists
    if (!fs.existsSync(resultPath)) {
      console.error(`File not found at path: ${resultPath}`);
      
      // Try to find the file by pattern matching (in case extension is wrong)
      const tempDir = process.env.TEMP_DIR || './temp';
      const fileBaseName = path.parse(req.params.filename).name;
      
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        console.log(`Searching for files starting with: ${fileBaseName} in directory: ${tempDir}`);
        console.log(`Files in directory: ${files.join(', ')}`);
        
        // Check if there's a file that starts with the same base name
        const matchingFile = files.find(file => file.startsWith(fileBaseName));
        
        if (matchingFile) {
          console.log(`Found matching file: ${matchingFile}`);
          const correctedPath = path.join(tempDir, matchingFile);
          
          // Get file stats
          const stats = fs.statSync(correctedPath);
          
          // Get extension and content type from the actual file
          const actualExtension = path.extname(matchingFile).toLowerCase();
          const contentType = getContentType(matchingFile);
          
          // Set response headers
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Length', stats.size);
          
          // Create a more user-friendly filename for download
          // Extract the original format from extension
          const format = actualExtension.replace('.', '');
          const suggestedFilename = `converted-document.${format}`;
          
          // Set content disposition for download
          res.setHeader('Content-Disposition', `attachment; filename="${suggestedFilename}"`);
          
          // Set cache headers for better performance
          res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
          
          // Stream the file directly
          fs.createReadStream(correctedPath).pipe(res);
          return;
        }
      }
      
      return next(new ErrorResponse('File not found', 404));
    }
    
    // Get the file extension and stats
    const extension = path.extname(req.params.filename).toLowerCase();
    const stats = fs.statSync(resultPath);
    
    // Set the correct content type
    const contentType = getContentType(req.params.filename);
    
    // Set headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    console.log(`Setting content type: ${contentType} for extension: ${extension}`);
    
    // Create a more user-friendly filename for download
    // Extract the format from extension
    const format = extension.replace('.', '');
    const suggestedFilename = `converted-document.${format}`;
    
    // Set content disposition for download
    res.setHeader('Content-Disposition', `attachment; filename="${suggestedFilename}"`);
    
    // Set cache headers
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    
    // Stream the file instead of using sendFile for better control
    console.log(`Streaming file: ${resultPath}`);
    fs.createReadStream(resultPath).pipe(res);
  } catch (error) {
    console.error('Error getting result file:', error);
    next(error);
  }
};

// @desc    Get original uploaded file
// @route   GET /api/files/original/:filename
// @access  Public
exports.getOriginalFile = async (req, res, next) => {
  try {
    // Security check for filename
    const filename = sanitizeFilename(req.params.filename);
    const filePath = path.join(process.env.UPLOAD_DIR || './uploads', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`Original file not found: ${filePath}`);
      return next(new ErrorResponse('File not found', 404));
    }
    
    // Get file stats
    const stats = fs.statSync(filePath);
    
    // Determine content type based on file extension
    const contentType = getContentType(filename);
    
    // Set response headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    
    // Create a clean filename for download (remove UUID prefix)
    const cleanFilename = `document${path.extname(filename)}`;
    res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"`);
    
    // Add cache headers
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    
    // Stream the file
    console.log(`Streaming original file: ${filePath}`);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error getting original file:', error);
    next(error);
  }
};