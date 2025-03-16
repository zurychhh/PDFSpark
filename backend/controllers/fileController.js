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
    
    // Check if file exists in the request with more detailed logging
    if (!req.file) {
      console.error('No file in request after middleware processing');
      console.log('Request body:', req.body);
      console.log('Request headers:', req.headers);
      
      // Check if the request is a multipart form but missing the file
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        console.error('Multipart request detected but file is missing. Check form field name.');
        return next(new ErrorResponse('No file found in the multipart request. Please make sure the file field is named "file".', 400));
      }
      
      return next(new ErrorResponse('Please upload a file', 400));
    }

    console.log(`File received: ${req.file.originalname}, size: ${req.file.size}, mimetype: ${req.file.mimetype}`);

    // Accept all file types temporarily for debugging purposes
    console.log(`File details - MIME type: ${req.file.mimetype}, Name: ${req.file.originalname}, Size: ${req.file.size} bytes`);

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
    
    // Enhanced file validation and detailed debugging
    try {
      console.log('Starting enhanced file validation');
      
      // Check if buffer exists and has content
      const buffer = req.file.buffer;
      if (!buffer || buffer.length === 0) {
        console.error('Empty file buffer detected');
        return next(new ErrorResponse('Empty file detected. Please upload a valid file.', 400));
      }
      
      // Log buffer details for debugging
      console.log(`File buffer details: Length=${buffer.length} bytes`);
      
      // Extract and log file signature for debugging
      const fileSignature = buffer.slice(0, 16);
      const hexSignature = fileSignature.toString('hex');
      const asciiSignature = fileSignature.toString('ascii').replace(/[^\x20-\x7E]/g, '.');
      
      console.log('File signatures:');
      console.log(`- Hex (first 16 bytes): ${hexSignature}`);
      console.log(`- ASCII (first 16 bytes): ${asciiSignature}`);
      
      // Detect file type based on signature regardless of extension
      const fileTypeSignatures = {
        '%PDF': 'application/pdf',
        'PK': 'application/zip',
        'BM': 'image/bmp',
        'GIF8': 'image/gif',
        '\xFF\xD8\xFF': 'image/jpeg',
        '\x89PNG': 'image/png',
        'II*\x00': 'image/tiff',
        'MM\x00*': 'image/tiff',
        'RIFF': 'audio/wav or video/avi',
        '\x1F\x8B\x08': 'application/gzip',
        '7z\xBC\xAF': 'application/x-7z-compressed',
        'Rar!\x1A\x07': 'application/x-rar-compressed',
        '\xD0\xCF\x11\xE0': 'application/msword or application/vnd.ms-excel',
        'MZ': 'application/x-msdownload',
        '\x7FELF': 'application/x-executable'
      };
      
      let detectedType = 'unknown';
      for (const [signature, mimeType] of Object.entries(fileTypeSignatures)) {
        if (asciiSignature.includes(signature) || hexSignature.includes(Buffer.from(signature).toString('hex'))) {
          detectedType = mimeType;
          break;
        }
      }
      
      console.log(`Detected file type from signature: ${detectedType}`);
      console.log(`Declared mimetype: ${req.file.mimetype}`);
      
      // Basic file type validation
      if (detectedType === 'unknown') {
        console.warn('Unknown file type signature');
      } else if (!detectedType.includes('pdf') && req.file.mimetype.includes('pdf')) {
        console.warn(`Mimetype mismatch: Declared as PDF but signature suggests ${detectedType}`);
      }
      
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
      if (suspiciousSignatures.some(sig => hexSignature.includes(sig))) {
        console.error(`Suspicious file signature detected: ${hexSignature}`);
        return next(new ErrorResponse('File appears to be malicious or contains executable code. Only PDF files are accepted.', 400));
      }
      
      // Check filename for suspicious extensions (double extensions)
      const originalName = req.file.originalname.toLowerCase();
      console.log(`Checking filename: ${originalName}`);
      
      if (originalName.includes('.exe.') || 
          originalName.includes('.php.') || 
          originalName.includes('.js.') || 
          originalName.includes('.vbs.') ||
          originalName.includes('.bat.') ||
          originalName.includes('.cmd.')) {
        console.error(`Suspicious filename detected: ${originalName}`);
        return next(new ErrorResponse('Filename contains suspicious patterns.', 400));
      }
      
      // Validate file extension against mimetype
      const fileExtension = originalName.substring(originalName.lastIndexOf('.') + 1);
      console.log(`File extension: ${fileExtension}`);
      
      // Check for PDF-specific file format validity
      if (req.file.mimetype === 'application/pdf' || fileExtension === 'pdf') {
        console.log('Validating as PDF file');
        
        // Check for the PDF header signature (%PDF)
        const pdfSignature = buffer.slice(0, 4).toString('ascii');
        console.log(`PDF signature check: "${pdfSignature}"`);
        
        if (pdfSignature !== '%PDF') {
          console.error(`Invalid PDF header signature: "${pdfSignature}"`);
          
          // Special debug for a common issue with JSON content instead of file
          if (pdfSignature.includes('{') || pdfSignature.includes('[')) {
            console.error('JSON content detected instead of PDF file. This suggests a formData creation issue.');
            
            // Try to extract more of the content for debugging
            const firstPart = buffer.slice(0, 100).toString('utf8');
            console.log('First 100 bytes of content:', firstPart);
            
            return next(new ErrorResponse('Invalid PDF format: JSON content detected instead of PDF file. This is likely a frontend FormData creation issue.', 400));
          }
          
          return next(new ErrorResponse('Invalid PDF file format. The file does not begin with %PDF signature.', 400));
        }
        
        // Optional: Check for EOF marker (not all PDFs have this but it's a good sign)
        const lastBytes = buffer.slice(-6).toString('ascii');
        console.log(`Last bytes of file: "${lastBytes}"`);
        if (!lastBytes.includes('EOF')) {
          console.warn('PDF file does not contain standard EOF marker. File might be truncated or corrupted.');
        }
      }
      
      console.log('File passed basic security and format checks');
    } catch (scanError) {
      console.error('Error during file security scanning:', scanError);
      return next(new ErrorResponse('Error verifying file security: ' + scanError.message, 500));
    }

    try {
      // Log what kind of upload we received
      console.log(`Processing file upload via ${req.file.upload_method || 'standard'} method`);
      
      // Generate a unique ID for the file
      const fileId = uuidv4();
      
      // Determine file storage strategy based on received file
      let filepath;
      let fileSize;
      
      // If file was uploaded using disk storage, it already has a path
      if (req.file.path && req.file.upload_method === 'disk_storage') {
        // File is already on disk, just reference it
        filepath = req.file.path;
        fileSize = req.file.size;
        console.log(`Using existing file on disk at: ${filepath}`);
      } 
      // For memory uploads or JSON base64 uploads, we need to save the buffer
      else {
        // Create directories if they don't exist
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        // Get file extension or default to .pdf
        const extension = path.extname(req.file.originalname).toLowerCase() || '.pdf';
        const filename = `${fileId}${extension}`;
        filepath = path.join(uploadDir, filename);
        
        console.log(`Saving file buffer to disk at: ${filepath}`);
        
        // Write file buffer to uploads directory
        fs.writeFileSync(filepath, req.file.buffer);
        
        // Verify file was written successfully
        if (!fs.existsSync(filepath)) {
          throw new Error(`Failed to save file to ${filepath}`);
        }
        
        fileSize = fs.statSync(filepath).size;
        console.log(`Successfully saved file buffer to disk, size: ${fileSize} bytes`);
      }
      
      // Get file extension
      const extension = path.extname(req.file.originalname).toLowerCase() || '.pdf';
      const filename = path.basename(filepath);
      
      // Create file result object with local references
      const fileResult = {
        public_id: fileId,
        url: `/api/files/original/${filename}`,
        secure_url: `/api/files/original/${filename}`,
        format: extension.replace('.', ''),
        resource_type: req.file.mimetype.startsWith('image') ? 'image' : 'raw'
      };
      
      // Create record in MongoDB or memory fallback
      let fileOperation;
      try {
        // Create Operation record
        const Operation = require('../models/Operation');
        
        fileOperation = new Operation({
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
            filePath: filepath,
            uploadMethod: req.file.upload_method || 'standard'
          }
        });
        
        // Save operation - this will use memory storage if in fallback mode
        await fileOperation.save();
        
        if (global.usingMemoryFallback) {
          console.log('File operation saved to memory storage with ID:', fileOperation._id);
        } else {
          console.log('File operation saved to MongoDB with ID:', fileOperation._id);
        }
      } catch (dbError) {
        // Handle errors with DB storage - attempt to use memory fallback directly
        console.error('Error saving operation record:', dbError.message);
        
        if (global.memoryStorage) {
          try {
            // Generate a unique ID
            const { v4: uuidv4 } = require('uuid');
            const opId = uuidv4();
            
            // Create a simple operation object
            fileOperation = {
              _id: opId,
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
                filePath: filepath,
                uploadMethod: req.file.upload_method || 'standard'
              },
              createdAt: new Date()
            };
            
            // Add to memory storage
            global.memoryStorage.addOperation(fileOperation);
            console.log('File operation saved to memory storage as fallback with ID:', opId);
          } catch (memoryError) {
            console.error('Failed to save operation to memory storage:', memoryError.message);
          }
        } else {
          console.error('No memory storage available as fallback!');
        }
      }
      
      // Determine PDF page count
      let pageCount;
      
      // For PDFs, do basic validation
      if (req.file.mimetype === 'application/pdf' || filepath.toLowerCase().endsWith('.pdf')) {
        // Basic validation: check if buffer or file starts with PDF signature
        let isPdf = false;
        
        if (req.file.buffer && req.file.buffer.length > 4) {
          // Check buffer directly
          isPdf = req.file.buffer.toString('ascii', 0, 4) === '%PDF';
        } else {
          // Read first few bytes of file
          try {
            const fileHeader = fs.readFileSync(filepath, { encoding: 'ascii', length: 4 });
            isPdf = fileHeader === '%PDF';
          } catch (readError) {
            console.error('Error reading PDF header from file:', readError);
          }
        }
        
        if (isPdf) {
          // Set a default page count since we can't easily count pages
          pageCount = 1; // Default value
          console.log('Valid PDF file uploaded');
        } else {
          console.warn('File does not have PDF signature - might not be a valid PDF');
        }
      }
      
      // Track successful upload in stats
      const fileCleanup = require('../utils/fileCleanup');
      fileCleanup.recordUpload(true, req.file.size, req.file.upload_method || 'standard');
      
      // Return success response with file data
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 1);
      
      console.log('Sending success response to client');
      
      // Response that's compatible with frontend expectations
      // In memory mode, add more debugging and ensure fields are explicitly set
      res.status(200).json({
        success: true,
        fileId: fileId, // The critical value needed by the frontend
        sourceFileId: fileId, // Adding this for extra clarity in memory mode
        fileName: req.file.originalname,
        fileSize: req.file.size,
        uploadDate: new Date().toISOString(),
        expiryDate: expiryDate.toISOString(),
        previewUrl: fileResult.secure_url,
        operationId: fileOperation ? fileOperation._id : undefined,
        pageCount: pageCount,
        uploadMethod: req.file.upload_method || 'standard',
        memoryModeActive: !!global.usingMemoryFallback, // Debug info for Railway troubleshooting
        filePath: filepath || null // Extra debug info for file location
      });
      
      console.log('========== FILE UPLOAD COMPLETED SUCCESSFULLY ==========');
    } catch (fileError) {
      console.error('Error processing file upload:', fileError);
      
      // Track failed upload in stats
      try {
        const fileCleanup = require('../utils/fileCleanup');
        fileCleanup.recordUpload(false, req.file ? req.file.size : 0, req.file ? req.file.upload_method || 'standard' : 'error');
      } catch (statsError) {
        console.error('Failed to record upload stats:', statsError);
      }
      
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
    
    // Enhanced file finding logic to match the download controller
    let fileFound = false;
    let finalPath = resultPath;
    
    // First check if file exists at the expected path
    if (fs.existsSync(resultPath)) {
      console.log(`File found at original path: ${resultPath}`);
      fileFound = true;
    } else {
      console.error(`File not found at path: ${resultPath}`);
      
      // STRATEGY 1: Try to find the file by pattern matching (in case extension is wrong)
      const tempDir = process.env.TEMP_DIR || './temp';
      const fileBaseName = path.parse(req.params.filename).name;
      
      if (fs.existsSync(tempDir)) {
        console.log(`Searching for result file using multiple strategies...`);
        const files = fs.readdirSync(tempDir);
        console.log(`Found ${files.length} files in directory: ${tempDir}`);
        if (files.length > 0) {
          console.log(`Sample files: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
        }
        
        // STRATEGY 2: Check if there's a file that starts with the same base name
        const matchingFile = files.find(file => file.startsWith(fileBaseName));
        
        if (matchingFile) {
          console.log(`Found matching file by prefix: ${matchingFile}`);
          finalPath = path.join(tempDir, matchingFile);
          fileFound = true;
        } else {
          // STRATEGY 3: Try alternative extensions
          console.log(`Trying alternative extensions for ${fileBaseName}`);
          const possibleExtensions = ['.pdf', '.docx', '.xlsx', '.pptx', '.jpg', '.txt'];
          
          for (const ext of possibleExtensions) {
            const testPath = path.join(tempDir, `${fileBaseName}${ext}`);
            console.log(`Trying path: ${testPath}`);
            
            if (fs.existsSync(testPath)) {
              finalPath = testPath;
              fileFound = true;
              console.log(`Found file with extension ${ext}: ${finalPath}`);
              break;
            }
          }
          
          // STRATEGY 4: Last resort - UUID may have been generated differently
          // Check if any file contains this ID as a substring 
          if (!fileFound) {
            console.log(`Trying fuzzy match for ID fragments...`);
            // Remove common prefixes/suffixes for better matching
            const cleanId = fileBaseName.replace(/^result-/, '').replace(/-result$/, '');
            
            if (cleanId.length >= 8) { // Only if we have a reasonably unique portion
              const fuzzyMatch = files.find(file => file.includes(cleanId));
              if (fuzzyMatch) {
                finalPath = path.join(tempDir, fuzzyMatch);
                fileFound = true;
                console.log(`Found fuzzy match: ${fuzzyMatch}`);
              }
            }
          }
        }
      }
    }
    
    if (!fileFound) {
      // Last resort for Railway - just continue with fake success but warn in logs
      if (process.env.RAILWAY_SERVICE_NAME || global.usingMemoryFallback) {
        console.error(`⚠️ CRITICAL: File not found but continuing for Railway/memory mode compatibility`);
        console.error(`Request filename: ${req.params.filename}`);
        console.error(`Tried paths including: ${resultPath}`);
        
        // Return a helpful error document instead
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="document-not-found.pdf"`);
        
        // Create a simple error PDF on the fly
        const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([500, 700]);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        page.drawText('Document Not Found', {
          x: 50,
          y: 650,
          size: 30,
          font,
          color: rgb(0.8, 0, 0)
        });
        
        page.drawText('The requested document could not be found on the server.', {
          x: 50,
          y: 600,
          size: 12,
          font
        });
        
        page.drawText(`Requested file: ${req.params.filename}`, {
          x: 50,
          y: 550,
          size: 10,
          font
        });
        
        const pdfBytes = await pdfDoc.save();
        res.send(Buffer.from(pdfBytes));
        return;
      }
      
      return next(new ErrorResponse('File not found', 404));
    }
    
    try {
      // Get file stats
      const stats = fs.statSync(finalPath);
      
      // Get extension and content type from the actual file
      const actualExtension = path.extname(finalPath).toLowerCase();
      const contentType = getContentType(finalPath);
      
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
      console.log(`Streaming file from: ${finalPath}`);
      fs.createReadStream(finalPath).pipe(res);
      return;
    } catch (fileError) {
      console.error(`Error accessing file at ${finalPath}:`, fileError);
      return next(new ErrorResponse(`Error accessing file: ${fileError.message}`, 500));
    }
    
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
    
    // For Railway deployment, don't fail with error - create a friendly error PDF document
    if (process.env.RAILWAY_SERVICE_NAME || global.usingMemoryFallback) {
      try {
        console.error(`Creating error PDF document instead of failing with error`);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="error-document.pdf"`);
        
        // Create a simple error PDF on the fly
        const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([500, 700]);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        page.drawText('Error Retrieving Document', {
          x: 50,
          y: 650,
          size: 28,
          font,
          color: rgb(0.8, 0, 0)
        });
        
        page.drawText('An error occurred while trying to retrieve your document.', {
          x: 50,
          y: 600,
          size: 12,
          font
        });
        
        page.drawText('Please try the conversion again or contact support.', {
          x: 50,
          y: 580,
          size: 12,
          font
        });
        
        const errorText = error.message || 'Unknown error';
        page.drawText(`Error details: ${errorText.substring(0, 100)}${errorText.length > 100 ? '...' : ''}`, {
          x: 50,
          y: 550,
          size: 10,
          font
        });
        
        const pdfBytes = await pdfDoc.save();
        res.send(Buffer.from(pdfBytes));
        return;
      } catch (pdfError) {
        console.error('Failed to create error PDF:', pdfError);
        // Continue to normal error handler
      }
    }
    
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